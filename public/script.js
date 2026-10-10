const socket = io();

let currentRoomId = null;
let myPlayerNumber = 1;
let isMyTurn = false;
let soundEnabled = true;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!soundEnabled || audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    if (!soundEnabled) return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'cardPlay') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
            gain.gain.setValueAtTime(0.6, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'turnAlert') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    } catch (e) {}
}

document.getElementById('sound-btn').onclick = () => {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-btn').innerHTML = soundEnabled ? '<span>🔊</span>' : '<span>🔇</span>';
};

document.getElementById('fullscreen-btn').onclick = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
};

const lobby = document.getElementById('lobby');
const roomSelectionBox = document.getElementById('room-selection-box');
const roomWaitingBox = document.getElementById('room-waiting-box');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInput = document.getElementById('room-input');
const displayRoomCode = document.getElementById('display-room-code');
const startBtn = document.getElementById('start-game-btn');
const playerCountEl = document.getElementById('player-count');

const roundNum = document.getElementById('round-num');
const turnBadge = document.getElementById('turn-badge');
const handContainer = document.getElementById('hand-container');
const scatteredPoolDiv = document.getElementById('scattered-pool');
const activeTrickDiv = document.getElementById('active-trick');
const poolCountEl = document.getElementById('pool-count');
const hukumDisplay = document.getElementById('hukum-display');

const names = {
    top: document.getElementById('name-top'),
    left: document.getElementById('name-left'),
    right: document.getElementById('name-right'),
    bottom: document.getElementById('name-bottom')
};
const scores = {
    top: document.getElementById('score-top'),
    left: document.getElementById('score-left'),
    right: document.getElementById('score-right'),
    bottom: document.getElementById('score-bottom')
};
const rings = {
    top: document.getElementById('ring-top'),
    left: document.getElementById('ring-left'),
    right: document.getElementById('ring-right'),
    bottom: document.getElementById('ring-bottom')
};

createRoomBtn.onclick = () => { socket.emit('createRoom'); };
joinRoomBtn.onclick = () => {
    const code = roomInput.value.trim();
    if (!code) return alert("Room code daalein!");
    socket.emit('joinRoom', code);
};
startBtn.onclick = () => { socket.emit('requestStartGame'); };

socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId;
    myPlayerNumber = data.playerNumber;
    displayRoomCode.innerText = data.roomId;
    roomSelectionBox.classList.add('hidden');
    roomWaitingBox.classList.remove('hidden');
});
socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    myPlayerNumber = data.playerNumber;
    displayRoomCode.innerText = data.roomId;
    roomSelectionBox.classList.add('hidden');
    roomWaitingBox.classList.remove('hidden');
});
socket.on('playerAssigned', (num) => { myPlayerNumber = Number(num); });
socket.on('playerCount', (count) => { playerCountEl.innerText = count; });
socket.on('gameStarted', () => {
    lobby.style.display = 'none';
    playSound('turnAlert');
});

// Helper for Court Card Art
function getCardCenterHTML(rank, suit) {
    if (rank === 'K') {
        return `<div class="court-frame"><span class="court-icon">👑</span></div>`;
    } else if (rank === 'Q') {
        return `<div class="court-frame"><span class="court-icon">👸</span></div>`;
    } else if (rank === 'J') {
        return `<div class="court-frame"><span class="court-icon">🛡️</span></div>`;
    } else {
        return `<div class="card-center-suit">${suit}</div>`;
    }
}

// User Hand Rendering (Wide Spanning Row)
socket.on('updateHand', (cards) => {
    handContainer.innerHTML = '';
    const suitOrder = { '♠': 1, '♥': 2, '♣': 3, '♦': 4 };
    const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

    cards.sort((a, b) => {
        if (a.suit === b.suit) return rankValues[b.rank] - rankValues[a.rank];
        return suitOrder[a.suit] - suitOrder[b.suit];
    });

    cards.forEach((card, index) => {
        const el = document.createElement('div');
        const isRed = (card.suit === '♥' || card.suit === '♦');
        el.className = `card-face hand-card ${isRed ? 'red' : 'black'}`;
        el.style.zIndex = index + 1;

        el.innerHTML = `
            <div class="card-corner">
                <span class="corner-rank">${card.rank}</span>
                <span class="corner-suit">${card.suit}</span>
            </div>
            <div class="card-center-art">
                ${getCardCenterHTML(card.rank, card.suit)}
            </div>
        `;

        el.onclick = () => {
            if (isMyTurn) {
                socket.emit('playCard', { suit: card.suit, rank: card.rank });
            }
        };
        handContainer.appendChild(el);
    });
});

// Game State Update
socket.on('gameState', (state) => {
    lobby.style.display = 'none';
    if (state.eventType) playSound(state.eventType);

    roundNum.innerText = state.trickCount || 1;
    poolCountEl.innerText = state.centerPool.length;

    if (state.hukumRevealed) {
        const isRed = (state.hukumSuit === '♥' || state.hukumSuit === '♦');
        hukumDisplay.innerHTML = `<span class="${isRed ? 'text-red-500' : 'text-amber-400'} text-xs font-black">${state.hukumSuit}</span>`;
    } else {
        hukumDisplay.innerText = '🔒 Band';
    }

    // Scores
    scores.bottom.innerText = `${state.teams[0].dehle}/${state.teams[0].cards}`;
    scores.top.innerText = `${state.teams[0].dehle}/${state.teams[0].cards}`;
    scores.left.innerText = `${state.teams[1].dehle}/${state.teams[1].cards}`;
    scores.right.innerText = `${state.teams[1].dehle}/${state.teams[1].cards}`;

    // Turn Highlights
    const activePlayer = state.currentTurn;
    isMyTurn = (activePlayer + 1) === myPlayerNumber;

    if (isMyTurn) {
        turnBadge.innerText = "Your Turn";
        turnBadge.className = "pill-badge text-[11px] font-black px-4 py-0.5 mb-0.5 shadow-lg bg-emerald-500 text-stone-950 animate-bounce";
    } else {
        turnBadge.innerText = `Waiting for P${activePlayer + 1}...`;
        turnBadge.className = "pill-badge text-[11px] font-bold px-4 py-0.5 mb-0.5 shadow-md bg-black/80 text-stone-400";
    }

    // Avatar glow
    Object.values(rings).forEach(r => r.classList.remove('turn-glow'));
    const relActive = (activePlayer - (myPlayerNumber - 1) + 4) % 4;
    if (relActive === 0) rings.bottom.classList.add('turn-glow');
    else if (relActive === 1) rings.right.classList.add('turn-glow');
    else if (relActive === 2) rings.top.classList.add('turn-glow');
    else if (relActive === 3) rings.left.classList.add('turn-glow');

    // 1. Center Pool (Gojh)
    scatteredPoolDiv.innerHTML = '';
    state.centerPool.forEach((card, idx) => {
        const cardEl = document.createElement('div');
        const isRed = (card.suit === '♥' || card.suit === '♦');
        cardEl.className = `card-face pool-card-scattered ${isRed ? 'red' : 'black'}`;
        const angle = ((idx * 37) % 70) - 35;
        const offsetX = ((idx * 15) % 40) - 20;
        const offsetY = ((idx * 19) % 30) - 15;
        cardEl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg)`;
        cardEl.innerHTML = `
            <div class="text-[9px] font-bold leading-none p-1">${card.rank}${card.suit}</div>
        `;
        scatteredPoolDiv.appendChild(cardEl);
    });

    // 2. Center Active Trick Cards (Controlled offsets: Never reaching Bot 3)
    activeTrickDiv.innerHTML = '';
    const seatOffsets = {
        0: { x: 44, y: 55, rotate: 0 },       // Bottom (You) - Facing vertical down
        1: { x: 75, y: 30, rotate: -90 },     // Right Bot - Rotated horizontal
        2: { x: 44, y: 0, rotate: 0 },        // Top Bot - Safely near center, far from Bot 3
        3: { x: 12, y: 30, rotate: 90 }       // Left Bot - Rotated horizontal
    };

    state.currentTrick.forEach((tc) => {
        const relPos = (tc.player - (myPlayerNumber - 1) + 4) % 4;
        const conf = seatOffsets[relPos] || { x: 44, y: 30, rotate: 0 };
        const isRed = (tc.card.suit === '♥' || tc.card.suit === '♦');

        const cardEl = document.createElement('div');
        cardEl.className = `card-face active-trick-card ${isRed ? 'red' : 'black'}`;
        cardEl.style.left = `${conf.x}px`;
        cardEl.style.top = `${conf.y}px`;
        cardEl.style.transform = `rotate(${conf.rotate}deg)`;

        cardEl.innerHTML = `
            <div class="card-corner">
                <span class="corner-rank">${tc.card.rank}</span>
                <span class="corner-suit">${tc.card.suit}</span>
            </div>
            <div class="card-center-art">
                ${getCardCenterHTML(tc.card.rank, tc.card.suit)}
            </div>
        `;
        activeTrickDiv.appendChild(cardEl);
    });
});

socket.on('errorMsg', (msg) => { alert(msg); });

socket.on('gameOverStats', (data) => {
    const modal = document.getElementById('game-over-modal');
    document.getElementById('winner-title').innerText = data.winningTeam ? `${data.winningTeam} Jeeti!` : "Draw!";
    document.getElementById('winner-reason').innerText = data.winReason;
    modal.classList.add('show-modal');
});

    
