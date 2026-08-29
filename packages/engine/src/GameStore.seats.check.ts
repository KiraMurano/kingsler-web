/**
 * startGame сажает всех живых игроков, добивает стол ботами до четырёх — и
 * перемешивает рассадку.
 *
 * Проверка нарочно не фиксирует конкретный порядок: раньше здесь стояло
 * `players[0].id === 'p1'`, и именно это утверждение описывало дефект —
 * второй в списке всегда сидел слева от первого. Вместо порядка проверяется
 * состав, целостность номеров мест и то, что за N партий порядок реально
 * меняется.
 *
 * Run: npx tsx packages/engine/src/GameStore.seats.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from './GameStore.ts';
import { TOTAL_DECK_SIZE } from './cards.ts';

const HUMANS = [
  { id: 'p1', name: 'Аня', avatar: '/avatars/yulia.webp', title: 'Прагматик' },
  { id: 'p2', name: 'Боря' }
];

useGameStore.getState().startGame(HUMANS);
const state = useGameStore.getState();
assert.equal(state.players.length, 4, 'must always seat exactly 4 players');

// Живые игроки на столе, со своей личностью и без флага бота.
const anya = state.players.find(p => p.id === 'p1');
assert.ok(anya, 'p1 must be seated');
assert.equal(anya.name, 'Аня');
assert.equal(anya.avatar, '/avatars/yulia.webp');
assert.equal(anya.title, 'Прагматик');
assert.equal(anya.isBot, false);

const borya = state.players.find(p => p.id === 'p2');
assert.ok(borya, 'p2 must be seated');
assert.equal(borya.name, 'Боря');
assert.equal(borya.isBot, false);

assert.equal(state.players.filter(p => p.isBot).length, 2, 'two empty seats must be filled by bots');

// Места — ровно 1..4, без дыр и повторов, иначе рассадка на клиенте
// (seatOpponents считает позицию относительно зрителя) поедет.
assert.deepEqual(
  [...state.players.map(p => p.seatNumber)].sort((a, b) => a - b),
  [1, 2, 3, 4],
  'seat numbers must be exactly 1..4'
);
state.players.forEach((p, idx) => {
  assert.equal(p.seatNumber, idx + 1, 'seatNumber must follow array order — turn order and seating are one thing');
});

// У каждого бота свой кандидат: два одинаковых характера за столом означали бы,
// что выбор кандидатов сломан.
const botNames = state.players.filter(p => p.isBot).map(p => p.name);
assert.equal(new Set(botNames).size, botNames.length, 'seated bots must be distinct candidates');
for (const bot of state.players.filter(p => p.isBot)) {
  assert.ok(bot.archetype, `${bot.name} must carry their own archetype`);
}

/* Карты `startGame` НЕ раздаёт: руки наполняет стадия `DEAL` открытия партии,
   уже при открытом столе (см. `GameStore.opening.check.ts`). Здесь важно ровно
   то, что колода при рассадке остаётся целой — иначе раздача брала бы карты из
   уже початой. */
for (const p of state.players) {
  assert.deepEqual(p.hand, [], `${p.id} садится за стол без карт`);
  assert.equal(p.gold, 2);
  assert.equal(p.actionTokens, 2);
}
assert.equal(state.deck.length, TOTAL_DECK_SIZE, 'колода к рассадке не тронута');

// Рассадка действительно случайна. При равномерном перемешивании шанс, что за
// 40 партий Аня ни разу не сменит место, — (1/4)^39; провал этой проверки
// означает возврат к фиксированному порядку, а не невезение.
const anyaSeats = new Set<number>();
const neighbours = new Set<string>();
for (let i = 0; i < 40; i++) {
  useGameStore.getState().startGame(HUMANS);
  const players = useGameStore.getState().players;
  const seat = players.findIndex(p => p.id === 'p1');
  anyaSeats.add(seat);
  neighbours.add(players[(seat + 1) % players.length].id);
}
assert.ok(anyaSeats.size > 1, 'seating must vary between games');
assert.ok(neighbours.size > 1, 'the player to your left must not always be the same seat');

// restartGame сохраняет живых игроков и пересаживает стол заново.
useGameStore.getState().startGame(HUMANS);
useGameStore.getState().restartGame();
const restarted = useGameStore.getState();
const restartedAnya = restarted.players.find(p => p.id === 'p1');
assert.ok(restartedAnya, 'restart must keep the human seats');
assert.equal(restartedAnya.name, 'Аня');
assert.equal(restartedAnya.avatar, '/avatars/yulia.webp');
assert.equal(restartedAnya.title, 'Прагматик');
assert.equal(restarted.players.length, 4);

// Backward compatibility: calling with no seats keeps today's solo-vs-3-bots behavior.
useGameStore.getState().startGame();
const solo = useGameStore.getState();
assert.equal(solo.players.length, 4);
assert.ok(solo.players.some(p => p.id === 'p1'), 'the lone human keeps id p1');
assert.equal(solo.players.filter(p => !p.isBot).length, 1, 'no-args startGame must still mean exactly one human');

console.log('GameStore.seats.check.ts passed.');
