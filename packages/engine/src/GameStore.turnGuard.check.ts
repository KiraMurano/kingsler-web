/**
 * `performAction` принадлежит тому, чей сейчас ход.
 *
 * Дыра, ради которой написан этот файл: `performAction` брала актора из
 * `activePlayerId`, а не из `actionData.actorId`, и не смотрела на фазу. В
 * интерфейсе выбор цели живёт отдельным состоянием и не отменялся при передаче
 * хода — значит, выбрав «Шантажиста» и нажав «Завершить ход», игрок сохранял
 * висящий прицел и мог ткнуть в жертву посреди чужого хода. Действие
 * выполнялось — и выполнялось ОТ ЛИЦА того, чей был ход.
 *
 * Run: npx tsx packages/engine/src/GameStore.turnGuard.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from './types.ts';
import { mintDeck } from './cardInstance.ts';
import { useGameStore } from './GameStore.ts';

function seat(id: string, isBot: boolean, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot,
    gold: 8,
    favor: 2,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(hand),
    activePlot: null
  };
}

function table() {
  useGameStore.setState({
    players: [
      seat('p1', false, ['Шантажист', 'Рыцарь']),
      seat('p2', true, ['Вор', 'Шут']),
      seat('p3', true, ['Казначей', 'Наследник'])
    ],
    activePlayerId: 'p2',
    turnPhase: 'IDLE',
    pendingAction: null,
    pendingDoubtDoubterId: null,
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVetoed: false,
    vetoChain: 0,
    pendingVetoPassedIds: [],
    pendingVetoActionId: null,
    history: []
  });
}

// 1. Чужой ход: действие от лица p1 не должно случиться вовсе.
{
  table();
  const было = useGameStore.getState().players.map(p => ({ id: p.id, gold: p.gold, favor: p.favor, tokens: p.actionTokens }));

  useGameStore.getState().performAction({
    type: 'role',
    name: 'Шантажист',
    roleClaim: 'Шантажист',
    actorId: 'p1',
    targetId: 'p3',
    costGold: 0,
    costTokens: 1,
    description: 'висящий прицел из прошлого хода'
  });

  assert.equal(
    useGameStore.getState().pendingAction,
    null,
    'действие в чужой ход не должно даже попасть в pendingAction'
  );
  assert.deepEqual(
    useGameStore.getState().players.map(p => ({ id: p.id, gold: p.gold, favor: p.favor, tokens: p.actionTokens })),
    было,
    'ничьи ресурсы не должны шелохнуться'
  );
}

// 2. И — главное — оно не должно выполниться ОТ ЛИЦА активного игрока.
{
  table();
  useGameStore.getState().performAction({
    type: 'role',
    name: 'Шантажист',
    roleClaim: 'Шантажист',
    actorId: 'p1',
    targetId: 'p3',
    costGold: 0,
    costTokens: 1,
    description: 'висящий прицел из прошлого хода'
  });
  assert.notEqual(
    useGameStore.getState().pendingAction?.actorId,
    'p2',
    'клик игрока не имеет права ходить за того, чей сейчас ход'
  );
}

// 3. Свой ход — по-прежнему работает.
{
  table();
  useGameStore.setState({ activePlayerId: 'p1' });
  useGameStore.getState().performAction({
    type: 'role',
    name: 'Шантажист',
    roleClaim: 'Шантажист',
    actorId: 'p1',
    targetId: 'p3',
    costGold: 0,
    costTokens: 1,
    description: 'законный ход'
  });
  assert.equal(useGameStore.getState().pendingAction?.actorId, 'p1', 'свой ход должен проходить');
}

// 4. Свой ход, но фаза занята: реакция ещё не разрешилась — действие не лезет.
{
  table();
  useGameStore.setState({ activePlayerId: 'p1', turnPhase: 'DOUBT_WINDOW' });
  useGameStore.getState().performAction({
    type: 'role',
    name: 'Шантажист',
    roleClaim: 'Шантажист',
    actorId: 'p1',
    targetId: 'p3',
    costGold: 0,
    costTokens: 1,
    description: 'посреди чужой реакции'
  });
  assert.equal(
    useGameStore.getState().pendingAction,
    null,
    'пока открыто окно реакции, новое действие начинать нельзя'
  );
}

console.log('GameStore.turnGuard.check: ok');
