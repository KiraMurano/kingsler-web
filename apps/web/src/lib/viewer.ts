import type { Player } from '@kinglier/engine/types';

/** Finds the local player. Online: the server-assigned `viewerId` says which
 *  seat is ours. Offline: there's always exactly one human, so the old
 *  `!isBot` lookup still holds — this only takes the online branch once a
 *  `viewerId` is present.
 *
 *  Every component that needs "am I the actor/target/viewer" must go through
 *  this, not `players.find(p => !p.isBot)` directly: with 2+ human players
 *  that always resolved to the same (first-joined) seat on every client,
 *  which made one player's clicks send the other player's id as the actor,
 *  and made every "you are being attacked" panel key off that same wrong
 *  seat on both screens at once. */
export function pickViewer(players: Player[], viewerId?: string): Player | undefined {
  return viewerId ? players.find(p => p.id === viewerId) : players.find(p => !p.isBot);
}
