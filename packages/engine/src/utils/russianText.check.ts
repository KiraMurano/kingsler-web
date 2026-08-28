/**
 * Self-check for name inflection.
 *
 * Склоняется каждое слово имени, а не только последнее: у ботов имена
 * двусоставные, и «на Барон Диму» — это половина склонения. Ники живых игроков
 * не склоняются вовсе, поэтому решение принимается по `isBot`, а не по виду
 * строки.
 *
 * Run: npx tsx packages/engine/src/utils/russianText.check.ts
 */
import assert from 'node:assert/strict';
import { accOf, declineAcc, declineGen, genOf, verbCaught, verbDoubted } from './russianText.ts';

assert.equal(declineAcc('Вы'), 'вас');
assert.equal(declineGen('Вы'), 'вас');

// Титул склоняется вместе с именем.
assert.equal(declineAcc('Маркиз Вадим'), 'Маркиза Вадима');
assert.equal(declineGen('Маркиз Вадим'), 'Маркиза Вадима');
assert.equal(declineAcc('Барон Дима'), 'Барона Диму');
assert.equal(declineGen('Барон Дима'), 'Барона Димы');
assert.equal(declineAcc('Графиня Елена'), 'Графиню Елену');
assert.equal(declineGen('Графиня Елена'), 'Графини Елены');
assert.equal(declineAcc('Княгиня Анна'), 'Княгиню Анну');
assert.equal(declineAcc('Герцог Виктор'), 'Герцога Виктора');

// Латиница не трогается ни в каком падеже.
assert.equal(declineAcc('Kira Murano'), 'Kira Murano');
assert.equal(declineGen('Kira Murano'), 'Kira Murano');

// Ник живого игрока не склоняется, даже если он кириллицей.
assert.equal(accOf({ name: 'Барон Дима', isBot: true }), 'Барона Диму');
assert.equal(accOf({ name: 'Мурена', isBot: false }), 'Мурена');
assert.equal(genOf({ name: 'Графиня Елена', isBot: true }), 'Графини Елены');
assert.equal(genOf({ name: 'Мурена', isBot: false }), 'Мурена');

// Род выбирается по списку женских имён, а не по окончанию строки: полное
// имя «Барон Дима» кончается на «а», и раньше в хронике выходило «Барон Дима
// усомнилась». Проверяем весь двор — восемь имён, три из них женские.
assert.equal(verbDoubted('Барон Дима'), 'усомнился');
assert.equal(verbCaught('Барон Дима'), 'поймал');
assert.equal(verbDoubted('Герцог Виктор'), 'усомнился');
assert.equal(verbDoubted('Маркиз Вадим'), 'усомнился');
assert.equal(verbDoubted('Аббат Тихон'), 'усомнился');
assert.equal(verbDoubted('Кондотьер Ратмир'), 'усомнился');
assert.equal(verbDoubted('Графиня Елена'), 'усомнилась');
assert.equal(verbCaught('Графиня Елена'), 'поймала');
assert.equal(verbDoubted('Княгиня Анна'), 'усомнилась');
assert.equal(verbDoubted('Боярыня Ждана'), 'усомнилась');
assert.equal(verbCaught('Боярыня Ждана'), 'поймала');

// Ник живого игрока — латиница, под правило не попадает.
assert.equal(verbDoubted('Kira Murano'), 'усомнился');

console.log('russianText.check: ok');
