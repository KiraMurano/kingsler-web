/**
 * Run: npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Static imports are hoisted and evaluate before any other top-level code in
// this file, so setting these env vars here would run too late — app.ts,
// KinglierRoom.ts and db.ts all read them once at module scope. Dynamic
// imports defer loading until after the env vars are actually set.
process.env.KINGLIER_RECONNECT_GRACE_SECONDS = '1';
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-reconnect-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');
const { findOrCreateUserByEmail } = await import('./db.ts');
const { getActiveSeat } = await import('./activeSeats.ts');
const { JWT } = await import('colyseus');

const PORT = 27893;
createServer().listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');
const anyaToken = await JWT.sign({ userId: anya.id });
const boryaToken = await JWT.sign({ userId: borya.id });

const hostClient = new Client(`ws://localhost:${PORT}`);
hostClient.auth.token = anyaToken;
const host = await hostClient.create('kinglier'); // p1

const guestClient = new Client(`ws://localhost:${PORT}`);
guestClient.auth.token = boryaToken;
const guest = await guestClient.joinById(host.roomId); // p2

type State = { players: { id: string; isBot: boolean }[] };
let guestState: State | null = null;
guest.onMessage('state', (data: State) => { guestState = data; });

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

// Host disconnects unexpectedly (not a consented leave).
host.connection.close();
await new Promise(resolve => setTimeout(resolve, 200));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, false, 'seat must stay human during the grace period');

// A *different* connection with the same account (simulating a different
// device/browser — this is the whole point of Phase 2's redesign) reconnects
// before the grace period expires.
const returningClient = new Client(`ws://localhost:${PORT}`);
returningClient.auth.token = anyaToken;
const returning = await returningClient.joinById(host.roomId);
let returningState: State | null = null;
returning.onMessage('state', (data: State) => { returningState = data; });

await new Promise(resolve => setTimeout(resolve, 1500)); // past the original 1s grace period
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, false, 'a reconnected human must not be handed to the bot');
assert.ok(returningState, 'the reconnecting client must receive a fresh state snapshot for its own seat');
assert.ok(getActiveSeat(anya.id), 'the active-seat registry must point at the reconnected seat');

// The reconnected player drops again and this time nobody comes back.
returning.connection.close();
await new Promise(resolve => setTimeout(resolve, 1500));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, true, 'seat must become bot-controlled once the grace period truly expires');
assert.equal(getActiveSeat(anya.id), undefined, 'the active-seat registry must be cleared once the bot takes over');

// A further attempt to reconnect after the bot took over must be rejected.
const tooLateClient = new Client(`ws://localhost:${PORT}`);
tooLateClient.auth.token = anyaToken;
await assert.rejects(() => tooLateClient.joinById(host.roomId), 'joining after bot handoff must be rejected');

guest.leave();
console.log('KinglierRoom.reconnect.check.ts passed.');
process.exit(0);
