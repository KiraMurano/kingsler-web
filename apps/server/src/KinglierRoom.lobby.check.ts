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
const { findOrCreateUserByEmail, updateProfile } = await import('./db.ts');
const { JWT } = await import('colyseus');

const PORT = 27891;
const server = createServer();
server.listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');
updateProfile(anya.id, {
  nickname: 'Аня',
  avatar: '/avatars/yulia.webp',
  title: 'Оппортунист'
});

const client = new Client(`ws://localhost:${PORT}`);
client.auth.token = await JWT.sign({ userId: anya.id });
const host = await client.create('kinglier');
assert.match(host.roomId, /^[A-Z0-9]{6}$/, 'room code must be 6 uppercase Latin letters or digits');

let lastLobby: unknown = null;
host.onMessage('lobby', data => { lastLobby = data; });

type State = {
  players: {
    id: string;
    hand: (string | null)[];
    isBot: boolean;
    avatar: string;
    title?: string;
    actionTokens: number;
  }[];
  activePlayerId: string;
  rules: { crownsToWin: number; actionTokens: number };
};
type Lobby = {
  seats: { playerId: string; nickname: string; avatar: string; title: string }[];
  rules: { crownsToWin: number; actionTokens: number; feastCost: number };
};
let hostState: State | null = null;
let guestState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });

client.auth.token = await JWT.sign({ userId: borya.id });
const guest = await client.joinById(host.roomId);
guest.onMessage('state', (data: State) => { guestState = data; });

await new Promise(resolve => setTimeout(resolve, 200));
assert.ok(lastLobby, 'host must receive a lobby update after the guest joins');
assert.equal((lastLobby as Lobby).seats[0].avatar, '/avatars/yulia.webp');
assert.equal((lastLobby as Lobby).seats[0].title, 'Оппортунист');

// --- Правила партии: их задаёт хост, сервер их нормализует и рассылает ---
assert.equal((lastLobby as Lobby).rules.crownsToWin, 5, 'в снапшоте лежат дефолтные правила');

let guestLobby: unknown = null;
guest.onMessage('lobby', data => { guestLobby = data; });

// Мусор от хоста нормализуется, а не принимается как есть.
host.send('rules', { crownsToWin: 99, feastCost: 6, deck: 'вся колода' });
await new Promise(resolve => setTimeout(resolve, 200));
assert.equal((lastLobby as Lobby).rules.crownsToWin, 10, 'выход за диапазон зажат сервером');
assert.equal((lastLobby as Lobby).rules.feastCost, 6, 'валидное значение принято');
assert.ok(guestLobby, 'правила разосланы всему столу, а не только хосту');
assert.equal((guestLobby as Lobby).rules.crownsToWin, 10, 'гость видит те же правила');

// Не-хост правила не меняет.
guest.send('rules', { crownsToWin: 1 });
await new Promise(resolve => setTimeout(resolve, 200));
assert.equal((lastLobby as Lobby).rules.crownsToWin, 10, 'правила от не-хоста отброшены');

// Дальше партия должна начаться на выполнимых правилах.
host.send('rules', { crownsToWin: 3, actionTokens: 4 });
await new Promise(resolve => setTimeout(resolve, 200));

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

assert.ok(hostState, 'host must receive a state message once the game starts');
assert.ok(guestState, 'guest must receive a state message once the game starts');
assert.equal(hostState!.players.length, 4);
assert.equal(hostState!.players.filter(p => !p.isBot).length, 2, 'exactly the 2 joined humans, rest are bots');

// Правила хоста доехали до партии и до клиентов — отдельного канала для них нет.
assert.equal(hostState!.rules.crownsToWin, 3, 'партия идёт по правилам, выставленным в лобби');
assert.equal(hostState!.rules.actionTokens, 4);
assert.equal(guestState!.rules.crownsToWin, 3, 'гость получил те же правила в состоянии');
assert.ok(
  hostState!.players.every(p => p.actionTokens === 4),
  'жетоны розданы по правилам партии, а не по дефолту'
);

// Место в лобби (`seats[0]`) — это очередь входа, а рассадка за столом
// перемешана: игрок ищется по id, а не по индексу.
const hostSeat = hostState!.players.find(p => p.id === 'p1');
assert.ok(hostSeat, 'the host must be seated');
assert.equal(hostSeat.avatar, '/avatars/yulia.webp');
assert.equal(hostSeat.title, 'Оппортунист');

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
