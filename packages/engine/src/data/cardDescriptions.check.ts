/**
 * Колода описана полностью и сходится по числу карт: у каждой карты есть
 * запись описания и число копий, а `createInitialDeck` выдаёт ровно то, что
 * обещает `CARD_COPIES_MAP`.
 * Run: npx tsx packages/engine/src/data/cardDescriptions.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard } from './cardDescriptions.ts';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_DESCRIPTIONS } from './cardDescriptions.ts';
import { CARD_COPIES_MAP, TOTAL_DECK_SIZE, createInitialDeck } from '../cards.ts';

const everyCard: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

for (const card of everyCard) {
  const info = CARD_DESCRIPTIONS[card];
  assert.ok(info, `у карты «${card}» нет записи в CARD_DESCRIPTIONS`);
  assert.equal(info.name, card, `запись «${card}» названа иначе: «${info.name}»`);
  assert.ok(info.artImage.endsWith('.webp'), `у карты «${card}» арт не webp: ${info.artImage}`);
  assert.ok(CARD_COPIES_MAP[card] >= 1, `у карты «${card}» нет числа копий`);
}

// Две новые интриги на месте, по 2 копии каждая.
for (const card of ['Стража покоев', 'Охранная грамота'] as const) {
  assert.ok(ALL_PLOTS.includes(card), `«${card}» не попала в ALL_PLOTS`);
  assert.equal(CARD_DESCRIPTIONS[card].category, 'plot', `«${card}» должна быть интригой`);
  assert.equal(CARD_COPIES_MAP[card], 2, `«${card}» должна идти в 2 копиях`);
}

assert.equal(TOTAL_DECK_SIZE, 50, 'колода: 19 ролей + 15 интриг + 16 инстантов = 50');

const deck = createInitialDeck();
assert.equal(deck.length, TOTAL_DECK_SIZE, 'createInitialDeck расходится с TOTAL_DECK_SIZE');
for (const card of everyCard) {
  const minted = deck.filter(c => c.card === card).length;
  assert.equal(minted, CARD_COPIES_MAP[card], `«${card}»: в колоде ${minted}, обещано ${CARD_COPIES_MAP[card]}`);
}

const ids = new Set(deck.map(c => c.id));
assert.equal(ids.size, deck.length, 'id карт в колоде не уникальны');

console.log('cardDescriptions.check: ok');
