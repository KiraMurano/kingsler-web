/**
 * Self-check: hidden opponent hand cards must round-trip as truthy
 * placeholders, not `null` — `deriveCardZones`/`OpponentSeat` treat `null` as
 * "no card here", so a redacted (face-hidden) hand rendered as an empty
 * hand instead of showing the right number of card backs. Card ids survive
 * the trip untouched: identity is public, only the face is hidden.
 * Run: npx tsx apps/web/src/online/bindOnlineStore.check.ts
 */
import assert from 'node:assert/strict';
import { toStorePatch, bindOnlineStore } from './bindOnlineStore.ts';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Room } from '@colyseus/sdk';
import type { PublicGameState } from '@kinglier/engine/net/redaction';

const discardPile = [{ id: 'c9', card: 'Вор' }, { id: 'c4', card: 'Шут' }];

const state = {
  viewerId: 'p1',
  deckSize: 5,
  discardPile,
  discardPileSize: 2,
  players: [
    { id: 'p1', name: 'Я', hand: [{ id: 'c0', card: 'Наследник' }, { id: 'c1', card: 'Шут' }] },
    { id: 'p2', name: 'Друг', hand: [{ id: 'c2', card: null }, { id: 'c3', card: null }] },
    { id: 'p3', name: 'Друг без карты', hand: [{ id: 'c5', card: null }] }
  ]
} as unknown as PublicGameState;

const patch = toStorePatch(state);

const me = patch.players!.find(p => p.id === 'p1')!;
assert.deepEqual(
  me.hand,
  [{ id: 'c0', card: 'Наследник' }, { id: 'c1', card: 'Шут' }],
  "the viewer's own hand must pass through untouched"
);

const opponent = patch.players!.find(p => p.id === 'p2')!;
assert.equal(opponent.hand.length, 2, 'hidden hand must keep its real card count');
assert.ok(opponent.hand.every(slot => slot.card), 'hidden cards must be truthy placeholders, not null');
assert.deepEqual(opponent.hand.map(slot => slot.id), ['c2', 'c3'], 'ids survive redaction — identity is public');

const oneCardOpponent = patch.players!.find(p => p.id === 'p3')!;
assert.equal(oneCardOpponent.hand.length, 1, 'an opponent down to one card must still show exactly one');

// The graveyard arrives in full and is used as-is; only the deck is faked.
assert.deepEqual(patch.discardPile, discardPile, 'the published discard must be used verbatim');
assert.equal(patch.deck!.length, 5, 'the deck is faked at the published size');
assert.deepEqual(
  patch.deck!.map(c => c.id),
  ['srv-deck-0', 'srv-deck-1', 'srv-deck-2', 'srv-deck-3', 'srv-deck-4'],
  'faked deck cards get synthetic ids that cannot collide with real ones'
);

const originalPerform = useGameStore.getState().performAction;
const unbind = bindOnlineStore({ onMessage() {} } as unknown as Room);
assert.notEqual(useGameStore.getState().performAction, originalPerform, 'bind must swap in the network sender');
unbind();
assert.equal(useGameStore.getState().performAction, originalPerform, 'unbind must restore the local store methods');

console.log('bindOnlineStore.check.ts passed.');
