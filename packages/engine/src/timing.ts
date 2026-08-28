/** Pause so a tabled action can be read before the next beat. */
export const ACTION_HOLD_MS = 2200;

/** Bot thinking before taking their own turn action. */
export const BOT_MOVE_MS = 1600;
export const BOT_MOVE_JITTER_MS = 700;

/** Bot considering a reaction (doubt / block / duel). */
export const BOT_REACTION_MS = 1800;
export const BOT_REACTION_JITTER_MS = 800;

/** Bot considering a veto on a pending effect. */
export const BOT_VETO_MS = 1400;
export const BOT_VETO_JITTER_MS = 600;

/**
 * Окно вето. Открывается на каждое ветируемое действие, независимо от того,
 * держит ли кто-то «Право вето»: пауза одинаковой длины предсказуема, а
 * разная — читается как подсказка о чужих картах.
 *
 * Цена — эта пауза добавляется к каждому действию, так что партия против
 * ботов на неё заметно тяжелеет. Это одно число: если в игре окажется долго,
 * крутить здесь. Начинали с 7 с, в игре оказалось долго.
 */
export const VETO_WINDOW_MS = 5000;

/**
 * Пауза между сбросом и добором при обмене карт руки.
 *
 * Оба движения происходили в одном кадре состояния, и слой карт пружинил их
 * одновременно: на столе это читалось как одно смазанное движение вместо двух.
 * Пауза вычитается из `ACTION_HOLD_MS`, так что ход целиком не удлиняется —
 * меняется только то, как он разбит.
 */
export const EXCHANGE_DRAW_MS = 800;

/**
 * Полёт монетки в стартовом жребии: от подброса до приземления, после которого
 * поверх неё встаёт имя первого ходящего.
 *
 * Это единственное здесь про время. Дальше экран держится не таймером, а
 * готовностью — партия начинается, когда её начали все живые игроки.
 */
export const TOSS_SPIN_MS = 2200;
