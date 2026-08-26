import type { GameCard } from './cards.ts';

export type CardId = string;
export interface CardInstance { id: CardId; card: GameCard }

export function mintDeck(cards: GameCard[]): CardInstance[] {
  return cards.map((card, i) => ({ id: `c${i}`, card }));
}

export function faces(hand: CardInstance[]): GameCard[] {
  return hand.map(h => h.card);
}

export function idOf(hand: CardInstance[], card: GameCard): CardId | null {
  return hand.find(h => h.card === card)?.id ?? null;
}

export function holds(hand: CardInstance[], card: GameCard): boolean {
  return hand.some(h => h.card === card);
}

export function byId(hand: CardInstance[], id: CardId | undefined): CardInstance | null {
  if (!id) return null;
  return hand.find(h => h.id === id) ?? null;
}

export function pluck(
  hand: CardInstance[],
  id: CardId
): { taken: CardInstance | null; rest: CardInstance[] } {
  const i = hand.findIndex(h => h.id === id);
  if (i === -1) return { taken: null, rest: [...hand] };
  return { taken: hand[i], rest: [...hand.slice(0, i), ...hand.slice(i + 1)] };
}

/**
 * A card conjured outside the shuffled deck — only used when both the deck and
 * the discard are empty and the rules still owe someone a card. Its id must
 * never collide with a minted `c<n>`.
 */
let conjured = 0;
export function mintCard(card: GameCard): CardInstance {
  return { id: `x${conjured++}`, card };
}
