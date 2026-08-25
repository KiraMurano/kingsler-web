/**
 * Run: npx tsx apps/server/src/KinglierRoom.lobby.check.ts
 */
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createServer } from './app.ts';

const PORT = 27891;
const server = createServer();
server.listen(PORT);

const client = new Client(`ws://localhost:${PORT}`);

const host = await client.create('kinglier', { nickname: 'Аня' });
assert.match(host.roomId, /^[A-Z0-9]{6}$/, 'room code must be 6 uppercase Latin letters or digits');

let lastLobby: unknown = null;
host.onMessage('lobby', data => { lastLobby = data; });

type State = { players: { id: string; hand: (string | null)[]; isBot: boolean }[]; activePlayerId: string };
let hostState: State | null = null;
let guestState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });

const guest = await client.joinById(host.roomId, { nickname: 'Боря' });
guest.onMessage('state', (data: State) => { guestState = data; });

await new Promise(resolve => setTimeout(resolve, 200));
assert.ok(lastLobby, 'host must receive a lobby update after the guest joins');

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

assert.ok(hostState, 'host must receive a state message once the game starts');
assert.ok(guestState, 'guest must receive a state message once the game starts');
assert.equal(hostState!.players.length, 4);
assert.equal(hostState!.players.filter(p => !p.isBot).length, 2, 'exactly the 2 joined humans, rest are bots');

guest.leave();
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(
  hostState!.players.find(p => p.id === 'p2')!.isBot,
  true,
  'consented leave mid-game must hand the seat to a bot immediately'
);

host.leave();
process.exit(0);
