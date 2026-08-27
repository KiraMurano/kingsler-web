/**
 * Which visual slot each held card owns.
 *
 * The engine keeps `player.hand` compact: playing the card at index 0 splices
 * it out and the survivor becomes index 0. Deriving the on-screen slot from
 * that index means the survivor visibly slides left the moment its neighbour
 * is staked, and the card drawn at end of turn lands in the *right* slot even
 * though the *left* one is the one that emptied. Both are wrong: a card that
 * nobody touched must not move, and a refill belongs in the hole that was
 * actually made.
 *
 * So the slot is remembered rather than computed. `reconcileSlots` keeps a
 * tiny book — player → card id → slot — across updates: a card keeps its slot
 * for as long as it stays in hand, a card that has left is forgotten, and a
 * newly arrived card takes the lowest slot nobody is holding. Card identity is
 * stable (`CardId` survives hand → table → discard), so this is exact rather
 * than a name-matching heuristic.
 *
 * The function is pure and idempotent: reconciling the same hands twice
 * returns the very same book object, which is what lets `App` keep it in a ref
 * and reconcile inside a `useMemo` without the result churning.
 */
import type { CardId } from '@kinglier/engine/cardInstance';

/** A hand holds two cards, so a slot is left or right and nothing else. */
export type Slot = 0 | 1;

/** Player id → card id → the slot that card is holding. */
export type SlotBook = Record<string, Record<CardId, Slot>>;

/** Exactly what the reconciliation needs of a player: an id and card ids. */
export interface SlotSeat {
  id: string;
  hand: readonly { id: CardId }[];
}

const SLOTS: readonly Slot[] = [0, 1];

/** Same players, same cards, same slots — used to hand `prev` straight back. */
function sameBook(a: SlotBook, b: SlotBook): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const left = a[key];
    const right = b[key];
    if (!right) return false;
    const leftIds = Object.keys(left);
    if (leftIds.length !== Object.keys(right).length) return false;
    for (const id of leftIds) if (left[id] !== right[id]) return false;
  }
  return true;
}

/**
 * Carry the previous slot assignments forward onto the current hands.
 *
 * Two passes per seat, and the order matters: everything that is *keeping* a
 * slot claims it first, and only then do the arrivals fill what is left. One
 * pass would let a card drawn into a hand grab the slot of a card that is
 * still sitting there.
 *
 * A seat absent from `players` drops out of the book entirely; the caller
 * falls back to the array index for anyone the book does not mention.
 */
export function reconcileSlots(prev: SlotBook, players: readonly SlotSeat[]): SlotBook {
  const next: SlotBook = {};

  for (const player of players) {
    const held = prev[player.id] ?? {};
    const kept: Record<CardId, Slot> = {};
    const taken = new Set<Slot>();
    const arrivals: CardId[] = [];

    /* 1. Everyone who already had a slot and is still in hand keeps it. A
       slot claimed twice — which the book should never contain — is honoured
       for the first holder only; the loser is treated as an arrival. */
    for (const card of player.hand) {
      const slot = held[card.id];
      if (slot === undefined || taken.has(slot) || kept[card.id] !== undefined) {
        arrivals.push(card.id);
        continue;
      }
      kept[card.id] = slot;
      taken.add(slot);
    }

    /* 2. Arrivals take the lowest free slot. This is the whole point of the
       book: play the left card and the refill lands back on the left. */
    for (const id of arrivals) {
      const free = SLOTS.find(slot => !taken.has(slot));
      /* A hand never holds more than two cards; if one somehow does, the
         extra is left out of the book and the caller falls back to its
         index rather than double-booking a slot. */
      if (free === undefined) continue;
      kept[id] = free;
      taken.add(free);
    }

    next[player.id] = kept;
  }

  return sameBook(prev, next) ? prev : next;
}
