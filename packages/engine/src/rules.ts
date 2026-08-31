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
  /**
   * Цена заявления роли «Шантажист». Списывается даже при блефе.
   *
   * **0 — это не цена, а выключенное правило**: тумблер «Платный шантаж» на
   * экране правил и есть проверка `blackmailCost > 0`. Отдельного флага нет
   * намеренно — он был бы вторым состоянием у одного и того же факта, и первый
   * же рассинхрон («флаг включён, цена ноль») пришлось бы чинить в трёх местах.
   */
  blackmailCost: number;
  /** Стоит ли вызов на дуэль жетона действия. */
  duelCostsToken: boolean;
  /**
   * Надбавка золотом за вызов на дуэль. Независима от всего остального:
   * платится и вместе с жетоном, и вместо него. 0 — дуэль золота не стоит.
   */
  duelCost: number;
  /**
   * «Платная дуэль»: без жетона щит можно поднять за золото. Имеет смысл
   * только когда дуэль вообще стоит жетона — иначе заменять в цене нечего, — и
   * это `normalizeRules` и гарантирует.
   */
  paidDuelEnabled: boolean;
  /**
   * Цена выкупа жетона на дуэли. Своя, а не взятая у платной проверки: щит и
   * проверка — разные ходы, и заимствование связывало руки на ровном месте,
   * заодно заставляя включать платную проверку ради одной только дуэли.
   * Надбавка `duelCost` платится сверх этой цены.
   */
  paidDuelCost: number;
  /** Можно ли отменить «Право вето» другим «Правом вето». */
  vetoOnVeto: boolean;
  /** «Срыв масок»: жертва атаки Вора/Шантажиста может купить проверку. */
  unmaskEnabled: boolean;
  unmaskCost: number;
  /** «Платная проверка»: любую проверку можно купить за золото. */
  paidDoubtEnabled: boolean;
  paidDoubtCost: number;
  /**
   * «Розыгрыш за монеты»: кончились жетоны — карту можно доиграть за золото.
   * Ограничение «одна роль за ход» при этом остаётся: покупка снимает нехватку
   * жетонов, а не лимит на заявление роли.
   */
  paidPlayEnabled: boolean;
  /**
   * Цена такого розыгрыша. Своя и независимая: раньше её перебивала цена
   * «Платной проверки», и два разных правила нельзя было развести по деньгам —
   * дешёвая проверка автоматически делала дешёвым и розыгрыш. Это разные ходы
   * (свой против чужого), и цениться они вправе по-разному.
   */
  paidPlayCost: number;
  /** Сколько копий каждой карты замешано в колоду. 0 — карта выключена. */
  deck: Record<GameCard, number>;
}

/** 4 игрока по 2 карты в стартовую руку. Меньше — партию не раздать. */
export const MIN_DECK_SIZE = 8;

/**
 * Цена, с которой включается «Платный шантаж».
 *
 * У шантажа `0` означает не «бесплатно», а «правило выключено» — отдельного
 * флага у него нет, — поэтому цену по умолчанию в `DEFAULT_RULES` не положить:
 * там лежит ноль. Стоит здесь, рядом с остальными покупками за золото, чтобы
 * все четыре двойки были видны разом.
 */
export const BLACKMAIL_PRICE_ON = 2;

const LIMITS = {
  crownsToWin: [1, 10],
  actionTokens: [1, 10],
  feastCost: [1, 10],
  rumorCost: [1, 10],
  blackmailCost: [0, 10],
  duelCost: [0, 10],
  paidDuelCost: [1, 10],
  unmaskCost: [1, 10],
  paidDoubtCost: [1, 10],
  paidPlayCost: [1, 10]
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
  crownsToWin: 3,
  actionTokens: 2,
  feastCost: 3,
  rumorCost: 5,
  blackmailCost: 0,
  duelCostsToken: true,
  duelCost: 0,
  paidDuelEnabled: true,
  paidDuelCost: 2,
  vetoOnVeto: true,
  unmaskEnabled: false,
  unmaskCost: 2,
  paidDoubtEnabled: true,
  /* Все пять покупок за золото стоят одинаково — две монеты: платная проверка,
     срыв масок, розыгрыш карты, выкуп щита на дуэли и (через
     `BLACKMAIL_PRICE_ON`) платный шантаж. Это одна и та же цена «жетона нет,
     плачу деньгами», и разъехавшиеся умолчания игрок выравнивал бы руками
     каждую партию. Ползунки при этом независимые: развести цены можно, просто
     начинать с разных незачем. */
  paidDoubtCost: 2,
  paidPlayEnabled: true,
  paidPlayCost: 2,
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
    /* «Платная дуэль» — это замена жетона золотом: без требования жетона
       заменять в цене нечего. Единственная зависимость, и проверяется она
       здесь, а не на экране: правила приходят от клиента, и верить им нельзя.
       Второй зависимости — от платной проверки — больше нет: у выкупа своя
       цена. */
    paidDuelEnabled: duelCostsToken
      ? bool(src.paidDuelEnabled, DEFAULT_RULES.paidDuelEnabled)
      : false,
    paidDuelCost: clampInt(src.paidDuelCost, DEFAULT_RULES.paidDuelCost, LIMITS.paidDuelCost),
    vetoOnVeto: bool(src.vetoOnVeto, DEFAULT_RULES.vetoOnVeto),
    /* Взаимоисключение: «Платная проверка» — надмножество «Срыва масок».
       Держать оба включёнными нечего, и решать это должен один код, а не
       каждый экран по-своему. */
    unmaskEnabled: paidDoubtEnabled ? false : bool(src.unmaskEnabled, DEFAULT_RULES.unmaskEnabled),
    unmaskCost: clampInt(src.unmaskCost, DEFAULT_RULES.unmaskCost, LIMITS.unmaskCost),
    paidDoubtEnabled,
    paidDoubtCost: clampInt(src.paidDoubtCost, DEFAULT_RULES.paidDoubtCost, LIMITS.paidDoubtCost),
    paidPlayEnabled: bool(src.paidPlayEnabled, DEFAULT_RULES.paidPlayEnabled),
    paidPlayCost: clampInt(src.paidPlayCost, DEFAULT_RULES.paidPlayCost, LIMITS.paidPlayCost),
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

/**
 * Во сколько золота обходится розыгрыш карты без жетона.
 *
 * Цена своя и ни от чего больше не зависит. Раньше её перебивала «Платная
 * проверка» — по образцу платной дуэли, — но там заимствование осмысленно:
 * платная дуэль это и есть купленная проверка, только со щитом. Розыгрыш в
 * свой ход к проверкам отношения не имеет, и общая цена лишь мешала развести
 * два правила по деньгам.
 *
 * Функция остаётся одна на движок и на экран: разъехавшаяся цена это либо
 * неоплаченный розыгрыш, либо кнопка, которая гаснет не по той причине.
 *
 * `null` — покупать нельзя вовсе.
 */
export function paidPlayPrice(rules: GameRules): number | null {
  return rules.paidPlayEnabled ? rules.paidPlayCost : null;
}

/**
 * Чем игрок платит за розыгрыш карты — и может ли вообще.
 *
 * Жетон приоритетнее золота: он восполняется в начале хода, золото — нет.
 * Золотая оплата открывается только `paidPlayEnabled` и только когда жетона
 * нет. `extraGold` — надбавка самой карты (шантаж); выкуп жетона складывается
 * с ней, а не вместо неё.
 *
 * Функция одна на движок и на экран: иначе кнопка «Разыграть за 2 🪙»
 * показывала ход, которого резолвер не принимал, и карта падала обратно в руку.
 */
export function playPayment(
  rules: GameRules,
  actor: { actionTokens: number; gold: number },
  extraGold = 0
): { tokens: number; gold: number } | null {
  if (actor.actionTokens >= 1) {
    return actor.gold >= extraGold ? { tokens: 1, gold: extraGold } : null;
  }
  const price = paidPlayPrice(rules);
  if (price === null) return null;
  const gold = price + extraGold;
  return actor.gold >= gold ? { tokens: 0, gold } : null;
}
