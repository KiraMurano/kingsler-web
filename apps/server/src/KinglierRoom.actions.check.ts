/**
 * Run: npx tsx apps/server/src/KinglierRoom.actions.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-actions-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');
const { findOrCreateUserByEmail } = await import('./db.ts');
const { JWT } = await import('colyseus');
const { TOSS_BOT_READY_MS, TOSS_SPIN_MS, TOSS_START_MS } = await import('@kinglier/engine/timing');

const PORT = 27892;
createServer().listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');

const client = new Client(`ws://localhost:${PORT}`);

type State = {
  players: { id: string; gold: number; isBot: boolean }[];
  activePlayerId: string;
  openingToss: { winnerId: string; readyIds: string[]; startsAt: number | null } | null;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Партия открывается жребием, и первый ход достаётся случайному месту, а не
 * хозяину комнаты. Проверяются здесь права на действие, а не жребий, поэтому
 * стол пересобирается, пока монетка не выпадет живому игроку.
 *
 * Ждать чужого хода за столом нельзя: бот, атаковавший человека, открывает
 * окно реакции и остановится в нём навсегда — отвечать в этой проверке некому.
 */
async function tableWithHumanToMove() {
  for (let attempt = 0; attempt < 10; attempt++) {
    client.auth.token = await JWT.sign({ userId: anya.id });
    const host = await client.create('kinglier'); // becomes p1

    let hostState: State | null = null;
    host.onMessage('state', (data: State) => { hostState = data; });

    client.auth.token = await JWT.sign({ userId: borya.id });
    const guest = await client.joinById(host.roomId); // becomes p2
    guest.onMessage('state', () => {});

    host.send('start');
    await sleep(500);
    assert.ok(hostState, 'starting the game must push a state to the host');
    assert.ok(hostState!.openingToss, 'a started game must open with a toss');
    assert.equal(
      hostState!.activePlayerId,
      hostState!.openingToss!.winnerId,
      'the toss winner must be the one to move'
    );

    // Под экраном жребия стол закрыт для всех, включая победителя.
    const goldUnderToss = hostState!.players.map(p => p.gold);
    host.send('action', {
      method: 'performAction',
      args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
    });
    await sleep(300);
    assert.deepEqual(
      hostState!.players.map(p => p.gold),
      goldUnderToss,
      'no action may land while the toss screen is still up'
    );

    // «Готов» — про себя: чужую готовность сервер отбивает.
    host.send('action', { method: 'markReady', args: ['p2'] });
    await sleep(200);
    assert.ok(
      !hostState!.openingToss!.readyIds.includes('p2'),
      'a player must not be able to press ready for someone else'
    );

    host.send('action', { method: 'markReady', args: ['p1'] });
    await sleep(200);
    assert.ok(hostState!.openingToss!.readyIds.includes('p1'), 'the host must be able to ready up');
    assert.ok(hostState!.openingToss, 'the screen must hold until the guest is ready too');

    // Готовы должны быть все, включая ботов: те отмечаются сами в пределах
    // пары секунд после приземления монетки.
    guest.send('action', { method: 'markReady', args: ['p2'] });
    await sleep(TOSS_SPIN_MS + TOSS_BOT_READY_MS + TOSS_START_MS + 600);
    assert.equal(hostState!.openingToss, null, 'the whole table ready must start the game');

    const active = hostState!.players.find(p => p.id === hostState!.activePlayerId)!;
    if (!active.isBot) {
      return { host, guest, state: () => hostState!, actorId: active.id };
    }

    host.leave();
    guest.leave();
    await sleep(200);
  }
  throw new Error('the toss never picked a human in 10 tables — that is not luck');
}

const { host, guest, state, actorId } = await tableWithHumanToMove();
const actor = actorId === 'p1' ? host : guest;
const idle = actorId === 'p1' ? guest : host;
const idleId = actorId === 'p1' ? 'p2' : 'p1';

const goldBefore = state().players.find(p => p.id === actorId)!.gold;

// Чужой ход: действие второго игрока должно быть отбито.
idle.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: idleId, costGold: 0, costTokens: 1, description: 'x' }]
});
await sleep(300);
assert.equal(
  state().players.find(p => p.id === actorId)!.gold,
  goldBefore,
  "the other player's out-of-turn action must be rejected"
);

// Bug repro: a buggy client can embed the *wrong* actorId in the payload
// (this happened for real — a UI bug sent the other player's id here). The
// server must stamp the real seat id over it, not trust the payload, or
// the resulting gold/effects land on the wrong player. Заодно это и проверка,
// что ход в свою очередь вообще проходит.
const idleGoldBefore = state().players.find(p => p.id === idleId)!.gold;
actor.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: idleId, costGold: 0, costTokens: 1, description: 'x' }]
});
await sleep(5000);
assert.equal(
  state().players.find(p => p.id === actorId)!.gold,
  goldBefore + 1,
  'the action must be credited to the real sender, not to the id in the payload'
);
assert.equal(
  state().players.find(p => p.id === idleId)!.gold,
  idleGoldBefore,
  'the spoofed id must gain nothing'
);

host.leave();
guest.leave();
console.log('KinglierRoom.actions.check.ts passed.');
process.exit(0);
