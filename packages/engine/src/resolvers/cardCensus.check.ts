/**
 * The one invariant the presentation layer stands on: every `CardId` in the
 * game is locatable in EXACTLY ONE zone — a hand, the deck, the discard, a
 * plot slot, or the current pending action. A card in two zones renders twice;
 * a card in none has nowhere to be drawn and simply vanishes off the table.
 *
 * This file is the shared helper for the bug checks that pin that invariant
 * (`duelResolver.check.ts`, `vetoWindow.check.ts`); it also self-tests below.
 * Run: npx tsx packages/engine/src/resolvers/cardCensus.check.ts
 */
import assert from 'node:assert/strict';
import type { CardId, CardInstance } from '../types.ts';

/** The slice of game state that can hold a card. Deliberately structural so
 *  the lightweight harnesses in the other check files can be passed straight in. */
export interface CardCensusState {
  players: {
    id: string;
    hand: CardInstance[];
    activePlot: { cardId: CardId } | null;
  }[];
  deck?: CardInstance[];
  discardPile?: CardInstance[];
  pendingAction?: { stakedCardId?: CardId } | null;
  pendingDuelDefenderCardId?: CardId | null;
}

/**
 * Walks the whole state and reports, per `CardId`, every zone it occupies.
 * More than one entry for an id means the card was cloned; an id that never
 * shows up at all has been destroyed.
 */
export function locateCards(state: CardCensusState): Map<CardId, string[]> {
  const zones = new Map<CardId, string[]>();
  const add = (id: CardId, where: string): void => {
    const found = zones.get(id);
    if (found) found.push(where);
    else zones.set(id, [where]);
  };

  for (const p of state.players) {
    for (const c of p.hand) add(c.id, `hand:${p.id}`);
    if (p.activePlot) add(p.activePlot.cardId, `plot:${p.id}`);
  }
  for (const c of state.deck ?? []) add(c.id, 'deck');
  for (const c of state.discardPile ?? []) add(c.id, 'discard');

  // The pending action is a zone of its own only for a card that is not in a
  // hand any more: an Intrigue/Instant leaves the hand the moment it is
  // played, while a face-down role stake stays in its owner's hand until a
  // challenge reveals it. Adding it unconditionally would report every
  // face-down stake as a clone of itself.
  for (const id of [state.pendingAction?.stakedCardId, state.pendingDuelDefenderCardId]) {
    if (id && !zones.has(id)) add(id, 'pendingAction');
  }

  return zones;
}

/**
 * Asserts the invariant: none of `expectedIds` is in two places at once, and
 * none of them has fallen out of the game entirely.
 */
export function assertCardCensus(
  state: CardCensusState,
  expectedIds: CardId[],
  label: string
): void {
  const zones = locateCards(state);

  const cloned = [...zones.entries()]
    .filter(([, where]) => where.length > 1)
    .map(([id, where]) => `${id} in ${where.join(' + ')}`);
  assert.deepEqual(cloned, [], `${label}: card(s) occupy more than one zone — ${cloned.join('; ')}`);

  const missing = expectedIds.filter(id => !zones.has(id));
  assert.deepEqual(missing, [], `${label}: card(s) have no zone left to be drawn in — ${missing.join(', ')}`);
}

/** Every card id that was minted into the game at setup time. */
export function allCardIds(state: CardCensusState): CardId[] {
  return [...locateCards(state).keys()];
}

// --- self-test: the helper must actually catch both failure modes ---
{
  const healthy: CardCensusState = {
    players: [
      { id: 'p1', hand: [{ id: 'c0', card: 'Наследник' }], activePlot: { cardId: 'c1' } },
      { id: 'p2', hand: [{ id: 'c2', card: 'Шут' }], activePlot: null }
    ],
    deck: [{ id: 'c3', card: 'Вор' }],
    discardPile: [{ id: 'c4', card: 'Дуэлянт' }],
    pendingAction: { stakedCardId: 'c0' }
  };
  assertCardCensus(healthy, ['c0', 'c1', 'c2', 'c3', 'c4'], 'healthy state');

  // A face-down stake still held in hand is one card, not two.
  assert.deepEqual(locateCards(healthy).get('c0'), ['hand:p1']);
  // A played Intrigue that has left the hand is located by the pending action.
  assert.deepEqual(
    locateCards({ players: [{ id: 'p1', hand: [], activePlot: null }], pendingAction: { stakedCardId: 'c9' } }).get('c9'),
    ['pendingAction']
  );

  const cloned: CardCensusState = {
    players: [{ id: 'p1', hand: [], activePlot: { cardId: 'c1' } }],
    discardPile: [{ id: 'c1', card: 'Королевский приём' }]
  };
  assert.throws(
    () => assertCardCensus(cloned, ['c1'], 'cloned state'),
    /more than one zone/,
    'the helper must catch a card that is in a plot slot and the discard at once'
  );

  const destroyed: CardCensusState = {
    players: [{ id: 'p1', hand: [], activePlot: null }],
    deck: [],
    discardPile: []
  };
  assert.throws(
    () => assertCardCensus(destroyed, ['c7'], 'destroyed state'),
    /no zone left/,
    'the helper must catch a card that has fallen out of the game'
  );
}

console.log('cardCensus.check: ok');
