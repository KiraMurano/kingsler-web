/**
 * Правила партии одним объектом.
 *
 * До этого модуля правила были рассыпаны по движку литералами: порог победы
 * шестёркой в одиннадцати местах, жетоны двойкой, цены пира и слуха — в UI и
 * в ботах по отдельности. Пока механики полируются вживую, каждая гипотеза
 * требовала правки в нескольких файлах, и копии успевали разъезжаться.
 *
 * Объект кладётся в `GameState.rules` и доезжает до онлайн-клиентов сам:
 * `GameStateData` выводится из `GameState` структурно, а `redactStateForPlayer`
 * разливает всё через `...rest`.
 */
import type { GameCard } from './cards';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_COPIES_MAP } from './cards';

export interface GameRules {
  /** Сколько корон нужно удержать круг, чтобы короноваться. */
  crownsToWin: number;
  /** До скольких жетонов действия восполняется игрок в начале своего хода. */
  actionTokens: number;
  /** Цена базового действия «Устроить пир» (+1 👑). */
  feastCost: number;
  /** Цена базового действия «Распустить слух» (-1 👑 цели). */
  rumorCost: number;
  /** Цена заявления роли «Шантажист». Списывается даже при блефе. */
  blackmailCost: number;
  /** Стоит ли вызов на дуэль жетона действия. */
  duelCostsToken: boolean;
  /**
   * Надбавка золотом за вызов на дуэль. Независима от всего остального:
   * платится и вместе с жетоном, и вместо него. 0 — дуэль золота не стоит.
   */
  duelCost: number;
  /**
   * «Платная дуэль»: без жетона щит можно поднять за золото, по цене платной
   * проверки. Имеет смысл только когда дуэль вообще стоит жетона и когда
   * проверку разрешено покупать, — `normalizeRules` это и гарантирует.
   */
  paidDuelEnabled: boolean;
  /** Можно ли отменить «Право вето» другим «Правом вето». */
  vetoOnVeto: boolean;
  /** «Срыв масок»: жертва атаки Вора/Шантажиста может купить проверку. */
  unmaskEnabled: boolean;
  unmaskCost: number;
  /** «Платная проверка»: любую проверку можно купить за золото. */
  paidDoubtEnabled: boolean;
  paidDoubtCost: number;
  /** Сколько копий каждой карты замешано в колоду. 0 — карта выключена. */
  deck: Record<GameCard, number>;
}

/** 4 игрока по 2 карты в стартовую руку. Меньше — партию не раздать. */
export const MIN_DECK_SIZE = 8;

const LIMITS = {
  crownsToWin: [1, 10],
  actionTokens: [1, 10],
  feastCost: [1, 10],
  rumorCost: [1, 10],
  blackmailCost: [0, 10],
  duelCost: [0, 10],
  unmaskCost: [1, 10],
  paidDoubtCost: [1, 10]
} as const satisfies Record<string, readonly [number, number]>;

export const RULE_LIMITS: Record<keyof typeof LIMITS, readonly [number, number]> = LIMITS;

/** Диапазон ползунка копий для любой карты. */
export const DECK_COPIES_LIMIT: readonly [number, number] = [0, 10];

export const ALL_CARDS: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

function defaultDeck(): Record<GameCard, number> {
  const deck = {} as Record<GameCard, number>;
  for (const card of ALL_CARDS) deck[card] = CARD_COPIES_MAP[card] ?? 0;
  return deck;
}

export const DEFAULT_RULES: GameRules = {
  crownsToWin: 5,
  actionTokens: 2,
  feastCost: 3,
  rumorCost: 5,
  blackmailCost: 0,
  duelCostsToken: true,
  duelCost: 0,
  paidDuelEnabled: false,
  vetoOnVeto: false,
  unmaskEnabled: false,
  unmaskCost: 3,
  paidDoubtEnabled: false,
  paidDoubtCost: 3,
  deck: defaultDeck()
};

function clampInt(value: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Приводит что угодно к валидным правилам.
 *
 * Это же и серверная валидация: правила приходят от клиента-хоста, а значит им
 * нельзя верить. `KinglierRoom` прогоняет их сюда перед стартом партии, и
 * клиентская проверка нужна только для того, чтобы объяснить игроку, что не так.
 */
export function normalizeRules(raw: unknown): GameRules {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<GameRules>;

  const rawDeck = (src.deck && typeof src.deck === 'object' ? src.deck : {}) as Partial<Record<GameCard, number>>;
  const deck = {} as Record<GameCard, number>;
  for (const card of ALL_CARDS) {
    deck[card] = clampInt(rawDeck[card], DEFAULT_RULES.deck[card], DECK_COPIES_LIMIT);
  }

  const paidDoubtEnabled = bool(src.paidDoubtEnabled, DEFAULT_RULES.paidDoubtEnabled);
  const duelCostsToken = bool(src.duelCostsToken, DEFAULT_RULES.duelCostsToken);

  return {
    crownsToWin: clampInt(src.crownsToWin, DEFAULT_RULES.crownsToWin, LIMITS.crownsToWin),
    actionTokens: clampInt(src.actionTokens, DEFAULT_RULES.actionTokens, LIMITS.actionTokens),
    feastCost: clampInt(src.feastCost, DEFAULT_RULES.feastCost, LIMITS.feastCost),
    rumorCost: clampInt(src.rumorCost, DEFAULT_RULES.rumorCost, LIMITS.rumorCost),
    blackmailCost: clampInt(src.blackmailCost, DEFAULT_RULES.blackmailCost, LIMITS.blackmailCost),
    duelCostsToken,
    duelCost: clampInt(src.duelCost, DEFAULT_RULES.duelCost, LIMITS.duelCost),
    /* «Платная дуэль» — это замена жетона золотом по цене платной проверки.
       Без жетона в цене заменять нечего, а без платной проверки неоткуда взять
       цену. Обе зависимости проверяются здесь, а не на экране: правила
       приходят от клиента, и верить им нельзя. */
    paidDuelEnabled:
      duelCostsToken && paidDoubtEnabled
        ? bool(src.paidDuelEnabled, DEFAULT_RULES.paidDuelEnabled)
        : false,
    vetoOnVeto: bool(src.vetoOnVeto, DEFAULT_RULES.vetoOnVeto),
    /* Взаимоисключение: «Платная проверка» — надмножество «Срыва масок».
       Держать оба включёнными нечего, и решать это должен один код, а не
       каждый экран по-своему. */
    unmaskEnabled: paidDoubtEnabled ? false : bool(src.unmaskEnabled, DEFAULT_RULES.unmaskEnabled),
    unmaskCost: clampInt(src.unmaskCost, DEFAULT_RULES.unmaskCost, LIMITS.unmaskCost),
    paidDoubtEnabled,
    paidDoubtCost: clampInt(src.paidDoubtCost, DEFAULT_RULES.paidDoubtCost, LIMITS.paidDoubtCost),
    deck
  };
}

export function deckSize(rules: GameRules): number {
  return ALL_CARDS.reduce((sum, card) => sum + (rules.deck[card] ?? 0), 0);
}

/**
 * Причины, по которым с этими правилами нельзя начинать партию.
 *
 * Возвращает человекочитаемые строки, а не булево: гасить кнопку старта молча
 * — значит заставлять игрока гадать, какой из тридцати ползунков он сломал.
 */
export function rulesProblems(rules: GameRules): string[] {
  const problems: string[] = [];
  const size = deckSize(rules);
  if (size < MIN_DECK_SIZE) {
    problems.push(
      `В колоде ${size} карт — нужно минимум ${MIN_DECK_SIZE}: четверо игроков берут по 2 карты в стартовую руку.`
    );
  }
  return problems;
}
