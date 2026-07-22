/**
 * oracle.js — Fluxo do Oráculo em 3 etapas manuais (clique a clique), conforme
 * especificado: 1) sortear decks  2) sortear play/draw  3) avançar pra partida.
 * Busca decks reais da planilha via Code.gs; cai num fallback local se falhar.
 */

const Oracle = {
  FALLBACK_DECKS: [
    { name: 'Golgari Swarm', format: 'standard', emoji: '🕷️' },
    { name: 'Izzet Phoenix', format: 'standard', emoji: '🔥' },
    { name: 'Azorius Control', format: 'commander', emoji: '🛡️' },
    { name: 'Mono Red Aggro', format: 'standard', emoji: '⚔️' },
    { name: 'Dimir Rogues', format: 'commander', emoji: '🗡️' },
    { name: 'Selesnya Tokens', format: 'commander', emoji: '🌿' }
  ],

  stage: 'idle', // idle -> decks-revealed -> coinflip-done

  async preloadDecks() {
    try {
      const decks = await this.fetchDecks();
      App.state.decks = decks;
      App.state.decksLoaded = true;
    } catch (err) {
      console.warn('Preload de decks falhou, seguindo com fallback local:', err);
    }
  },

  async fetchDecks() {
    const url = `${CONFIG.API_URL}?action=decks`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Resposta inválida da API');
    if (!Array.isArray(data.decks) || data.decks.length === 0) {
      throw new Error('Planilha de decks vazia');
    }
    return data.decks;
  },

  /** Reinicia o estado do oráculo ao entrar na view (chamado por App.startMatch). */
  resetStage() {
    this.stage = 'idle';
    UI.updateOracleText('O Oráculo aguarda...', 'Toque para sortear os decks');
    UI.setOracleButton('Invocar o Oráculo');
    UI.clearDeckList();
    UI.setOracleOrbActive(false);
  },

  /** Chamado pelo clique único do botão da view Oracle — avança a etapa atual. */
  async advance(state) {
    if (this.stage === 'idle') {
      await this.revealDecks(state);
    } else if (this.stage === 'decks-revealed') {
      await this.rollPlayDraw(state);
    } else if (this.stage === 'coinflip-done') {
      App.beginMatchPlay();
    }
  },

  filterByFormat(pool, format) {
    const filtered = pool.filter(d => (d.format || '').toLowerCase() === format);
    return filtered.length ? filtered : pool; // se não houver decks do formato, usa tudo
  },

  async revealDecks(state) {
    UI.setOracleOrbActive(true);
    UI.updateOracleText('Consultando o Oráculo...', '');
    UI.setOracleButton('Sorteando...', true);

    let basePool = state.decksLoaded && state.decks.length ? [...state.decks] : [...this.FALLBACK_DECKS];
    basePool = this.filterByFormat(basePool, state.format);

    const allowRepeat = basePool.length < state.playersCount;
    const assigned = [];

    for (let i = 1; i <= state.playersCount; i++) {
      let pick;
      if (allowRepeat) {
        pick = basePool[Math.floor(Math.random() * basePool.length)];
      } else {
        const idx = Math.floor(Math.random() * basePool.length);
        pick = basePool.splice(idx, 1)[0];
      }
      assigned.push({
        id: i,
        name: `Jogador ${i}`,
        deck: pick.name,
        deckEmoji: pick.emoji || '🎴',
        life: state.startingLife
      });
    }

    state.players = assigned;

    await new Promise(res => setTimeout(res, 900)); // pequeno drama antes da revelação
    UI.revealDeckList(assigned);

    this.stage = 'decks-revealed';
    UI.updateOracleText('Os decks foram revelados.', 'Toque para sortear quem começa');
    UI.setOracleButton('Sortear Play/Draw');
  },

  async rollPlayDraw(state) {
    UI.setOracleButton('Sorteando...', true);

    const chooser = state.players[Math.floor(Math.random() * state.players.length)];
    const coinResult = await Dice.rollWithAnimation('Sorteando prioridade...', () => Dice.flipCoin());
    const playsFirst = coinResult === 'Cara';

    state.playDrawResult = {
      chooserId: chooser.id,
      coinResult,
      decision: playsFirst ? 'Play First' : 'Draw First'
    };

    this.stage = 'coinflip-done';
    UI.updateOracleText(
      `${chooser.name}: ${coinResult} — ${state.playDrawResult.decision}`,
      'Tudo pronto. Toque para iniciar a partida'
    );
    UI.setOracleButton('Iniciar Partida');
  }
};
