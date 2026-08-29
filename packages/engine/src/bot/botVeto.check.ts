/**
 * Окно вето держится ответами — значит промолчать бот не имеет права никогда.
 *
 * Два зависания, ради которых написан этот файл, оба выглядели одинаково: стол
 * стоял в `VETO_WINDOW`, ожидая ответа, которого никто уже не даст.
 *
 *  1. Перезапуск круга был НЕ атомарным. Движок ботов — подписчик стора, и он
 *     просыпался между двумя `set`: цепочка уже новая, список ответивших ещё
 *     старый. Ответившие в прошлом круге отфильтровывались как «уже
 *     ответившие», планировать было некого, а второй `set` движок не будил.
 *     Ловится в `resolvers/vetoChain.check.ts` — там проверяется сам кадр.
 *  2. Бот, чей ход движок отверг молча (карты уже нет на руках), не отвечал
 *     вовсе: «наложить вето» ответом не стало, а «Пропустить» он не нажал.
 *     Ловится здесь.
 *
 * Run: npx tsx packages/engine/src/bot/botVeto.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
import { handleVetoPhase } from './botReactions.ts';
import { timerManager } from '../utils/timerManager.ts';

function seat(id: string, isBot: boolean, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot,
    gold: 4,
    favor: 1,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(hand),
    activePlot: null
  };
}

/**
 * Стол в открытом окне вето по действию `p1`.
 *
 * `targetId` — кого это действие бьёт. Он же делает решение бота
 * детерминированным: защищать себя от прямой атаки бот решает всегда, а без
 * цели ветирует по броску монетки, и тест проходил бы через раз сам собой.
 */
function tableInVetoWindow(botHands: GameCard[][], targetId?: string) {
  useGameStore.setState({
    players: [
      seat('p1', false, ['Наследник', 'Шут']),
      ...botHands.map((hand, i) => seat(`b${i + 1}`, true, hand))
    ],
    activePlayerId: 'p1',
    turnPhase: 'VETO_WINDOW',
    turnSubPhase: 'CARD_PLAY_PHASE',
    opening: null,
    pendingAction: {
      id: 'a1',
      type: 'role',
      name: targetId ? 'Вор' : 'Наследник',
      roleClaim: targetId ? 'Вор' : 'Наследник',
      actorId: 'p1',
      targetId,
      costGold: 0,
      costTokens: 1,
      description: ''
    },
    pendingDoubtDoubterId: null,
    pendingDoubtPassedIds: [],
    pendingVetoPassedIds: [],
    pendingVetoActionId: 'a1',
    overlayInstant: null,
    isVetoed: false,
    vetoChain: 0,
    winnerId: null,
    history: []
  });
}

/** Планировщик, исполняющий ответы сразу: интересен исход, а не задержка. */
const now = (_key: string, cb: () => void) => cb();

// --- Каждый спрашиваемый бот отвечает, и с картой, и без ---
{
  tableInVetoWindow([['Шут', 'Шут'], ['Казначей', 'Рыцарь']]);
  handleVetoPhase(useGameStore.getState(), now);

  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 0, 'вето никому не досталось — класть было нечего');
  assert.deepEqual(
    [...after.pendingVetoPassedIds].sort(),
    ['b1', 'b2'],
    'бот без «Права вето» всё равно обязан ответить: молчание держало бы стол'
  );
  timerManager.clearAll();
}

// --- Отвергнутый движком ход не оставляет бота без ответа ---
//
// Карта, которую бот собрался положить, к моменту хода в руке уже не лежит:
// `playInstant` отвергает ход молча. Раньше бот на этом и заканчивал — вето не
// легло, «Пропустить» не нажато, опрос ждёт его вечно.
{
  /* Бот — цель атаки, значит вето он положит наверняка: гадать на `Math.random`
     в тесте про зависание нельзя, иначе он ловил бы дефект через раз. */
  tableInVetoWindow([['Право вето', 'Шут']], 'b1');

  const stale = (_key: string, cb: () => void) => {
    /* Подменяем руку между планированием и ходом — ровно то, что делает любой
       эффект, успевший тронуть карты, пока бот думал. */
    useGameStore.setState({
      players: useGameStore.getState().players.map(p =>
        p.id === 'b1' ? { ...p, hand: mintDeck(['Шут', 'Шут']) } : p
      )
    });
    cb();
  };
  handleVetoPhase(useGameStore.getState(), stale);

  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 0, 'вето не легло: карты у бота уже нет');
  assert.deepEqual(
    after.pendingVetoPassedIds,
    ['b1'],
    'ход отвергнут — значит ответом стал «Пропустить», а не молчание'
  );
  timerManager.clearAll();
}

// --- Наложившего вето в новом круге не переспрашивают ---
//
// Он и так наверху: вето поверх собственного вето ничего не отменяет. Раньше
// он попадал в опрос и говорил «Не накладываю Вето» сразу после «Право вето!».
{
  tableInVetoWindow([['Право вето', 'Шут'], ['Шут', 'Шут']]);
  /* Круг повторяется только при включённом «вето на вето»: без него окно
     закрывается само, и спрашивать уже нечего. */
  useGameStore.setState({
    rules: { ...useGameStore.getState().rules, vetoOnVeto: true },
    vetoChain: 1,
    isVetoed: true,
    overlayInstant: { card: 'Право вето', actorId: 'b1' }
  });
  handleVetoPhase(useGameStore.getState(), now);

  const after = useGameStore.getState();
  assert.equal(
    after.pendingVetoPassedIds.includes('b1'),
    false,
    'своё же вето не переспрашивают — он не отвечает вовсе'
  );
  assert.deepEqual(
    after.pendingVetoPassedIds,
    ['b2'],
    'а остальных спрашивают как обычно'
  );
  timerManager.clearAll();
}

// --- А с выключенным «вето на вето» второго круга нет вовсе ---
{
  tableInVetoWindow([['Право вето', 'Шут'], ['Шут', 'Шут']]);
  useGameStore.setState({
    rules: { ...useGameStore.getState().rules, vetoOnVeto: false },
    vetoChain: 1,
    isVetoed: true,
    overlayInstant: { card: 'Право вето', actorId: 'b1' }
  });
  handleVetoPhase(useGameStore.getState(), now);

  assert.deepEqual(
    useGameStore.getState().pendingVetoPassedIds,
    [],
    'отвечать не на что: вето легло, окно закрывается само'
  );
  timerManager.clearAll();
}

console.log('botVeto.check: ok');
