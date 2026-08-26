import { useEffect, useRef, useState } from 'react';
import type { Action, CardId, GameCard } from '@kinglier/engine/types';

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

/**
 * A staked role card stays hidden behind the "на кону" placeholder for as
 * long as `pendingAction` still references it — from the claim all the way
 * through doubt/veto windows and the departure flight. Gating this on
 * `turnPhase` instead (as it used to) let turnPhase flip back to IDLE while
 * the action was still resolving, revealing the real card in hand at the same
 * time the arena was still showing (or animating) the staked card: a visible
 * duplicate.
 */
export function isCardStaked(
  pendingAction: Pick<Action, 'type' | 'actorId' | 'stakedCardId'> | null | undefined,
  playerId: string,
  cardId: CardId
): boolean {
  return (
    pendingAction?.type === 'role' &&
    pendingAction.actorId === playerId &&
    pendingAction.stakedCardId === cardId
  );
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
