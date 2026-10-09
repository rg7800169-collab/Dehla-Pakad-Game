const socket = io();

const myHandDiv = document.getElementById('my-hand');
const centerArea = document.getElementById('center-play-area');
const statusAlert = document.getElementById('status-alert');
const lobby = document.getElementById('lobby');

socket.on('playerCount', (count) => {
    document.getElementById('player-count').innerText = count;
    if(count === 4) lobby.style.display = 'none';
});

socket.on('updateHand', (cards) => {
    myHandDiv.innerHTML = '';
    
    cards.sort((a, b) => {
        const suitsOrder = {'♠': 1, '♥': 2, '♣': 3, '♦': 4};
        const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        if(a.suit === b.suit) return rankValues[b.rank] - rankValues[a.rank];
        return suitsOrder[a.suit] - suitsOrder[b.suit];
    });

    cards.forEach((card, index) => {
        let cardEl = document.createElement('div');
        cardEl.className = `playing-card ${card.color}`;
        cardEl.innerHTML = `${card.rank}<br><span class="text-3xl">${card.suit}</span>`;
        cardEl.onclick = () => socket.emit('playCard', index);
        myHandDiv.appendChild(cardEl);
    });
});

socket.on('gameState', (state) => {
    document.getElementById('team-a-dehlas').innerText = state.teams[0].dehlas;
    document.getElementById('team-a-cards').innerText = state.teams[0].cards;
    document.getElementById('team-b-dehlas').innerText = state.teams[1].dehlas;
    document.getElementById('team-b-cards').innerText = state.teams[1].cards;

    if(state.hukumRevealed) {
        document.getElementById('hukum-suit').innerText = state.hukumSuit;
        let colorClass = (state.hukumSuit === '♥' || state.hukumSuit === '♦') ? 'text-red-600' : 'text-black';
        document.getElementById('hukum-suit').innerHTML = `<span class="${colorClass}">${state.hukumSuit}</span>`;
        document.getElementById('hukum-badge').classList.add('hukum-glow');
    }

    centerArea.innerHTML = '';
    state.trickCards.forEach((tc, i) => {
        let cardEl = document.createElement('div');
        cardEl.className = `playing-card played-card ${tc.card.color}`;
        cardEl.innerHTML = `${tc.card.rank}<br><span class="text-3xl">${tc.card.suit}</span>`;
        
        cardEl.style.transform = `translate(${i * 20 - 30}px, ${i * 10 - 15}px) rotate(${i * 15 - 20}deg)`;
        centerArea.appendChild(cardEl);
    });

    if(state.msg) {
        statusAlert.innerText = state.msg;
    } else {
        statusAlert.innerText = `Player ${state.currentTurn + 1} ki chaal...`;
    }
});

socket.on('errorMsg', (msg) => { alert(msg); });

socket.on('gameOver', (msg) => { 
    alert(`GAME OVER: ${msg}`); 
    location.reload(); 
});
