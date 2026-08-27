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
  const real = data.players.find(d => d.id === p.id)!;
  assert.equal(p.hand.length, real.hand.length, 'hand length must be preserved');
  assert.ok(p.hand.every(slot => slot.card === null), `player ${p.id}'s hand must be fully hidden from p1`);
  assert.deepEqual(
    p.hand.map(slot => slot.id),
    real.hand.map(slot => slot.id),
    'card ids are public — only the face is hidden, so a card keeps its identity across the wire'
  );
}

assert.equal('deck' in forP1, false, 'the raw deck array must never be sent');
assert.equal(forP1.deckSize, data.deck.length);

// The discard is the open "Кладбище двора" by the rules — it is published in
// full, faces and all. Only the deck stays a bare count.
assert.deepEqual(forP1.discardPile, data.discardPile, 'the graveyard is open to everyone');
assert.equal(forP1.discardPileSize, data.discardPile.length);

// informantPeekData must only reach its intended observer.
const dataWithPeek = { ...data, informantPeekData: { observerId: 'p2', targetId: 'p1', newCard: data.players[0].hand[0].card } };
const peekForP1 = redactStateForPlayer(dataWithPeek, 'p1');
const peekForP2 = redactStateForPlayer(dataWithPeek, 'p2');
assert.equal(peekForP1.informantPeekData, null, 'the peek target must not see the peeked card');
assert.deepEqual(peekForP2.informantPeekData, dataWithPeek.informantPeekData, 'the observer must see their own peek');

console.log('redaction.check.ts passed.');
