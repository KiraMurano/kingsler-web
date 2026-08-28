/**
 * Вето на вето: отмена стала цепочкой, а не флагом. Чётная цепочка означает,
 * что эффект всё-таки состоится, нечётная — что отменён.
 * Run: npx tsx packages/engine/src/resolvers/vetoChain.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard } from '../types.ts';
import { vetoPlayed, vetoReset } from './vetoChain.ts';
import { useGameStore } from '../GameStore.ts';
import { mintCard, mintDeck } from '../cardInstance.ts';
import { timerManager } from '../utils/timerManager.ts';
import { VETO_WINDOW_MS } from '../timing.ts';

// ==========================================================================
// Чистая арифметика цепочки
// ==========================================================================
{
  assert.deepEqual(vetoReset(), { vetoChain: 0, isVetoed: false });
  assert.deepEqual(vetoPlayed(0), { vetoChain: 1, isVetoed: true }, '1-е вето отменяет');
  assert.deepEqual(vetoPlayed(1), { vetoChain: 2, isVetoed: false }, '2-е возвращает действие');
  assert.deepEqual(vetoPlayed(2), { vetoChain: 3, isVetoed: true }, '3-е снова отменяет');
  assert.deepEqual(vetoPlayed(4), { vetoChain: 5, isVetoed: true }, 'вся колода вето — отмена');
}

// ==========================================================================
// Живой стол
// ==========================================================================

/** Партия с заданными правилами: ход у первого места, окно вето открыто. */
function tableInVetoWindow(vetoOnVeto: boolean, vetoHolders: string[] = []) {
  useGameStore.getState().startGame(undefined, { vetoOnVeto });
  const state = useGameStore.getState();
  const meId = state.players[0].id;
  useGameStore.setState({
    openingToss: null,
    activePlayerId: meId,
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    players: state.players.map(p => ({
      ...p,
      isBot: false, // боты не должны вмешиваться в проверку руками
      actionTokens: 2,
      hand: vetoHolders.includes(p.id) || p.id === meId
        ? mintDeck(['Право вето', 'Право вето'] as GameCard[])
        : mintDeck(['Шут', 'Шут'] as GameCard[])
    }))
  });

  // Интрига открывает окно вето — самый короткий путь до него.
  const players = useGameStore.getState().players;
  const others = players.filter(p => p.id !== meId).map(p => p.id);
  useGameStore.setState({
    players: useGameStore.getState().players.map(p =>
      p.id === meId ? { ...p, hand: mintDeck(['Королевский приём', 'Право вето'] as GameCard[]) } : p
    )
  });
  const plotCard = useGameStore.getState().players.find(p => p.id === meId)!.hand[0].id;
  useGameStore.getState().playPlotAction('Королевский приём', plotCard);

  assert.equal(useGameStore.getState().turnPhase, 'VETO_WINDOW', 'окно вето открыто');
  return { meId, others };
}

/**
 * Играет «Право вето» от лица игрока, выдав ему свежую карту.
 *
 * Карта чеканится `mintCard`, а не `mintDeck`: последний нумерует ids заново с
 * `c0` на каждом вызове, и добавленная карта столкнулась бы по id с уже
 * лежащей в руке — движок вынул бы не ту и молча ничего не сделал.
 */
function playVeto(playerId: string) {
  const veto = mintCard('Право вето');
  useGameStore.setState({
    players: useGameStore.getState().players.map(p =>
      p.id === playerId ? { ...p, hand: [...p.hand, veto] } : p
    )
  });
  useGameStore.getState().playInstant(playerId, 'Право вето', veto.id);
}

// --- Правило выключено: второе вето окна не застаёт ---
{
  const { meId, others } = tableInVetoWindow(false);
  playVeto(others[0]);
  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 1, 'первое вето легло');
  assert.equal(after.isVetoed, true, 'эффект отменён');
  assert.equal(after.vetoDeadlineAt, null, 'окно закрылось сразу — отвечать некогда');
  void meId;
  timerManager.clearAll();
}

// --- Правило включено: окно перезапускается ---
{
  const { others } = tableInVetoWindow(true);
  const before = Date.now();
  playVeto(others[0]);
  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 1);
  assert.equal(after.isVetoed, true);
  assert.equal(after.turnPhase, 'VETO_WINDOW', 'окно осталось открытым');
  assert.ok(
    after.vetoDeadlineAt !== null && after.vetoDeadlineAt >= before + VETO_WINDOW_MS - 200,
    'дедлайн отсчитан заново, а не унаследован'
  );
  timerManager.clearAll();
}

// --- Цепочка из двух: действие возвращается ---
{
  const { others } = tableInVetoWindow(true);
  playVeto(others[0]);
  playVeto(others[1]);
  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 2);
  assert.equal(after.isVetoed, false, 'встречное вето сняло отмену');
  timerManager.clearAll();
}

// --- Цепочка из трёх: снова отмена ---
{
  const { others } = tableInVetoWindow(true);
  playVeto(others[0]);
  playVeto(others[1]);
  playVeto(others[2]);
  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 3);
  assert.equal(after.isVetoed, true);
  timerManager.clearAll();
}

// --- Цепочка длиной 5 (вся колода вето) отрабатывает ---
{
  const { meId, others } = tableInVetoWindow(true);
  const order = [others[0], others[1], others[2], meId, others[0]];
  for (const id of order) playVeto(id);
  const after = useGameStore.getState();
  assert.equal(after.vetoChain, 5, 'ограничений на длину цепочки нет');
  assert.equal(after.isVetoed, true, 'нечётная цепочка — отмена');
  assert.equal(
    after.discardPile.filter(c => c.card === 'Право вето').length,
    5,
    'все пять вето ушли в сброс'
  );
  timerManager.clearAll();
}

// --- Новое действие обнуляет цепочку ---
{
  const { others } = tableInVetoWindow(true);
  playVeto(others[0]);
  assert.equal(useGameStore.getState().vetoChain, 1);
  useGameStore.getState().proceedAfterVetoWindow();
  timerManager.clearAll();

  useGameStore.getState().startGame(undefined, { vetoOnVeto: true });
  assert.equal(useGameStore.getState().vetoChain, 0, 'новая партия — чистая цепочка');
  assert.equal(useGameStore.getState().isVetoed, false);
  timerManager.clearAll();
}

console.log('vetoChain.check: ok');
