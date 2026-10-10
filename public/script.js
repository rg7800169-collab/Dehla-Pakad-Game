
const socket = io();

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
        } else if (type === 'poolCollect') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'hukum') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
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

// Sound Toggle
document.getElementById('sound-btn').onclick = () => {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-btn').innerText = soundEnabled ? '🔊' : '🔇';
};

// Fullscreen Toggle
document.getElementById('fullscreen-btn').onclick = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
};

const lobby = document.getElementById('lobby');
const startBtn = document.getElementById('start-game-btn');
const playerCountEl = document.getElementById('player-count');
const myPlayerBadge = document.getElementById('my-player-badge');
const statusPill = document.getElementById('status-pill');
const turnBadge = document.getElementById('turn-badge');
const handContainer = document.getElementById('hand-container');
const scatteredPoolDiv = document.getElementById('scattered-pool');
const activeTrickDiv = document.getElementById('active-trick');
const poolCountEl = document.getElementById('pool-count');
const hukumDisplay = document.getElementById('hukum-display');

const t1Dehle = document.getElementById('t1-dehle');
const t1Cards = document.getElementById('t1-cards');
const t2Dehle = document.getElementById('t2-dehle');
const t2Cards = document.getElementById('t2-cards');

const rings = {
    top: document.getElementById('ring-top'),
    left: document.getElementById('ring-left'),
    right: document.getElementById('ring-right')
};
const names = {
    top: document.getElementById('name-top'),
    left: document.getElementById('name-left'),
    right: document.getElementById('name-right')
};
const icons = {
    top: document.getElementById('icon-top'),
    left: document.getElementById('icon-left'),
    right: document.getElementById('icon-right')
};

startBtn.onclick = () => {
    socket.emit('requestStartGame');
};

socket.on('playerAssigned', (num) => {
    myPlayerNumber = Number(num);
    myPlayerBadge.innerText = `Aapka Number: Player ${num}`;
});

socket.on('playerCount', (count) => {
    playerCountEl.innerText = count;
});

socket.on('gameStarted', () => {
    lobby.style.display = 'none';
    playSound('turnAlert');
});

function updateSeatLabels(isBotArray) {
    if (!isBotArray) return;
    const me = (myPlayerNumber || 1) - 1;

    const relP = [
        (me + 1) % 4, // Right
        (me + 2) % 4, // Top (Partner)
        (me + 3) % 4  // Left
    ];

    names.right.innerText = isBotArray[relP[0]] ? `Bot ${relP[0] + 1}` : `Player ${relP[0] + 1}`;
    icons.right.innerText = isBotArray[relP[0]] ? '🤖' : `P${relP[0] + 1}`;

    names.top.innerText = isBotArray[relP[1]] ? `Bot ${relP[1] + 1} (Partner)` : `Partner (P${relP[1] + 1})`;
    icons.top.innerText = isBotArray[relP[1]] ? '🤖' : `P${relP[1] + 1}`;

    names.left.innerText = isBotArray[relP[2]] ? `Bot ${relP[2] + 1}` : `Player ${relP[2] + 1}`;
    icons.left.innerText = isBotArray[relP[2]] ? '🤖' : `P${relP[2] + 1}`;
}

// RENDER CALLBREAK FAN HAND
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
        const textColor = (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#0f172a';
        
        el.className = `hand-card ${card.color} ${isMyTurn ? 'my-turn-card' : ''}`;
        el.style.zIndex = index + 1;
        el.style.color = textColor;

        el.innerHTML = `
            <div class="card-corner" style="color: ${textColor};">
                <span class="corner-rank">${card.rank}</span>
                <span class="corner-suit">${card.suit}</span>
            </div>
            <div class="card-center-suit" style="color: ${textColor};">${card.suit}</div>
        `;

        const playAction = (e) => {
            e.preventDefault();
            if (isMyTurn) {
                socket.emit('playCard', { suit: card.suit, rank: card.rank });
            }
        };

        el.onclick = playAction;
        el.ontouchend = playAction;

        handContainer.appendChild(el);
    });
});

socket.on('gameState', (state) => {
    lobby.style.display = 'none';
    if (state.eventType) playSound(state.eventType);

    updateSeatLabels(state.isBot);

    t1Dehle.innerText = state.teams[0].dehle;
    t1Cards.innerText = state.teams[0].cards;
    t2Dehle.innerText = state.teams[1].dehle;
    t2Cards.innerText = state.teams[1].cards;

    if (state.hukumRevealed) {
        let color = (state.hukumSuit === '♥' || state.hukumSuit === '♦') ? 'text-red-500' : 'text-amber-400';
        hukumDisplay.innerHTML = `<span class="${color} text-xs font-black">${state.hukumSuit}</span>`;
    } else {
        hukumDisplay.innerText = '🔒 Band';
    }

    poolCountEl.innerText = state.centerPool.length;

    const activePlayer = state.currentTurn;
    isMyTurn = (activePlayer + 1) === myPlayerNumber;

    if (isMyTurn) {
        turnBadge.innerText = "👉 AAPKI CHAAL (15s)";
        turnBadge.className = "text-[10px] font-black px-3 py-0.5 rounded-full bg-emerald-400 text-stone-950 animate-bounce shadow-md shadow-emerald-500/50";
        document.querySelectorAll('.hand-card').forEach(c => c.classList.add('my-turn-card'));
    } else {
        const isCurrentBot = state.isBot && state.isBot[activePlayer];
        turnBadge.innerText = `${isCurrentBot ? 'Bot' : 'P'}${activePlayer + 1} ki baari...`;
        turnBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800 text-stone-400";
        document.querySelectorAll('.hand-card').forEach(c => c.classList.remove('my-turn-card'));
    }

    // Active ring in landscape
    Object.values(rings).forEach(r => r.classList.remove('turn-active'));
    if (myPlayerNumber) {
        const relativeActive = (activePlayer - (myPlayerNumber - 1) + 4) % 4;
        if (relativeActive === 1) rings.right.classList.add('turn-active');
        else if (relativeActive === 2) rings.top.classList.add('turn-active');
        else if (relativeActive === 3) rings.left.classList.add('turn-active');
    }

    if (state.message) statusPill.innerText = state.message;

    // 1. SCATTERED POOL
    scatteredPoolDiv.innerHTML = '';
    state.centerPool.forEach((card, idx) => {
        const cardEl = document.createElement('div');
        const textColor = (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#0f172a';
        cardEl.className = `pool-card-scattered ${card.color}`;
        cardEl.style.color = textColor;

        const angle = ((idx * 37) % 70) - 35;
        const offsetX = ((idx * 15) % 40) - 20;
        const offsetY = ((idx * 19) % 30) - 15;

        cardEl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg)`;
        cardEl.innerHTML = `
            <div class="text-[9px] font-bold leading-none" style="color:${textColor};">${card.rank}</div>
            <div class="text-xs text-center leading-none" style="color:${textColor};">${card.suit}</div>
            <div class="text-[8px] text-right font-bold leading-none" style="color:${textColor};">${card.rank}</div>
        `;
        scatteredPoolDiv.appendChild(cardEl);
    });

    // 2. ACTIVE TRICK CARDS (Landscape Centered Offsets)
    activeTrickDiv.innerHTML = '';
    const seatOffsets = {
        0: { x: 0, y: 30 },   // Bottom (You)
        1: { x: 38, y: 0 },   // Right
        2: { x: 0, y: -30 },  // Top
        3: { x: -38, y: 0 }   // Left
    };

    state.currentTrick.forEach((tc) => {
        const relPos = myPlayerNumber ? (tc.player - (myPlayerNumber - 1) + 4) % 4 : tc.player;
        const pos = seatOffsets[relPos] || { x: 0, y: 0 };
        const textColor = (tc.card.suit === '♥' || tc.card.suit === '♦') ? '#dc2626' : '#0f172a';

        const cardEl = document.createElement('div');
        cardEl.className = `active-trick-card ${tc.card.color}`;
        cardEl.style.color = textColor;
        cardEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        cardEl.innerHTML = `
            <div class="text-[10px] font-black leading-none" style="color:${textColor};">${tc.card.rank}</div>
            <div class="text-lg text-center leading-none" style="color:${textColor};">${tc.card.suit}</div>
            <div class="text-[9px] text-right font-black leading-none" style="color:${textColor};">${tc.card.rank}</div>
        `;
        activeTrickDiv.appendChild(cardEl);
    });
});

socket.on('errorMsg', (msg) => { alert(msg); });

socket.on('gameOverStats', (data) => {
    const modal = document.getElementById('game-over-modal');
    if (!modal) {
        alert(`Khel Khatam: ${data.winReason}`);
        location.reload();
        return;
    }
    const kotBanner = document.getElementById('kot-banner');
    const winnerTitle = document.getElementById('winner-title');
    const winnerReason = document.getElementById('winner-reason');
    const trophy = document.getElementById('trophy-icon');

    if (data.isKot) {
        kotBanner.classList.remove('hidden');
        trophy.innerText = "👑";
    } else {
        kotBanner.classList.add('hidden');
        trophy.innerText = data.winningTeam ? "🏆" : "🤝";
    }

    winnerTitle.innerText = data.winningTeam ? `${data.winningTeam} Jeeti!` : "Match Draw!";
    winnerReason.innerText = data.winReason;

    document.getElementById('final-t1-dehle').innerText = data.teams[0].dehle;
    document.getElementById('final-t1-cards').innerText = data.teams[0].cards;
    document.getElementById('final-t2-dehle').innerText = data.teams[1].dehle;
    document.getElementById('final-t2-cards').innerText = data.teams[1].cards;

    modal.classList.add('show-modal');
});

socket.on('roomFull', (msg) => { alert(msg); });
            

    
