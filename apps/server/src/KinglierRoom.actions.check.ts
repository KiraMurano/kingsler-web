/**
 * Run: npx tsx apps/server/src/KinglierRoom.actions.check.ts
 */
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createServer } from './app.ts';

const PORT = 27892;
createServer().listen(PORT);
const client = new Client(`ws://localhost:${PORT}`);

const host = await client.create('kinglier', { nickname: 'Аня' }); // becomes p1

type State = { players: { id: string; gold: number }[]; activePlayerId: string };
let hostState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });

const guest = await client.joinById(host.roomId, { nickname: 'Боря' }); // becomes p2
guest.onMessage('state', () => {});

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));
assert.equal(hostState!.activePlayerId, 'p1', 'p1 (the host) must go first');

const goldBefore = hostState!.players.find(p => p.id === 'p1')!.gold;

// Guest (p2) tries to act even though it is p1's turn — must be rejected.
guest.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p2', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(hostState!.players.find(p => p.id === 'p1')!.gold, goldBefore, "p2's out-of-turn action must be rejected");

// The host acting on p1's own turn must succeed. A normal action resolves
// its effect and then advances the turn after two back-to-back
// ACTION_HOLD_MS holds, so wait past both.
host.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 5000));
assert.equal(hostState!.players.find(p => p.id === 'p1')!.gold, goldBefore + 1, "p1's own-turn action must apply");

// Bug repro: a buggy client can embed the *wrong* actorId in the payload
// (this happened for real — a UI bug sent the other player's id here). The
// server must stamp the real seat id over it, not trust the payload, or
// the resulting gold/effects land on the wrong player.
host.send('action', { method: 'endTurnManually', args: [] });
await new Promise(resolve => setTimeout(resolve, 500));
assert.equal(hostState!.activePlayerId, 'p2', "p1 ending their turn must hand it to p2");

const goldBeforeSpoof = hostState!.players.find(p => p.id === 'p2')!.gold;
guest.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 3000));
assert.equal(
  hostState!.players.find(p => p.id === 'p2')!.gold,
  goldBeforeSpoof + 1,
  "p2's action must be credited to p2 (the real sender) even if the payload spoofs actorId: 'p1'"
);

host.leave();
guest.leave();
console.log('KinglierRoom.actions.check.ts passed.');
process.exit(0);
