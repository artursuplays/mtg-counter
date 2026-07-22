/**
 * game.js — Motor de partida: toque direcional (single touch, esquerda/direita),
 * undo, histórico de delta, detecção de vitória/derrota.
 */

const Game = {
  startNewMatch(state) {
    state.matchStartedAt = Date.now();
    state.totalLifeChanges = 0;
    state.history = []; // pilha de undo: { playerId, change, timestamp }
    state.finished = false;

    state.players.forEach(p => {
      p.currentDelta = 0;
      p.deltaTimeout = null;
      p.deltaHistory = [];
      p.alive = true;
    });
  },

  /**
   * Toque direcional: metade direita da zona = +1 vida, metade esquerda = -1.
   * Se o jogador estiver rotacionado 180° na tela (isFlipped), os lados são
   * invertidos para que "direita" continue significando "+1" do ponto de
   * vista do próprio jogador.
   * Segurar (>450ms) repete a ação automaticamente (conveniência, não
   * substitui o toque único que é o requisito principal).
   */
  bindTapMechanic(zone, player, isFlipped) {
    const minusEl = zone.querySelector('.tap-minus');
    const plusEl = zone.querySelector('.tap-plus');

    const resolveChange = (side) => {
      // side: 'minus' ou 'plus' conforme a metade física tocada
      const isPlusSide = side === 'plus';
      const effectivePlus = isFlipped ? !isPlusSide : isPlusSide;
      return effectivePlus ? 1 : -1;
    };

    const bindSide = (el, side) => {
      let holdTimeout = null;
      let holdInterval = null;

      const fire = () => {
        this.updatePlayerLife(player.id, resolveChange(side));
        UI.flashTapZone(zone, side);
      };

      const start = (e) => {
        if (e.cancelable) e.preventDefault();
        fire(); // toque único já aplica a mudança imediatamente
        holdTimeout = setTimeout(() => {
          holdInterval = setInterval(fire, CONFIG.HOLD_REPEAT_INTERVAL_MS);
        }, CONFIG.HOLD_REPEAT_DELAY_MS);
      };

      const stop = () => {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
      };

      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', stop);
      el.addEventListener('touchcancel', stop);
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', stop);
      el.addEventListener('mouseleave', stop);
    };

    bindSide(minusEl, 'minus');
    bindSide(plusEl, 'plus');
  },

  updatePlayerLife(playerId, change, { skipHistory = false } = {}) {
    const player = App.state.players.find(p => p.id === playerId);
    if (!player || !player.alive || App.state.finished) return;

    player.life += change;
    player.currentDelta += change;
    App.state.totalLifeChanges++;

    if (!skipHistory) {
      App.state.history.push({ playerId, change, timestamp: Date.now() });
      player.deltaHistory.push({ change, life: player.life, timestamp: Date.now() });
    }

    change > 0 ? App.audio.lifeUp() : App.audio.lifeDown();

    UI.updateLifeDisplay(player);
    this.checkWinLossState();
  },

  undoLast() {
    const last = App.state.history.pop();
    if (!last) {
      UI.toast('Nada para desfazer.');
      return;
    }
    const player = App.state.players.find(p => p.id === last.playerId);
    if (!player) return;

    player.life -= last.change;
    player.deltaHistory.pop();
    UI.updateLifeDisplay(player, { skipDelta: true });
    UI.toast(`Desfeito: ${last.change > 0 ? '+' : ''}${last.change} (Jogador ${player.id})`);
  },

  setLifeManually(playerId, newValue) {
    const player = App.state.players.find(p => p.id === playerId);
    if (!player) return;
    const change = newValue - player.life;
    if (change === 0) return;
    this.updatePlayerLife(playerId, change);
  },

  checkWinLossState() {
    if (App.state.finished) return;

    App.state.players.forEach(p => {
      if (p.life <= 0 && p.alive) {
        p.alive = false;
        UI.markPlayerDefeated(p);
      }
    });

    const aliveCount = App.state.players.filter(p => p.alive).length;

    if (App.state.players.length >= 2 && aliveCount === 1) {
      const winner = App.state.players.find(p => p.alive);
      this.endMatch(winner.id);
    } else if (aliveCount === 0) {
      this.endMatch(null);
    }
  },

  endMatch(winnerId) {
    App.state.finished = true;
    App.releaseWakeLock();

    if (winnerId) {
      App.audio.victory();
      UI.showMatchEndOverlay(winnerId);
    } else {
      App.audio.defeat();
      UI.showMatchEndOverlay(null);
    }

    App.saveMatchResult(winnerId);
  }
};
