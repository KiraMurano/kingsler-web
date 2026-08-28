/**
 * Стартовый жребий: первым ходит случайное место, и пока летит монетка, стол
 * ходов не принимает.
 *
 * До этого первым всегда ходил `players[0]` — то есть хозяин комнаты онлайн и
 * человек в оффлайне. Проверка не фиксирует конкретного победителя (его на то
 * и бросают), а держит связь «активный игрок = победитель жребия», разброс по
 * партиям и заслонку на время броска.
 *
 * Run: npx tsx packages/engine/src/GameStore.toss.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from './GameStore.ts';
import { TOSS_SPIN_MS, TOSS_START_MS } from './timing.ts';

const HUMANS = [
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
];

// 1. Жребий открыт, и ходит именно его победитель.
{
  const before = Date.now();
  useGameStore.getState().startGame(HUMANS);
  const { openingToss, activePlayerId, players, history } = useGameStore.getState();

  assert.ok(openingToss, 'startGame must open a toss');
  assert.equal(activePlayerId, openingToss.winnerId, 'the toss winner must be the one to move');
  assert.ok(
    players.some(p => p.id === openingToss.winnerId),
    'the winner must be someone at the table'
  );
  assert.ok(
    openingToss.landsAt >= before + TOSS_SPIN_MS && openingToss.landsAt <= Date.now() + TOSS_SPIN_MS,
    'landsAt must be an absolute deadline one coin flight away'
  );
  assert.deepEqual(openingToss.readyIds, [], 'nobody is ready before anyone says so');
  assert.equal(openingToss.startsAt, null, 'the countdown must not run before everyone is ready');
  assert.ok(
    history.some(line => line.includes('Жребий брошен')),
    'the chronicle must record the toss'
  );
}

// 2. Под жребием стол не принимает ходов — даже от того, чей ход.
{
  useGameStore.getState().startGame(HUMANS);
  const actorId = useGameStore.getState().activePlayerId;
  const goldBefore = useGameStore.getState().players.map(p => p.gold);

  useGameStore.getState().performAction({
    type: 'role',
    name: 'Казначей',
    roleClaim: 'Казначей',
    actorId,
    costGold: 0,
    costTokens: 1,
    description: 'ход из-под летящей монетки'
  });

  assert.equal(
    useGameStore.getState().pendingAction,
    null,
    'действие под жребием не должно даже попасть в pendingAction'
  );
  assert.deepEqual(
    useGameStore.getState().players.map(p => p.gold),
    goldBefore,
    'жребий не должен пропускать изменения ресурсов'
  );
}

// 3. Победитель меняется от партии к партии. Шанс, что за 40 партий выпадет
//    одно и то же место, — (1/4)^39: провал означает вернувшийся фиксированный
//    старт, а не невезение.
{
  const winners = new Set<number>();
  for (let i = 0; i < 40; i++) {
    useGameStore.getState().startGame(HUMANS);
    const { players, activePlayerId } = useGameStore.getState();
    winners.add(players.findIndex(p => p.id === activePlayerId));
  }
  assert.ok(winners.size > 1, 'the first player must not always be the same seat');
}

// 4. Экран снимается готовностью, а не временем: пока не отметились все живые,
//    он держится сколько угодно.
{
  useGameStore.getState().startGame(HUMANS);
  await new Promise(resolve => setTimeout(resolve, TOSS_SPIN_MS + 400));
  assert.ok(useGameStore.getState().openingToss, 'the toss must not time out on its own');

  useGameStore.getState().markReady('p1');
  assert.deepEqual(useGameStore.getState().openingToss!.readyIds, ['p1']);

  // Повтор ничего не меняет и никого не пропускает вперёд.
  useGameStore.getState().markReady('p1');
  assert.deepEqual(useGameStore.getState().openingToss!.readyIds, ['p1'], 'a second click must not double-count');

  // Бот нажать не может — и держать стол ему нечем.
  const botId = useGameStore.getState().players.find(p => p.isBot)!.id;
  useGameStore.getState().markReady(botId);
  assert.deepEqual(useGameStore.getState().openingToss!.readyIds, ['p1'], 'bots do not sign the ready list');

  // Последняя галочка не бросает игрока в партию тем же кадром: сначала
  // отсчёт, и только потом стол оживает.
  useGameStore.getState().markReady('p2');
  const counting = useGameStore.getState().openingToss;
  assert.ok(counting, 'the last ready must start a countdown, not the game itself');
  assert.ok(
    counting.startsAt !== null && counting.startsAt > Date.now(),
    'startsAt must be a deadline in the future'
  );

  await new Promise(resolve => setTimeout(resolve, TOSS_START_MS + 250));
  assert.equal(useGameStore.getState().openingToss, null, 'the countdown must hand the table over');
}

// 5. Место, отданное боту, перестаёт держать стол: ушедший «Готов» не нажмёт.
{
  useGameStore.getState().startGame(HUMANS);
  useGameStore.getState().markReady('p1');
  assert.ok(useGameStore.getState().openingToss, 'still waiting for p2');

  useGameStore.setState(state => ({
    players: state.players.map(p => (p.id === 'p2' ? { ...p, isBot: true } : p))
  }));
  useGameStore.getState()._settleOpeningToss();
  assert.ok(
    useGameStore.getState().openingToss!.startsAt !== null,
    'a seat handed to a bot must stop holding the toss screen'
  );
  await new Promise(resolve => setTimeout(resolve, TOSS_START_MS + 250));
  assert.equal(useGameStore.getState().openingToss, null);
}

// 6. Новая партия обрывает чужой отсчёт: иначе таймер прошлой снял бы экран
//    жребия следующей.
{
  useGameStore.getState().startGame(HUMANS);
  useGameStore.getState().markReady('p1');
  useGameStore.getState().markReady('p2');
  assert.ok(useGameStore.getState().openingToss!.startsAt !== null, 'countdown running');

  useGameStore.getState().startGame(HUMANS);
  await new Promise(resolve => setTimeout(resolve, TOSS_START_MS + 250));
  const fresh = useGameStore.getState().openingToss;
  assert.ok(fresh, "the previous game's countdown must not lift the new toss screen");
  assert.deepEqual(fresh.readyIds, []);
}

console.log('GameStore.toss.check.ts passed.');
