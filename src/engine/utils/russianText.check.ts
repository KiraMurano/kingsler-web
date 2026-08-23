/**
 * Self-check for name inflection.
 * Run: node --experimental-strip-types src/engine/utils/russianText.check.ts
 */
import assert from 'node:assert/strict';
import { declineAcc, declineGen } from './russianText.ts';

assert.equal(declineAcc('Вы'), 'вас');
assert.equal(declineGen('Вы'), 'вас');
assert.equal(declineAcc('Маркиз Вадим'), 'Маркиз Вадима');
assert.equal(declineGen('Маркиз Вадим'), 'Маркиз Вадима');
assert.equal(declineAcc('Графиня Елена'), 'Графиня Елену');
assert.equal(declineGen('Графиня Елена'), 'Графиня Елены');

console.log('russianText.check: ok');
