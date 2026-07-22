/**
 * dice.js — Sorteios auxiliares.
 * Corrige o gap da diretriz: coin, d6, d10, d100 (não d20, que não estava especificado).
 */

const Dice = {
  /** Cara e Coroa. Retorna 'Cara' ou 'Coroa'. */
  flipCoin() {
    App.audio.coin();
    return Math.random() < 0.5 ? 'Cara' : 'Coroa';
  },

  /** Dado genérico de N faces (1..N). */
  roll(sides) {
    App.audio.dice();
    return Math.floor(Math.random() * sides) + 1;
  },

  rollD6() { return this.roll(6); },
  rollD10() { return this.roll(10); },
  rollD100() { return this.roll(100); },

  /**
   * Executa um sorteio com pequeno delay dramático (para animação de UI)
   * e retorna o resultado via Promise.
   */
  async rollWithAnimation(label, rollFn, animationMs = 600) {
    UI.showDiceOverlay(label);
    await new Promise(res => setTimeout(res, animationMs));
    const result = rollFn.call(this);
    UI.updateDiceOverlay(result);
    await new Promise(res => setTimeout(res, 900));
    UI.hideDiceOverlay();
    return result;
  }
};
