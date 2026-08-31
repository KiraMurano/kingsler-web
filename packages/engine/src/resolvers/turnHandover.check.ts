/**
 * Ход человека не передаётся сам.
 *
 * Раньше `checkEndgameAndAdvanceTurn` смотрела на жетоны и, не найдя их,
 * молча звала `endTurn`: истратил последний ⚡ — и стол уже на чужом ходу.
 * Между результатом собственного действия и чужим ходом не оставалось ни
 * секунды, чтобы посмотреть, чем всё кончилось, а кнопку «Завершить ход» игра
 * нажимала за игрока чаще, чем он сам.
 *
 * Теперь стол в этом месте возвращается в IDLE и ждёт нажатия. Бот — исключение,
 * и намеренное: его «решение» это тот же расчёт, а лишняя пауза добавила бы
 * секунду ожидания к каждому ходу двора.
 *
 * Run: npx tsx packages/engine/src/resolvers/turnHandover.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from './../types.ts';
import { mintDeck } from './../cardInstance.ts';
import { useGameStore } from './../GameStore.ts';

function seat(id: string, isBot: boolean, tokens: number, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot,
    gold: 4,
    favor: 1,
    seals: 0,
    actionTokens: tokens,
    hand: mintDeck(hand),
    activePlot: null
  };
}

function table(active: string, seats: Player[]) {
  useGameStore.setState({
    players: seats,
    /* Колода нужна: `endTurn` добирает руки до двух карт, и на пустой колоде
       перетасовка полезла бы в пустой же сброс. */
    deck: mintDeck(['Вор', 'Шут', 'Казначей', 'Наследник', 'Дуэлянт', 'Шантажист']),
    discardPile: [],
    activePlayerId: active,
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    pendingAction: null,
    pendingDoubtDoubterId: null,
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: true,
    hasPlayedPlotThisTurn: true,
    isVetoed: false,
    vetoChain: 0,
    coronations: [],
    winnerId: null,
    history: []
  });
}

/* 1. Человек истратил жетоны — ход всё равно остаётся у него. */
{
  table('p1', [
    seat('p1', false, 0, ['Шантажист', 'Дуэлянт']),
    seat('p2', true, 2, ['Вор', 'Шут'])
  ]);

  useGameStore.getState()._checkEndgameAndAdvanceTurn();

  const after = useGameStore.getState();
  assert.equal(after.activePlayerId, 'p1', 'ход не передаётся без нажатия игрока');
  assert.equal(after.turnPhase, 'IDLE', 'стол ждёт в IDLE — это фаза «свой ход»');
  assert.equal(after.pendingAction, null, 'разыгранное действие со стола убрано');
  assert.equal(
    after.players.find(p => p.id === 'p1')!.hand.length,
    2,
    'руку не добирают: добор — часть завершения хода, а ход не завершён'
  );
}

/* 2. И даже когда в руке пусто, а обе карты за ход уже сыграны. */
{
  table('p1', [seat('p1', false, 0, []), seat('p2', true, 2, ['Вор', 'Шут'])]);

  useGameStore.getState()._checkEndgameAndAdvanceTurn();
  assert.equal(
    useGameStore.getState().activePlayerId,
    'p1',
    'играть нечем — но передать ход это всё ещё решение игрока'
  );
}

/* 3. Нажатие «Завершить ход» ход передаёт. */
{
  table('p1', [
    seat('p1', false, 0, ['Шантажист', 'Дуэлянт']),
    seat('p2', true, 2, ['Вор', 'Шут'])
  ]);

  useGameStore.getState().endTurnManually();
  assert.equal(useGameStore.getState().activePlayerId, 'p2', 'кнопка ход передаёт');
}

/* 4. Бот, исчерпавший ход, завершает его сам. */
{
  table('p2', [
    seat('p1', false, 2, ['Шантажист', 'Дуэлянт']),
    seat('p2', true, 0, ['Вор', 'Шут'])
  ]);

  useGameStore.getState()._checkEndgameAndAdvanceTurn();
  assert.equal(
    useGameStore.getState().activePlayerId,
    'p1',
    'бот не заставляет двор ждать лишнюю секунду'
  );
}

/* 5. У бота ещё есть жетоны — ход остаётся у него, он походит второй раз. */
{
  table('p2', [
    seat('p1', false, 2, ['Шантажист', 'Дуэлянт']),
    seat('p2', true, 1, ['Вор', 'Шут'])
  ]);

  useGameStore.getState()._checkEndgameAndAdvanceTurn();
  assert.equal(useGameStore.getState().activePlayerId, 'p2', 'непотраченный жетон — ещё одно действие');
}

console.log('turnHandover.check.ts passed.');
