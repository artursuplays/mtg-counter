/**
 * ui.js — Tudo que toca o DOM diretamente. Setup (formato/vida/jogadores),
 * fluxo do Oráculo em etapas, grid de partida com toque direcional (tap),
 * menu radial e overlays.
 */

const UI = {
  // ===== SETUP =====
  bindSetupEvents() {
    this.setupPillGroup('format-pills', (val) => (App.state.format = val));
    this.setupPillGroup('player-pills', (val) => (App.state.playersCount = parseInt(val, 10)));

    const slider = document.getElementById('life-slider');
    const label = document.getElementById('life-value');
    slider.addEventListener('input', () => {
      App.state.startingLife = parseInt(slider.value, 10);
      label.innerText = slider.value;
    });

    document.getElementById('start-btn').addEventListener('click', () => App.startMatch());
    document.getElementById('oracle-action-btn').addEventListener('click', () => App.advanceOracle());
  },

  bindGlobalEvents() {
    document.body.addEventListener('pointerdown', () => App.audio.getContext(), { once: true });
  },

  setupPillGroup(groupId, callback) {
    const group = document.getElementById(groupId);
    const pills = group.querySelectorAll('.pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        callback(pill.dataset.val);
      });
    });
  },

  // ===== ORACLE (fluxo em etapas) =====
  updateOracleText(title, subtext) {
    document.getElementById('oracle-text').innerText = title;
    document.getElementById('oracle-subtext').innerText = subtext || '';
  },

  setOracleButton(label, disabled = false) {
    const btn = document.getElementById('oracle-action-btn');
    btn.innerText = label;
    btn.disabled = disabled;
  },

  setOracleOrbActive(active) {
    document.getElementById('oracle-orb').classList.toggle('consulting', active);
  },

  clearDeckList() {
    document.getElementById('oracle-deck-list').innerHTML = '';
  },

  revealDeckList(players) {
    const list = document.getElementById('oracle-deck-list');
    list.innerHTML = '';
    players.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'deck-card';
      card.style.animationDelay = `${i * 120}ms`;
      card.innerHTML = `<span class="deck-emoji">${p.deckEmoji}</span><span class="deck-info"><b>${p.name}</b>${p.deck}</span>`;
      list.appendChild(card);
    });
  },

  // ===== MATCH BUILD =====
  buildMatchUI(state) {
    const grid = document.getElementById('match-grid');
    grid.className = `match-grid layout-${state.playersCount}`;
    grid.innerHTML = '';

    const rotatedIds = CONFIG.ROTATION_MAP[state.playersCount] || [];

    state.players.forEach(player => {
      const isFlipped = rotatedIds.includes(player.id);
      const zone = document.createElement('div');
      zone.className = `player-zone player-${player.id}`;
      zone.dataset.playerId = player.id;

      zone.innerHTML = `
        <div class="tap-zone tap-minus" data-side="minus"><span class="tap-hint">−</span></div>
        <div class="tap-zone tap-plus" data-side="plus"><span class="tap-hint">+</span></div>
        <div class="life-total" id="life-${player.id}">${player.life}</div>
        <div class="delta-indicator" id="delta-${player.id}"></div>
        <div class="player-deck-name">${player.deckEmoji || ''} ${player.deck}</div>
      `;

      Game.bindTapMechanic(zone, player, isFlipped);
      grid.appendChild(zone);
    });

    this.buildRadialMenu(state);
  },

  updateLifeDisplay(player, { skipDelta = false } = {}) {
    const lifeEl = document.getElementById(`life-${player.id}`);
    if (lifeEl) lifeEl.innerText = player.life;
    if (!skipDelta) this.showDelta(player);
  },

  showDelta(player) {
    const deltaEl = document.getElementById(`delta-${player.id}`);
    if (!deltaEl) return;

    const prefix = player.currentDelta > 0 ? '+' : '';
    deltaEl.innerText = `${prefix}${player.currentDelta}`;
    deltaEl.className = 'delta-indicator show ' + (player.currentDelta > 0 ? 'delta-positive' : 'delta-negative');

    deltaEl.style.transition = 'none';
    deltaEl.style.transform = 'translateY(20px)';
    void deltaEl.offsetWidth;
    deltaEl.style.transition = 'opacity 0.2s, transform 0.5s ease-out';
    deltaEl.style.transform = 'translateY(-50px)';

    if (player.deltaTimeout) clearTimeout(player.deltaTimeout);
    player.deltaTimeout = setTimeout(() => {
      player.currentDelta = 0;
      deltaEl.classList.remove('show');
    }, CONFIG.DELTA_TIMEOUT_MS);
  },

  flashTapZone(zone, side) {
    const el = zone.querySelector(`.tap-${side}`);
    if (!el) return;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 180);
  },

  markPlayerDefeated(player) {
    const zone = document.querySelector(`.player-zone[data-player-id="${player.id}"]`);
    if (zone) zone.classList.add('defeated');
  },

  // ===== MENU RADIAL =====
  buildRadialMenu(state) {
    const container = document.getElementById('radial-menu-container');
    container.querySelectorAll('.radial-item').forEach(el => el.remove());

    const items = [
      { label: 'Vida', action: () => this.promptManualLife(state) },
      { label: 'Undo', action: () => Game.undoLast() },
      { label: 'Dado', action: () => this.openDiceMenu() },
      { label: 'Coin', action: () => this.flipCoinDisplay() },
      { label: 'Reset', action: () => App.resetToSetup(true) }
    ];

    const radius = 90;
    items.forEach((item, index) => {
      const angle = (index / items.length) * (2 * Math.PI) - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const el = document.createElement('div');
      el.className = 'radial-item';
      el.innerText = item.label;
      el.style.setProperty('--tx', `${x}px`);
      el.style.setProperty('--ty', `${y}px`);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        this.toggleMenu();
      });

      container.appendChild(el);
    });
  },

  toggleMenu() {
    App.state.menuOpen = !App.state.menuOpen;
    document.getElementById('radial-menu-container').classList.toggle('open', App.state.menuOpen);
  },

  promptManualLife(state) {
    const idStr = prompt(`Editar vida de qual jogador? (1-${state.players.length})`);
    const id = parseInt(idStr, 10);
    const player = state.players.find(p => p.id === id);
    if (!player) return;

    const valStr = prompt(`Novo valor de vida para Jogador ${id} (atual: ${player.life}):`);
    const val = parseInt(valStr, 10);
    if (!Number.isNaN(val)) Game.setLifeManually(id, val);
  },

  flipCoinDisplay() {
    const result = Dice.flipCoin();
    this.toast(`🪙 ${result}`);
  },

  openDiceMenu() {
    const choice = prompt('Qual dado? Digite: 6, 10 ou 100');
    const map = { '6': () => Dice.rollD6(), '10': () => Dice.rollD10(), '100': () => Dice.rollD100() };
    const rollFn = map[choice];
    if (!rollFn) return;
    const result = rollFn();
    this.toast(`🎲 d${choice}: ${result}`);
  },

  // ===== OVERLAYS =====
  showDiceOverlay(label) { this.toast(label, 5000); },
  updateDiceOverlay(result) { this.toast(`Resultado: ${result}`, 900); },
  hideDiceOverlay() {},

  showMatchEndOverlay(winnerId) {
    const overlay = document.getElementById('match-end-overlay');
    const title = document.getElementById('match-end-title');
    const subtitle = document.getElementById('match-end-subtitle');

    if (winnerId) {
      const winner = App.state.players.find(p => p.id === winnerId);
      title.innerText = '🏆 Vitória!';
      subtitle.innerText = `${winner.name} venceu com ${winner.deck}`;
      overlay.classList.add('victory');
    } else {
      title.innerText = '💀 Fim de jogo';
      subtitle.innerText = 'Todos os jogadores foram derrotados.';
      overlay.classList.add('defeat');
    }

    overlay.classList.add('active');
    document.getElementById('match-end-btn').onclick = () => {
      overlay.classList.remove('active', 'victory', 'defeat');
      App.resetToSetup(false);
    };
  },

  toast(message, durationMs = 2200) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.getElementById('app').appendChild(el);
    }
    el.innerText = message;
    el.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => el.classList.remove('show'), durationMs);
  }
};
