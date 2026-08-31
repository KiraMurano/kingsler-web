import { 
  type Role, 
  type PlotType, 
  type InstantType, 
  type GameCard, 
  type CardCategory, 
  type CardDescription,
  ALL_ROLES, 
  ALL_PLOTS, 
  ALL_INSTANTS, 
  CARD_DESCRIPTIONS 
} from './data/cardDescriptions';

import { mintDeck, mintCard, type CardInstance } from './cardInstance';

export type { Role, PlotType, InstantType, GameCard, CardCategory, CardDescription };
export type CardInfo = CardDescription;

export { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS };
export const CARD_INFO = CARD_DESCRIPTIONS;

/**
 * Сколько карт держит игрок. До этого числа руку добирают в конце хода, и
 * ровно столько раздаётся на открытии партии.
 *
 * Было записано числом `2` в обоих местах, и «раздать» с «добрать» могли
 * разъехаться молча.
 */
export const HAND_SIZE = 2;

export const CARD_COPIES_MAP: Record<GameCard, number> = {
  // 6 Ролей (19 карт: Дуэлянт вчетвером, он один держит щит за весь двор)
  'Наследник': 3,
  'Казначей': 3,
  'Вор': 3,
  'Шантажист': 3,
  'Дуэлянт': 4,
  'Шут': 3,

  // 7 Интриг (6 типов × 2 + Тайный заговор × 3 = 15 карт)
  'Королевский приём': 2,
  'Чёрная книга': 2,
  'Сеть информаторов': 2,
  'Досье': 2,
  'Тайный заговор': 3,
  'Стража покоев': 2,
  'Охранная грамота': 2,

  // 6 Инстантов (16 карт)
  'Право вето': 5,
  'Обвинение в измене': 3,
  'Перенаправление': 2,
  'Ва-банк': 2,
  'Дворцовый переполох': 2,
  'Обыск покоев': 2
};

export const getCardMaxCopies = (card: GameCard): number => CARD_COPIES_MAP[card] ?? CARD_DESCRIPTIONS[card]?.copiesCount ?? 2;

export const TOTAL_ROLES_COUNT = ALL_ROLES.reduce((sum, r) => sum + (CARD_COPIES_MAP[r] ?? 3), 0);
export const TOTAL_PLOTS_COUNT = ALL_PLOTS.reduce((sum, p) => sum + (CARD_COPIES_MAP[p] ?? 2), 0);
export const TOTAL_INSTANTS_COUNT = ALL_INSTANTS.reduce((sum, i) => sum + (CARD_COPIES_MAP[i] ?? 2), 0);
export const TOTAL_DECK_SIZE = TOTAL_ROLES_COUNT + TOTAL_PLOTS_COUNT + TOTAL_INSTANTS_COUNT;

export function isRole(card: GameCard): card is Role {
  return ALL_ROLES.includes(card as Role);
}

export function isPlot(card: GameCard): card is PlotType {
  return ALL_PLOTS.includes(card as PlotType);
}

export function isInstant(card: GameCard): card is InstantType {
  return ALL_INSTANTS.includes(card as InstantType);
}

/**
 * Собирает колоду по карте копий: сколько какой карты замешано.
 *
 * Принимает саму карту копий, а не `GameRules`: правила уже импортируют этот
 * модуль ради `CARD_COPIES_MAP` и списков карт, и обратный импорт замкнул бы
 * цикл. Без аргумента собирается сегодняшний состав по умолчанию.
 *
 * Ids are minted after the shuffle, so they are stable but arbitrary — a card's
 * identity says nothing about which card it is.
 */
export function createInitialDeck(
  copies: Partial<Record<GameCard, number>> = CARD_COPIES_MAP
): CardInstance[] {
  const deck: GameCard[] = [];

  for (const [card, count] of Object.entries(copies)) {
    for (let i = 0; i < (count ?? 0); i++) {
      deck.push(card as GameCard);
    }
  }

  // Перемешивание алгоритмом Фишера-Йетса
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return mintDeck(deck);
}

export function drawCardsFromDeck(
  count: number,
  deck: CardInstance[],
  discardPile: CardInstance[]
): { drawn: CardInstance[]; deck: CardInstance[]; discardPile: CardInstance[]; wasReshuffled: boolean; reshuffledCount: number } {
  let curDeck = [...deck];
  let curDiscard = [...discardPile];
  const drawn: CardInstance[] = [];
  let wasReshuffled = false;
  let reshuffledCount = 0;

  for (let i = 0; i < count; i++) {
    if (curDeck.length === 0) {
      if (curDiscard.length === 0) {
        drawn.push(mintCard('Наследник'));
        continue;
      }
      wasReshuffled = true;
      reshuffledCount = curDiscard.length;
      curDeck = [...curDiscard];
      curDiscard = [];
      for (let j = curDeck.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [curDeck[j], curDeck[k]] = [curDeck[k], curDeck[j]];
      }
    }
    const card = curDeck.pop();
    if (card) {
      drawn.push(card);
    }
  }

  return { drawn, deck: curDeck, discardPile: curDiscard, wasReshuffled, reshuffledCount };
}
