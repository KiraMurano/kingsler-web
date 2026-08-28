/**
 * Правила партии реально управляют движком, а не лежат в состоянии мёртвым
 * грузом: порог победы, потолок корон, число жетонов.
 * Run: npx tsx packages/engine/src/rules.engine.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from './types.ts';
import { useGameStore } from './GameStore.ts';
import { resolveCoronationAtTurnStart, fallenCoronationPatch } from './resolvers/coronation.ts';
import { addSealsToPlayer } from './resolvers/sealsResolver.ts';
import { mintDeck } from './cardInstance.ts';
import { timerManager } from './utils/timerManager.ts';

/** Партия на заданных правилах, ход у первого места, жребий снят. */
function table(rules: Parameters<typeof useGameStore.getState>[0] extends never ? never : object) {
  useGameStore.getState().startGame(undefined, rules);
  const state = useGameStore.getState();
  const meId = state.players[0].id;
  useGameStore.setState({
    openingToss: null,
    activePlayerId: meId,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE'
  });
  return meId;
}

function patch(id: string, fields: Partial<Player>) {
  useGameStore.setState({
    players: useGameStore.getState().players.map(p => (p.id === id ? { ...p, ...fields } : p))
  });
}

function hand(cards: GameCard[]) {
  return mintDeck(cards);
}

// ==========================================================================
// Порог победы
// ==========================================================================

// --- Чистые функции получают порог параметром ---
{
  const players: Player[] = [
    { id: 'p1', name: 'p1', avatar: '', seatNumber: 1, isBot: false, gold: 0, favor: 3, seals: 0, actionTokens: 2, hand: [], activePlot: null }
  ];
  assert.equal(resolveCoronationAtTurnStart('p1', players, 'p1', 'p1', 3).kind, 'win', 'на пороге 3 трёх корон хватает');
  assert.equal(resolveCoronationAtTurnStart('p1', players, 'p1', 'p1', 4).kind, 'abort', 'на пороге 4 — нет');

  assert.deepEqual(fallenCoronationPatch('p1', 'p1', 2, 3), { coronationCandidateId: null, coronationOriginId: null });
  assert.deepEqual(fallenCoronationPatch('p1', 'p1', 3, 3), {}, 'на пороге круг держится');
}

// --- Круг коронации открывается на пороге из правил ---
for (const crownsToWin of [1, 5, 10]) {
  const meId = table({ crownsToWin });
  patch(meId, { favor: crownsToWin - 1, actionTokens: 2, hand: hand(['Наследник', 'Шут']) });
  useGameStore.setState({ coronationCandidateId: null, coronationOriginId: null });

  // Прямое начисление короны через печати: 2 ⚜️ = 1 👑.
  patch(meId, { seals: 1 });
  addSealsToPlayer(useGameStore.getState, useGameStore.setState, meId, 1);

  const after = useGameStore.getState();
  const me = after.players.find(p => p.id === meId)!;
  assert.equal(me.favor, crownsToWin, `порог ${crownsToWin}: корона добрана`);
  assert.equal(after.coronationCandidateId, meId, `порог ${crownsToWin}: круг коронации открыт`);
  timerManager.clearAll();
}

// --- Потолок корон равен порогу ---
{
  const meId = table({ crownsToWin: 3 });
  patch(meId, { favor: 3, seals: 1 });
  addSealsToPlayer(useGameStore.getState, useGameStore.setState, meId, 5);
  const me = useGameStore.getState().players.find(p => p.id === meId)!;
  assert.equal(me.favor, 3, 'выше порога корон не набрать');
  timerManager.clearAll();
}

// --- Ниже порога круг срывается ---
{
  const meId = table({ crownsToWin: 4 });
  const victim = useGameStore.getState().players[1].id;
  patch(victim, { favor: 4 });
  useGameStore.setState({ coronationCandidateId: victim, coronationOriginId: meId });

  // Прямая потеря короны через тот же путь, что и все атаки.
  const { loseCrowns } = await import('./resolvers/crownLoss.ts');
  loseCrowns(useGameStore.getState, useGameStore.setState, victim, 1, 'проверки');
  assert.equal(useGameStore.getState().coronationCandidateId, null, 'круг сорван падением ниже порога');
  timerManager.clearAll();
}

// ==========================================================================
// Жетоны хода
// ==========================================================================

for (const actionTokens of [1, 2, 5]) {
  const meId = table({ actionTokens });
  const me = useGameStore.getState().players.find(p => p.id === meId)!;
  assert.equal(me.actionTokens, actionTokens, `старт с ${actionTokens} ⚡`);
  timerManager.clearAll();
}

// --- Восполнение в начале хода идёт до значения из правил ---
{
  const meId = table({ actionTokens: 4 });
  const state = useGameStore.getState();
  const nextId = state.players[1].id;
  patch(nextId, { actionTokens: 0 });

  const { checkEndgameAndAdvanceTurn } = await import('./resolvers/turnResolver.ts');
  patch(meId, { actionTokens: 0 });
  checkEndgameAndAdvanceTurn(useGameStore.getState, useGameStore.setState);

  const active = useGameStore.getState().players.find(
    p => p.id === useGameStore.getState().activePlayerId
  )!;
  assert.equal(active.actionTokens, 4, 'жетоны восполнены до значения из правил');
  timerManager.clearAll();
}

console.log('rules.engine.check: ok');
