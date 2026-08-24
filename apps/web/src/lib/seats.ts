import type { Player } from '@kinglier/engine/types';

export type SeatSide = 'left' | 'top' | 'right';

/** Seat position relative to the viewer, going clockwise: 1 = left, 2 = top,
 *  3 = right. Offline always seats the human at 1, so this collapses to the
 *  old fixed seatNumber → side mapping there; online it rotates per viewer. */
const SIDE_BY_RELATIVE_SEAT: Record<number, SeatSide> = {
  1: 'left',
  2: 'top',
  3: 'right'
};

/** Everyone but the viewer, in clockwise seating order starting from the
 *  viewer's left, each tagged with the side it renders on.
 *
 *  Deliberately keys "am I the viewer" off player id, not `isBot`: with 2+
 *  human players every non-viewer human is still an opponent to render, not
 *  just the bots (the earlier `players.filter(p => p.isBot)` bug hid every
 *  other real player from both sides of an online match). */
export function seatOpponents(players: Player[], viewer: Player | undefined): (Player & { side: SeatSide })[] {
  const total = players.length;
  const viewerSeat = viewer?.seatNumber ?? 1;
  const relativeSeat = (p: Player) => (p.seatNumber - viewerSeat + total) % total;

  return players
    .filter(p => p.id !== viewer?.id)
    .map(p => ({ ...p, side: SIDE_BY_RELATIVE_SEAT[relativeSeat(p)] ?? 'top' }))
    .sort((a, b) => relativeSeat(a) - relativeSeat(b));
}
