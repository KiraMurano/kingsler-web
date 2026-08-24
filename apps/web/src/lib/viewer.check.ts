/**
 * Self-check: `pickViewer` must resolve to the actual connected seat online,
 * not "whoever isn't a bot" — that used to make every online client (host
 * and guest alike) resolve "me" to the same first-joined human, so a guest's
 * click sent the host's id as the actor/target.
 * Run: npx tsx apps/web/src/lib/viewer.check.ts
 */
import assert from 'node:assert/strict';
import { pickViewer } from './viewer.ts';
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
const bot = player({ id: 'b1', name: 'Бот', seatNumber: 3, isBot: true });
const table = [host, guest, bot];

assert.equal(pickViewer(table).id, 'p1', 'offline (no viewerId) must still find the lone human');
assert.equal(pickViewer(table, 'p1').id, 'p1', 'online host must resolve to themself');
assert.equal(
  pickViewer(table, 'p2').id,
  'p2',
  'online guest must resolve to themself, not the first-joined human'
);

console.log('viewer.check.ts passed.');
