const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

let players = [];
let isBot = [false, true, true, true];
let gameStarted = false;

let deck = [];
let playersHands = [[], [], [], []];
let teams = [
    { name: 'Team 1 (P1 & Bot 3)', dehle: 0, cards: 0 },
    { name: 'Team 2 (Bot 2 & Bot 4)', dehle: 0, cards: 0 }
];

let hukumSuit = null;
let hukumRevealed = false;
let currentTurn = 0;
let leadSuit = null;
let currentTrick = []; 
let centerPool = []; 
let trickCount = 1;
let lastWinningTeam = null;
let consecutiveWins = 0;
let turnTimer = null;
const TURN_TIMEOUT_SEC = 15;

function cleanActivePlayers() {
    players = players.filter(id => {
        const s = io.sockets.sockets.get(id);
        return s && s.connected;
    });
    return players;
}

function initDeck() {
    deck = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) {
            deck.push({
                suit,
                rank,
                isDehla: rank === '10',
                color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
            });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function sortHand(hand) {
    const suitOrder = { '♠': 1, '♥': 2, '♣': 3, '♦': 4 };
    hand.sort((a, b) => {
        if (a.suit === b.suit) return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
        return suitOrder[a.suit] - suitOrder[b.suit];
    });
}

function dealCards(count) {
    for (let i = 0; i < count; i++) {
        for (let p = 0; p < 4; p++) {
            if (deck.length > 0) {
                playersHands[p].push(deck.pop());
            }
        }
    }
    for (let p = 0; p < 4; p++) {
        sortHand(playersHands[p]);
    }
    players.forEach((socketId, idx) => {
        io.to(socketId).emit('updateHand', playersHands[idx]);
    });
}

function broadcastState(message = "", eventType = "state") {
    io.emit('gameState', {
        teams,
        hukumSuit,
        hukumRevealed,
        currentTurn,
        currentTrick,
        centerPool,
        trickCount,
        message,
        eventType,
        isBot
    });
}

io.on('connection', (socket) => {
    cleanActivePlayers();

    if (players.length >= 4 || gameStarted) {
        socket.emit('roomFull', 'Room full hai ya khel pehle se shuru hai.');
        return;
    }

    players.push(socket.id);
    let mySeat = players.indexOf(socket.id);
    isBot[mySeat] = false;

    socket.emit('playerAssigned', mySeat + 1);
    io.emit('playerCount', players.length);

    socket.on('requestStartGame', () => {
        if (!gameStarted) {
            startGame();
        }
    });

    socket.on('playCard', (cardData) => {
        const currentPIndex = players.indexOf(socket.id);
        if (currentPIndex === -1 || currentPIndex !== currentTurn) return;

        let hand = playersHands[currentPIndex];
        let cardIndex = -1;

        if (typeof cardData === 'object' && cardData !== null) {
            cardIndex = hand.findIndex(c => c.suit === cardData.suit && c.rank === cardData.rank);
        } else if (typeof cardData === 'number') {
            cardIndex = cardData;
        }

        if (cardIndex === -1) return;
        handleCardPlay(currentPIndex, cardIndex);
    });

    socket.on('disconnect', () => {
        cleanActivePlayers();
        io.emit('playerCount', players.length);
        if (players.length === 0) {
            gameStarted = false;
            if (turnTimer) clearTimeout(turnTimer);
        }
    });
});

function startGame() {
    cleanActivePlayers();
    gameStarted = true;

    for (let i = 0; i < 4; i++) {
        if (i < players.length) {
            isBot[i] = false;
            io.to(players[i]).emit('playerAssigned', i + 1);
        } else {
            isBot[i] = true;
        }
    }

    const p3Name = isBot[2] ? 'Bot 3' : 'P3';
    const p2Name = isBot[1] ? 'Bot 2' : 'P2';
    const p4Name = isBot[3] ? 'Bot 4' : 'P4';
    teams = [
        { name: `Team 1 (P1 & ${p3Name})`, dehle: 0, cards: 0 },
        { name: `Team 2 (${p2Name} & ${p4Name})`, dehle: 0, cards: 0 }
    ];

    initDeck();
    playersHands = [[], [], [], []];
    hukumSuit = null;
    hukumRevealed = false;
    currentTurn = 0;
    currentTrick = [];
    centerPool = [];
    trickCount = 1;
    lastWinningTeam = null;
    consecutiveWins = 0;

    dealCards(5);
    io.emit('gameStarted');
    broadcastState("Khel shuru! Player 1 pehli chaal chalein.", "start");

    resetTurnTimer();
}

function resetTurnTimer() {
    if (turnTimer) clearTimeout(turnTimer);

    if (isBot[currentTurn]) {
        turnTimer = setTimeout(triggerBotTurn, 850);
    } else {
        turnTimer = setTimeout(() => {
            autoPlayLegalCard(currentTurn);
        }, TURN_TIMEOUT_SEC * 1000);
    }
}

function autoPlayLegalCard(playerIdx) {
    let hand = playersHands[playerIdx];
    if (!hand || hand.length === 0) return;

    let chosenIdx = 0;

    if (currentTrick.length === 0) {
        let nonDehlas = [];
        hand.forEach((c, idx) => { if (!c.isDehla) nonDehlas.push(idx); });
        chosenIdx = nonDehlas.length > 0 ? nonDehlas[Math.floor(Math.random() * nonDehlas.length)] : 0;
    } else {
        let suitIndices = [];
        hand.forEach((c, i) => { if (c.suit === leadSuit) suitIndices.push(i); });

        if (suitIndices.length > 0) {
            chosenIdx = suitIndices[0];
        } else {
            if (!hukumRevealed) {
                chosenIdx = 0;
            } else {
                let hukumIndices = [];
                hand.forEach((c, i) => { if (c.suit === hukumSuit) hukumIndices.push(i); });
                chosenIdx = hukumIndices.length > 0 ? hukumIndices[0] : 0;
            }
        }
    }

    handleCardPlay(playerIdx, chosenIdx);
}

function handleCardPlay(playerIndex, cardIndex) {
    if (playerIndex !== currentTurn || currentTrick.length >= 4) return;
    if (turnTimer) clearTimeout(turnTimer);

    let hand = playersHands[playerIndex];
    let card = hand[cardIndex];
    if (!card) return;

    // Follow Suit Rule Check
    if (currentTrick.length > 0) {
        let hasLeadSuit = hand.some(c => c.suit === leadSuit);
        if (hasLeadSuit && card.suit !== leadSuit) {
            if (!isBot[playerIndex] && players[playerIndex]) {
                io.to(players[playerIndex]).emit('errorMsg', `Aapko ${leadSuit} chalna padega!`);
            }
            resetTurnTimer();
            return;
        }

        // Remove card first to maintain hand integrity
        hand.splice(cardIndex, 1);
        currentTrick.push({ player: playerIndex, card });

        // Hukum reveal check
        if (!hasLeadSuit && !hukumRevealed) {
            hukumSuit = card.suit;
            hukumRevealed = true;
            dealCards(8);
            broadcastState(`HUKUM KHULA: ${hukumSuit}! Sabhi ko bache 8 cards mil gaye.`, "hukum");
        }
    } else {
        leadSuit = card.suit;
        hand.splice(cardIndex, 1);
        currentTrick.push({ player: playerIndex, card });
    }

    if (!isBot[playerIndex] && players[playerIndex]) {
        io.to(players[playerIndex]).emit('updateHand', hand);
    }

    if (currentTrick.length === 4) {
        broadcastState(`Chaal poori hui...`, "cardPlay");
        setTimeout(resolveTrick, 1400);
    } else {
        currentTurn = (currentTurn + 1) % 4;
        broadcastState(`Player ${currentTurn + 1} (${isBot[currentTurn] ? 'Bot' : 'Player'}) ki baari`, "cardPlay");
        resetTurnTimer();
    }
}

function triggerBotTurn() {
    if (!isBot[currentTurn] || currentTrick.length >= 4) return;
    autoPlayLegalCard(currentTurn);
}

function resolveTrick() {
    let winningTrick = currentTrick[0];

    for (let i = 1; i < 4; i++) {
        let candidate = currentTrick[i];
        if (hukumRevealed && candidate.card.suit === hukumSuit) {
            if (winningTrick.card.suit !== hukumSuit || RANK_VALUES[candidate.card.rank] > RANK_VALUES[winningTrick.card.rank]) {
                winningTrick = candidate;
            }
        } else if (candidate.card.suit === leadSuit && winningTrick.card.suit !== hukumSuit) {
            if (RANK_VALUES[candidate.card.rank] > RANK_VALUES[winningTrick.card.rank]) {
                winningTrick = candidate;
            }
        }
    }

    let winnerPlayer = winningTrick.player;
    let winningTeamIndex = winnerPlayer % 2;

    centerPool.push(...currentTrick.map(t => t.card));

    if (lastWinningTeam === winningTeamIndex) {
        consecutiveWins++;
    } else {
        lastWinningTeam = winningTeamIndex;
        consecutiveWins = 1;
    }

    let handCollected = false;
    let turnStatusMsg = `Player ${winnerPlayer + 1} (${isBot[winnerPlayer] ? 'Bot' : 'Player'}) ne trick jeeti!`;

    if (consecutiveWins >= 2 || trickCount === 13) {
        let dehleCount = centerPool.filter(c => c.isDehla).length;
        teams[winningTeamIndex].cards += centerPool.length;
        teams[winningTeamIndex].dehle += dehleCount;

        turnStatusMsg = `${teams[winningTeamIndex].name} ne pool utha liya (${centerPool.length} Cards, ${dehleCount} Dehle)!`;
        centerPool = [];
        consecutiveWins = 0;
        handCollected = true;
    }

    currentTrick = [];
    leadSuit = null;
    currentTurn = winnerPlayer;
    trickCount++;

    if (trickCount > 13) {
        finishGame();
    } else {
        broadcastState(turnStatusMsg, handCollected ? "poolCollect" : "trickEnd");
        resetTurnTimer();
    }
}

function finishGame() {
    if (turnTimer) clearTimeout(turnTimer);
    let t1 = teams[0];
    let t2 = teams[1];
    let isKot = false;
    let winningTeam = null;
    let winReason = "";

    if (t1.dehle === 4) {
        isKot = true;
        winningTeam = t1.name;
        winReason = "शानदार कोत! Team 1 ne sabhi 4 Dehle pakad liye!";
    } else if (t2.dehle === 4) {
        isKot = true;
        winningTeam = t2.name;
        winReason = "शानदार कोत! Team 2 ne sabhi 4 Dehle pakad liye!";
    } else if (t1.dehle > t2.dehle) {
        winningTeam = t1.name;
        winReason = `${t1.name} Dehlo ke aadhar par jeeti!`;
    } else if (t2.dehle > t1.dehle) {
        winningTeam = t2.name;
        winReason = `${t2.name} Dehlo ke aadhar par jeeti!`;
    } else {
        if (t1.cards > t2.cards) {
            winningTeam = t1.name;
            winReason = "2-2 Dehle barabar! Cards ke aadhar par jeet.";
        } else if (t2.cards > t1.cards) {
            winningTeam = t2.name;
            winReason = "2-2 Dehle barabar! Cards ke aadhar par jeet.";
        } else {
            winReason = "ड्राॅ! Dehle aur Cards barabar rahe.";
        }
    }

    io.emit('gameOverStats', { teams, isKot, winningTeam, winReason });
    gameStarted = false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on port ${PORT}`);
});
        
