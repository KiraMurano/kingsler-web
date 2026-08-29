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
  proceedAfterVetoWindow,
  passVeto,
  resolvePendingActionEffect
} from './doubtResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { assertCardCensus } from './cardCensus.check.ts';
import { DEFAULT_RULES } from '../rules.ts';

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
    rules: DEFAULT_RULES,
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    pendingAction: null as Action | null,
    pendingDoubtDoubterId: null as string | null,
    pendingDoubtPassedIds: [] as string[],
    pendingVetoPassedIds: [] as string[],
    pendingVetoActionId: null as string | null,
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
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'the window opens on every vetoable action');
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot, null, 'the plot has not landed yet');
  assertCardCensus(api, allIds, 'while the veto window is open');

  // The court answers and the window closes. (Case 4 below drives the poll
  // itself; here the subject is the late bot.)
  proceedAfterVetoWindow(get, set);
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
  proceedAfterVetoWindow(get, set);
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

// 4. Окно вето открывается ВСЕГДА — даже когда «Права вето» нет ни у кого на
//    руках, — и держится ОТВЕТАМИ, а не часами. Таймер на пять секунд был
//    самой дорогой паузой партии, и решение за ним почти всегда было одно и
//    то же; теперь окно закрывает последний ответивший, а автора действия в
//    первом круге не спрашивают вовсе.
{
  const actorHand = mint(['Королевский приём', 'Наследник']);
  const humanHand = mint(['Шут', 'Казначей']);
  const botHand = mint(['Вор', 'Рыцарь']);
  const deck = mint(['Наследник', 'Казначей']);
  const plotCardId: CardId = actorHand[0].id;
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

  playPlotAction(get, set, 'Королевский приём', plotCardId);

  assert.equal(
    api.turnPhase,
    'VETO_WINDOW',
    'окно открывается и без «Права вето» на руках — вопрос задаётся всегда'
  );
  /* Ни у p2, ни у p3 «Права вето» нет — и это НИЧЕГО не меняет: их всё равно
     спрашивают, и пропуск за них не проставляется. Иначе длина паузы читалась
     бы как подсказка о чужих руках: окно, закрывшееся само, означало бы
     «вето ни у кого нет». */
  assert.equal(
    api.players.filter(p => p.hand.some(c => c.card === 'Право вето')).length,
    0,
    'ни у кого на руках вето нет — и опрос всё равно идёт'
  );
  assert.deepEqual(api.pendingVetoPassedIds, [], 'опрос открыт и пуст');
  assert.equal(api.pendingVetoActionId, api.pendingAction?.id, 'опрос принадлежит своей заявке');
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot,
    null,
    'интрига не легла, пока окно открыто'
  );
  assertCardCensus(api, allIds, 'пока окно вето открыто');

  /* Часы больше ничего не решают: сколько ни жди, без ответов окно стоит. */
  await new Promise(r => setTimeout(r, 1200));
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'само по себе окно не закрывается');

  /* Автора не спрашивают — его «Пропустить» не засчитывается и окна не
     закрывает. Иначе один клик закрыл бы опрос за весь двор. */
  passVeto(get, set, 'p1');
  assert.deepEqual(api.pendingVetoPassedIds, [], 'ответ автора в опросе не участвует');
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'окно держится');

  passVeto(get, set, 'p2');
  assert.deepEqual(api.pendingVetoPassedIds, ['p2'], 'ответ засчитан');
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'ответил не весь двор — окно держится');

  /* Повторный ответ ничего не двигает: свой голос отдают один раз. */
  passVeto(get, set, 'p2');
  assert.deepEqual(api.pendingVetoPassedIds, ['p2'], 'второй раз тот же ответ не считается');
  assert.equal(api.turnPhase, 'VETO_WINDOW', 'и окна не закрывает');

  passVeto(get, set, 'p3');
  assert.notEqual(
    api.turnPhase,
    'VETO_WINDOW',
    'окно закрыл последний ОТВЕТИВШИЙ, а не отсутствие карт на руках'
  );
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot?.type,
    'Королевский приём',
    'и действие состоялось'
  );
  assertCardCensus(api, allIds, 'после закрытия окна вето');

  timerManager.clearAll();
}

// 5. Стол на двоих: спрашивать в первом круге некого — единственный, кроме
//    автора, отвечает, и окно закрывается его ответом. А если и того нет,
//    опрос заканчивается, не начавшись.
{
  const actorHand = mint(['Королевский приём', 'Наследник']);
  const deck = mint(['Наследник', 'Казначей']);
  const plotCardId: CardId = actorHand[0].id;

  const { get, set, api } = makeHarness({
    activePlayerId: 'p1',
    deck,
    players: [player({ id: 'p1', name: 'Анна', hand: actorHand })]
  });

  playPlotAction(get, set, 'Королевский приём', plotCardId);
  assert.notEqual(
    api.turnPhase,
    'VETO_WINDOW',
    'кроме автора за столом никого — окно не имеет кого спросить и закрывается сразу'
  );
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot?.type,
    'Королевский приём',
    'действие состоялось, а не повисло'
  );

  timerManager.clearAll();
}

console.log('vetoWindow.check: ok');
