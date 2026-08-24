/**
 * Self-check: hand slots stay put when a neighbour leaves.
 * Run: node --experimental-strip-types src/lib/handSlots.check.ts
 */
import assert from 'node:assert/strict';
import { compactIndex, reconcileHandSlots, type HandSlots } from './handSlots.ts';

const empty: HandSlots = [null, null];

assert.deepEqual(reconcileHandSlots(empty, ['Вор', 'Казначей']), ['Вор', 'Казначей']);

assert.deepEqual(reconcileHandSlots(['Вор', 'Казначей'], ['Казначей']), [null, 'Казначей']);
assert.deepEqual(reconcileHandSlots(['Вор', 'Казначей'], ['Вор']), ['Вор', null]);

assert.deepEqual(reconcileHandSlots([null, 'Казначей'], ['Обыск покоев', 'Казначей']), [
  'Обыск покоев',
  'Казначей'
]);

assert.deepEqual(reconcileHandSlots(['Вор', 'Вор'], ['Вор']), ['Вор', null]);
assert.deepEqual(reconcileHandSlots([null, null], []), [null, null]);
assert.deepEqual(reconcileHandSlots(['Вор', 'Казначей'], []), [null, null]);

assert.equal(compactIndex(['Казначей'], [null, 'Казначей'], 1), 0);
assert.equal(compactIndex(['Вор', 'Вор'], ['Вор', 'Вор'], 1), 1);

console.log('handSlots.check: ok');
