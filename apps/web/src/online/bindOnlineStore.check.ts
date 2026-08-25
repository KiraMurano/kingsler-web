/**
 * Self-check: hidden opponent hand cards must round-trip as truthy
 * placeholders, not `null` — `useHandSlots`/`OpponentSeat` treat `null` as
 * "no card here", so a redacted (identity-hidden) hand rendered as an empty
 * hand instead of showing the right number of card backs.
 * Run: npx tsx apps/web/src/online/bindOnlineStore.check.ts
 */
import assert from 'node:assert/strict';
import { toStorePatch, bindOnlineStore } from './bindOnlineStore.ts';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Room } from '@colyseus/sdk';
import type { PublicGameState } from '@kinglier/engine/net/redaction';

const state = {
  viewerId: 'p1',
  deckSize: 5,
  discardPileSize: 2,
  players: [
    { id: 'p1', name: 'Я', hand: ['Наследник', 'Шут'] },
    { id: 'p2', name: 'Друг', hand: [null, null] },
    { id: 'p3', name: 'Друг без карты', hand: [null] }
  ]
} as unknown as PublicGameState;

const patch = toStorePatch(state);

const me = patch.players!.find(p => p.id === 'p1')!;
assert.deepEqual(me.hand, ['Наследник', 'Шут'], "the viewer's own hand must pass through untouched");

const opponent = patch.players!.find(p => p.id === 'p2')!;
assert.equal(opponent.hand.length, 2, 'hidden hand must keep its real card count');
assert.ok(opponent.hand.every(card => card), 'hidden cards must be truthy placeholders, not null');

const oneCardOpponent = patch.players!.find(p => p.id === 'p3')!;
assert.equal(oneCardOpponent.hand.length, 1, 'an opponent down to one card must still show exactly one');

const originalPerform = useGameStore.getState().performAction;
const unbind = bindOnlineStore({ onMessage() {} } as unknown as Room);
assert.notEqual(useGameStore.getState().performAction, originalPerform, 'bind must swap in the network sender');
unbind();
assert.equal(useGameStore.getState().performAction, originalPerform, 'unbind must restore the local store methods');

console.log('bindOnlineStore.check.ts passed.');
