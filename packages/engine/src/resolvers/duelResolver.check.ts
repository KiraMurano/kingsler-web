/**
 * Duel breakthrough must not resurrect a ghost staked card on the table:
 * once both duel cards fly to discard, `pendingAction.cardAlreadyResolved`
 * must stay set until the action fully clears, so `StakedCardArena` never
 * re-stages a face-down card while the winner's effect is on hold.
 * Run: node --experimental-strip-types src/engine/resolvers/duelResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, GameState, Player } from '../types.ts';
import { attackerAcceptDuel, closeDuelOutcome } from './duelResolver.ts';
import { triggerVetoWindowOrResolveEffect, resolvePendingActionEffect } from './doubtResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { timerManager } from '../utils/timerManager.ts';

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: ['Наследник', 'Право вето'],
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    discardPile: [] as GameState['discardPile'],
    activePlayerId: 'p1',
    turnPhase: 'DUEL_ATTACKER_WINDOW' as GameState['turnPhase'],
    pendingAction: null as Action | null,
    pendingDuelDefenderCardIndex: 0 as number | null,
    pendingDuelDefenderRoleClaim: 'Казначей' as GameState['pendingDuelDefenderRoleClaim'],
    duelOutcome: null,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    hasCardDeparted: false,
    cardFlightEvent: null,
    overlayInstant: null,
    activeSpeechReactions: {} as Record<string, string>,
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
    api.pendingAction = null;
    api.turnPhase = 'IDLE';
    api.overlayInstant = null;
  };
  state.addSealsToPlayer = () => {};
  state.closeDuelOutcome = () => closeDuelOutcome(get, set);

  return { get, set, api };
}

{
  const pending: Action = {
    id: 'a1',
    type: 'role',
    name: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Вор',
    stakedCardIndex: 0,
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  const { get, set, api } = makeHarness({
    pendingAction: pending,
    players: [
      player({ id: 'p1', name: 'Атакующий', hand: ['Вор', 'Шут'] }),
      player({ id: 'p2', name: 'Защитник', isBot: true, gold: 3, hand: ['Рыцарь', 'Шут'] })
    ]
  });

  // Attacker tells the truth, defender's shield ("Рыцарь") is a bluff -> breakthrough.
  attackerAcceptDuel(get, set, 'p1');
  assert.equal(api.duelOutcome?.resultType, 'attacker_breakthrough');

  closeDuelOutcome(get, set);

  assert.equal(api.duelOutcome, null, 'duel outcome modal must close');
  assert.equal(
    api.pendingAction?.cardAlreadyResolved,
    true,
    'pendingAction must be flagged so the arena stops staging the departed card'
  );

  // Mirrors StakedCardArena's `showPile` guard: even though hasCardDeparted was
  // reset to false while the effect resolves (no veto held), the flag must keep
  // the ghost card hidden.
  const showPile = !api.pendingAction?.cardAlreadyResolved && !api.hasCardDeparted;
  assert.equal(showPile, false, 'the departed duel card must not be re-staged on the table');

  timerManager.clearAll();
  console.log('duelResolver.check: ok');
}
