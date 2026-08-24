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

// The host acting on p1's own turn must succeed.
host.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 3000));
assert.equal(hostState!.players.find(p => p.id === 'p1')!.gold, goldBefore + 1, "p1's own-turn action must apply");

host.leave();
guest.leave();
console.log('KinglierRoom.actions.check.ts passed.');
process.exit(0);
