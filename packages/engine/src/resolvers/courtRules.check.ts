/**
 * Court timing: plot disruption, conspiracy charges, veto-before-effect, duel cost.
 * Run: node --experimental-strip-types src/engine/resolvers/courtRules.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardId, GameCard, GameState, Player } from '../types.ts';
import { playPlotAction, disruptPlayerPlotsOnLoss, chargeActiveConspiracies, applyConspiracyEffect } from './plotResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { playInstant } from './instantResolver.ts';
import { targetDeclareDuel } from './duelResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import {
  triggerVetoWindowOrResolveEffect,
  proceedAfterVetoWindow,
  resolvePendingActionEffect
} from './doubtResolver.ts';
import { faces, idOf, mintDeck } from '../cardInstance.ts';
import { DEFAULT_RULES } from '../rules.ts';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as { window: typeof globalThis }).window = globalThis;
}

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(['Наследник', 'Право вето']),
    activePlot: null,
    ...partial
  };
}

function action(partial: Partial<Action> & Pick<Action, 'type' | 'name' | 'actorId'>): Action {
  return {
    id: 'a1',
    costGold: 0,
    costTokens: 1,
    description: '',
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
  state._disruptPlayerPlotsOnLoss = (id, reason) => disruptPlayerPlotsOnLoss(get, set, id, reason);
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

/** The id of the first `card` in a seat's hand — the check files address cards
 *  the way the UI does now: by identity, not by position. */
function cardIdOf(api: { players: Player[] }, playerId: string, card: GameCard): CardId {
  return idOf(api.players.find(p => p.id === playerId)!.hand, card)!;
}

{
  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Шантажист', 'Вор']) }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        favor: 2,
        gold: 3,
        hand: mintDeck(['Казначей', 'Рыцарь']),
        activePlot: { id: 'pl1', cardId: 'plot-pl1', type: 'Королевский приём' }
      })
    ]
  });

  resolveRoleActionEffect(get, set, action({
    type: 'role',
    name: 'Шантажист',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Шантажист'
  }));
  const after = api.players.find(p => p.id === 'p2')!;
  assert.equal(after.favor, 1);
  assert.equal(after.activePlot, null);
  assert.ok(faces(api.discardPile).includes('Королевский приём'));
}

{
  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Вор', 'Шут']) }),
      player({ id: 'p2', name: 'Борис', isBot: true, gold: 3, hand: mintDeck(['Казначей', 'Рыцарь']) }),
      player({
        id: 'p3',
        name: 'Вера',
        isBot: true,
        hand: mintDeck(['Наследник', 'Шут']),
        activePlot: { id: 'c1', cardId: 'plot-c1', type: 'Тайный заговор', charges: 0 }
      })
    ]
  });

  resolveRoleActionEffect(get, set, action({
    type: 'role',
    name: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Вор'
  }));
  const plot = api.players.find(p => p.id === 'p3')!.activePlot;
  assert.equal(plot?.type, 'Тайный заговор');
  assert.equal(plot?.charges, 0);
}

{
  const { get, set, api } = makeHarness({
    activePlayerId: 'p2',
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Право вето', 'Наследник']), favor: 2 }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        actionTokens: 2,
        hand: mintDeck(['Обвинение в измене', 'Шут']),
        favor: 1
      })
    ]
  });

  playInstant(get, set, 'p2', 'Обвинение в измене', cardIdOf(api, 'p2', 'Обвинение в измене'), 'p1');
  assert.equal(api.turnPhase, 'VETO_WINDOW');
  assert.equal(api.players.find(p => p.id === 'p1')!.favor, 2);

  playInstant(get, set, 'p1', 'Право вето', cardIdOf(api, 'p1', 'Право вето'));
  assert.equal(api.isVetoed, true);
  proceedAfterVetoWindow(get, set);
  assert.equal(api.players.find(p => p.id === 'p1')!.favor, 2);
}

{
  const { get, set, api } = makeHarness({
    activePlayerId: 'p2',
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Право вето', 'Наследник']), favor: 2 }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        actionTokens: 2,
        hand: mintDeck(['Обвинение в измене', 'Шут'])
      })
    ]
  });

  playInstant(get, set, 'p2', 'Обвинение в измене', cardIdOf(api, 'p2', 'Обвинение в измене'), 'p1');
  proceedAfterVetoWindow(get, set);
  assert.equal(api.players.find(p => p.id === 'p1')!.favor, 1);
}

{
  const { get, set, api } = makeHarness({
    activePlayerId: 'p2',
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Право вето', 'Наследник']) }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        actionTokens: 2,
        hand: mintDeck(['Королевский приём', 'Шут'])
      })
    ]
  });

  playPlotAction(get, set, 'Королевский приём', cardIdOf(api, 'p2', 'Королевский приём'));
  assert.equal(api.turnPhase, 'VETO_WINDOW');
  assert.equal(api.players.find(p => p.id === 'p2')!.activePlot, null);

  proceedAfterVetoWindow(get, set);
  assert.equal(api.players.find(p => p.id === 'p2')!.activePlot?.type, 'Королевский приём');
}

{
  const pending = action({
    type: 'role',
    name: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Вор'
  });
  const { get, set, api } = makeHarness({
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: pending,
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Вор', 'Шут']) }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        actionTokens: 2,
        hand: mintDeck(['Казначей', 'Рыцарь'])
      })
    ]
  });

  targetDeclareDuel(get, set, 'p2', cardIdOf(api, 'p2', 'Казначей'));
  assert.equal(api.players.find(p => p.id === 'p2')!.actionTokens, 1);
  assert.equal(api.turnPhase, 'DUEL_CLASH');
  /* Объявление ставит отложенный розыгрыш — этой сцене он уже не нужен. */
  timerManager.clearAll();
}

{
  const pending = action({
    type: 'role',
    name: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Вор'
  });
  const { get, set, api } = makeHarness({
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: pending,
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Вор', 'Шут']) }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        actionTokens: 0,
        hand: mintDeck(['Казначей', 'Рыцарь'])
      })
    ]
  });

  targetDeclareDuel(get, set, 'p2', cardIdOf(api, 'p2', 'Казначей'));
  assert.equal(api.turnPhase, 'TARGET_REACTION_WINDOW');
  assert.equal(api.players.find(p => p.id === 'p2')!.actionTokens, 0);
}

{
  const { get, set, api } = makeHarness({
    isPendingActionAfterTruthChallenge: true,
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Наследник', 'Шут']) }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Право вето', 'Рыцарь']) })
    ]
  });
  const rolePlay = action({
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник'
  });
  api.pendingAction = rolePlay;
  triggerVetoWindowOrResolveEffect(get, set, rolePlay, false);
  assert.equal(api.turnPhase, 'VETO_WINDOW');
  assert.equal(api.isPendingActionAfterTruthChallenge, false);
}

{
  const { get, set, api } = makeHarness({
    activePlayerId: 'p2',
    players: [
      player({
        id: 'p1',
        name: 'Анна',
        hand: mintDeck(['Право вето', 'Наследник']),
        activePlot: { id: 'pl1', cardId: 'plot-pl1', type: 'Королевский приём' }
      }),
      player({
        id: 'p2',
        name: 'Борис',
        isBot: true,
        actionTokens: 2,
        hand: mintDeck(['Обыск покоев', 'Шут'])
      })
    ]
  });

  playInstant(get, set, 'p2', 'Обыск покоев', cardIdOf(api, 'p2', 'Обыск покоев'), 'p1');
  assert.equal(api.turnPhase, 'VETO_WINDOW');
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot?.type, 'Королевский приём');

  proceedAfterVetoWindow(get, set);
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot, null);
  assert.ok(faces(api.discardPile).includes('Королевский приём'));
}

{
  const { get, set, api } = makeHarness({
    players: [
      player({
        id: 'p1',
        name: 'Анна',
        actionTokens: 1,
        activePlot: { id: 'c1', cardId: 'plot-c1', type: 'Тайный заговор', charges: 0 }
      }),
      player({ id: 'p2', name: 'Борис', isBot: true, gold: 5, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });
  chargeActiveConspiracies(get, set, 'проверку');
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot?.charges, 1);
}

{
  const { get, set, api } = makeHarness({
    players: [
      player({
        id: 'p1',
        name: 'Анна',
        actionTokens: 1,
        activePlot: { id: 'c1', cardId: 'plot-c1', type: 'Тайный заговор', charges: 4 }
      }),
      player({ id: 'p2', name: 'Борис', isBot: true, gold: 2, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });
  applyConspiracyEffect(get, set, action({
    type: 'plot',
    name: 'Тайный заговор',
    actorId: 'p1',
    targetId: 'p2',
    conspiracyEffect: 'gold'
  }));
  // Удар фиксирован в 3 🪙, но пустую казну не обобрать: у цели было всего 2.
  assert.equal(api.players.find(p => p.id === 'p2')!.gold, 0);
  assert.equal(api.players.find(p => p.id === 'p1')!.activePlot, null);
}

{
  const { get, set, api } = makeHarness({
    players: [
      player({
        id: 'p1',
        name: 'Анна',
        actionTokens: 1,
        activePlot: { id: 'c1', cardId: 'plot-c1', type: 'Тайный заговор', charges: 4 }
      }),
      player({ id: 'p2', name: 'Борис', isBot: true, gold: 5, favor: 3, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });
  applyConspiracyEffect(get, set, action({
    type: 'plot',
    name: 'Тайный заговор',
    actorId: 'p1',
    targetId: 'p2',
    conspiracyEffect: 'gold'
  }));
  // Заговор всегда сбрасывает ровно 3 🪙, сколько бы зарядов ни было.
  assert.equal(api.players.find(p => p.id === 'p2')!.gold, 2);
}

console.log('courtRules.check: ok');
