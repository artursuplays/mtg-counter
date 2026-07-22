/**
 * app.js — Orquestrador central da aplicação.
 * Mantém CONFIG, App.state, wake lock, áudio e o ciclo de vida geral.
 * Depende de: dice.js, oracle.js, game.js, ui.js (carregados antes deste no index.html
 * seria o ideal, mas todos se registram em window.App para evitar ordem rígida).
 */

const CONFIG = {
  // Cole aqui a URL do deployment do Apps Script (.../exec)
  API_URL: 'https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec',
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
  MIN_LIFE: 20,
  MAX_LIFE: 40,
  FORMATS: ['standard', 'commander'],
  HOLD_REPEAT_DELAY_MS: 450,   // tempo até começar a repetição ao segurar
  HOLD_REPEAT_INTERVAL_MS: 130, // intervalo entre repetições
  DELTA_TIMEOUT_MS: 2000,
  // Mapa de quais jogadores ficam rotacionados 180° em cada layout (espelha o CSS)
  ROTATION_MAP: {
    2: [1],
    3: [1, 2],
    4: [1, 2],
    5: [1, 2, 3],
    6: [1, 2, 3]
  }
};

const App = {
  state: {
    format: 'standard',
    startingLife: 20,
    playersCount: 4,
    players: [],
    menuOpen: false,
    matchStartedAt: null,
    totalLifeChanges: 0,
    decks: [],
    decksLoaded: false
  },

  wakeLock: null,

  async init() {
    UI.bindSetupEvents();
    UI.bindGlobalEvents();
    await Oracle.preloadDecks(); // tenta carregar decks cedo, silenciosamente
  },

  // ===== NAVEGAÇÃO =====
  switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
  },

  // ===== FLUXO PRINCIPAL (etapas manuais, um clique por vez) =====
  startMatch() {
    this.switchView('view-oracle');
    Oracle.resetStage();
  },

  /** Chamado a cada clique do botão único da view Oracle. */
  async advanceOracle() {
    try {
      await Oracle.advance(this.state);
    } catch (err) {
      console.error('Falha no fluxo do oráculo:', err);
      UI.toast('Algo deu errado. Usando modo offline.');
    }
  },

  /** Chamado quando o jogador confirma o fim do fluxo do oráculo (3ª etapa). */
  beginMatchPlay() {
    this.requestWakeLock();
    Game.startNewMatch(this.state);
    UI.buildMatchUI(this.state);
    this.switchView('view-match');
  },

  async resetToSetup(confirmFirst) {
    if (confirmFirst && this.state.players.length && !confirm('Encerrar a partida atual?')) {
      return;
    }
    this.releaseWakeLock();
    this.state.players = [];
    this.state.menuOpen = false;
    this.switchView('view-setup');
  },

  // ===== WAKE LOCK (tela não apaga durante a partida) =====
  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
      document.addEventListener('visibilitychange', this._reacquireWakeLock);
    } catch (err) {
      console.warn('Wake Lock indisponível:', err);
    }
  },

  _reacquireWakeLock: async () => {
    if (document.visibilityState === 'visible' && document.getElementById('view-match').classList.contains('active')) {
      await App.requestWakeLock();
    }
  },

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  },

  // ===== PERSISTÊNCIA DE RESULTADO =====
  async saveMatchResult(winnerId) {
    const durationSeconds = this.state.matchStartedAt
      ? Math.round((Date.now() - this.state.matchStartedAt) / 1000)
      : 0;

    const payload = {
      action: 'saveResult',
      format: this.state.format,
      winnerId,
      lifeChanges: this.state.totalLifeChanges,
      durationSeconds,
      players: this.state.players.map(p => ({
        id: p.id,
        name: p.name || `Jogador ${p.id}`,
        deck: p.deck,
        finalLife: p.life
      }))
    };

    try {
      // text/plain evita preflight CORS no Apps Script
      await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Não foi possível salvar o resultado na planilha:', err);
      UI.toast('Resultado não sincronizado (sem conexão).');
    }
  },

  // ===== ÁUDIO SINTETIZADO (sem arquivos externos — robusto e leve) =====
  audio: {
    ctx: null,

    getContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      // Navegadores exigem gesto do usuário para retomar o contexto
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    tone(freq, durationMs, type = 'sine', gainValue = 0.15) {
      try {
        const ctx = this.getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = gainValue;
        osc.connect(gain).connect(ctx.destination);
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(gainValue, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
        osc.start(now);
        osc.stop(now + durationMs / 1000);
      } catch (err) {
        // Áudio nunca deve quebrar o jogo
      }
    },

    lifeUp() { this.tone(880, 90, 'sine', 0.12); },
    lifeDown() { this.tone(220, 120, 'sawtooth', 0.10); },
    touch() { this.tone(440, 40, 'triangle', 0.05); },
    dice() { this.tone(600, 60, 'square', 0.08); },
    coin() { this.tone(700, 80, 'sine', 0.1); },

    victory() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this.tone(f, 220, 'sine', 0.15), i * 140)
      );
    },

    defeat() {
      [392, 349, 294, 262].forEach((f, i) =>
        setTimeout(() => this.tone(f, 300, 'sawtooth', 0.12), i * 180)
      );
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
