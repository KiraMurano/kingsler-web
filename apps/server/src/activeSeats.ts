/**
 * Which room (if any) each logged-in user currently occupies a seat in.
 * Deliberately in-memory, not the database — this is operational state
 * that shouldn't survive a server restart (a restart already drops every
 * active room today).
 */
export interface ActiveSeat {
  roomId: string;
  playerId: string;
}

const activeSeats = new Map<string, ActiveSeat>();

export function setActiveSeat(userId: string, seat: ActiveSeat): void {
  activeSeats.set(userId, seat);
}

export function getActiveSeat(userId: string): ActiveSeat | undefined {
  return activeSeats.get(userId);
}

export function clearActiveSeat(userId: string): void {
  activeSeats.delete(userId);
}
