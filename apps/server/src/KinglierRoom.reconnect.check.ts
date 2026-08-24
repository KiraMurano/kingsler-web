/**
 * Run: npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
 */
import assert from 'node:assert/strict';

// Static imports are hoisted and evaluate before any other top-level code in
// this file, so setting the env var here would run too late — app.ts (and
// KinglierRoom.ts, which reads it once at module scope) would already have
// loaded with the default 60s grace period. Dynamic imports defer loading
// until after the env var is actually set.
process.env.KINGLIER_RECONNECT_GRACE_SECONDS = '1';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');

const PORT = 27893;
createServer().listen(PORT);
const client = new Client(`ws://localhost:${PORT}`);

const host = await client.create('kinglier', { nickname: 'Аня' }); // p1
const guest = await client.joinById(host.roomId, { nickname: 'Боря' }); // p2

type State = { players: { id: string; isBot: boolean }[] };
let guestState: State | null = null;
guest.onMessage('state', (data: State) => { guestState = data; });

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

// Host disconnects unexpectedly (not a consented leave).
host.connection.close();
await new Promise(resolve => setTimeout(resolve, 200));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, false, 'seat must stay human during the grace period');

// Wait past the 1-second grace period.
await new Promise(resolve => setTimeout(resolve, 1500));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, true, 'seat must become bot-controlled after the grace period expires');

guest.leave();
console.log('KinglierRoom.reconnect.check.ts passed.');
process.exit(0);
