/**
 * ui.js — Tudo que toca o DOM diretamente. Setup (formato/vida/jogadores/
 * orientação), fluxo do Oráculo em etapas, grid de partida com dial de
 * vida (tap/hold/drag), menu radial (roda de segmentos) e modais temáticos
 * (substituem prompt()/alert() do MVP).
 */

const UI = {
  // ===== SETUP =====
  bindSetupEvents() {
    document.getElementById('format-select').addEventListener('change', (e) => {
      App.state.format = e.target.value;
    });

    this.bindLifeControls();
    this.setupPillGroup('player-pills', (val) => (App.state.playersCount = parseInt(val, 10)));
    this.setupPillGroup('rotation-pills', (val) => (App.state.autoRotate = val === 'auto'));

    const soundBtn = document.getElementById('sound-toggle');
    soundBtn.addEventListener('click', () => {
      App.state.soundOn = !App.state.soundOn;
      soundBtn.classList.toggle('active', App.state.soundOn);
    });

    document.getElementById('start-btn').addEventListener('click', () => App.startMatch());
    document.getElementById('oracle-action-btn').addEventListener('click', () => App.advanceOracle());
  },

  bindGlobalEvents() {
    document.body.addEventListener('pointerdown', () => App.audio.getContext(), { once: true });

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  },

  /**
   * Vida inicial: 6 presets do mockup (pills) + ajuste fino de ±5 pra
   * cobrir o intervalo completo 20-80 (os presets sozinhos vão só até 60).
   */
  bindLifeControls() {
    const pills = document.querySelectorAll('#life-pills .pill');
    const label = document.getElementById('life-value');

    const setLife = (val) => {
      val = Math.max(CONFIG.MIN_LIFE, Math.min(CONFIG.MAX_LIFE, val));
      App.state.startingLife = val;
      label.innerText = val;
      pills.forEach(p => p.classList.toggle('active', parseInt(p.dataset.val, 10) === val));
    };

    pills.forEach(pill => pill.addEventListener('click', () => setLife(parseInt(pill.dataset.val, 10))));
    document.getElementById('life-minus').addEventListener('click', () => setLife(App.state.startingLife - 5));
    document.getElementById('life-plus').addEventListener('click', () => setLife(App.state.startingLife + 5));
    setLife(App.state.startingLife);
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

    const rotatedIds = state.autoRotate ? (CONFIG.ROTATION_MAP[state.playersCount] || []) : [];

    state.players.forEach(player => {
      const isFlipped = rotatedIds.includes(player.id);
      const zone = document.createElement('div');
      zone.className = `player-zone player-${player.id}`;
      zone.dataset.playerId = player.id;

      zone.innerHTML = `
        <div class="dial-groove"></div>
        <div class="tap-zone tap-minus" data-side="minus"><span class="tap-hint">−</span></div>
        <div class="tap-zone tap-plus" data-side="plus"><span class="tap-hint">+</span></div>
        <div class="life-total" id="life-${player.id}">${player.life}</div>
        <div class="delta-indicator" id="delta-${player.id}"></div>
        <div class="player-deck-name">${player.deckEmoji || ''} ${player.deck}</div>
      `;

      Game.bindDialMechanic(zone, player, isFlipped);
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

  // ===== MENU RADIAL (roda de segmentos) =====
  buildRadialMenu(state) {
    const container = document.getElementById('radial-menu-container');
    const svg = document.getElementById('radial-wedges');
    svg.innerHTML = '';
    container.querySelectorAll('.radial-label').forEach(el => el.remove());

    const items = [
      { label: 'Vida', action: () => this.openLifeModal(state) },
      { label: 'Jogadores', action: () => this.openPlayerCountModal(state) },
      { label: 'Dado/Coin', action: () => this.openDiceCoinModal() },
      { label: 'Reset', action: () => App.resetToSetup(true) },
      { label: 'Menu', action: () => this.openExpandableMenu() }
    ];

    const n = items.length;
    const stepDeg = 360 / n;
    const gapDeg = 3;
    const rInner = 46;
    const rOuter = 116;
    const rLabel = (rInner + rOuter) / 2;
    const rad = deg => (deg * Math.PI) / 180;
    const point = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];

    items.forEach((item, i) => {
      const center = i * stepDeg - 90;
      const a0 = center - stepDeg / 2 + gapDeg / 2;
      const a1 = center + stepDeg / 2 - gapDeg / 2;

      const [x1, y1] = point(rOuter, a0);
      const [x2, y2] = point(rOuter, a1);
      const [x3, y3] = point(rInner, a1);
      const [x4, y4] = point(rInner, a0);
      const d = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `radial-wedge ${i % 2 === 0 ? 'wedge-a' : 'wedge-b'}`);
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        this.toggleMenu();
      });
      svg.appendChild(path);

      const [lx, ly] = point(rLabel, center);
      const label = document.createElement('div');
      label.className = 'radial-label';
      label.innerText = item.label;
      label.style.setProperty('--lx', `${lx}px`);
      label.style.setProperty('--ly', `${ly}px`);
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        this.toggleMenu();
      });
      container.appendChild(label);
    });
  },

  toggleMenu() {
    App.state.menuOpen = !App.state.menuOpen;
    document.getElementById('radial-menu-container').classList.toggle('open', App.state.menuOpen);
  },

  // ===== MODAL GENÉRICO =====
  openModal(title, bodyHTML, buttons) {
    document.getElementById('modal-title').innerText = title;
    this.setModalBody(bodyHTML);

    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = `modal-btn ${b.className || ''}`;
      btn.innerText = b.label;
      btn.addEventListener('click', () => {
        const shouldClose = b.onClick ? b.onClick() : true;
        if (shouldClose !== false) this.closeModal();
      });
      actions.appendChild(btn);
    });

    document.getElementById('modal-overlay').classList.add('active');
  },

  setModalBody(html) {
    document.getElementById('modal-body').innerHTML = html;
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
  },

  // ===== AÇÕES DO MENU RADIAL (conteúdo dos modais) =====
  openLifeModal(state) {
    let selectedId = (state.players.find(p => p.alive) || state.players[0]).id;
    let value = state.players.find(p => p.id === selectedId).life;

    const render = () => {
      const playerPills = state.players.map(p => `
        <button type="button" class="modal-player-pill ${p.id === selectedId ? 'active' : ''}" data-id="${p.id}">${p.name}</button>
      `).join('');

      this.setModalBody(`
        <div class="modal-player-row">${playerPills}</div>
        <div class="modal-stepper">
          <button type="button" class="stepper-btn" data-step="-1">−</button>
          <span class="stepper-value" id="modal-life-value">${value}</span>
          <button type="button" class="stepper-btn" data-step="1">+</button>
        </div>
      `);

      document.querySelectorAll('.modal-player-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedId = parseInt(btn.dataset.id, 10);
          value = state.players.find(p => p.id === selectedId).life;
          render();
        });
      });
      document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          value += parseInt(btn.dataset.step, 10);
          document.getElementById('modal-life-value').innerText = value;
        });
      });
    };

    this.openModal('Editar Vida', '', [
      { label: 'Cancelar', className: 'modal-btn-secondary' },
      { label: 'Confirmar', className: 'modal-btn-primary', onClick: () => { Game.setLifeManually(selectedId, value); } }
    ]);
    render();
  },

  openPlayerCountModal(state) {
    const pills = [];
    for (let n = CONFIG.MIN_PLAYERS; n <= CONFIG.MAX_PLAYERS; n++) {
      pills.push(`<button type="button" class="modal-player-pill ${n === state.playersCount ? 'active' : ''}" data-n="${n}">${n}</button>`);
    }

    this.openModal('Quantidade de Jogadores', `<div class="modal-player-row">${pills.join('')}</div>`, [
      { label: 'Fechar', className: 'modal-btn-secondary' }
    ]);

    document.querySelectorAll('.modal-player-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        Game.changePlayerCount(parseInt(btn.dataset.n, 10));
        this.closeModal();
      });
    });
  },

  openDiceCoinModal() {
    const rollMap = {
      coin: () => Dice.flipCoin(),
      '6': () => Dice.rollD6(),
      '10': () => Dice.rollD10(),
      '100': () => Dice.rollD100()
    };

    this.openModal('Dado / Moeda', `
      <div class="modal-dice-grid">
        <button type="button" class="dice-btn" data-roll="coin"><span class="dice-icon">🪙</span>Moeda</button>
        <button type="button" class="dice-btn" data-roll="6"><span class="dice-icon">🎲</span>d6</button>
        <button type="button" class="dice-btn" data-roll="10"><span class="dice-icon">🎲</span>d10</button>
        <button type="button" class="dice-btn" data-roll="100"><span class="dice-icon">🎲</span>d100</button>
      </div>
      <p class="modal-dice-result" id="modal-dice-result">&nbsp;</p>
    `, [{ label: 'Fechar', className: 'modal-btn-secondary' }]);

    document.querySelectorAll('.dice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.roll;
        const result = rollMap[key]();
        document.getElementById('modal-dice-result').innerText =
          key === 'coin' ? `🪙 ${result}` : `🎲 d${key}: ${result}`;
      });
    });
  },

  openExpandableMenu() {
    this.openModal('Menu', `
      <div class="modal-menu-list">
        <button type="button" class="modal-menu-item" id="modal-undo-btn">↺ Desfazer última jogada</button>
        <button type="button" class="modal-menu-item" id="modal-sound-btn">
          ${App.state.soundOn ? '🔊 Som ligado' : '🔇 Som desligado'}
        </button>
      </div>
    `, [{ label: 'Fechar', className: 'modal-btn-secondary' }]);

    document.getElementById('modal-undo-btn').addEventListener('click', () => {
      Game.undoLast();
      this.closeModal();
    });
    document.getElementById('modal-sound-btn').addEventListener('click', () => {
      App.state.soundOn = !App.state.soundOn;
      document.getElementById('modal-sound-btn').innerText = App.state.soundOn ? '🔊 Som ligado' : '🔇 Som desligado';
    });
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
