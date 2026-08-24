/**
 * Self-check: opponent seating must be based on who the viewer actually is,
 * not "whoever isn't a bot" — with 2+ human players that used to make every
 * client treat the same (first) player as "me" and hide every other human
 * from the table entirely.
 * Run: npx tsx apps/web/src/lib/seats.check.ts
 */
import assert from 'node:assert/strict';
import { pickViewer, seatOpponents } from './seats.ts';
import type { Player } from '@kinglier/engine/types';

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name' | 'seatNumber'>): Player {
  return {
    avatar: '',
    isBot: false,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: ['Наследник', 'Шут'],
    activePlot: null,
    ...partial
  };
}

const host = player({ id: 'p1', name: 'Хост', seatNumber: 1 });
const guest = player({ id: 'p2', name: 'Друг', seatNumber: 2 });
const bot1 = player({ id: 'b1', name: 'Бот А', seatNumber: 3, isBot: true });
const bot2 = player({ id: 'b2', name: 'Бот Б', seatNumber: 4, isBot: true });
const table = [host, guest, bot1, bot2];

// Offline (no viewerId): the single human is still found the old way.
assert.equal(pickViewer([host, bot1, bot2]).id, 'p1', 'offline must still find the lone human');

// Online, viewing as the host: every other seat (including the real guest)
// must show up as an opponent — this is the exact bug: `filter(isBot)` used
// to drop the guest entirely.
{
  const viewer = pickViewer(table, 'p1');
  const opponents = seatOpponents(table, viewer);
  assert.deepEqual(
    opponents.map(o => o.id),
    ['p2', 'b1', 'b2'],
    'host must see the guest as an opponent, not just the bots'
  );
}

// Online, viewing as the guest: must see themself as "me" (not the host),
// and the host must appear as an opponent too.
{
  const viewer = pickViewer(table, 'p2');
  assert.equal(viewer?.id, 'p2', 'guest must be identified as themself, not the first non-bot player');
  const opponents = seatOpponents(table, viewer);
  assert.deepEqual(
    opponents.map(o => o.id),
    ['b1', 'b2', 'p1'],
    'guest must see the host as an opponent'
  );
  // Two different viewers at the same table must not resolve to the same
  // "left neighbour" — that was the visible symptom (both clients saw the
  // same bot on their right).
  const hostOpponents = seatOpponents(table, pickViewer(table, 'p1'));
  assert.notEqual(
    opponents.find(o => o.side === 'right')?.id,
    hostOpponents.find(o => o.side === 'right')?.id,
    'host and guest must not both see the same seat as their right-hand opponent'
  );
}

console.log('seats.check.ts passed.');
