import assert from 'node:assert/strict';
import { mintDeck, faces, idOf, holds, byId, pluck } from './cardInstance.ts';

const deck = mintDeck(['Шут', 'Шут', 'Казначей']);
assert.deepEqual(deck.map(d => d.id), ['c0', 'c1', 'c2'], 'ids are minted in order');
assert.deepEqual(faces(deck), ['Шут', 'Шут', 'Казначей']);

// Duplicate faces must stay distinguishable — this is the whole point.
assert.equal(idOf(deck, 'Шут'), 'c0', 'idOf returns the first instance');
assert.equal(idOf(deck, 'Рыцарь'), null);
assert.equal(holds(deck, 'Казначей'), true);
assert.equal(holds(deck, 'Рыцарь'), false);
assert.equal(byId(deck, 'c1')?.card, 'Шут');
assert.equal(byId(deck, 'nope'), null);
assert.equal(byId(deck, undefined), null);

const { taken, rest } = pluck(deck, 'c0');
assert.equal(taken?.id, 'c0');
assert.deepEqual(rest.map(r => r.id), ['c1', 'c2'], 'the other Шут survives');
assert.equal(deck.length, 3, 'pluck does not mutate');

const miss = pluck(deck, 'nope');
assert.equal(miss.taken, null);
assert.deepEqual(miss.rest.map(r => r.id), ['c0', 'c1', 'c2']);

console.log('cardInstance.check: ok');
