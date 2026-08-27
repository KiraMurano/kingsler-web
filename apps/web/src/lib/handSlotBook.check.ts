/**
 * Self-check: a card keeps the hand slot it was dealt into, and a refill
 * lands in the hole that was actually made.
 *
 * The reported bug: «Если я разыгрываю левую карту из руки, то правая потом
 * перемещается на её место» — playing the card in slot 0 made the survivor
 * slide left, because the slot was the engine's array index and the engine
 * keeps `hand` compact. Case 2 below is that exact sequence.
 *
 * Run: npx tsx apps/web/src/lib/handSlotBook.check.ts
 */
import assert from 'node:assert/strict';
import { cardInSlot, reconcileSlots } from './handSlotBook.ts';
import type { SlotBook } from './handSlotBook.ts';

/** A seat, as thin as `reconcileSlots` needs it. */
function seat(id: string, ...cardIds: string[]) {
  return { id, hand: cardIds.map(cardId => ({ id: cardId })) };
}

const EMPTY: SlotBook = {};

/* ------------------------------------------------------------------ */
/* 1. A fresh hand is dealt left to right.                             */
/* ------------------------------------------------------------------ */
{
  const book = reconcileSlots(EMPTY, [seat('p1', 'a', 'b')]);
  assert.deepEqual(book.p1, { a: 0, b: 1 }, 'the first card dealt takes the left slot');
}

/* ------------------------------------------------------------------ */
/* 2. THE reported bug, end to end: play left, then draw.              */
/* ------------------------------------------------------------------ */
{
  //  a in slot 0, b in slot 1.
  const dealt = reconcileSlots(EMPTY, [seat('p1', 'a', 'b')]);
  assert.deepEqual(dealt.p1, { a: 0, b: 1 });

  //  `a` is staked, so the engine splices it out and `b` becomes index 0.
  //  `b` must not move.
  const staked = reconcileSlots(dealt, [seat('p1', 'b')]);
  assert.equal(staked.p1.b, 1, 'the surviving card keeps its slot — it must not slide left');
  assert.equal(staked.p1.a, undefined, 'a card that left the hand is forgotten');

  //  End of turn refills the hand. The engine appends, so `c` is index 1 —
  //  but the hole is on the left, and that is where it must land.
  const refilled = reconcileSlots(staked, [seat('p1', 'b', 'c')]);
  assert.equal(refilled.p1.c, 0, 'the drawn card fills the slot that was actually vacated');
  assert.equal(refilled.p1.b, 1, 'and the untouched card still has not moved');
}

/* ------------------------------------------------------------------ */
/* 3. The mirror case: play the RIGHT card, refill on the right.       */
/* ------------------------------------------------------------------ */
{
  const dealt = reconcileSlots(EMPTY, [seat('p1', 'a', 'b')]);
  const staked = reconcileSlots(dealt, [seat('p1', 'a')]);
  assert.equal(staked.p1.a, 0, 'the left card stays left when the right one leaves');
  const refilled = reconcileSlots(staked, [seat('p1', 'a', 'c')]);
  assert.deepEqual(refilled.p1, { a: 0, c: 1 }, 'the refill takes the right slot this time');
}

/* ------------------------------------------------------------------ */
/* 4. Two identical faces are two different cards in two slots.        */
/* ------------------------------------------------------------------ */
{
  //  Ids are what the book keys on, so «Шут» twice is unambiguous.
  const book = reconcileSlots(EMPTY, [seat('p1', 'jester-1', 'jester-2')]);
  assert.equal(book.p1['jester-1'], 0);
  assert.equal(book.p1['jester-2'], 1);
  assert.equal(
    new Set(Object.values(book.p1)).size,
    2,
    'twin faces must never share a slot'
  );
}

/* ------------------------------------------------------------------ */
/* 5. An emptied hand forgets everything, and refills from the left.   */
/* ------------------------------------------------------------------ */
{
  const dealt = reconcileSlots(EMPTY, [seat('p1', 'a', 'b')]);
  const empty = reconcileSlots(dealt, [seat('p1')]);
  assert.deepEqual(empty.p1, {}, 'nothing held, nothing remembered');
  const dealtAgain = reconcileSlots(empty, [seat('p1', 'x', 'y')]);
  assert.deepEqual(dealtAgain.p1, { x: 0, y: 1 });
}

/* ------------------------------------------------------------------ */
/* 6. A no-op reconcile is stable, by identity.                        */
/* ------------------------------------------------------------------ */
{
  const players = [seat('p1', 'a', 'b'), seat('p2', 'c', 'd')];
  const first = reconcileSlots(EMPTY, players);
  const second = reconcileSlots(first, players);
  assert.equal(second, first, 'an unchanged book is handed straight back, same object');

  //  And the same holds when the hands are rebuilt from scratch, which is
  //  what a store update actually does.
  const third = reconcileSlots(second, [seat('p1', 'a', 'b'), seat('p2', 'c', 'd')]);
  assert.equal(third, first, 'equal hands reconcile to the identical book');

  //  Reconciling the same input twice must land in the same place — React
  //  runs the memo twice under StrictMode.
  assert.deepEqual(
    reconcileSlots(first, [seat('p1', 'b'), seat('p2', 'c', 'd')]),
    reconcileSlots(
      reconcileSlots(first, [seat('p1', 'b'), seat('p2', 'c', 'd')]),
      [seat('p1', 'b'), seat('p2', 'c', 'd')]
    ),
    'reconciliation is idempotent'
  );
}

/* ------------------------------------------------------------------ */
/* 7. Two seats keep their own books.                                  */
/* ------------------------------------------------------------------ */
{
  const dealt = reconcileSlots(EMPTY, [seat('p1', 'a', 'b'), seat('p2', 'c', 'd')]);
  assert.deepEqual(dealt.p1, { a: 0, b: 1 });
  assert.deepEqual(dealt.p2, { c: 0, d: 1 });

  //  p1 plays their left card and draws; p2 is not touched at all.
  const after = reconcileSlots(
    reconcileSlots(dealt, [seat('p1', 'b'), seat('p2', 'c', 'd')]),
    [seat('p1', 'b', 'e'), seat('p2', 'c', 'd')]
  );
  assert.deepEqual(after.p1, { b: 1, e: 0 }, "p1's refill lands in p1's vacated slot");
  assert.deepEqual(after.p2, { c: 0, d: 1 }, "p2's slots are untouched by p1's turn");

  //  A seat that is no longer in the game drops out of the book.
  const solo = reconcileSlots(after, [seat('p1', 'b', 'e')]);
  assert.equal(solo.p2, undefined, 'an absent seat is forgotten');
  assert.deepEqual(solo.p1, { b: 1, e: 0 });
}

/* ------------------------------------------------------------------ */
/* 8. Purity: the book handed in is never written to.                  */
/* ------------------------------------------------------------------ */
{
  const before: SlotBook = { p1: { a: 0, b: 1 } };
  const snapshot = JSON.stringify(before);
  reconcileSlots(before, [seat('p1', 'b', 'c'), seat('p2', 'd')]);
  assert.equal(JSON.stringify(before), snapshot, 'the previous book is left exactly as it was');
}

/* ------------------------------------------------------------------ */
/* 9. A book that double-books a slot is repaired, not propagated.     */
/* ------------------------------------------------------------------ */
{
  const broken: SlotBook = { p1: { a: 0, b: 0 } };
  const fixed = reconcileSlots(broken, [seat('p1', 'a', 'b')]);
  assert.equal(fixed.p1.a, 0, 'the first holder keeps the contested slot');
  assert.equal(fixed.p1.b, 1, 'the loser is re-seated as an arrival');
}

// Обратный поиск: рука спрашивает «кто в слоте», книга хранит «где карта».
{
  const book = reconcileSlots({}, [{ id: 'p1', hand: [{ id: 'a' }, { id: 'b' }] }]);
  assert.equal(cardInSlot(book, 'p1', 0), 'a');
  assert.equal(cardInSlot(book, 'p1', 1), 'b');

  // Карта из слота 0 ушла — слот 1 не должен переехать, а слот 0 пустеет.
  const после = reconcileSlots(book, [{ id: 'p1', hand: [{ id: 'b' }] }]);
  assert.equal(cardInSlot(после, 'p1', 0), undefined, 'слот 0 опустел');
  assert.equal(cardInSlot(после, 'p1', 1), 'b', 'соседка осталась на своём месте');

  assert.equal(cardInSlot(book, 'нет-такого', 0), undefined);
}

console.log('handSlotBook.check: ok');
