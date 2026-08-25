/**
 * Run: npx tsx apps/server/src/activeSeats.check.ts
 */
import assert from 'node:assert/strict';
import { setActiveSeat, getActiveSeat, clearActiveSeat } from './activeSeats.ts';

assert.equal(getActiveSeat('u1'), undefined);

setActiveSeat('u1', { roomId: 'ABC123', playerId: 'p1' });
assert.deepEqual(getActiveSeat('u1'), { roomId: 'ABC123', playerId: 'p1' });

setActiveSeat('u1', { roomId: 'ABC123', playerId: 'p1' }); // re-setting must not throw
clearActiveSeat('u1');
assert.equal(getActiveSeat('u1'), undefined);

clearActiveSeat('never-set'); // clearing an absent entry must be a no-op, not an error

console.log('activeSeats.check.ts passed.');
