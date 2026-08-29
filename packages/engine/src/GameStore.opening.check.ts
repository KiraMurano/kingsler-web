/**
 * Открытие партии: сбор двора → жребий → раздача → фанфара → первый ход.
 *
 * Порядок здесь и есть предмет проверки. Раньше стол открывался сразу, с уже
 * розданными картами, а жребий вместе с готовностью висел поверх него — то
 * есть игрок подтверждал участие в партии, жребий которой уже состоялся, и
 * раздачи как события не было вовсе.
 *
 * Заодно держится то, что было и раньше: первым ходит победитель жребия, а не
 * хозяин комнаты, и всё открытие стол не принимает ходов.
 *
 * Run: npx tsx packages/engine/src/GameStore.opening.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from './GameStore.ts';
import { HAND_SIZE } from './cards.ts';
import {
  DEAL_STEP_MS,
  FANFARE_MS,
  OPENING_HOLD_MS,
  TOSS_BOT_READY_MS,
  TOSS_SPIN_MS,
  TOSS_VERDICT_MS
} from './timing.ts';
import { startBotEngine, stopBotEngine } from './Bot.ts';

const HUMANS = [
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
];

/** Отмечает всех, кроме перечисленных. */
function readyAllExcept(...keep: string[]) {
  for (const p of useGameStore.getState().players) {
    if (!keep.includes(p.id)) useGameStore.getState().markReady(p.id);
  }
}

const state = () => useGameStore.getState();
const opening = () => state().opening;

// 1. Партия открывается сбором двора: ни монетки, ни карт на руках ещё нет.
{
  useGameStore.getState().startGame(HUMANS);

  assert.ok(opening(), 'startGame открывает партию');
  assert.equal(opening()!.stage, 'READY', 'первая стадия — сбор двора');
  assert.equal(opening()!.holdUntil, null, 'пауза не идёт: двор ещё не собран');
  assert.equal(opening()!.landsAt, null, 'монетка ещё не брошена');
  assert.deepEqual(opening()!.readyIds, [], 'никто не отметился, пока не отметился');

  assert.deepEqual(
    state().players.map(p => p.hand.length),
    [0, 0, 0, 0],
    'руки пустые: карты раздаются позже и на глазах у стола'
  );
  assert.equal(
    state().activePlayerId,
    opening()!.winnerId,
    'ходить будет победитель жребия'
  );
  assert.ok(
    state().players.some(p => p.id === opening()!.winnerId),
    'победитель — кто-то за этим столом'
  );
  assert.equal(
    state().history.some(line => line.includes('Жребий брошен')),
    false,
    'жребия ещё не было — объявлять нечего'
  );
}

// 2. Всё открытие стол не принимает ходов — даже от того, чей ход.
{
  useGameStore.getState().startGame(HUMANS);
  const actorId = state().activePlayerId;
  const goldBefore = state().players.map(p => p.gold);

  useGameStore.getState().performAction({
    type: 'role',
    name: 'Казначей',
    roleClaim: 'Казначей',
    actorId,
    costGold: 0,
    costTokens: 1,
    description: 'ход из-под открытия'
  });

  assert.equal(state().pendingAction, null, 'действие не должно попасть даже в pendingAction');
  assert.deepEqual(state().players.map(p => p.gold), goldBefore, 'и ресурсы не должны двинуться');
}

// 3. Победитель меняется от партии к партии. Шанс, что за 40 партий выпадет
//    одно и то же место, — (1/4)^39: провал означает вернувшийся фиксированный
//    старт, а не невезение.
{
  const winners = new Set<number>();
  for (let i = 0; i < 40; i++) {
    useGameStore.getState().startGame(HUMANS);
    winners.add(state().players.findIndex(p => p.id === state().activePlayerId));
  }
  assert.ok(winners.size > 1, 'первым ходит не всегда одно и то же место');
}

// 4. Сбор двора держится готовностью, а не временем, и жребий ждёт всех.
{
  useGameStore.getState().startGame(HUMANS);
  /* Дольше любой паузы открытия: если бы сбор двора кончался сам, к этому
     моменту он бы уже кончился. */
  await new Promise(resolve => setTimeout(resolve, OPENING_HOLD_MS + 400));
  assert.equal(opening()!.stage, 'READY', 'сам по себе сбор двора не заканчивается');

  useGameStore.getState().markReady('p1');
  assert.deepEqual(opening()!.readyIds, ['p1']);

  // Повтор ничего не меняет и никого не пропускает вперёд.
  useGameStore.getState().markReady('p1');
  assert.deepEqual(opening()!.readyIds, ['p1'], 'вторая галочка не считается дважды');

  // Чужого за столом нет — отметить некого.
  useGameStore.getState().markReady('нет-такого');
  assert.deepEqual(opening()!.readyIds, ['p1'], 'отмечаются только сидящие за столом');

  // Боты отмечаются наравне со всеми: их кружки зажигаются из того же поля.
  readyAllExcept('p1', 'p2');
  assert.equal(opening()!.stage, 'READY', 'p2 ещё держит стол');

  /* Последняя галочка не бросает монетку тем же кадром: игрок ещё смотрит на
     ряд, проверяя, что собрались все. Сначала пауза, потом жребий. */
  useGameStore.getState().markReady('p2');
  assert.equal(opening()!.stage, 'READY', 'двор собран, но монетка ещё не летит');
  assert.ok(
    opening()!.holdUntil !== null && opening()!.holdUntil! > Date.now(),
    'идёт пауза перед жребием'
  );
  assert.deepEqual(opening()!.landsAt, null, 'монетки в воздухе ещё нет');

  await new Promise(resolve => setTimeout(resolve, OPENING_HOLD_MS + 300));
  assert.equal(opening()!.stage, 'TOSS', 'пауза вышла — монетка полетела');
  /* Дальше дорогу до первого хода целиком проходит сцена 5 — второй раз ждать
     те же полторы минуты незачем. */
  assert.ok(
    opening()!.landsAt !== null && opening()!.landsAt! > Date.now(),
    'landsAt — абсолютный момент приземления впереди'
  );
  assert.ok(
    state().history.some(line => line.includes('Жребий брошен')),
    'вот теперь жребий попадает в летопись'
  );
  assert.deepEqual(
    state().players.map(p => p.hand.length),
    [0, 0, 0, 0],
    'пока летит монетка, карт всё ещё нет'
  );
}

// 5. После жребия стол открывается и карты идут ПО ОДНОЙ по кругу.
//
// Считаем не по часам, а по кадрам: подписка ловит каждое изменение состояния,
// и последовательность розданных карт обязана быть 1, 2, 3, … без пропусков.
// Проверка по таймеру ловила бы шаг раздачи, а не саму раздачу, и краснела бы
// от каждой лишней миллисекунды.
{
  useGameStore.getState().startGame(HUMANS);
  readyAllExcept();

  const seatCount = state().players.length;
  const deckBefore = state().deck.length;
  const winnerId = opening()!.winnerId;

  /** Сколько карт было роздано на каждом кадре, где это число менялось. */
  const steps: number[] = [];
  /** Кому досталась первая карта. */
  let firstRecipient: string | null = null;
  let dealt = 0;

  const unsubscribe = useGameStore.subscribe(s => {
    const total = s.players.reduce((n, p) => n + p.hand.length, 0);
    if (total === dealt) return;
    dealt = total;
    steps.push(total);
    if (total === 1) firstRecipient = s.players.find(p => p.hand.length === 1)?.id ?? null;
  });

  await new Promise(resolve =>
    setTimeout(
      resolve,
      OPENING_HOLD_MS +
        TOSS_SPIN_MS +
        TOSS_VERDICT_MS +
        DEAL_STEP_MS * (seatCount * HAND_SIZE + 2) +
        600
    )
  );
  unsubscribe();

  assert.deepEqual(
    steps,
    Array.from({ length: seatCount * HAND_SIZE }, (_, i) => i + 1),
    'карты идут по одной: каждый кадр добавляет ровно одну'
  );
  assert.equal(firstRecipient, winnerId, 'раздача начинается с того, кому выпал жребий');
  assert.deepEqual(
    state().players.map(p => p.hand.length),
    state().players.map(() => HAND_SIZE),
    'у каждого полная рука'
  );
  assert.equal(
    state().deck.length,
    deckBefore - seatCount * HAND_SIZE,
    'из колоды ушло ровно столько, сколько роздано'
  );

  /* Роздали — но объявление не выскакивает поверх ещё летящей карты: сперва
     пауза, чтобы игрок успел посмотреть на свою руку. */
  assert.equal(opening()!.stage, 'DEAL', 'после последней карты — пауза, а не сразу фанфара');
  assert.ok(opening()!.holdUntil !== null, 'и это именно пауза');

  await new Promise(resolve => setTimeout(resolve, OPENING_HOLD_MS + 300));
  assert.equal(opening()!.stage, 'FANFARE', 'вот теперь объявление');
  assert.equal(opening()!.holdUntil, null, 'оно идёт, а не ждёт');

  // Объявление отстаивает своё, уходит — и только после паузы стол оживает.
  await new Promise(resolve => setTimeout(resolve, FANFARE_MS + 300));
  assert.equal(opening()!.stage, 'FANFARE', 'объявление ушло, идёт вдох перед ходом');
  assert.ok(opening()!.holdUntil !== null, 'и это снова пауза');

  await new Promise(resolve => setTimeout(resolve, OPENING_HOLD_MS + 300));
  assert.equal(opening(), null, 'открытие закончилось — идёт первый ход');
}

// 6. Место, отданное боту, перестаёт держать сбор двора: ушедший «Готов» не
//    нажмёт.
{
  useGameStore.getState().startGame(HUMANS);
  readyAllExcept('p2');
  assert.equal(opening()!.stage, 'READY', 'ждём p2');

  useGameStore.setState(s => ({
    players: s.players.map(p => (p.id === 'p2' ? { ...p, isBot: true } : p))
  }));
  useGameStore.getState().markReady('p2');
  assert.ok(
    opening()!.holdUntil !== null,
    'место под ботом больше не держит сбор двора: пошла пауза перед жребием'
  );
}

// 7. Новая партия обрывает чужую последовательность: иначе таймер прошлой
//    двигал бы стадии следующей.
{
  useGameStore.getState().startGame(HUMANS);
  readyAllExcept();
  assert.ok(opening()!.holdUntil !== null, 'у прошлой партии пошла пауза до жребия');
  const firstId = opening()!.id;

  useGameStore.getState().startGame(HUMANS);
  /* Ждём ровно столько, чтобы успел сработать таймер ПРОШЛОГО открытия: если
     он жив, он переведёт стадию, и это здесь и ловится. Досиживать до жребия
     незачем — своего таймера у новой партии ещё нет. */
  await new Promise(resolve => setTimeout(resolve, OPENING_HOLD_MS + 300));
  assert.equal(opening()!.stage, 'READY', 'прошлая партия не двигает новую');
  assert.notEqual(opening()!.id, firstId, 'это другое открытие');
  assert.equal(opening()!.holdUntil, null, 'и её пауза не унаследована');
  assert.deepEqual(opening()!.readyIds, []);
}

// 8. Боты отмечаются сами и вразнобой — этим занят движок ботов.
{
  startBotEngine();
  try {
    useGameStore.getState().startGame(HUMANS);
    const botIds = state().players.filter(p => p.isBot).map(p => p.id);
    assert.equal(botIds.length, 2, 'два места за этим столом — боты');

    await new Promise(resolve => setTimeout(resolve, TOSS_BOT_READY_MS + 600));
    const ready = state().opening!.readyIds;
    assert.deepEqual([...ready].sort(), [...botIds].sort(), 'каждый бот отмечается сам');
    assert.equal(
      state().opening!.stage,
      'READY',
      'люди жмут «Готов» сами — за них никто не отмечается'
    );

    useGameStore.getState().markReady('p1');
    useGameStore.getState().markReady('p2');
    assert.ok(state().opening!.holdUntil !== null, 'теперь можно бросать жребий');
  } finally {
    stopBotEngine();
  }
}

console.log('GameStore.opening.check: ok');

/* Выходим сами.
 *
 * Открытие партии — это цепочка таймеров: каждый шаг планирует следующий, и
 * пока цепочка не доиграет, node держит цикл событий живым. Последняя партия
 * этой проверки остаётся на середине последовательности, и без явного выхода
 * процесс просто досиживал бы её до конца — полтора десятка секунд молчания
 * после уже напечатанного «ok». */
process.exit(0);
