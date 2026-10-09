const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder correctly
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game Constants & State
const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

let players = []; 
let deck = [];
let playersHands = [[], [], [], []];
let teams = [{ name: 'Team A (P1 & P3)', dehlas: 0, cards: 0 }, { name: 'Team B (P2 & P4)', dehlas: 0, cards: 0 }];
let hukumSuit = null, hukumRevealed = false, currentTurn = 0, trickCards = [], tablePool = [];
let leadSuit = null, lastTrickWinner = null, consecutiveWins = 0, firstHandPicked = false, trickCount = 1;

function createDeck() {
    deck = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) deck.push({ suit, rank, isDehla: rank === '10', color: (suit === '♥' || suit === '♦') ? 'red' : 'black' });
    }
    deck.sort(() => Math.random() - 0.5);
}

function dealCards(num) {
    for (let i = 0; i < num; i++) {
        for (let p = 0; p < 4; p++) {
            if (deck.length > 0) playersHands[p].push(deck.pop());
        }
    }
    players.forEach((socketId, index) => {
        io.to(socketId).emit('updateHand', playersHands[index]);
    });
}

function broadcastState(msg = "") {
    io.emit('gameState', {
        teams, hukumSuit, hukumRevealed, currentTurn, trickCards, trickCount, msg, tablePoolLength: tablePool.length
    });
}

io.on('connection', (socket) => {
    if (players.length >= 4) {
        socket.emit('full', 'Room is full! 4 players already joined.');
        return;
    }
    
    players.push(socket.id);
    let playerIndex = players.length - 1;
    console.log(`Player ${playerIndex + 1} joined. ID: ${socket.id}`);
    
    io.emit('playerCount', players.length);

    if (players.length === 4) {
        createDeck();
        dealCards(5);
        broadcastState("Game Shuru! Player 1 ki chaal hai.");
    }

    socket.on('playCard', (cardIndex) => {
        if (playerIndex !== currentTurn || trickCards.length === 4) return;
        
        let hand = playersHands[playerIndex];
        let card = hand[cardIndex];

        if (trickCards.length > 0) {
            let hasLeadSuit = hand.some(c => c.suit === leadSuit);
            if (hasLeadSuit && card.suit !== leadSuit) {
                socket.emit('errorMsg', `Aapko ${leadSuit} chalna padega!`);
                return;
            }
            if (!hasLeadSuit && !hukumRevealed) {
                hukumSuit = card.suit;
                hukumRevealed = true;
                dealCards(8);
                broadcastState(`!!! HUKUM KHUL GAYA (${hukumSuit}) !!! Baki cards bat gaye.`);
            }
        } else {
            leadSuit = card.suit;
        }

        hand.splice(cardIndex, 1);
        trickCards.push({ player: playerIndex, card: card });
        socket.emit('updateHand', hand); 
        
        currentTurn = (currentTurn + 1) % 4;
        broadcastState();

        if (trickCards.length === 4) {
            setTimeout(evaluateTrick, 2000);
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(id => id !== socket.id);
        io.emit('playerCount', players.length);
        console.log('A player disconnected');
    });
});

function evaluateTrick() {
    let winningCard = trickCards[0].card;
    let winnerIndex = trickCards[0].player;

    for (let i = 1; i < 4; i++) {
        let curr = trickCards[i].card;
        if (hukumRevealed && curr.suit === hukumSuit) {
            if (winningCard.suit !== hukumSuit || RANK_VALUES[curr.rank] > RANK_VALUES[winningCard.rank]) {
                winningCard = curr; winnerIndex = trickCards[i].player;
            }
        } else if (curr.suit === leadSuit && winningCard.suit !== hukumSuit) {
            if (RANK_VALUES[curr.rank] > RANK_VALUES[winningCard.rank]) {
                winningCard = curr; winnerIndex = trickCards[i].player;
            }
        }
    }

    let teamIndex = winnerIndex % 2;
    tablePool.push(...trickCards.map(t => t.card));

    if (lastTrickWinner !== null && (lastTrickWinner % 2 === teamIndex)) consecutiveWins++;
    else consecutiveWins = 1;
    
    lastTrickWinner = winnerIndex;
    let canPickUp = false;
    let turnMsg = `Player ${winnerIndex + 1} jeeta yeh trick!`;

    if (trickCount === 13) {
        canPickUp = true; turnMsg = "Last chaal! Sab cards utha liye gaye.";
    } else if (consecutiveWins >= 2) {
        if (!firstHandPicked) {
            if (tablePool.some(c => c.isDehla)) { canPickUp = true; firstHandPicked = true; turnMsg = "Pahla Dehla mila, haath uth gaya!"; }
        } else {
            canPickUp = true; turnMsg = "2 haath lagatar, haath uth gaya!";
        }
    }

    if (canPickUp) {
        teams[teamIndex].cards += tablePool.length;
        teams[teamIndex].dehlas += tablePool.filter(c => c.isDehla).length;
        tablePool = [];
        consecutiveWins = 0;
    }

    trickCards = [];
    trickCount++;
    currentTurn = winnerIndex;
    
    if (trickCount > 13) checkGameOver();
    else broadcastState(turnMsg);
}

function checkGameOver() {
    let msg = "Draw / Kot!";
    for (let i = 0; i < 2; i++) {
        if (teams[i].dehlas >= 3 || (teams[i].dehlas === 2 && teams[i].cards >= 28)) {
            msg = `🏆 ${teams[i].name} Jeet Gayi!`; break;
        }
    }
    io.emit('gameOver', msg);
}

// Dynamic port assignment for Render compatibility
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});