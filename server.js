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

let rooms = {};

function generateRoomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function initDeck() {
    let deck = [];
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
    return deck;
}

function sortHand(hand) {
    const suitOrder = { '♠': 1, '♥': 2, '♣': 3, '♦': 4 };
    hand.sort((a, b) => {
        if (a.suit === b.suit) return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
        return suitOrder[a.suit] - suitOrder[b.suit];
    });
}

function dealCards(room, count) {
    for (let i = 0; i < count; i++) {
        for (let p = 0; p < 4; p++) {
            if (room.deck.length > 0) {
                room.playersHands[p].push(room.deck.pop());
            }
        }
    }
    for (let p = 0; p < 4; p++) {
        sortHand(room.playersHands[p]);
    }
    room.players.forEach((socketId, idx) => {
        io.to(socketId).emit('updateHand', room.playersHands[idx]);
    });
}

function broadcastState(roomId, message = "", eventType = "state") {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('gameState', {
        teams: room.teams,
        hukumSuit: room.hukumSuit,
        hukumRevealed: room.hukumRevealed,
        currentTurn: room.currentTurn,
        currentTrick: room.currentTrick,
        centerPool: room.centerPool,
        trickCount: room.trickCount,
        message,
        eventType,
        isBot: room.isBot
    });
}

io.on('connection', (socket) => {
    let currentRoomId = null;

    // Room Create Karna
    socket.on('createRoom', () => {
        let roomId = generateRoomId();
        while (rooms[roomId]) roomId = generateRoomId();

        rooms[roomId] = {
            id: roomId,
            players: [socket.id],
            isBot: [false, true, true, true],
            gameStarted: false,
            deck: [],
            playersHands: [[], [], [], []],
            teams: [
                { name: 'Team 1 (P1 & Bot 3)', dehle: 0, cards: 0 },
                { name: 'Team 2 (Bot 2 & Bot 4)', dehle: 0, cards: 0 }
            ],
            hukumSuit: null,
            hukumRevealed: false,
            currentTurn: 0,
            leadSuit: null,
            currentTrick: [],
            centerPool: [],
            trickCount: 1,
            lastWinningPlayer: null, // Same player 2 tricks track karne ke liye
            turnTimer: null
        };

        currentRoomId = roomId;
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, playerNumber: 1 });
        io.to(roomId).emit('playerCount', 1);
    });

    // Room Join Karna
    socket.on('joinRoom', (roomId) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('errorMsg', 'Yeh Room Code galat hai!');
            return;
        }
        if (room.players.length >= 4) {
            socket.emit('errorMsg', 'Yeh Room pehle se full hai!');
            return;
        }
        if (room.gameStarted) {
            socket.emit('errorMsg', 'Is room me match pehle se shuru ho chuka hai!');
            return;
        }

        room.players.push(socket.id);
        const mySeat = room.players.length;
        room.isBot[mySeat - 1] = false;

        currentRoomId = roomId;
        socket.join(roomId);

        socket.emit('roomJoined', { roomId, playerNumber: mySeat });
        io.to(roomId).emit('playerCount', room.players.length);
    });

    // Khel Shuru Karna
    socket.on('requestStartGame', () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        if (room.gameStarted) return;

        startGame(currentRoomId);
    });

    // Card Chalna
    socket.on('playCard', (cardData) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        const playerIndex = room.players.indexOf(socket.id);

        if (playerIndex === -1 || playerIndex !== room.currentTurn) return;

        let hand = room.playersHands[playerIndex];
        let cardIndex = -1;
        if (typeof cardData === 'object' && cardData !== null) {
            cardIndex = hand.findIndex(c => c.suit === cardData.suit && c.rank === cardData.rank);
        } else if (typeof cardData === 'number') {
            cardIndex = cardData;
        }

        if (cardIndex === -1) return;
        handleCardPlay(currentRoomId, playerIndex, cardIndex);
    });

    socket.on('disconnect', () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];

        room.players = room.players.filter(id => id !== socket.id);
        io.to(currentRoomId).emit('playerCount', room.players.length);

        if (room.players.length === 0) {
            if (room.turnTimer) clearTimeout(room.turnTimer);
            delete rooms[currentRoomId];
        }
    });
});

function startGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.gameStarted = true;

    for (let i = 0; i < 4; i++) {
        if (i < room.players.length) {
            room.isBot[i] = false;
            io.to(room.players[i]).emit('playerAssigned', i + 1);
        } else {
            room.isBot[i] = true;
        }
    }

    const p3Name = room.isBot[2] ? 'Bot 3' : 'P3';
    const p2Name = room.isBot[1] ? 'Bot 2' : 'P2';
    const p4Name = room.isBot[3] ? 'Bot 4' : 'P4';
    room.teams = [
        { name: `Team 1 (P1 & ${p3Name})`, dehle: 0, cards: 0 },
        { name: `Team 2 (${p2Name} & ${p4Name})`, dehle: 0, cards: 0 }
    ];

    room.deck = initDeck();
    room.playersHands = [[], [], [], []];
    room.hukumSuit = null;
    room.hukumRevealed = false;
    room.currentTurn = 0;
    room.currentTrick = [];
    room.centerPool = [];
    room.trickCount = 1;
    room.lastWinningPlayer = null;

    // Pehle sirf 5 patti baantein (Batch 1)
    dealCards(room, 5);
    io.to(roomId).emit('gameStarted');
    broadcastState(roomId, "Khel shuru! Player 1 pehli chaal chalein.", "start");

    resetTurnTimer(roomId);
}

function resetTurnTimer(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.turnTimer) clearTimeout(room.turnTimer);

    if (room.isBot[room.currentTurn]) {
        room.turnTimer = setTimeout(() => triggerBotTurn(roomId), 850);
    } else {
        room.turnTimer = setTimeout(() => {
            autoPlayLegalCard(roomId, room.currentTurn);
        }, 15000);
    }
}

function autoPlayLegalCard(roomId, playerIdx) {
    const room = rooms[roomId];
    if (!room) return;

    let hand = room.playersHands[playerIdx];
    if (!hand || hand.length === 0) return;

    let chosenIdx = 0;
    if (room.currentTrick.length === 0) {
        let nonDehlas = [];
        hand.forEach((c, idx) => { if (!c.isDehla) nonDehlas.push(idx); });
        chosenIdx = nonDehlas.length > 0 ? nonDehlas[Math.floor(Math.random() * nonDehlas.length)] : 0;
    } else {
        let suitIndices = [];
        hand.forEach((c, i) => { if (c.suit === room.leadSuit) suitIndices.push(i); });
        if (suitIndices.length > 0) {
            chosenIdx = suitIndices[0];
        } else {
            if (!room.hukumRevealed) {
                chosenIdx = 0;
            } else {
                let hukumIndices = [];
                hand.forEach((c, i) => { if (c.suit === room.hukumSuit) hukumIndices.push(i); });
                chosenIdx = hukumIndices.length > 0 ? hukumIndices[0] : 0;
            }
        }
    }

    handleCardPlay(roomId, playerIdx, chosenIdx);
}

function handleCardPlay(roomId, playerIndex, cardIndex) {
    const room = rooms[roomId];
    if (!room || playerIndex !== room.currentTurn || room.currentTrick.length >= 4) return;
    if (room.turnTimer) clearTimeout(room.turnTimer);

    let hand = room.playersHands[playerIndex];
    let card = hand[cardIndex];
    if (!card) return;

    // Follow Suit Rule Check
    if (room.currentTrick.length > 0) {
        let hasLeadSuit = hand.some(c => c.suit === room.leadSuit);
        if (hasLeadSuit && card.suit !== room.leadSuit) {
            if (!room.isBot[playerIndex] && room.players[playerIndex]) {
                io.to(room.players[playerIndex]).emit('errorMsg', `Aapko ${room.leadSuit} chalna padega!`);
            }
            resetTurnTimer(roomId);
            return;
        }

        hand.splice(cardIndex, 1);
        room.currentTrick.push({ player: playerIndex, card });

        // Hukum reveal hone par turant patti NAHI bategi
        if (!hasLeadSuit && !room.hukumRevealed) {
            room.hukumSuit = card.suit;
            room.hukumRevealed = true;
            broadcastState(roomId, `HUKUM KHULA: ${room.hukumSuit}!`, "hukum");
        }
    } else {
        room.leadSuit = card.suit;
        hand.splice(cardIndex, 1);
        room.currentTrick.push({ player: playerIndex, card });
    }

    if (!room.isBot[playerIndex] && room.players[playerIndex]) {
        io.to(room.players[playerIndex]).emit('updateHand', hand);
    }

    if (room.currentTrick.length === 4) {
        broadcastState(roomId, `Chaal poori hui...`, "cardPlay");
        setTimeout(() => resolveTrick(roomId), 1200);
    } else {
        room.currentTurn = (room.currentTurn + 1) % 4;
        broadcastState(roomId, `Player ${room.currentTurn + 1} (${room.isBot[room.currentTurn] ? 'Bot' : 'Player'}) ki baari`, "cardPlay");
        resetTurnTimer(roomId);
    }
}

function triggerBotTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.isBot[room.currentTurn] || room.currentTrick.length >= 4) return;
    autoPlayLegalCard(roomId, room.currentTurn);
}

function resolveTrick(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    let winningTrick = room.currentTrick[0];

    for (let i = 1; i < 4; i++) {
        let candidate = room.currentTrick[i];
        if (room.hukumRevealed && candidate.card.suit === room.hukumSuit) {
            if (winningTrick.card.suit !== room.hukumSuit || RANK_VALUES[candidate.card.rank] > RANK_VALUES[winningTrick.card.rank]) {
                winningTrick = candidate;
            }
        } else if (candidate.card.suit === room.leadSuit && winningTrick.card.suit !== room.hukumSuit) {
            if (RANK_VALUES[candidate.card.rank] > RANK_VALUES[winningTrick.card.rank]) {
                winningTrick = candidate;
            }
        }
    }

    let winnerPlayer = winningTrick.player;
    let winningTeamIndex = winnerPlayer % 2;

    // Center pool mein 4 cards daalein
    room.centerPool.push(...room.currentTrick.map(t => t.card));

    // ========================================================
    // DEHLA PAKAD NIYAM: SAME PLAYER 2 TRICKS RULE
    // ========================================================
    const isSamePlayerTwice = (room.lastWinningPlayer !== null && room.lastWinningPlayer === winnerPlayer);
    const isLastTrick = (room.trickCount === 13);

    let handCollected = false;
    let turnStatusMsg = `Player ${winnerPlayer + 1} (${room.isBot[winnerPlayer] ? 'Bot' : 'Player'}) ne trick jeeti!`;

    if (isSamePlayerTwice || isLastTrick) {
        // Patti uthayi gayi!
        let dehleCount = room.centerPool.filter(c => c.isDehla).length;
        room.teams[winningTeamIndex].cards += room.centerPool.length;
        room.teams[winningTeamIndex].dehle += dehleCount;

        turnStatusMsg = `${room.teams[winningTeamIndex].name} ne pool utha liya (${room.centerPool.length} Cards, ${dehleCount} Dehle)!`;
        room.centerPool = [];
        room.lastWinningPlayer = null; // Reset
        handCollected = true;
    } else {
        // Patti nahi uthegi (Partner jeete toh bhi table par rahegi)
        room.lastWinningPlayer = winnerPlayer;
    }

    room.currentTrick = [];
    room.leadSuit = null;
    room.currentTurn = winnerPlayer;

    // ========================================================
    // BATCH-WISE CARD DEALING (5, 4, 4)
    // ========================================================
    if (room.trickCount === 5) {
        // 5 chaal poori hone par agla 4 patti ka batch baantein
        dealCards(room, 4);
        turnStatusMsg += " | Agli 4-4 patti baanti gayi!";
    } else if (room.trickCount === 9) {
        // 9 chaal poori hone par aakhiri 4 patti ka batch baantein
        dealCards(room, 4);
        turnStatusMsg += " | Aakhiri 4-4 patti baanti gayi!";
    }

    room.trickCount++;

    if (room.trickCount > 13) {
        finishGame(roomId);
    } else {
        broadcastState(roomId, turnStatusMsg, handCollected ? "poolCollect" : "trickEnd");
        resetTurnTimer(roomId);
    }
}

function finishGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.turnTimer) clearTimeout(room.turnTimer);
    let t1 = room.teams[0];
    let t2 = room.teams[1];
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

    io.to(roomId).emit('gameOverStats', { teams: room.teams, isKot, winningTeam, winReason });
    room.gameStarted = false;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on port ${PORT}`);
});
     
