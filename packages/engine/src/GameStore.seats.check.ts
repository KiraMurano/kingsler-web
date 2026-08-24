/**
 * startGame must seat real joined players in order and fill any remaining
 * seats (up to 4) with bots. Run: npx tsx packages/engine/src/GameStore.seats.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from './GameStore.ts';
import { TOTAL_DECK_SIZE } from './cards.ts';

useGameStore.getState().startGame([
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
]);

const state = useGameStore.getState();
assert.equal(state.players.length, 4, 'must always seat exactly 4 players');

const [seat1, seat2, seat3, seat4] = state.players;
assert.equal(seat1.id, 'p1');
assert.equal(seat1.name, 'Аня');
assert.equal(seat1.isBot, false);
assert.equal(seat1.seatNumber, 1);

assert.equal(seat2.id, 'p2');
assert.equal(seat2.name, 'Боря');
assert.equal(seat2.isBot, false);
assert.equal(seat2.seatNumber, 2);

assert.equal(seat3.isBot, true);
assert.equal(seat3.seatNumber, 3);
assert.equal(seat4.isBot, true);
assert.equal(seat4.seatNumber, 4);

for (const p of state.players) {
  assert.equal(p.hand.length, 2, `${p.id} must be dealt 2 cards`);
  assert.equal(p.gold, 2);
  assert.equal(p.actionTokens, 2);
}
assert.equal(state.deck.length, TOTAL_DECK_SIZE - 8, 'deck must be down by 4 players x 2 cards');
assert.equal(state.activePlayerId, 'p1', 'the first seated human goes first');

// Backward compatibility: calling with no seats keeps today's solo-vs-3-bots behavior.
useGameStore.getState().startGame();
const solo = useGameStore.getState();
assert.equal(solo.players.length, 4);
assert.equal(solo.players[0].id, 'p1');
assert.equal(solo.players.filter(p => !p.isBot).length, 1, 'no-args startGame must still mean exactly one human');

console.log('GameStore.seats.check.ts passed.');
