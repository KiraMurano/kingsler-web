/**
 * Run: npx tsx apps/server/src/KinglierRoom.lobby.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Static imports are hoisted and evaluate before any other top-level code in
// this file, so setting these env vars here would run too late — db.ts (and
// app.ts, which loads it) would already have opened its database. Dynamic
// imports defer loading until after the env vars are actually set.
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-lobby-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');
const { findOrCreateUserByEmail } = await import('./db.ts');
const { JWT } = await import('colyseus');

const PORT = 27891;
const server = createServer();
server.listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');

const client = new Client(`ws://localhost:${PORT}`);
client.auth.token = await JWT.sign({ userId: anya.id });
const host = await client.create('kinglier');
assert.match(host.roomId, /^[A-Z0-9]{6}$/, 'room code must be 6 uppercase Latin letters or digits');

let lastLobby: unknown = null;
host.onMessage('lobby', data => { lastLobby = data; });

type State = { players: { id: string; hand: (string | null)[]; isBot: boolean }[]; activePlayerId: string };
let hostState: State | null = null;
let guestState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });

client.auth.token = await JWT.sign({ userId: borya.id });
const guest = await client.joinById(host.roomId);
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
console.log('KinglierRoom.lobby.check.ts passed.');
process.exit(0);
