/**
 * The vocabulary of places a card can be. Layout registers anchors under
 * `zoneKey(zone)`; the card layer springs each card toward the anchor its
 * zone names. Nothing here knows about game rules or about the DOM — this is
 * shared vocabulary between `lib/cardZones.ts` (which derives zones from game
 * state) and `motion/` (which draws them).
 */
import type { GameCard } from '@kinglier/engine/types';
import type { CardId } from '@kinglier/engine/cardInstance';

export type Zone =
  /** Face-down source: the top-left corner of the table. */
  | { kind: 'deck' }
  /** A seat's hand slot. Slots are sticky: a card keeps its slot while held. */
  | { kind: 'hand'; playerId: string; slot: 0 | 1 }
  /** The single face-down card staked on the table under scrutiny. */
  | { kind: 'stake' }
  /** One of the two cards clashing in a duel. */
  | { kind: 'duel'; side: 'attacker' | 'defender' }
  /** An instant laid openly in the middle of the table. */
  | { kind: 'table' }
  /** An instant laid on top of the current action: veto, redirect. */
  | { kind: 'overlay' }
  /** A plot card resting in a seat's plot slot. */
  | { kind: 'plot'; playerId: string }
  /** Face-up graveyard: the top-right corner of the table. */
  | { kind: 'discard' };

export type ZoneKind = Zone['kind'];

/** What the viewer is allowed to see of a card's face. */
export interface Face {
  known: GameCard | null;
}

export interface PlacedCard {
  id: CardId;
  zone: Zone;
  face: Face;
  /** True while the table wants this card turned face-up for scrutiny. */
  revealed: boolean;
  /**
   * Did the claim this card was staked on hold up? Set only while a reveal or
   * a duel outcome is on screen, and only for the cards that outcome turned
   * up — it is what the ПРАВДА / БЛЕФ stamp reads. `undefined` means no
   * verdict has been passed on this card, which is different from `false`.
   */
  wasTruth?: boolean;
  /** Whose card this is, when that is meaningful (hand, plot, duel side). */
  ownerId: string | null;
}

/** The string an anchor registers itself under. Stable and collision-free. */
export function zoneKey(zone: Zone): string {
  switch (zone.kind) {
    case 'hand':
      return `hand:${zone.playerId}:${zone.slot}`;
    case 'plot':
      return `plot:${zone.playerId}`;
    case 'duel':
      return `duel:${zone.side}`;
    default:
      return zone.kind;
  }
}

/**
 * Ordering used when two rules could claim the same card. Higher wins, and a
 * card claimed by a higher rule never also appears in a lower one.
 */
export const ZONE_PRECEDENCE: Record<ZoneKind, number> = {
  overlay: 80,
  duel: 70,
  stake: 60,
  table: 50,
  plot: 40,
  hand: 30,
  discard: 20,
  deck: 10
};
