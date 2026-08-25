/**
 * Run: npx tsx apps/web/src/online/roomCode.check.ts
 */
import assert from 'node:assert/strict';
import { sanitizeRoomCode } from './roomCode.ts';

assert.equal(sanitizeRoomCode('ab-c1'), 'ABC1');
assert.equal(sanitizeRoomCode('абвxyz9!'), 'XYZ9');
assert.equal(sanitizeRoomCode('abcdefgh'), 'ABCDEF');
assert.equal(sanitizeRoomCode('  q2  '), 'Q2');
