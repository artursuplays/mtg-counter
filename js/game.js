/**
 * game.js — Motor de partida: toque direcional (single touch, esquerda/direita),
 * undo, histórico de delta, detecção de vitória/derrota.
 */

const Game = {
  startNewMatch(state) {
    state.matchStartedAt = Date.now();
    state.matchId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
   * Dial de vida por jogador — toque, segurar e arrastar, tudo num único
   * gesto de ponteiro por zona (em vez de dois listeners independentes por
   * metade), pra permitir que o arraste mude de direção livremente:
   *   - Toque único: aplica exatamente 1 ponto de vida (+1 na metade
   *     direita, -1 na esquerda).
   *   - Segurar parado (>450ms): repete a mudança na mesma direção do toque
   *     inicial, em intervalos curtos.
   *   - Arrastar (mais que DIAL_DRAG_THRESHOLD_PX): cancela a repetição por
   *     "segurar" e passa a aplicar mudanças a cada DIAL_DRAG_STEP_PX de
   *     deslocamento horizontal, na direção do arraste — como girar um dial.
   * Se o jogador estiver rotacionado 180° na tela (isFlipped), a direção é
   * invertida para que "direita"/arrastar-para-a-direita continue
   * significando "+1" do ponto de vista do próprio jogador.
   */
  bindDialMechanic(zone, player, isFlipped) {
    const minusEl = zone.querySelector('.tap-minus');
    const plusEl = zone.querySelector('.tap-plus');

    const effectiveSign = (movingRight) => {
      const plus = isFlipped ? !movingRight : movingRight;
      return plus ? 1 : -1;
    };

    const apply = (sign) => {
      this.updatePlayerLife(player.id, sign);
      UI.flashTapZone(zone, sign > 0 ? 'plus' : 'minus');
    };

    let holdTimeout = null;
    let holdInterval = null;
    let dragging = false;
    let startX = 0;
    let steppedPx = 0; // deslocamento já convertido em pontos de vida

    const clearTimers = () => {
      clearTimeout(holdTimeout);
      clearInterval(holdInterval);
      holdTimeout = null;
      holdInterval = null;
    };

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      try { zone.setPointerCapture && zone.setPointerCapture(e.pointerId); } catch (err) { /* captura opcional — não deve impedir o toque */ }
      dragging = false;
      startX = e.clientX;
      steppedPx = 0;

      const rect = zone.getBoundingClientRect();
      const pressedRight = (e.clientX - rect.left) > rect.width / 2;
      const sign = effectiveSign(pressedRight);

      apply(sign); // toque único já aplica a mudança imediatamente

      holdTimeout = setTimeout(() => {
        holdInterval = setInterval(() => {
          if (!dragging) apply(sign);
        }, CONFIG.HOLD_REPEAT_INTERVAL_MS);
      }, CONFIG.HOLD_REPEAT_DELAY_MS);
    };

    const onPointerMove = (e) => {
      if (holdTimeout === null && holdInterval === null && !dragging) return; // sem gesto ativo
      const totalDx = e.clientX - startX;

      if (!dragging && Math.abs(totalDx) >= CONFIG.DIAL_DRAG_THRESHOLD_PX) {
        dragging = true;
        clearInterval(holdInterval); // arraste assume o controle da repetição
        holdInterval = null;
      }

      if (!dragging) return;

      const targetSteps = Math.trunc(totalDx / CONFIG.DIAL_DRAG_STEP_PX);
      while (steppedPx < targetSteps) {
        apply(effectiveSign(true));
        steppedPx++;
      }
      while (steppedPx > targetSteps) {
        apply(effectiveSign(false));
        steppedPx--;
      }
    };

    const onPointerUp = () => {
      clearTimers();
      dragging = false;
    };

    zone.addEventListener('pointerdown', onPointerDown);
    zone.addEventListener('pointermove', onPointerMove);
    zone.addEventListener('pointerup', onPointerUp);
    zone.addEventListener('pointercancel', onPointerUp);

    // Mantém os rótulos visuais de +/- nas metades (decorativo/estático).
    minusEl.dataset.side = 'minus';
    plusEl.dataset.side = 'plus';
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

  /**
   * Ajusta a quantidade de jogadores em partida (item "Jogadores" do menu
   * radial). Jogadores existentes mantêm vida/deck/histórico; jogadores
   * novos entram com a vida inicial da partida. Reduzir remove os últimos
   * assentos. Reconstrói o grid inteiro (UI.buildMatchUI).
   */
  changePlayerCount(newCount) {
    const state = App.state;
    newCount = Math.max(CONFIG.MIN_PLAYERS, Math.min(CONFIG.MAX_PLAYERS, newCount));
    if (state.finished || newCount === state.players.length) return;

    if (newCount > state.players.length) {
      for (let id = state.players.length + 1; id <= newCount; id++) {
        state.players.push({
          id,
          name: `Jogador ${id}`,
          deck: '—',
          deckEmoji: '🎴',
          life: state.startingLife,
          currentDelta: 0,
          deltaTimeout: null,
          deltaHistory: [],
          alive: true
        });
      }
    } else {
      state.players.length = newCount;
    }

    state.playersCount = newCount;
    UI.buildMatchUI(state);
    UI.toast(`Jogadores ajustados para ${newCount}.`);
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
