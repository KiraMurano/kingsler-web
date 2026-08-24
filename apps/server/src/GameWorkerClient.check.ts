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
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
]);

await new Promise(resolve => setTimeout(resolve, 500));
assert.ok(states.length > 0, 'starting a game must broadcast at least one state');

const afterStart = states[states.length - 1];
assert.equal(afterStart.players.length, 4);
assert.equal(afterStart.players.filter(p => !p.isBot).length, 2);
assert.equal(afterStart.activePlayerId, 'p1');

const countBeforeAction = states.length;
worker.call('performAction', [{
  type: 'normal',
  name: 'Просить содержание',
  actorId: 'p1',
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
