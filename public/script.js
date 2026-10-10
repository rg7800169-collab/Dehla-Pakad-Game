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

async function autoLockLandscape() {
    try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
        }
    } catch (err) {}
}

const soundBtn = document.getElementById('sound-btn');
if (soundBtn) {
    soundBtn.onclick = () => {
        soundEnabled = !soundEnabled;
        soundBtn.innerHTML = soundEnabled ? '<span>🔊</span>' : '<span>🔇</span>';
    };
}

const fullscreenBtn = document.getElementById('fullscreen-btn');
if (fullscreenBtn) {
    fullscreenBtn.onclick = () => {
        autoLockLandscape();
    };
}

// UI Containers
const homeLobby = document.getElementById('home-lobby');
const privateRoomModal = document.getElementById('private-room-modal');
const gameArena = document.getElementById('game-arena');

// Game Mode Clicks
const btnPractice = document.getElementById('btn-mode-practice');
const btnPrivate = document.getElementById('btn-mode-private');
const btnOnline = document.getElementById('btn-mode-online');
const btnLocal = document.getElementById('btn-mode-local');
const closeRoomModal = document.getElementById('close-room-modal');
const backToHomeBtn = document.getElementById('back-to-home-btn');

// 1. PRACTICE MODE (Instant 3 Bots Match)
if (btnPractice) {
    btnPractice.onclick = () => {
        autoLockLandscape();
        socket.emit('createRoom');
        setTimeout(() => {
            socket.emit('requestStartGame');
        }, 400);
    };
}

// 2. PLAY PRIVATELY (Opens Code Popup)
if (btnPrivate) {
    btnPrivate.onclick = () => {
        autoLockLandscape();
        privateRoomModal.classList.remove('hidden');
        privateRoomModal.classList.add('flex');
    };
}
if (closeRoomModal) {
    closeRoomModal.onclick = () => {
        privateRoomModal.classList.add('hidden');
        privateRoomModal.classList.remove('flex');
    };
}

// 3. PLAY ONLINE
if (btnOnline) {
    btnOnline.onclick = () => {
        autoLockLandscape();
        if (btnPractice) btnPractice.click();
    };
}
if (btnLocal) {
    btnLocal.onclick = () => {
        autoLockLandscape();
        if (btnPractice) btnPractice.click();
    };
}

// Return to Home
if (backToHomeBtn) {
    backToHomeBtn.onclick = () => {
        if (confirm("Match chhod kar Home par jana chahte hain?")) {
            location.reload();
        }
    };
}

// Room Management Elements
const roomSelectionBox = document.getElementById('room-selection-box');
const roomWaitingBox = document.getElementById('room-waiting-box');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInput = document.getElementById('room-input');
const displayRoomCode = document.getElementById('display-room-code');
const startBtn = document.getElementById('start-game-btn');
const playerCountEl = document.getElementById('player-count');

if (createRoomBtn) createRoomBtn.onclick = () => { socket.emit('createRoom'); };
if (joinRoomBtn) {
    joinRoomBtn.onclick = () => {
        const code = roomInput.value.trim();
        if (!code) return alert("Room code daalein!");
        socket.emit('joinRoom', code);
    };
}
if (startBtn) startBtn.onclick = () => { socket.emit('requestStartGame'); };

socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId;
    myPlayerNumber = data.playerNumber;
    if (displayRoomCode) displayRoomCode.innerText = data.roomId;
    if (roomSelectionBox) roomSelectionBox.classList.add('hidden');
    if (roomWaitingBox) {
        roomWaitingBox.classList.remove('hidden');
        roomWaitingBox.classList.add('flex');
    }
});

socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    myPlayerNumber = data.playerNumber;
    if (displayRoomCode) displayRoomCode.innerText = data.roomId;
    if (roomSelectionBox) roomSelectionBox.classList.add('hidden');
    if (roomWaitingBox) {
        roomWaitingBox.classList.remove('hidden');
        roomWaitingBox.classList.add('flex');
    }
});

socket.on('playerAssigned', (num) => { myPlayerNumber = Number(num); });
socket.on('playerCount', (count) => { if (playerCountEl) playerCountEl.innerText = count; });

socket.on('gameStarted', () => {
    if (homeLobby) homeLobby.classList.add('hidden');
    if (privateRoomModal) {
        privateRoomModal.classList.add('hidden');
        privateRoomModal.classList.remove('flex');
    }
    if (gameArena) gameArena.classList.remove('hidden');
    playSound('turnAlert');
    autoLockLandscape();
});

// Card Graphics Generator
function getCourtSVG(rank, isRed) {
    const robeColor = isRed ? '#dc2626' : '#1e3a8a';
    const accentColor = isRed ? '#f87171' : '#3b82f6';
    if (rank === 'K') {
        return `
        <svg class="court-svg" viewBox="0 0 60 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="60" height="90" fill="#fffbeb"/>
            <path d="M10 90 L10 50 L20 40 L40 40 L50 50 L50 90 Z" fill="${robeColor}"/>
            <path d="M22 40 L30 55 L38 40 L30 45 Z" fill="#f59e0b"/>
            <path d="M12 55 L30 90 L48 55 Z" fill="${accentColor}" opacity="0.6"/>
            <path d="M18 24 L22 14 L30 20 L38 14 L42 24 Z" fill="#d97706" stroke="#b45309" stroke-width="1.5"/>
            <circle cx="22" cy="14" r="2" fill="#ef4444"/>
            <circle cx="30" cy="20" r="2.5" fill="#3b82f6"/>
            <circle cx="38" cy="14" r="2" fill="#ef4444"/>
            <circle cx="30" cy="30" r="10" fill="#fde68a"/>
            <path d="M22 32 Q30 44 38 32 Q30 36 22 32" fill="#78350f"/>
            <circle cx="27" cy="28" r="1.5" fill="#1e293b"/>
            <circle cx="33" cy="28" r="1.5" fill="#1e293b"/>
            <line x1="46" y1="36" x2="46" y2="82" stroke="#d97706" stroke-width="2.5"/>
            <circle cx="46" cy="34" r="3.5" fill="#f59e0b"/>
        </svg>`;
    } else if (rank === 'Q') {
        return `
        <svg class="court-svg" viewBox="0 0 60 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="60" height="90" fill="#fffbeb"/>
            <path d="M12 90 L12 48 L22 42 L38 42 L48 48 L48 90 Z" fill="${robeColor}"/>
            <path d="M24 42 L30 52 L36 42 Z" fill="#f59e0b"/>
            <path d="M18 28 Q16 48 24 50 Q36 50 42 48 Q44 28 30 24 Z" fill="#92400e"/>
            <circle cx="30" cy="32" r="9" fill="#fde68a"/>
            <circle cx="27" cy="30" r="1.2" fill="#1e293b"/>
            <circle cx="33" cy="30" r="1.2" fill="#1e293b"/>
            <path d="M28 36 Q30 38 32 36" stroke="#b91c1c" stroke-width="1.2" fill="none"/>
            <path d="M20 22 L24 15 L30 19 L36 15 L40 22 Z" fill="#d97706" stroke="#b45309" stroke-width="1.2"/>
            <circle cx="30" cy="19" r="2" fill="#10b981"/>
            <circle cx="44" cy="62" r="4" fill="#ec4899"/>
        </svg>`;
    } else if (rank === 'J') {
        return `
        <svg class="court-svg" viewBox="0 0 60 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="60" height="90" fill="#fffbeb"/>
            <path d="M12 90 L12 48 L22 38 L38 38 L48 48 L48 90 Z" fill="${robeColor}"/>
            <path d="M22 48 L30 60 L38 48 Z" fill="#cbd5e1" stroke="#64748b"/>
            <circle cx="30" cy="28" r="9" fill="#fde68a"/>
            <path d="M19 24 Q30 12 41 24 L41 20 Q30 10 19 20 Z" fill="#d97706"/>
            <circle cx="27" cy="27" r="1.3" fill="#1e293b"/>
            <circle cx="33" cy="27" r="1.3" fill="#1e293b"/>
            <line x1="45" y1="20" x2="45" y2="85" stroke="#64748b" stroke-width="2.5"/>
            <path d="M41 24 L45 14 L49 24 Z" fill="#94a3b8"/>
        </svg>`;
    }
    return '';
}

function renderCardContent(rank, suit, isRed) {
    if (rank === 'K' || rank === 'Q' || rank === 'J') {
        return `<div class="court-card-body">${getCourtSVG(rank, isRed)}</div>`;
    } else {
        return `<div class="num-card-body"><span class="big-center-suit">${suit}</span></div>`;
    }
}

// Table Elements
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

// User Hand Rendering
socket.on('updateHand', (cards) => {
    if (!handContainer) return;
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
            ${renderCardContent(card.rank, card.suit, isRed)}
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
    if (state.eventType) playSound(state.eventType);

    if (roundNum) roundNum.innerText = state.trickCount || 1;
    
    // Pool Count update with null-safety
    if (poolCountEl && state.centerPool) {
        poolCountEl.innerText = state.centerPool.length;
    }

    if (hukumDisplay) {
        if (state.hukumRevealed) {
            const isRed = (state.hukumSuit === '♥' || state.hukumSuit === '♦');
            hukumDisplay.innerHTML = `<span class="${isRed ? 'text-red-500' : 'text-amber-400'} text-xs font-black">${state.hukumSuit}</span>`;
        } else {
            hukumDisplay.innerText = '🔒 Band';
        }
    }

    if (state.teams) {
        if (scores.bottom) scores.bottom.innerText = `${state.teams[0].dehle}/${state.teams[0].cards}`;
        if (scores.top) scores.top.innerText = `${state.teams[0].dehle}/${state.teams[0].cards}`;
        if (scores.left) scores.left.innerText = `${state.teams[1].dehle}/${state.teams[1].cards}`;
        if (scores.right) scores.right.innerText = `${state.teams[1].dehle}/${state.teams[1].cards}`;
    }

    const activePlayer = state.currentTurn;
    isMyTurn = (activePlayer + 1) === myPlayerNumber;

    if (turnBadge) {
        if (isMyTurn) {
            turnBadge.innerText = "Your Turn";
            turnBadge.className = "pill-badge text-[11px] font-black px-4 py-0.5 shadow-lg bg-emerald-500 text-stone-950 animate-bounce";
        } else {
            turnBadge.innerText = `Waiting for P${activePlayer + 1}...`;
            turnBadge.className = "pill-badge text-[11px] font-bold px-4 py-0.5 shadow-md bg-black/80 text-stone-400";
        }
    }

    Object.values(rings).forEach(r => { if (r) r.classList.remove('turn-glow'); });
    const relActive = (activePlayer - (myPlayerNumber - 1) + 4) % 4;
    if (relActive === 0 && rings.bottom) rings.bottom.classList.add('turn-glow');
    else if (relActive === 1 && rings.right) rings.right.classList.add('turn-glow');
    else if (relActive === 2 && rings.top) rings.top.classList.add('turn-glow');
    else if (relActive === 3 && rings.left) rings.left.classList.add('turn-glow');

    // 1. Center Pool Cards
    if (scatteredPoolDiv) {
        scatteredPoolDiv.innerHTML = '';
        if (state.centerPool) {
            state.centerPool.forEach((card, idx) => {
                const cardEl = document.createElement('div');
                const isRed = (card.suit === '♥' || card.suit === '♦');
                cardEl.className = `card-face pool-card-scattered ${isRed ? 'red' : 'black'}`;
                const angle = ((idx * 37) % 70) - 35;
                const offsetX = ((idx * 15) % 36) - 18;
                const offsetY = ((idx * 19) % 28) - 14;
                cardEl.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${angle}deg)`;
                cardEl.innerHTML = `
                    <div class="card-corner">
                        <span class="corner-rank" style="font-size:11px;">${card.rank}</span>
                        <span class="corner-suit" style="font-size:10px;">${card.suit}</span>
                    </div>
                `;
                scatteredPoolDiv.appendChild(cardEl);
            });
        }
    }

    // 2. Center Active Trick Cards (Aligned for Top Bot)
    if (activeTrickDiv) {
        activeTrickDiv.innerHTML = '';
        const seatTransforms = {
            0: { x: 81, y: 86, rotate: 0 },
            1: { x: 122, y: 46, rotate: -90 },
            2: { x: 81, y: 10, rotate: 0 },
            3: { x: 40, y: 46, rotate: 90 }
        };

        if (state.currentTrick) {
            state.currentTrick.forEach((tc) => {
                const relPos = (tc.player - (myPlayerNumber - 1) + 4) % 4;
                const conf = seatTransforms[relPos] || { x: 81, y: 46, rotate: 0 };
                const isRed = (tc.card.suit === '♥' || tc.card.suit === '♦');

                const cardEl = document.createElement('div');
                cardEl.className = `card-face active-trick-card ${isRed ? 'red' : 'black'}`;
                cardEl.style.left = `${conf.x}px`;
                cardEl.style.top = `${conf.y}px`;
                cardEl.style.transform = `rotate(${conf.rotate}deg)`;

                cardEl.innerHTML = `
                    <div class="card-corner">
                        <span class="corner-rank" style="font-size:14px;">${tc.card.rank}</span>
                        <span class="corner-suit" style="font-size:11px;">${tc.card.suit}</span>
                    </div>
                    ${renderCardContent(tc.card.rank, tc.card.suit, isRed)}
                `;
                activeTrickDiv.appendChild(cardEl);
            });
        }
    }
});

socket.on('errorMsg', (msg) => { alert(msg); });

socket.on('gameOverStats', (data) => {
    const modal = document.getElementById('game-over-modal');
    if (!modal) return;
    const title = document.getElementById('winner-title');
    const reason = document.getElementById('winner-reason');
    if (title) title.innerText = data.winningTeam ? `${data.winningTeam} Jeeti!` : "Draw!";
    if (reason) reason.innerText = data.winReason;
    modal.classList.add('show-modal');
});
    
