/**
 * Run: npx tsx apps/server/src/GameWorkerClient.check.ts
 */
import assert from 'node:assert/strict';
import { GameWorkerClient } from './GameWorkerClient.ts';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';

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

// Партия открывается жребием: ходит его победитель, и до конца броска стол
// закрыт — воркер обязан отбивать действия, а не пропускать их под монетку.
assert.ok(afterStart.openingToss, 'a started game must be under its opening toss');
assert.equal(afterStart.activePlayerId, afterStart.openingToss.winnerId);

const countUnderToss = states.length;
worker.call('performAction', [{
  type: 'normal',
  name: 'Просить содержание',
  actorId: afterStart.activePlayerId,
  costGold: 0,
  costTokens: 1,
  description: 'ход из-под летящей монетки'
}]);
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(states.length, countUnderToss, 'the worker must swallow actions while the toss is in the air');

// Экран жребия снимается готовностью, а не временем: отмечаются оба живых.
worker.call('markReady', ['p1']);
worker.call('markReady', ['p2']);
await new Promise(resolve => setTimeout(resolve, 300));
const settled = states[states.length - 1];
assert.equal(settled.openingToss, null, 'both humans ready must lift the toss screen');

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
