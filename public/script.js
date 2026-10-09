const socket = io();

let myPlayerNumber = null;
let isMyTurn = false;
let soundEnabled = true;

// Audio Synthesizer (Zero external files needed)
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
            // Card snap/slap sound
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
            gain.gain.setValueAtTime(0.6, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'poolCollect') {
            // Card pickup / sweep whoosh
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'hukum') {
            // Trump fanfare chime
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'turnAlert') {
            // Notification ding
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    } catch (e) {
        console.log("Audio not allowed yet:", e);
    }
}

// Sound toggle button
document.getElementById('sound-btn').onclick = () => {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-btn').innerText = soundEnabled ? '🔊' : '🔇';
};

// Elements
const lobby = document.getElementById('lobby');
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

// Seats mapping
const rings = {
    bottom: document.getElementById('ring-bottom'),
    top: document.getElementById('ring-top'),
    left: document.getElementById('ring-left'),
    right: document.getElementById('ring-right')
};
const names = {
    bottom: document.getElementById('name-bottom'),
    top: document.getElementById('name-top'),
    left: document.getElementById('name-left'),
    right: document.getElementById('name-right')
};

socket.on('playerAssigned', (num) => {
    myPlayerNumber = num;
    myPlayerBadge.innerText = `Aapka Number: Player ${num} (${num % 2 === 1 ? 'Team 1' : 'Team 2'})`;
    setupSeatNames();
});

socket.on('playerCount', (count) => {
    playerCountEl.innerText = count;
    if (count === 4) {
        lobby.style.display = 'none';
        playSound('turnAlert');
    }
});

function setupSeatNames() {
    if (!myPlayerNumber) return;
    const me = myPlayerNumber - 1;
    // Relative Callbreak seats (0: Bottom/Me, 1: Right, 2: Top/Partner, 3: Left)
    const rightP = (me + 1) % 4 + 1;
    const topP = (me + 2) % 4 + 1;
    const leftP = (me + 3) % 4 + 1;

    names.bottom.innerText = `Aap (P${myPlayerNumber})`;
    names.right.innerText = `P${rightP}`;
    names.top.innerText = `Partner (P${topP})`;
    names.left.innerText = `P${leftP}`;
}

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
        el.className = `card card-playable ${card.color}`;
        el.innerHTML = `
            <div>${card.rank}</div>
            <div class="text-xl text-center leading-none">${card.suit}</div>
            <div class="text-right text-[11px]">${card.rank}</div>
        `;
        el.onclick = () => {
            if (isMyTurn) {
                socket.emit('playCard', index);
            }
        };
        handContainer.appendChild(el);
    });
});

socket.on('gameState', (state) => {
    if (state.eventType) playSound(state.eventType);

    t1Dehle.innerText = state.teams[0].dehle;
    t1Cards.innerText = state.teams[0].cards;
    t2Dehle.innerText = state.teams[1].dehle;
    t2Cards.innerText = state.teams[1].cards;

    // Hukum Display
    if (state.hukumRevealed) {
        let color = (state.hukumSuit === '♥' || state.hukumSuit === '♦') ? 'text-red-500' : 'text-amber-400';
        hukumDisplay.innerHTML = `<span class="${color} text-lg">${state.hukumSuit}</span>`;
    } else {
        hukumDisplay.innerText = '🔒 Band';
    }

    poolCountEl.innerText = state.centerPool.length;

    // Turn Highlights
    const activePlayer = state.currentTurn;
    isMyTurn = (activePlayer + 1) === myPlayerNumber;

    if (isMyTurn) {
        turnBadge.innerText = "Aapki Chaal!";
        turnBadge.className = "text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500 text-black animate-pulse";
    } else {
        turnBadge.innerText = `P${activePlayer + 1} ki baari`;
        turnBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800 text-stone-400";
    }

    // Relative active seat highlighting
    Object.values(rings).forEach(r => r.classList.remove('turn-active'));
    if (myPlayerNumber) {
        const relativeActive = (activePlayer - (myPlayerNumber - 1) + 4) % 4;
        if (relativeActive === 0) rings.bottom.classList.add('turn-active');
        else if (relativeActive === 1) rings.right.classList.add('turn-active');
        else if (relativeActive === 2) rings.top.classList.add('turn-active');
        else if (relativeActive === 3) rings.left.classList.add('turn-active');
    }

    if (state.message) statusPill.innerText = state.message;

    // 1. RENDER SCATTERED POOL (Table par bikhri hui patti)
    scatteredPoolDiv.innerHTML = '';
    state.centerPool.forEach((card, idx) => {
        const cardEl = document.createElement('div');
        cardEl.className = `pool-card-scattered ${card.color}`;
        
        // Pseudo-random scattered angles & offsets based on card index
        const angle = ((idx * 37) % 70) - 35;
        const offsetX = ((idx * 17) % 50) - 25;
        const offsetY = ((idx * 23) % 40) - 20;

        cardEl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg)`;
        cardEl.innerHTML = `
            <div>${card.rank}</div>
            <div class="text-sm text-center">${card.suit}</div>
            <div class="text-right">${card.rank}</div>
        `;
        scatteredPoolDiv.appendChild(cardEl);
    });

    // 2. RENDER CURRENT TRICK CARDS (Chaal ki 4 patti)
    activeTrickDiv.innerHTML = '';
    const seatOffsets = {
        0: { x: 0, y: 38 },   // Bottom
        1: { x: 42, y: 0 },   // Right
        2: { x: 0, y: -38 },  // Top
        3: { x: -42, y: 0 }   // Left
    };

    state.currentTrick.forEach((tc) => {
        const relPos = myPlayerNumber ? (tc.player - (myPlayerNumber - 1) + 4) % 4 : tc.player;
        const pos = seatOffsets[relPos] || { x: 0, y: 0 };

        const cardEl = document.createElement('div');
        cardEl.className = `active-trick-card ${tc.card.color}`;
        cardEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        cardEl.innerHTML = `
            <div>${tc.card.rank}</div>
            <div class="text-lg text-center leading-none">${tc.card.suit}</div>
            <div class="text-right">${tc.card.rank}</div>
        `;
        activeTrickDiv.appendChild(cardEl);
    });
});

socket.on('errorMsg', (msg) => { alert(msg); });

socket.on('gameOver', (msg) => {
    alert(`🎉 Khel Khatam!\n\n${msg}`);
    location.reload();
});

socket.on('roomFull', (msg) => { alert(msg); });
