/**
 * The VETO_WINDOW is single-entry.
 *
 * It used to be possible to resolve it twice: when every human passed
 * immediately, `proceedAfterVetoWindow` landed the plot but left `turnPhase`
 * on 'VETO_WINDOW' for the whole ACTION_HOLD_MS that follows. A bot's veto
 * timer — whose only guard is `turnPhase === 'VETO_WINDOW' && !isVetoed` —
 * could still fire in that gap, spend a «Право вето» for nothing and re-enter
 * `proceedAfterVetoWindow`, which pushed the already-landed plot card into the
 * discard. The card then existed twice: in the plot slot AND in the graveyard.
 *
 * Run: npx tsx packages/engine/src/resolvers/vetoWindow.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardId, CardInstance, GameCard, GameState, Player } from '../types.ts';
import { playPlotAction } from './plotResolver.ts';
import { playInstant } from './instantResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import {
  triggerVetoWindowOrResolveEffect,
  passVetoWindow,
  proceedAfterVetoWindow,
  resolvePendingActionEffect
} from './doubtResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { assertCardCensus } from './cardCensus.check.ts';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as { window: typeof globalThis }).window = globalThis;
}

/** Ids stay unique across hands — two seats holding `c0` would make the
 *  whole-state card census meaningless. */
let mintedInCheck = 0;
function mint(cards: GameCard[]): CardInstance[] {
  return cards.map(card => ({ id: `v${mintedInCheck++}`, card }));
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
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    pendingAction: null as Action | null,
    pendingDoubtDoubterId: null as string | null,
    pendingDoubtPassedIds: [] as string[],
    pendingVetoPassedIds: [] as string[],
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    revealOutcome: null,
    duelOutcome: null,
    informantPeekData: null,
    conspiracyPrompt: null,
    pendingDuelDefenderCardId: null as string | null,
    pendingDuelDefenderRoleClaim: null,
    activeSpeechReactions: {} as Record<string, string>,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    cardFlightEvent: null as GameState['cardFlightEvent'],
    hasCardDeparted: false,
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
    api.isPendingActionAfterTruthChallenge = false;
  };
  state.addSealsToPlayer = () => {};
  state.playInstant = (id, type, cardId, target) => playInstant(get, set, id, type, cardId, target);
  state.proceedAfterVetoWindow = () => proceedAfterVetoWindow(get, set);

  return { get, set, api };
}

/** Exactly the guard a bot's veto timer runs in `bot/botReactions.ts`. */
function lateBotVetoTimerFires(
  api: { turnPhase: GameState['turnPhase']; isVetoed: boolean },
  play: () => void
): void {
  if (api.turnPhase === 'VETO_WINDOW' && !api.isVetoed) play();
}

// 1. Every human passes the veto window, then a bot's veto timer fires late.
//    The plot instance must appear exactly once in the whole game state.
{
  const actorHand = mint(['Королевский приём', 'Наследник']);
  const humanHand = mint(['Право вето', 'Шут']);
  const botHand = mint(['Право вето', 'Рыцарь']);
  const deck = mint(['Вор', 'Казначей']);
  const plotCardId: CardId = actorHand[0].id;
  const botVetoId: CardId = botHand[0].id;
  const allIds = [...actorHand, ...humanHand, ...botHand, ...deck].map(c => c.id);

  const { get, set, api } = makeHarness({
    activePlayerId: 'p1',
    deck,
    players: [
      player({ id: 'p1', name: 'Анна', hand: actorHand }),
      player({ id: 'p2', name: 'Виктор', hand: humanHand }),
      player({ id: 'p3', name: 'Борис', isBot: true, hand: botHand })
    ]
  });

  assertCardCensus(api, allIds, 'before the plot is played');

  playPlotAction(get, set, 'Королевский приём', plotCardId);
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'a human holds «Право вето», so the window opens');
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot, null, 'the plot has not landed yet');
  assertCardCensus(api, allIds, 'while the veto window is open');

  // The only non-actor human passes — the window is settled.
  passVetoWindow(get, set, 'p2');
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot?.type,
    'Королевский приём',
    'the plot lands once the court has passed'
  );
  assert.notEqual(
    api.turnPhase,
    'VETO_WINDOW',
    'the window is consumed synchronously — it must not stay open across the ACTION_HOLD_MS'
  );
  assertCardCensus(api, allIds, 'right after the plot lands');

  // ...and only now does the bot's veto timer get its turn.
  lateBotVetoTimerFires(api, () => playInstant(get, set, 'p3', 'Право вето', botVetoId));

  assert.equal(api.isVetoed, false, 'a veto after the window has closed must not register');
  assert.ok(
    api.players.find(p => p.id === 'p3')!.hand.some(c => c.id === botVetoId),
    'the bot must not spend its «Право вето» on a window that is already over'
  );
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot?.cardId,
    plotCardId,
    'the landed plot must still be the instance that was played'
  );
  assert.equal(
    api.discardPile.filter(c => c.id === plotCardId).length,
    0,
    'the landed plot card must not also be sitting in the discard'
  );
  assertCardCensus(api, allIds, 'after the late bot veto timer fired');

  timerManager.clearAll();
}

// 2. Belt and braces: even a direct second call into `proceedAfterVetoWindow`
//    (the shape the bug took — a re-entry keyed to a window that is already
//    spent) must be a no-op rather than a second resolution.
{
  const actorHand = mint(['Королевский приём', 'Наследник']);
  const humanHand = mint(['Право вето', 'Шут']);
  const plotCardId: CardId = actorHand[0].id;
  const allIds = [...actorHand, ...humanHand].map(c => c.id);

  const { get, set, api } = makeHarness({
    activePlayerId: 'p1',
    players: [
      player({ id: 'p1', name: 'Анна', hand: actorHand }),
      player({ id: 'p2', name: 'Виктор', hand: humanHand })
    ]
  });

  playPlotAction(get, set, 'Королевский приём', plotCardId);
  assert.equal(api.turnPhase, 'VETO_WINDOW');
  passVetoWindow(get, set, 'p2');
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot?.type, 'Королевский приём');

  // A stale timer fires after the window resolved, with `isVetoed` already
  // flipped by a veto that slipped through elsewhere: still a no-op.
  api.isVetoed = true;
  proceedAfterVetoWindow(get, set);
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot?.cardId,
    plotCardId,
    'a spent veto window must not retroactively cancel the landed plot'
  );
  assert.equal(
    api.discardPile.filter(c => c.id === plotCardId).length,
    0,
    'a spent veto window must not push the landed plot card into the discard'
  );
  assertCardCensus(api, allIds, 'after a stale re-entry');

  timerManager.clearAll();
}

// 3. The window still works normally: a veto played inside it cancels the
//    plot and sends exactly one instance of the card to the discard.
{
  const actorHand = mint(['Королевский приём', 'Наследник']);
  const humanHand = mint(['Право вето', 'Шут']);
  const plotCardId: CardId = actorHand[0].id;
  const vetoId: CardId = humanHand[0].id;
  const allIds = [...actorHand, ...humanHand].map(c => c.id);

  const { get, set, api } = makeHarness({
    activePlayerId: 'p1',
    players: [
      player({ id: 'p1', name: 'Анна', hand: actorHand }),
      player({ id: 'p2', name: 'Виктор', hand: humanHand })
    ]
  });

  playPlotAction(get, set, 'Королевский приём', plotCardId);
  assert.equal(api.turnPhase, 'VETO_WINDOW');

  playInstant(get, set, 'p2', 'Право вето', vetoId);
  assert.equal(api.isVetoed, true, 'a veto inside the window still registers');

  proceedAfterVetoWindow(get, set);
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot, null, 'the vetoed plot must not land');
  assert.equal(
    api.discardPile.filter(c => c.id === plotCardId).length,
    1,
    'the vetoed plot card goes to the discard exactly once'
  );
  assertCardCensus(api, allIds, 'after a successful veto');

  timerManager.clearAll();
}

console.log('vetoWindow.check: ok');
