import { useEffect, useRef, useState } from 'react';
import type { GameCard } from '../engine/types';

export type HandSlots = [GameCard | null, GameCard | null];

export const HAND_EXIT_MS = 280;

/**
 * Keep cards in their seats. Removing the left card must not slide the right
 * one over; a newly drawn card occupies the first hole.
 */
export function reconcileHandSlots(prev: HandSlots, compact: GameCard[]): HandSlots {
  const bag = [...compact];
  const take = (card: GameCard) => {
    const i = bag.indexOf(card);
    if (i < 0) return false;
    bag.splice(i, 1);
    return true;
  };

  const next: HandSlots = [
    prev[0] !== null && take(prev[0]) ? prev[0] : null,
    prev[1] !== null && take(prev[1]) ? prev[1] : null
  ];

  for (const card of bag) {
    const hole = next[0] === null ? 0 : next[1] === null ? 1 : null;
    if (hole === null) break;
    next[hole] = card;
  }

  return next;
}

/** Compact-hand index for a visual slot, counting duplicate names from the left. */
export function compactIndex(hand: GameCard[], slots: HandSlots, slot: number): number {
  const card = slots[slot];
  if (!card) return -1;
  let ordinal = 0;
  for (let i = 0; i <= slot; i++) {
    if (slots[i] === card) ordinal++;
  }
  let seen = 0;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i] === card) {
      seen++;
      if (seen === ordinal) return i;
    }
  }
  return hand.indexOf(card);
}

/** Two visual seats that keep occupancy when the engine splices the compact hand. */
export function useHandSlots(compact: GameCard[]): { slots: HandSlots; leaving: HandSlots } {
  const [slots, setSlots] = useState<HandSlots>([null, null]);
  const [leaving, setLeaving] = useState<HandSlots>([null, null]);
  const prevRef = useRef<HandSlots>([null, null]);
  const key = compact.join('\0');

  // ponytail: `key` fingerprints occupancy; the hand array is new every store tick.
  useEffect(() => {
    const prev = prevRef.current;
    const next = reconcileHandSlots(prev, compact);
    prevRef.current = next;
    setSlots(next);
    setLeaving([
      prev[0] !== null && prev[0] !== next[0] ? prev[0] : null,
      prev[1] !== null && prev[1] !== next[1] ? prev[1] : null
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!leaving[0] && !leaving[1]) return;
    const t = window.setTimeout(() => setLeaving([null, null]), HAND_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  return { slots, leaving };
}
