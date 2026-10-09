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
let deck = [];
let playersHands = [[], [], [], []];
let teams = [
    { name: 'Team 1 (P1 & P3)', dehle: 0, cards: 0 },
    { name: 'Team 2 (P2 & P4)', dehle: 0, cards: 0 }
];

let hukumSuit = null;
let hukumRevealed = false;
let currentTurn = 0;
let leadSuit = null;
let currentTrick = []; 
let centerPool = []; // Isme bikhri hui patiyan rahengi jab tak utha na li jayein
let trickCount = 1;
let lastWinningTeam = null;
let consecutiveWins = 0;

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

function dealCards(count) {
    for (let i = 0; i < count; i++) {
        for (let p = 0; p < 4; p++) {
            if (deck.length > 0) {
                playersHands[p].push(deck.pop());
            }
        }
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
        centerPool, // Saari jama hui patiyan client ko bhejte hain
        trickCount,
        message,
        eventType
    });
}

io.on('connection', (socket) => {
    if (players.length >= 4) {
        socket.emit('roomFull', 'Room full hai! 4 khiladi pehle se hain.');
        return;
    }

    players.push(socket.id);
    let playerIndex = players.length - 1;
    socket.emit('playerAssigned', playerIndex + 1);
    io.emit('playerCount', players.length);

    if (players.length === 4) {
        startGame();
    }

    socket.on('playCard', (cardIndex) => {
        if (playerIndex !== currentTurn) {
            socket.emit('errorMsg', 'Abhi aapki baari nahi hai!');
            return;
        }
        if (currentTrick.length >= 4) return;

        let hand = playersHands[playerIndex];
        let card = hand[cardIndex];
        if (!card) return;

        // Follow Suit check
        if (currentTrick.length > 0) {
            let hasLeadSuit = hand.some(c => c.suit === leadSuit);
            if (hasLeadSuit && card.suit !== leadSuit) {
                socket.emit('errorMsg', `Aapko ${leadSuit} chalna padega!`);
                return;
            }

            // Hukum reveal if cut
            if (!hasLeadSuit && !hukumRevealed) {
                hukumSuit = card.suit;
                hukumRevealed = true;
                dealCards(8);
                broadcastState(`HUKUM KHULA: ${hukumSuit}! Sabhi ko bache cards mil gaye.`, "hukum");
            }
        } else {
            leadSuit = card.suit;
        }

        hand.splice(cardIndex, 1);
        currentTrick.push({ player: playerIndex, card });
        socket.emit('updateHand', hand);

        if (currentTrick.length === 4) {
            broadcastState(`Chaal poori hui...`, "cardPlay");
            setTimeout(resolveTrick, 1600);
        } else {
            currentTurn = (currentTurn + 1) % 4;
            broadcastState(`Player ${currentTurn + 1} ki baari`, "cardPlay");
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(id => id !== socket.id);
        io.emit('playerCount', players.length);
    });
});

function startGame() {
    initDeck();
    playersHands = [[], [], [], []];
    teams = [
        { name: 'Team 1 (P1 & P3)', dehle: 0, cards: 0 },
        { name: 'Team 2 (P2 & P4)', dehle: 0, cards: 0 }
    ];
    hukumSuit = null;
    hukumRevealed = false;
    currentTurn = 0;
    currentTrick = [];
    centerPool = [];
    trickCount = 1;
    lastWinningTeam = null;
    consecutiveWins = 0;

    dealCards(5);
    broadcastState("Khel shuru! Player 1 pehli chaal chalein.", "start");
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

    // Played cards go to the center pool
    centerPool.push(...currentTrick.map(t => t.card));

    if (lastWinningTeam === winningTeamIndex) {
        consecutiveWins++;
    } else {
        lastWinningTeam = winningTeamIndex;
        consecutiveWins = 1;
    }

    let handCollected = false;
    let turnStatusMsg = `Player ${winnerPlayer + 1} ne yeh trick jeeti!`;

    // 2 consecutive tricks or 13th hand sweeps the pool
    if (consecutiveWins >= 2 || trickCount === 13) {
        let dehleCount = centerPool.filter(c => c.isDehla).length;
        teams[winningTeamIndex].cards += centerPool.length;
        teams[winningTeamIndex].dehle += dehleCount;

        turnStatusMsg = `${teams[winningTeamIndex].name} ne pool utha liya (${centerPool.length} Cards, ${dehleCount} Dehle)!`;
        centerPool = []; // Pool cleared only when picked up
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
    }
}

function finishGame() {
    let t1 = teams[0];
    let t2 = teams[1];
    let winner = "Match Draw!";

    if (t1.dehle > t2.dehle) winner = `🏆 Team 1 Jeet Gayi (${t1.dehle} Dehle)!`;
    else if (t2.dehle > t1.dehle) winner = `🏆 Team 2 Jeet Gayi (${t2.dehle} Dehle)!`;
    else {
        if (t1.cards > t2.cards) winner = `🏆 Team 1 Cards ke aadhar par jeeti!`;
        else if (t2.cards > t1.cards) winner = `🏆 Team 2 Cards ke aadhar par jeeti!`;
    }

    io.emit('gameOver', winner);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on port ${PORT}`);
});
