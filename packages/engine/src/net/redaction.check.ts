/**
 * redactStateForPlayer is the only place allowed to decide what a given
 * player's browser is allowed to see. This check exists because a leak here
 * breaks the game's entire bluffing mechanic.
 * Run: npx tsx packages/engine/src/net/redaction.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from '../GameStore.ts';
import { toGameStateData } from './gameStateData.ts';
import { redactStateForPlayer } from './redaction.ts';

useGameStore.getState().startGame([
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
]);
const data = toGameStateData(useGameStore.getState());

const forP1 = redactStateForPlayer(data, 'p1');
assert.equal(forP1.viewerId, 'p1', 'the payload must say which seat the recipient is');

const realP1 = data.players.find(p => p.id === 'p1')!;
const redactedP1 = forP1.players.find(p => p.id === 'p1')!;
assert.deepEqual(redactedP1.hand, realP1.hand, 'a player must see their own hand');

for (const p of forP1.players.filter(p => p.id !== 'p1')) {
  assert.equal(p.hand.length, data.players.find(d => d.id === p.id)!.hand.length, 'hand length must be preserved');
  assert.ok(p.hand.every(card => card === null), `player ${p.id}'s hand must be fully hidden from p1`);
}

assert.equal('deck' in forP1, false, 'the raw deck array must never be sent');
assert.equal(forP1.deckSize, data.deck.length);

assert.equal('discardPile' in forP1, false, 'the raw discard array must never be sent (it can hold face-down returned cards)');
assert.equal(forP1.discardPileSize, data.discardPile.length);

// informantPeekData must only reach its intended observer.
const dataWithPeek = { ...data, informantPeekData: { observerId: 'p2', targetId: 'p1', newCard: data.players[0].hand[0] } };
const peekForP1 = redactStateForPlayer(dataWithPeek, 'p1');
const peekForP2 = redactStateForPlayer(dataWithPeek, 'p2');
assert.equal(peekForP1.informantPeekData, null, 'the peek target must not see the peeked card');
assert.deepEqual(peekForP2.informantPeekData, dataWithPeek.informantPeekData, 'the observer must see their own peek');

console.log('redaction.check.ts passed.');
