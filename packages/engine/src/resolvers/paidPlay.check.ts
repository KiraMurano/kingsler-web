/**
 * «Розыгрыш за монеты»: без жетона карту можно доиграть за золото.
 *
 * Меню это уже умело показывать. Движок — нет: интрига и инстант смотрели
 * только на жетон и молча возвращались, а блеф в меню даже не спрашивал
 * правило. Тогда кнопка «Разыграть за 2 🪙» закрывала меню, и карта падала
 * обратно в руку.
 *
 * Run: npx tsx packages/engine/src/resolvers/paidPlay.check.ts
 */
import assert from 'node:assert/strict';
import type { Player } from '../types.ts';
import { useGameStore } from '../GameStore.ts';
import { mintDeck } from '../cardInstance.ts';
import { timerManager } from '../utils/timerManager.ts';
import { DEFAULT_RULES, normalizeRules, playPayment } from '../rules.ts';

function player(over: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: over.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 10,
    favor: 0,
    seals: 0,
    actionTokens: 0,
    hand: [],
    activePlot: null,
    ...over
  };
}

function table(rules: object) {
  useGameStore.getState().startGame(undefined, rules);
  const meId = useGameStore.getState().players[0].id;
  useGameStore.setState({
    opening: null,
    activePlayerId: meId,
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE'
  });
  return meId;
}

function patch(id: string, fields: Partial<Player>) {
  useGameStore.setState({
    players: useGameStore.getState().players.map(p => (p.id === id ? { ...p, ...fields } : p))
  });
}

function me(id: string) {
  return useGameStore.getState().players.find(p => p.id === id)!;
}

// --- 1. Жетон всегда приоритетнее золота ---
{
  const rules = normalizeRules({ paidPlayEnabled: true, paidPlayCost: 3 });
  assert.deepEqual(
    playPayment(rules, player({ id: 'a', actionTokens: 2, gold: 10 })),
    { tokens: 1, gold: 0 },
    'есть жетон — платит жетон, золото не трогается'
  );
}

// --- 2. Без жетона карту доигрывают золотом ---
{
  assert.deepEqual(
    playPayment(DEFAULT_RULES, player({ id: 'a' })),
    { tokens: 0, gold: 2 },
    'по умолчанию карту можно доиграть за 2 🪙'
  );
}

// --- 3. Правило включено: без жетона платит золотом ---
{
  const rules = normalizeRules({ paidPlayEnabled: true, paidPlayCost: 2 });
  assert.deepEqual(
    playPayment(rules, player({ id: 'a', gold: 2 })),
    { tokens: 0, gold: 2 },
    'жетона нет — две монеты'
  );
  assert.equal(
    playPayment(rules, player({ id: 'a', gold: 1 })),
    null,
    'монеты тоже нет — хода нет'
  );
}

// --- 4. Надбавка карты (шантаж) складывается с выкупом жетона ---
{
  const rules = normalizeRules({ paidPlayEnabled: true, paidPlayCost: 2 });
  assert.deepEqual(
    playPayment(rules, player({ id: 'a', actionTokens: 1, gold: 5 }), 2),
    { tokens: 1, gold: 2 },
    'жетон есть — платит только надбавку карты'
  );
  assert.deepEqual(
    playPayment(rules, player({ id: 'a', gold: 4 }), 2),
    { tokens: 0, gold: 4 },
    'жетона нет — выкуп + надбавка'
  );
  assert.equal(
    playPayment(rules, player({ id: 'a', gold: 3 }), 2),
    null,
    'на оба платежа золота не хватает — в минус не уходит'
  );
}

// --- 5. Живой стол: интрига без жетона ложится за золото ---
{
  const meId = table({ paidPlayEnabled: true, paidPlayCost: 2 });
  const hand = mintDeck(['Охранная грамота', 'Наследник']);
  patch(meId, { actionTokens: 0, gold: 2, hand });
  useGameStore.getState().playPlotAction('Охранная грамота', hand[0].id);

  const after = me(meId);
  assert.equal(after.gold, 0, 'золото списано');
  assert.equal(after.actionTokens, 0, 'жетонов и не было — в минус не ушли');
  assert.equal(after.hand.length, 1, 'карта ушла из руки');
  assert.equal(after.hand[0].card, 'Наследник');
  const pending = useGameStore.getState().pendingAction;
  assert.equal(pending?.plotType, 'Охранная грамота', 'интрига заявлена, а не проглочена');
  assert.equal(pending?.costGold, 2);
  assert.equal(pending?.costTokens, 0);
  timerManager.clearAll();
}

// --- 6. Без правила интрига без жетона не ложится ---
{
  const meId = table({ paidPlayEnabled: false });
  const hand = mintDeck(['Охранная грамота', 'Наследник']);
  patch(meId, { actionTokens: 0, gold: 4, hand });
  useGameStore.getState().playPlotAction('Охранная грамота', hand[0].id);

  const after = me(meId);
  assert.equal(after.hand.length, 2, 'карта осталась в руке');
  assert.equal(after.gold, 4, 'золото не тронуто');
  assert.equal(useGameStore.getState().pendingAction, null, 'заявки нет');
  timerManager.clearAll();
}

// --- 7. Инстант без жетона тоже покупается ---
{
  const meId = table({ paidPlayEnabled: true, paidPlayCost: 2 });
  const victim = useGameStore.getState().players[1].id;
  const hand = mintDeck(['Дворцовый переполох', 'Наследник']);
  patch(meId, { actionTokens: 0, gold: 2, hand });
  patch(victim, { favor: 2 });
  useGameStore.getState().playInstant(meId, 'Дворцовый переполох', hand[0].id, victim);

  const after = me(meId);
  assert.equal(after.gold, 0, 'золото списано');
  assert.equal(after.hand.length, 1, 'карта ушла из руки');
  assert.equal(useGameStore.getState().pendingAction?.instantType, 'Дворцовый переполох');
  assert.equal(useGameStore.getState().pendingAction?.costTokens, 0);
  timerManager.clearAll();
}

// --- 8. Роль без жетона: блеф и номинал идут тем же платежом ---
{
  const meId = table({ paidPlayEnabled: true, paidPlayCost: 2 });
  const hand = mintDeck(['Шут', 'Наследник']);
  patch(meId, { actionTokens: 0, gold: 2, hand });
  useGameStore.getState().performAction({
    type: 'role',
    name: 'Наследник',
    roleClaim: 'Наследник',
    actorId: meId,
    stakedCardId: hand[0].id,
    costGold: 0,
    costTokens: 1,
    description: ''
  });

  const after = me(meId);
  assert.equal(after.gold, 0, 'золото списано за заявление роли');
  assert.equal(after.actionTokens, 0, 'жетон не списан — его не было');
  assert.equal(useGameStore.getState().pendingAction?.roleClaim, 'Наследник');
  timerManager.clearAll();
}

console.log('paidPlay.check: ok');
