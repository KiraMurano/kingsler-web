/**
 * «Не верю» под нападением не должно молча проваливаться.
 *
 * Дефект, ради которого написан файл: окно реакции жертвы открывалось, НЕ
 * сбросив список ответивших в опросе двора. Список принадлежит своей заявке —
 * но проверка «сказавший „Верю“ ответ уже дал» смотрела в него как есть, и
 * ответ, данный по ПРОШЛОМУ действию, молча запрещал жертве проверить
 * нападающего. Кнопка нажималась, и не происходило ничего.
 *
 * Обычная проверка при этом работала: своё окно сомнения список сбрасывает.
 *
 * Run: npx tsx packages/engine/src/resolvers/attackDoubt.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from '../GameStore.ts';
import { mintDeck } from '../cardInstance.ts';
import { timerManager } from '../utils/timerManager.ts';

const HUMANS = [
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
];

/**
 * Стол, готовый к нападению `p1` на `p2`.
 *
 * `passed` — что лежит в списке ответивших ДО нападения: так воспроизводится
 * состояние после прошлого опроса двора.
 */
function tableReadyToAttack(passed: string[], gold = 0) {
  useGameStore.getState().startGame(HUMANS);
  const state = useGameStore.getState();
  useGameStore.setState({
    opening: null,
    activePlayerId: 'p1',
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    pendingAction: null,
    pendingDoubtDoubterId: null,
    /* Ответ по ПРОШЛОЙ заявке: её самой уже нет, а список остался. */
    pendingDoubtPassedIds: passed,
    pendingDoubtActionId: 'прошлая-заявка',
    hasPlayedRoleThisTurn: false,
    players: state.players.map(p => {
      if (p.id === 'p1') return { ...p, actionTokens: 2, hand: mintDeck(['Вор', 'Шут']) };
      if (p.id === 'p2') {
        /* Жертве есть что терять — иначе Вора на неё не заявить вовсе. */
        return { ...p, gold: 5, actionTokens: gold > 0 ? 0 : 2, hand: mintDeck(['Шут', 'Шут']) };
      }
      return { ...p, actionTokens: 2 };
    })
  });

  const staked = useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id;
  useGameStore.getState().performAction({
    type: 'role',
    name: 'Вор',
    roleClaim: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    stakedCardId: staked,
    costGold: 0,
    costTokens: 1,
    description: ''
  });
  assert.equal(
    useGameStore.getState().turnPhase,
    'TARGET_REACTION_WINDOW',
    'жертва в окне реакции'
  );
}

// --- 1. Ответ по прошлой заявке не запрещает проверить нападающего ---
{
  tableReadyToAttack(['p2']);
  const before = useGameStore.getState().players.find(p => p.id === 'p2')!.actionTokens;

  useGameStore.getState().targetDoubtAttack('p2');

  const after = useGameStore.getState();
  assert.equal(
    after.pendingDoubtDoubterId,
    'p2',
    'жертва проверяет нападающего, хотя в прошлом опросе говорила «Верю»'
  );
  assert.equal(
    after.players.find(p => p.id === 'p2')!.actionTokens,
    before - 1,
    'и за проверку списан жетон'
  );
  timerManager.clearAll();
}

// --- 2. Открытие окна реакции гасит прошлый опрос ---
//
// Список ответивших принадлежит своей заявке: пока он доживал до следующей,
// стол показывал решения прошлого хода как свежие.
{
  tableReadyToAttack(['p2', 'p3']);
  const state = useGameStore.getState();
  assert.deepEqual(state.pendingDoubtPassedIds, [], 'ответы прошлой заявки погашены');
  assert.equal(
    state.pendingDoubtActionId,
    state.pendingAction!.id,
    'опрос принадлежит нападению, а не прошлой заявке'
  );
  timerManager.clearAll();
}

// --- 3. А своё «Верю» жертву по-прежнему держит ---
//
// Ответ один и окончательный: сказав «Верю» под нападением, переиграть его на
// «Не верю» нельзя — иначе жертва добирала бы себе вторую попытку.
{
  tableReadyToAttack([]);
  useGameStore.getState().targetAcceptAttack('p2');
  const tokens = useGameStore.getState().players.find(p => p.id === 'p2')!.actionTokens;

  useGameStore.getState().doubtAction('p2');

  const after = useGameStore.getState();
  assert.equal(after.pendingDoubtDoubterId, null, 'своё «Верю» уже сказано — проверки не будет');
  assert.equal(
    after.players.find(p => p.id === 'p2')!.actionTokens,
    tokens,
    'и жетон за неслучившуюся проверку не списан'
  );
  timerManager.clearAll();
}

// --- 4. То же и для платной проверки: жетонов нет, платит золотом ---
{
  useGameStore.getState().startGame(HUMANS, { paidDoubtEnabled: true, paidDoubtCost: 2 });
  const state = useGameStore.getState();
  useGameStore.setState({
    opening: null,
    activePlayerId: 'p1',
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    pendingAction: null,
    pendingDoubtDoubterId: null,
    pendingDoubtPassedIds: ['p2'],
    pendingDoubtActionId: 'прошлая-заявка',
    hasPlayedRoleThisTurn: false,
    players: state.players.map(p => {
      if (p.id === 'p1') return { ...p, actionTokens: 2, hand: mintDeck(['Вор', 'Шут']) };
      if (p.id === 'p2') return { ...p, gold: 5, actionTokens: 0, hand: mintDeck(['Шут', 'Шут']) };
      return { ...p, actionTokens: 2 };
    })
  });
  const staked = useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id;
  useGameStore.getState().performAction({
    type: 'role',
    name: 'Вор',
    roleClaim: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    stakedCardId: staked,
    costGold: 0,
    costTokens: 1,
    description: ''
  });

  useGameStore.getState().targetDoubtAttack('p2');

  const after = useGameStore.getState();
  assert.equal(after.pendingDoubtDoubterId, 'p2', 'платная проверка под нападением проходит');
  assert.equal(
    after.players.find(p => p.id === 'p2')!.gold,
    3,
    'и списаны именно монеты, а не жетон'
  );
  timerManager.clearAll();
}

console.log('attackDoubt.check: ok');
process.exit(0);
