/**
 * Run: npx tsx apps/server/src/GameWorkerClient.check.ts
 */
import assert from 'node:assert/strict';
import { GameWorkerClient } from './GameWorkerClient.ts';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';
import {
  DEAL_STEP_MS,
  FANFARE_MS,
  OPENING_HOLD_MS,
  TOSS_BOT_READY_MS,
  TOSS_SPIN_MS,
  TOSS_VERDICT_MS
} from '@kinglier/engine/timing';

const worker = new GameWorkerClient();
const states: GameStateData[] = [];
worker.onState(data => states.push(data));

worker.startGame([
  { id: 'p1', name: 'Аня', avatar: '/avatars/yulia.webp', title: 'Провокатор' },
  { id: 'p2', name: 'Боря' }
]);

await new Promise(resolve => setTimeout(resolve, 500));
assert.ok(states.length > 0, 'starting a game must broadcast at least one state');

const afterStart = states[states.length - 1];
assert.equal(afterStart.players.length, 4);
assert.equal(afterStart.players.filter(p => !p.isBot).length, 2);

// Рассадка перемешана, поэтому место ищется по id, а не по индексу.
const anya = afterStart.players.find(p => p.id === 'p1');
assert.ok(anya, 'p1 must be seated');
assert.equal(anya.avatar, '/avatars/yulia.webp');
assert.equal(anya.title, 'Провокатор');

// Партия открывается сбором двора: ходить будет победитель жребия, и всё
// открытие стол закрыт — воркер обязан отбивать действия, а не пропускать их.
assert.ok(afterStart.opening, 'a started game must be under its opening sequence');
assert.equal(afterStart.opening.stage, 'READY', 'and it starts by gathering the court');
assert.equal(afterStart.activePlayerId, afterStart.opening.winnerId);

/* Проверяем последствия, а не число рассылок: во время сбора двора боты
   отмечаются сами, и каждая галочка — это своя рассылка состояния. Считать
   кадры здесь значит считать чужие ходы. */
const goldUnderOpening = afterStart.players.map(p => p.gold);
worker.call('performAction', [{
  type: 'normal',
  name: 'Просить содержание',
  actorId: afterStart.activePlayerId,
  costGold: 0,
  costTokens: 1,
  description: 'ход из-под открытия'
}]);
await new Promise(resolve => setTimeout(resolve, 300));
const underOpening = states[states.length - 1];
assert.deepEqual(
  underOpening.players.map(p => p.gold),
  goldUnderOpening,
  'the worker must swallow actions while the opening runs'
);
assert.equal(underOpening.pendingAction, null, 'and not even stage them');

// Сбор двора держится готовностью, а не временем — и готовы должны быть все,
// включая ботов. Боты отмечаются сами в пределах пары секунд, поэтому сперва
// ждём их.
await new Promise(resolve => setTimeout(resolve, TOSS_BOT_READY_MS + 600));
const botsReady = states[states.length - 1].opening!.readyIds;
assert.equal(
  botsReady.length,
  2,
  'both bots must have confirmed on their own by now'
);
assert.ok(!botsReady.includes('p1') && !botsReady.includes('p2'), 'humans confirm themselves');

// Готов весь стол — дальше открытие идёт само: пауза, жребий, раздача по одной
// карте и фанфара. Ходов до конца этой последовательности воркер не принимает.
worker.call('markReady', ['p1']);
worker.call('markReady', ['p2']);
await new Promise(resolve =>
  setTimeout(
    resolve,
    OPENING_HOLD_MS * 3 + TOSS_SPIN_MS + TOSS_VERDICT_MS + DEAL_STEP_MS * 10 + FANFARE_MS + 1200
  )
);
const settled = states[states.length - 1];
assert.equal(settled.opening, null, 'the whole table ready must play the opening out');
assert.deepEqual(
  settled.players.map(p => p.hand.length),
  settled.players.map(() => 2),
  'and the opening must have dealt every hand'
);

const countBeforeAction = states.length;
worker.call('performAction', [{
  type: 'normal',
  name: 'Просить содержание',
  actorId: settled.activePlayerId,
  costGold: 0,
  costTokens: 1,
  description: 'test'
}]);

await new Promise(resolve => setTimeout(resolve, 300));
assert.ok(states.length > countBeforeAction, 'a forwarded action must trigger a new state broadcast');

// An unknown/internal method must be silently ignored, not crash the worker.
worker.call('_executeNormalAction', []);
await new Promise(resolve => setTimeout(resolve, 100));

worker.terminate();
console.log('GameWorkerClient.check.ts passed.');
