//Addcard ve draw temel iki fonksiyon gerisi yardımcı ve şablon:
//Kart görünüşleri unicode ve renklerle custom değil
const CONFIG = {
    SUITS: ['♠', '♥', '♦', '♣'],
    VALUES: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    CHIP_VALUES: [5, 10, 25, 50, 100, 500, 5000],
    NUM_DECKS: 6,
    RESHUFFLE_THRESHOLD: 52, 
    //Kalan kart 52den azsa karıştır
    NUM_PLAYERS: 7,
    STARTING_CHIPS: 5000,
    MIN_BET: 5,
    MAX_BET: 100000,
    BLACKJACK_PAYOUT: 1.5,
    INSURANCE_PAYOUT: 2,
    MAX_SPLIT_HANDS: 4,
    DEALER_STAND_VALUE: 17,
    DEAL_DELAY: 280
};
//Oyundaki değerler (obje halinde)
let cardIdCounter = 0;
//Her karta benzersiz id atamak lazım her kartta bir artar

// Sesler bir kütüphaneden alınmadı hz ile var
class SoundManager {
    constructor() { this.enabled = true; this.ctx = null; }
    init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
    resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }
    toggle() { this.enabled = !this.enabled; document.getElementById('soundToggle').textContent = this.enabled ? '🔊' : '🔇'; }
    play(type) {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        if (type === 'card') { this.tone(600, 0.08, 0.08); setTimeout(() => this.tone(800, 0.05, 0.05), 30); }
        else if (type === 'chip') { this.tone(1800, 0.04, 0.06); }
        else if (type === 'win') { [523,659,784,1047].forEach((f,i) => setTimeout(() => this.tone(f, 0.1, 0.25), i*100)); }
        else if (type === 'lose') { this.tone(200, 0.1, 0.3, 'sawtooth'); }
        else if (type === 'blackjack') { [523,659,784,1047,1319].forEach((f,i) => setTimeout(() => this.tone(f, 0.12, 0.35), i*80)); }
    }
    tone(freq, vol, dur, type='sine') {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination);
        o.frequency.value = freq; o.type = type;
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
        o.start(); o.stop(this.ctx.currentTime + dur);
    }
}
const sound = new SoundManager();

// Genel hesaplamalar altta:
const Utils = {
    cardValue(c) { return c.value === 'A' ? 11 : ['J','Q','K'].includes(c.value) ? 10 : parseInt(c.value); },
    //Tek kartın değeri arrayden alıyor

    calcTotal(cards) {
        let t = 0, a = 0; //t toplam--a=AS
        for (const c of cards) { if (c.value === 'A') { a++; t += 11; } else if (['J','Q','K'].includes(c.value)) t += 10; else t += parseInt(c.value); }
        //her kartı gez ve değere göre ekleme yap (As 11 olucak)
        while (t > 21 && a > 0) { t -= 10; a--; }
        //Ama 21den fazlaya ve AS varsa o zaman o kart artık 1 olur
        //Toplamdan 10 çıkacak tabii AS 1 sayıldı ya
        //Bu döngü tüm ASLAR gidene ve toplam 21den az olana kadar devam eder
        return t;
    },
    isBJ(cards) { return cards.length === 2 && this.calcTotal(cards) === 21; },
    //Kartlar 2 ise ve toplam 21 ise blackjacktir el biter

    isSoft(cards) {
        const t = this.calcTotal(cards); //Şuanki toplam bu
        if (!cards.some(c => c.value === 'A')) return false;
        //As yoksa çık

        const hard = cards.reduce((s,c) => s + (c.value === 'A' ? 1 : ['J','Q','K'].includes(c.value) ? 10 : parseInt(c.value)), 0);
        //Aslar 1 ile hesaplandı
        return t !== hard && t <= 21;
        //Toplam ile üst hesap ayrıysa o zaman bir AS 11 hala
        //Bu soft veya hard yazması için !!!Render.handSection()!!!
      
    },
    canSplit(cards) { return cards.length === 2 && this.cardValue(cards[0]) === this.cardValue(cards[1]); },
    //Split olabilir mi? İki kart olucak ikiside aynı olacak
    money(n) { return '$' + n.toLocaleString(); },
    //Parayı göster
    delay(ms) { return new Promise(r => setTimeout(r, ms)); },
    //Delay fonksiyonu global
    cardMargin(count) { return count <= 2 ? -6 : count === 3 ? -10 : count === 4 ? -16 : count === 5 ? -22 : count === 6 ? -28 : -34; }
    //Fazla kart daha çok üst üste biner css
};

// Hand
class Hand {
    constructor(bet = 0) {
        //El oluşturma
        this.cards = []; 
        this.bet = bet; 
        this.standing = false; 
        this.busted = false;
        this.doubled = false; 
        this.surrendered = false; 
        this.splitAces = false; 
        this.result = null;
    }
    get total() { 
        return Utils.calcTotal(this.cards); }

    get isBlackjack() { 
        return Utils.isBJ(this.cards) && !this.splitAces; }

    get isSoft() { 
        return Utils.isSoft(this.cards); }
        //Oyun bilgilerini hesaplamalardan alıyor

        //Ele kart ekleme aşağıda
    addCard(card) {
        card.id = ++cardIdCounter; 
        card.isNew = true;
        this.cards.push(card);
        //Kart ekleme fonksiyonu rastgele olanlardan alıyor
        
        if (this.total > 21) { 
            this.busted = true; this.standing = true; }
        //21den coksa busted el bitti
        setTimeout(() => card.isNew = false, 500);
        //isNew false oldu animasyon bitti 500ms sonra
        return this.busted;
        //Bust oldu?
    }
}

// Oyuncu için fonksiyon çağırılan yer her durum için var
//Tanımlama/Şablon
class Player {
    constructor(seat) {
        this.seat = seat; this.chips = CONFIG.STARTING_CHIPS;
        this.hands = [new Hand()]; this.handIdx = 0; this.insurance = 0; this.lastBet = 0; this.insDeclined = false;
    }
    get hand() { return this.hands[this.handIdx]; }
    get totalBet() { return this.hands.reduce((s,h) => s + h.bet, 0) + this.insurance; }
    get hasBet() { return this.hands[0].bet > 0; }

    placeBet(amt) { if (amt <= this.chips) { this.hand.bet += amt; this.chips -= amt; sound.play('chip'); return true; } return false; }
    clearBet() { this.chips += this.hand.bet; this.hand.bet = 0; }
    rebet() { if (this.lastBet > 0 && this.lastBet <= this.chips) { this.hand.bet = this.lastBet; this.chips -= this.lastBet; sound.play('chip'); return true; } return false; }

    canSplit() { return this.hand.cards.length === 2 && this.hands.length < CONFIG.MAX_SPLIT_HANDS && this.chips >= this.hand.bet && !this.hand.standing && !this.hand.busted && Utils.canSplit(this.hand.cards); }
    split() {
        if (!this.canSplit()) return false;
        const orig = this.hand, splitCard = orig.cards.pop();
        const newH = new Hand(orig.bet); newH.cards = [splitCard];
        if (orig.cards[0].value === 'A') { orig.splitAces = true; newH.splitAces = true; }
        this.chips -= newH.bet;
        this.hands.splice(this.handIdx + 1, 0, newH);
        return true;
    }

    canDouble() { return this.hand.cards.length === 2 && !this.hand.doubled && !this.hand.standing && !this.hand.busted && this.chips >= this.hand.bet; }
    double() { if (!this.canDouble()) return false; this.chips -= this.hand.bet; this.hand.bet *= 2; this.hand.doubled = true; return true; }

    canInsurance(upCard) { return upCard?.value === 'A' && this.insurance === 0 && !this.insDeclined && this.chips >= Math.floor(this.hands[0].bet / 2); }
    takeIns() { const a = Math.floor(this.hands[0].bet / 2); if (this.chips >= a) { this.chips -= a; this.insurance = a; return true; } return false; }

    canSurrender() { return this.hand.cards.length === 2 && this.hands.length === 1 && !this.hand.doubled && !this.hand.standing; }
    surrender() { if (!this.canSurrender()) return false; this.hand.surrendered = true; this.hand.standing = true; this.chips += Math.floor(this.hand.bet / 2); this.hand.result = 'surrender'; return true; }

    reset() { this.lastBet = this.hands[0].bet > 0 ? this.hands[0].bet : this.lastBet; this.hands = [new Hand()]; this.handIdx = 0; this.insurance = 0; this.insDeclined = false; }
}

// Kartlar desteye geliyor
class Shoe {
    constructor() { this.cards = []; this.create(); }
    create() {
        this.cards = []; //Buraya gelecek

        for (let d = 0; d < CONFIG.NUM_DECKS; d++) 
            for (const s of CONFIG.SUITS) 
            for (const v of CONFIG.VALUES) 
            this.cards.push({suit: s, value: v});
        //6 deste 4 suit ve 13 değer bitene kadar döner
        this.shuffle();  //AŞAĞIDA
        this.updateUI();
        //Ekrandaki sayıyı guncelle ve shuffle yani karıştır
    }
    shuffle() { 
        for (let i = this.cards.length - 1; i > 0; i--) { 
            const j = Math.floor(Math.random() * (i + 1)); //Rastgele index
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]]; } }
           //Yer değiştir ve böylece cardsa gir. Artık herkesin rastgele kartları olacak
    draw() { 
        if (this.cards.length < CONFIG.RESHUFFLE_THRESHOLD) 
            this.create(); 
        
        //52den az kaldıysa yeni deste
        
        const c = this.cards.pop(); 
        //Sondakini çek ve YOK ET^^^^
        //Şimdi bu rastgele kartlardan herkese kart verilebilecek
        
        this.updateUI(); return c; }
    updateUI() { 
        document.getElementById('cardsLeft').textContent = this.cards.length; }
        //son kartı al güncelle döndür
}

// Effects bj için
const Effects = {
    coinRain() {
        const cont = document.getElementById('coinRain'), coins = ['🪙','💰','✨'];
        for (let i = 0; i < 20; i++) {
            const c = document.createElement('div'); c.className = 'falling-coin';
            c.textContent = coins[Math.floor(Math.random() * coins.length)];
            c.style.left = Math.random() * 100 + '%'; c.style.animationDelay = Math.random() * 0.8 + 's';
            cont.appendChild(c); setTimeout(() => c.remove(), 3000);
        }
    }
};


// Insurance Modal
const InsModal = {
    players: [], idx: 0, cb: null,
    show(players, callback) {
        this.players = players.filter(p => p.hasBet && p.canInsurance({value:'A'}));
        this.cb = callback; this.idx = 0;
        if (!this.players.length) { callback(); return; }
        this.showFor(this.players[0]);
    },
    showFor(p) {
        const cost = Math.floor(p.hands[0].bet / 2);
        const el = document.createElement('div'); el.className = 'insurance-overlay'; el.id = 'insOverlay';
        el.innerHTML = `<div class="insurance-modal"><h2>🛡️ Insurance?</h2><p><strong>Seat ${p.seat}</strong><br>Dealer shows Ace.<br>Insurance costs <strong>${Utils.money(cost)}</strong><br><small>(Pays 2:1 if dealer has Blackjack)</small></p><div class="insurance-buttons"><button class="yes" onclick="InsModal.respond(true)">Yes - Take Insurance</button><button class="no" onclick="InsModal.respond(false)">No Thanks</button></div></div>`;
        document.body.appendChild(el);
    },
    respond(yes) {
        const p = this.players[this.idx];
        if (yes) { p.takeIns(); sound.play('chip'); } else { p.insDeclined = true; }
        document.getElementById('insOverlay')?.remove();
        this.idx++;
        if (this.idx < this.players.length) this.showFor(this.players[this.idx]);
        else { game.render(); this.cb(); }
    }
};

// Renderer
const Render = {
    card(c, hidden = false, isNew = false) {
        if (hidden) return `<div class="card card-back ${isNew ? 'dealing' : ''}"></div>`;
        const red = c.suit === '♥' || c.suit === '♦';
        return `<div class="card ${red ? 'red' : 'black'} ${isNew ? 'dealing' : ''}">
            <div class="card-corner"><span class="card-value">${c.value}</span><span class="card-suit-small">${c.suit}</span></div>
            <span class="card-suit-center">${c.suit}</span>
            <div class="card-corner bottom"><span class="card-value">${c.value}</span><span class="card-suit-small">${c.suit}</span></div></div>`;
    },
    dealerCards(dealer, hideHole = true) {
        const cont = document.getElementById('dealerCards'), badge = document.getElementById('dealerTotal');
        if (!dealer.hand.cards.length) { cont.innerHTML = ''; badge.style.display = 'none'; return; }

        const existing = new Set(Array.from(cont.querySelectorAll('.card-wrapper')).map(e => e.dataset.cardId));
        const margin = Utils.cardMargin(dealer.hand.cards.length);

        dealer.hand.cards.forEach((c, i) => {
            if (!existing.has(String(c.id))) {
                const w = document.createElement('div'); w.className = 'card-wrapper'; w.dataset.cardId = c.id;
                w.style.marginLeft = i === 0 ? '0' : margin + 'px';
                w.innerHTML = this.card(c, hideHole && i === 1, c.isNew);
                cont.appendChild(w);
            }
        });
        cont.querySelectorAll('.card-wrapper').forEach((e, i) => e.style.marginLeft = i === 0 ? '0' : margin + 'px');

        if (hideHole && dealer.hand.cards.length >= 2) { badge.textContent = `Showing: ${Utils.cardValue(dealer.hand.cards[0])}`; badge.className = 'dealer-total-badge'; }
        else {
            const t = dealer.hand.total;
            if (dealer.hand.busted) { badge.textContent = 'BUST!'; badge.className = 'dealer-total-badge bust'; }
            else if (dealer.hand.isBlackjack) { badge.textContent = 'BLACKJACK!'; badge.className = 'dealer-total-badge blackjack'; }
            else { badge.textContent = t; badge.className = 'dealer-total-badge'; }
        }
        badge.style.display = 'block';
    },
    revealHole(dealer) {
        const cont = document.getElementById('dealerCards'), ws = cont.querySelectorAll('.card-wrapper');
        if (ws.length >= 2) {
            const holeCard = dealer.hand.cards[1], hw = ws[1], cd = hw.querySelector('.card');
            if (cd?.classList.contains('card-back')) {
                cd.classList.add('flipping');
                setTimeout(() => { hw.innerHTML = this.card(holeCard, false, false); }, 250);
            }
        }
        setTimeout(() => {
            const badge = document.getElementById('dealerTotal'), t = dealer.hand.total;
            if (dealer.hand.busted) { badge.textContent = 'BUST!'; badge.className = 'dealer-total-badge bust'; }
            else if (dealer.hand.isBlackjack) { badge.textContent = 'BLACKJACK!'; badge.className = 'dealer-total-badge blackjack'; }
            else { badge.textContent = t; badge.className = 'dealer-total-badge'; }
        }, 300);
    },
    players(players, curIdx, phase, upCard) {
        document.getElementById('playersArea').innerHTML = players.map((p, i) => this.player(p, i, curIdx, phase, upCard)).join('');
    },
    player(p, idx, curIdx, phase, upCard) {
        const active = phase === 'playing' && curIdx === idx, betting = phase === 'betting';
        let boxCls = 'player-box';
        if (active) boxCls += ' active';
        if (phase === 'finished' && p.hasBet) {
            const res = p.hands.map(h => h.result).filter(r => r);
            if (res.includes('blackjack')) boxCls += ' blackjack-win';
            else if (res.every(r => r === 'win')) boxCls += ' winner';
            else if (res.every(r => r === 'loss' || r === 'surrender')) boxCls += ' loser';
        }

        const handsHtml = p.hands.map((h, hi) => this.handSection(h, hi, p, active && p.handIdx === hi, phase)).join('');
        let ctrl = '';
        if (betting) ctrl = this.bettingCtrl(p, idx);
        else if (active && phase === 'playing') ctrl = this.actionCtrl(p, upCard);

        return `<div class="player-spot">
            <div class="betting-circle ${p.totalBet > 0 ? 'has-bet' : ''}">${p.totalBet > 0 ? `<span class="bet-display">${Utils.money(p.totalBet)}</span>` : ''}</div>
            <div class="${boxCls}">${this.resultBadge(p, phase)}
                <div class="player-header"><span class="player-name">Seat ${p.seat}</span><span class="player-bankroll">💰 ${Utils.money(p.chips)}</span></div>
                ${handsHtml}${ctrl}
            </div></div>`;
    },
    handSection(h, hi, p, isCur, phase) {
        const t = h.total;
        let tCls = 'hand-total', tTxt = t.toString();
        if (h.busted) { tCls += ' bust'; tTxt = 'BUST'; }
        else if (h.isBlackjack) { tCls += ' blackjack'; tTxt = 'BJ!'; }
        else if (t === 21) { tCls += ' twenty-one'; tTxt = '21'; }
        else if (h.isSoft) tTxt = t + ' soft';

        const splitLbl = p.hands.length > 1 ? `<div class="split-indicator ${isCur && phase === 'playing' ? 'active-hand' : ''}">${isCur && phase === 'playing' ? '▶ ' : ''}Hand ${hi + 1}</div>` : '';
        const margin = Utils.cardMargin(h.cards.length);
        const cardsHtml = h.cards.map((c, i) => {
            const red = c.suit === '♥' || c.suit === '♦';
            return `<div class="card-wrapper" style="margin-left:${i === 0 ? 0 : margin}px"><div class="card ${red ? 'red' : 'black'} ${c.isNew ? 'dealing' : ''}">
                <div class="card-corner"><span class="card-value">${c.value}</span><span class="card-suit-small">${c.suit}</span></div>
                <span class="card-suit-center">${c.suit}</span>
                <div class="card-corner bottom"><span class="card-value">${c.value}</span><span class="card-suit-small">${c.suit}</span></div></div></div>`;
        }).join('');

        let badges = '';
        if (h.doubled) badges += '<span class="badge doubled">2X</span>';
        if (p.insurance > 0 && hi === 0) badges += '<span class="badge insurance">INS</span>';

        return `<div class="hand-section">${splitLbl}<div class="player-cards-area">${cardsHtml}</div>
            <div class="player-info-bar">${h.cards.length ? `<span class="${tCls}">${tTxt}</span>` : '<span></span>'}<div>${badges}</div></div></div>`;
    },
    bettingCtrl(p, idx) {
        const chips = CONFIG.CHIP_VALUES.map(v => `<div class="chip chip-${v} ${p.chips < v ? 'disabled' : ''}" onclick="game.placeBet(${idx},${v})">${v}</div>`).join('');
        return `<div class="betting-panel"><div class="chip-rack">${chips}</div>
            <div class="bet-actions"><button class="bet-btn clear" onclick="game.clearBet(${idx})">Clear</button>
            <button class="bet-btn rebet" onclick="game.rebet(${idx})" ${!p.lastBet || p.lastBet > p.chips ? 'disabled' : ''}>Rebet</button></div></div>`;
    },
    actionCtrl(p, upCard) {
        const h = p.hand;
        const canHit = !h.standing && !h.busted && !(h.splitAces && h.cards.length >= 2);
        const canStand = !h.standing && !h.busted;
        let html = `<div class="action-controls">
            <button class="action-btn hit" onclick="game.hit()" ${!canHit ? 'disabled' : ''}>Hit</button>
            <button class="action-btn stand" onclick="game.stand()" ${!canStand ? 'disabled' : ''}>Stand</button>
            <button class="action-btn double" onclick="game.double()" ${!p.canDouble() ? 'disabled' : ''}>Double</button>
            <button class="action-btn split" onclick="game.split()" ${!p.canSplit() ? 'disabled' : ''}>Split</button>`;
        if (p.canInsurance(upCard)) html += `<button class="action-btn insurance" onclick="game.takeIns()">Insurance ($${Math.floor(p.hands[0].bet/2)})</button>`;
        if (p.canSurrender()) html += `<button class="action-btn surrender" onclick="game.surrender()">Surrender</button>`;
        return html + '</div>';
    },
    resultBadge(p, phase) {
        if (phase !== 'finished' || !p.hasBet) return '';
        const res = p.hands.map(h => h.result).filter(r => r);
        if (!res.length) return '';
        let cls = 'result-badge show ', txt = '';
        if (res.includes('blackjack')) { cls += 'blackjack'; txt = 'BLACKJACK!'; }
        else if (res.every(r => r === 'win')) { cls += 'win'; txt = 'WIN!'; }
        else if (res.every(r => r === 'loss' || r === 'surrender')) { cls += 'loss'; txt = res.includes('surrender') ? 'SURRENDER' : 'LOSS'; }
        else if (res.every(r => r === 'push')) { cls += 'push'; txt = 'PUSH'; }
        else { cls += 'push'; txt = 'MIXED'; }
        return `<div class="${cls}">${txt}</div>`;
    }
};

// Game
class Game {
    constructor() {
        this.shoe = new Shoe();
        this.players = [];
        this.dealer = { hand: new Hand() };
        this.curIdx = 0;
        this.phase = 'betting';
        for (let i = 1; i <= CONFIG.NUM_PLAYERS; i++) this.players.push(new Player(i));
        sound.init();
        this.render();
    }

    placeBet(idx, amt) { if (this.phase !== 'betting') return; const p = this.players[idx]; if (p.hand.bet + amt <= CONFIG.MAX_BET && p.placeBet(amt)) this.render(); }
    clearBet(idx) { if (this.phase !== 'betting') return; this.players[idx].clearBet(); this.render(); }
    rebet(idx) { if (this.phase !== 'betting') return; const p = this.players[idx]; p.clearBet(); if (p.rebet()) this.render(); }

    async startRound() {
        const active = this.players.filter(p => p.hasBet);
        if (!active.length) { this.status('Place at least one bet!'); return; }
        for (const p of active) if (p.hands[0].bet < CONFIG.MIN_BET) { this.status(`Min bet: ${Utils.money(CONFIG.MIN_BET)}`); return; }

        this.phase = 'dealing';
        this.dealer.hand = new Hand();
        cardIdCounter = 0;
        document.getElementById('dealerCards').innerHTML = '';
        document.getElementById('dealerTotal').style.display = 'none';
        document.getElementById('dealBtn').style.display = 'none';
        this.status('Dealing...');
        this.render();

        // Deal cards
        for (let r = 0; r < 2; r++) {
            for (const p of this.players) if (p.hasBet) { p.hand.addCard(this.shoe.draw()); sound.play('card'); Render.players(this.players, -1, 'dealing', null); await Utils.delay(CONFIG.DEAL_DELAY); }
            this.dealer.hand.addCard(this.shoe.draw()); sound.play('card'); Render.dealerCards(this.dealer, true); await Utils.delay(CONFIG.DEAL_DELAY);
        }

        this.curIdx = this.players.findIndex(p => p.hasBet);
        const upCard = this.dealer.hand.cards[0];

        // Insurance phase - ONLY when dealer shows Ace
        // This is just a side bet - dealer does NOT peek at hole card
        if (upCard.value === 'A') {
            this.phase = 'insurance';
            this.status('Dealer shows Ace - Insurance?'); 
            this.render(); 
            await Utils.delay(600);
            
            // Offer insurance to all eligible players via modal
            const eligiblePlayers = this.players.filter(p => p.hasBet && p.canInsurance(upCard));
            if (eligiblePlayers.length > 0) {
                await new Promise(res => InsModal.show(this.players, res));
            }
            await Utils.delay(400);
        }

        // Now begin regular play - dealer does NOT check for blackjack yet
        // Players complete all their actions first
        this.phase = 'playing';
        this.render(); 
        this.status(); 
        this.autoCheck();
    }

    autoCheck() {
        const p = this.players[this.curIdx]; if (!p) return;
        const h = p.hand;
        if (h.isBlackjack && p.hands.length === 1) { h.standing = true; sound.play('blackjack'); setTimeout(() => this.next(), 500); return; }
        if (h.splitAces && h.cards.length >= 2) { h.standing = true; setTimeout(() => this.next(), 300); return; }
        if (h.total === 21 && h.cards.length > 2) { h.standing = true; setTimeout(() => this.next(), 300); }
    }

    async hit() {
        if (this.phase !== 'playing') return;
        const p = this.players[this.curIdx], h = p.hand;
        if (h.standing || h.busted) return;
        h.addCard(this.shoe.draw()); sound.play('card'); this.render();
        if (h.busted) { sound.play('lose'); await Utils.delay(400); this.next(); }
        else if (h.total === 21) { h.standing = true; await Utils.delay(300); this.next(); }
    }

    stand() { if (this.phase !== 'playing') return; const p = this.players[this.curIdx]; if (p.hand.standing || p.hand.busted) return; p.hand.standing = true; this.next(); }

    async double() {
        if (this.phase !== 'playing') return;
        const p = this.players[this.curIdx];
        if (p.double()) { sound.play('chip'); p.hand.addCard(this.shoe.draw()); sound.play('card'); p.hand.standing = true; this.render(); if (p.hand.busted) sound.play('lose'); await Utils.delay(400); this.next(); }
    }

    async split() {
        if (this.phase !== 'playing') return;
        const p = this.players[this.curIdx];
        if (p.split()) {
            sound.play('chip');
            p.hand.addCard(this.shoe.draw()); sound.play('card'); this.render(); await Utils.delay(CONFIG.DEAL_DELAY);
            p.hands[p.handIdx + 1].addCard(this.shoe.draw()); sound.play('card'); this.render(); await Utils.delay(CONFIG.DEAL_DELAY);
            if (p.hand.splitAces) { p.hand.standing = true; p.handIdx++; p.hand.standing = true; this.render(); await Utils.delay(300); this.next(); }
            else this.status();
        }
    }

    takeIns() { if (this.phase !== 'playing') return; const p = this.players[this.curIdx]; if (p.takeIns()) { sound.play('chip'); this.render(); } }
    surrender() { if (this.phase !== 'playing') return; const p = this.players[this.curIdx]; if (p.surrender()) { this.render(); this.next(); } }

    next() {
        const p = this.players[this.curIdx];
        if (p && p.handIdx < p.hands.length - 1) { p.handIdx++; this.render(); this.status(); this.autoCheck(); return; }
        do { this.curIdx++; if (this.curIdx >= this.players.length) { this.dealerPlay(); return; } } while (!this.players[this.curIdx].hasBet);
        this.players[this.curIdx].handIdx = 0; this.render(); this.status(); this.autoCheck();
    }

    async dealerPlay() {
        this.phase = 'dealer'; Render.revealHole(this.dealer); this.status("Dealer's turn");
        if (this.players.every(p => p.hands.every(h => h.bet === 0 || h.busted || h.surrendered))) { await Utils.delay(700); this.resolve(); return; }
        await Utils.delay(600);
        while (this.dealer.hand.total < CONFIG.DEALER_STAND_VALUE) { this.dealer.hand.addCard(this.shoe.draw()); sound.play('card'); Render.dealerCards(this.dealer, false); await Utils.delay(450); }
        if (this.dealer.hand.busted) sound.play('win');
        await Utils.delay(500); this.resolve();
    }

    resolve() {
        this.phase = 'finished';
        const dt = this.dealer.hand.total, db = this.dealer.hand.busted, dBJ = this.dealer.hand.isBlackjack;
        let hasWin = false, hasBJ = false;

        for (const p of this.players) {
            // Pay out insurance if dealer has blackjack
            if (p.insurance > 0) {
                if (dBJ) {
                    // Insurance pays 2:1, so player gets back insurance bet + 2x insurance bet
                    p.chips += p.insurance * 3;
                }
                // If dealer doesn't have BJ, insurance is lost (already deducted)
            }
            
            for (const h of p.hands) {
                if (h.bet === 0 || h.surrendered) continue;
                const pt = h.total, pBJ = h.isBlackjack;
                
                if (h.busted) {
                    // Player busted - always loses
                    h.result = 'loss';
                } else if (dBJ) {
                    // Dealer has blackjack
                    if (pBJ) {
                        // Both have blackjack = push
                        h.result = 'push'; 
                        p.chips += h.bet;
                    } else {
                        // Dealer BJ beats non-BJ hand
                        h.result = 'loss';
                    }
                } else if (pBJ) {
                    // Player blackjack, dealer doesn't have BJ
                    h.result = 'blackjack'; 
                    p.chips += h.bet + h.bet * CONFIG.BLACKJACK_PAYOUT; 
                    hasBJ = true; 
                    hasWin = true;
                } else if (db) {
                    // Dealer busted, player didn't
                    h.result = 'win'; 
                    p.chips += h.bet * 2; 
                    hasWin = true;
                } else if (pt > dt) {
                    // Player total higher
                    h.result = 'win'; 
                    p.chips += h.bet * 2; 
                    hasWin = true;
                } else if (pt === dt) {
                    // Same total = push
                    h.result = 'push'; 
                    p.chips += h.bet;
                } else {
                    // Dealer total higher
                    h.result = 'loss';
                }
            }
        }

        if (hasBJ) { sound.play('blackjack'); Effects.coinRain(); }
        else if (hasWin) sound.play('win');

        document.getElementById('newRoundBtn').style.display = 'inline-block';
        this.status('Round Complete'); this.render();
    }

    newRound() {
        for (const p of this.players) { p.reset(); if (p.chips < CONFIG.MIN_BET) p.chips = CONFIG.STARTING_CHIPS; }
        this.dealer.hand = new Hand(); this.curIdx = 0; this.phase = 'betting'; cardIdCounter = 0;
        document.getElementById('dealerCards').innerHTML = '';
        document.getElementById('dealerTotal').style.display = 'none';
        document.getElementById('dealBtn').style.display = 'inline-block';
        document.getElementById('newRoundBtn').style.display = 'none';
        this.render(); this.status('Place Your Bets');
    }

    resetGame() {
        if (confirm(`Reset all to ${Utils.money(CONFIG.STARTING_CHIPS)}?`)) {
            this.players = []; for (let i = 1; i <= CONFIG.NUM_PLAYERS; i++) this.players.push(new Player(i));
            this.dealer.hand = new Hand(); this.phase = 'betting'; this.curIdx = 0; this.shoe = new Shoe(); cardIdCounter = 0;
            document.getElementById('dealerCards').innerHTML = '';
            document.getElementById('dealerTotal').style.display = 'none';
            document.getElementById('dealBtn').style.display = 'inline-block';
            document.getElementById('newRoundBtn').style.display = 'none';
            this.render(); this.status('Game Reset');
        }
    }

    render() { Render.players(this.players, this.curIdx, this.phase, this.dealer.hand.cards[0]); }
    status(msg) {
        const el = document.getElementById('gameStatus');
        if (msg) { el.textContent = msg; return; }
        if (this.phase === 'betting') el.textContent = 'Place Your Bets';
        else if (this.phase === 'dealing') el.textContent = 'Dealing...';
        else if (this.phase === 'insurance') el.textContent = 'Insurance Offered';
        else if (this.phase === 'playing') { const p = this.players[this.curIdx]; el.textContent = `Seat ${p.seat}${p.hands.length > 1 ? ` • Hand ${p.handIdx + 1}/${p.hands.length}` : ''} - Your Move`; }
        else if (this.phase === 'dealer') el.textContent = "Dealer's Turn";
        else if (this.phase === 'finished') el.textContent = 'Round Complete';
    }
}

const game = new Game();
document.getElementById('soundToggle').addEventListener('click', () => sound.toggle());
document.addEventListener('keydown', e => { if (game.phase !== 'playing') return; const k = e.key.toLowerCase(); if (k === '1') game.hit(); else if (k === '2') game.stand(); else if (k === '3') game.double(); else if (k === '4') game.split(); });
document.addEventListener('click', () => sound.resume(), { once: true });
