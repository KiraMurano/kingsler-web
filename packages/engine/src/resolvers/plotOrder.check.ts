/**
 * Порядок розыгрыша Интриги: старая в сброс → новая на стол → круг вето.
 *
 * Раньше порядок был другой, и это был не только вопрос вкуса: старую интригу
 * снимал `landPlot`, то есть уже после окна вето. Всё окно две интриги стояли в
 * одном слоте разом, а на столе новая уезжала под старую по z — читалось как
 * сбой раскладки, а не как ход.
 *
 * Здесь проверяется, что слот освобождается самой выкладкой и что вето старую
 * не возвращает: заветированная новая уходит в сброс следом за ней, а слот
 * остаётся пустым. Заодно — что колода при этом сходится по картам: обе
 * интриги обязаны найтись в состоянии ровно по одному разу.
 *
 * Run: npx tsx packages/engine/src/resolvers/plotOrder.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardId, CardInstance, GameCard, GameState, Player } from '../types.ts';
import { playPlotAction } from './plotResolver.ts';
import { playInstant } from './instantResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import {
  triggerVetoWindowOrResolveEffect,
  proceedAfterVetoWindow,
  resolvePendingActionEffect
} from './doubtResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { assertCardCensus } from './cardCensus.check.ts';
import { DEFAULT_RULES } from '../rules.ts';
import type { Coronation } from './coronation.ts';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as { window: typeof globalThis }).window = globalThis;
}

let minted = 0;
function mint(cards: GameCard[]): CardInstance[] {
  return cards.map(card => ({ id: `o${minted++}`, card }));
}

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 2,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    deck: [] as GameState['deck'],
    discardPile: [] as GameState['discardPile'],
    activePlayerId: 'p1',
    turnPhase: 'IDLE' as GameState['turnPhase'],
    turnSubPhase: 'CARD_PLAY_PHASE' as GameState['turnSubPhase'],
    timerSeconds: 0,
    timerMaxSeconds: 0,
    isTimerPaused: false,
    rules: DEFAULT_RULES,
    coronations: [] as Coronation[],
    pendingAction: null as Action | null,
    pendingDoubtDoubterId: null as string | null,
    pendingDoubtPassedIds: [] as string[],
    pendingVetoPassedIds: [] as string[],
    pendingVetoActionId: null as string | null,
    pendingRedirectFromId: null,
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVaBanqueActive: false,
    isVetoed: false,
    vetoChain: 0,
    isPendingActionAfterTruthChallenge: false,
    revealOutcome: null,
    duelOutcome: null,
    informantPeekData: null,
    conspiracyPrompt: null,
    pendingDuelDefenderCardId: null as string | null,
    pendingDuelDefenderRoleClaim: null,
    activeSpeechReactions: {} as Record<string, string>,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    overlayInstant: null,
    winnerId: null,
    history: [] as string[],
    ...overrides
  };

  const get = () => api as unknown as GameState;
  const set = (partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)) => {
    const patch = typeof partial === 'function' ? partial(get()) : partial;
    Object.assign(api, patch);
  };

  const state = api as unknown as GameState;
  state._triggerVetoWindowOrResolveEffect = (a, after) =>
    triggerVetoWindowOrResolveEffect(get, set, a, after);
  state._resolvePendingActionEffect = (a, after) => resolvePendingActionEffect(get, set, a, after);
  state._resolveRoleActionEffect = (a, after) => resolveRoleActionEffect(get, set, a, after);
  state._checkEndgameAndAdvanceTurn = () => {
    api.turnPhase = 'IDLE';
    api.pendingAction = null;
    api.overlayInstant = null;
    api.isVetoed = false;
  };
  state.addSealsToPlayer = () => {};
  state.playInstant = (id, type, cardId, target) => playInstant(get, set, id, type, cardId, target);
  state.proceedAfterVetoWindow = () => proceedAfterVetoWindow(get, set);

  return { get, set, api };
}

const plotOf = (api: { players: Player[] }, id: string) =>
  api.players.find(p => p.id === id)!.activePlot;

/* ------------------------------------------------------------------ */
/* 1. Шаг 1 и 2: старая уходит в сброс В МОМЕНТ выкладки новой.        */
/* ------------------------------------------------------------------ */
{
  const oldPlot = mint(['Стража покоев'])[0];
  const actorHand = mint(['Досье', 'Наследник']);
  const courtHand = mint(['Право вето', 'Шут']);
  const newPlotId: CardId = actorHand[0].id;
  const allIds = [oldPlot, ...actorHand, ...courtHand].map(c => c.id);

  const { get, set, api } = makeHarness({
    players: [
      player({
        id: 'p1',
        name: 'Анна',
        hand: actorHand,
        activePlot: {
          id: 'old',
          cardId: oldPlot.id,
          type: 'Стража покоев'
        }
      }),
      player({ id: 'p2', name: 'Виктор', seatNumber: 2, hand: courtHand })
    ]
  });

  assertCardCensus(api, allIds, 'до выкладки');

  playPlotAction(get, set, 'Досье', newPlotId, 'p2');

  /* Круг вето ещё идёт — а слот уже пуст. Это и есть новый порядок: место под
     новую интригу освобождает сама выкладка, а не её успех. */
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'на выкладку открывается круг вето');
  assert.equal(plotOf(api, 'p1'), null, 'слот освобождён ещё до конца круга вето');
  assert.equal(
    api.discardPile.filter(c => c.id === oldPlot.id).length,
    1,
    'прежняя интрига ушла в сброс ровно один раз, и сразу'
  );
  assert.ok(
    api.history.some(line => line.includes('Прежняя интрига') && line.includes('Стража покоев')),
    'сброс прежней интриги объявлен двору'
  );
  assertCardCensus(api, allIds, 'пока идёт круг вето');

  /* Шаг 3 прошёл без вето — новая садится в освободившийся слот. */
  proceedAfterVetoWindow(get, set);
  assert.equal(plotOf(api, 'p1')?.cardId, newPlotId, 'устоявшая интрига занимает слот');
  assert.equal(
    api.discardPile.filter(c => c.id === oldPlot.id).length,
    1,
    'прежняя интрига не сбрасывается вторично, когда новая садится'
  );
  assert.equal(
    api.discardPile.filter(c => c.id === newPlotId).length,
    0,
    'севшая в слот интрига не лежит заодно и в сбросе'
  );
  assertCardCensus(api, allIds, 'после посадки новой интриги');

  timerManager.clearAll();
}

/* ------------------------------------------------------------------ */
/* 2. Вето старую НЕ возвращает: в сбросе обе, слот пуст.              */
/* ------------------------------------------------------------------ */
{
  const oldPlot = mint(['Стража покоев'])[0];
  const actorHand = mint(['Досье', 'Наследник']);
  const courtHand = mint(['Право вето', 'Шут']);
  const newPlotId: CardId = actorHand[0].id;
  const vetoId: CardId = courtHand[0].id;
  const allIds = [oldPlot, ...actorHand, ...courtHand].map(c => c.id);

  const { get, set, api } = makeHarness({
    players: [
      player({
        id: 'p1',
        name: 'Анна',
        hand: actorHand,
        activePlot: { id: 'old', cardId: oldPlot.id, type: 'Стража покоев' }
      }),
      player({ id: 'p2', name: 'Виктор', seatNumber: 2, hand: courtHand })
    ]
  });

  playPlotAction(get, set, 'Досье', newPlotId, 'p2');
  playInstant(get, set, 'p2', 'Право вето', vetoId);
  assert.equal(api.isVetoed, true, 'вето внутри круга регистрируется');

  proceedAfterVetoWindow(get, set);

  assert.equal(plotOf(api, 'p1'), null, 'заветированная интрига не садится');
  assert.equal(
    api.discardPile.filter(c => c.id === newPlotId).length,
    1,
    'заветированная новая уходит в сброс'
  );
  assert.equal(
    api.discardPile.filter(c => c.id === oldPlot.id).length,
    1,
    'прежняя интрига остаётся в сбросе: вето её не воскрешает'
  );
  assertCardCensus(api, allIds, 'после вето на новую интригу');

  timerManager.clearAll();
}

/* ------------------------------------------------------------------ */
/* 3. Пустой слот — прежний случай, ничего лишнего в сброс не уходит.  */
/* ------------------------------------------------------------------ */
{
  const actorHand = mint(['Досье', 'Наследник']);
  const courtHand = mint(['Шут']);
  const newPlotId: CardId = actorHand[0].id;
  const allIds = [...actorHand, ...courtHand].map(c => c.id);

  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand: actorHand }),
      player({ id: 'p2', name: 'Виктор', seatNumber: 2, hand: courtHand })
    ]
  });

  playPlotAction(get, set, 'Досье', newPlotId, 'p2');
  assert.equal(api.discardPile.length, 0, 'сбрасывать нечего — сброс пуст');
  assert.ok(
    !api.history.some(line => line.includes('Прежняя интрига')),
    'о несуществующей прежней интриге двору не сообщают'
  );

  proceedAfterVetoWindow(get, set);
  assert.equal(plotOf(api, 'p1')?.cardId, newPlotId);
  assertCardCensus(api, allIds, 'выкладка в пустой слот');

  timerManager.clearAll();
}

console.log('plotOrder.check.ts passed.');
