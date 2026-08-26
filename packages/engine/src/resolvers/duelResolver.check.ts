/**
 * Duel breakthrough must not resurrect a ghost staked card on the table:
 * once both duel cards have been fought, neither staked instance is in its
 * owner's hand any more, so `StakedCardArena` must not re-stage a face-down
 * card while the winner's effect is on hold.
 * Run: npx tsx packages/engine/src/resolvers/duelResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, GameState, Player } from '../types.ts';
import { attackerAcceptDuel, closeDuelOutcome } from './duelResolver.ts';
import { triggerVetoWindowOrResolveEffect, resolvePendingActionEffect } from './doubtResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { mintDeck } from '../cardInstance.ts';

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

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    discardPile: [] as GameState['discardPile'],
    activePlayerId: 'p1',
    turnPhase: 'DUEL_ATTACKER_WINDOW' as GameState['turnPhase'],
    pendingAction: null as Action | null,
    pendingDuelDefenderCardId: null as string | null,
    pendingDuelDefenderRoleClaim: 'Казначей' as GameState['pendingDuelDefenderRoleClaim'],
    duelOutcome: null,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    hasCardDeparted: false,
    cardFlightEvent: null as GameState['cardFlightEvent'],
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
  const attackerHand = mintDeck(['Вор', 'Шут']);
  const defenderHand = mintDeck(['Рыцарь', 'Шут']);
  const attackerStakeId = attackerHand[0].id;
  const defenderStakeId = defenderHand[0].id;

  const pending: Action = {
    id: 'a1',
    type: 'role',
    name: 'Вор',
    actorId: 'p1',
    targetId: 'p2',
    roleClaim: 'Вор',
    stakedCardId: attackerStakeId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  const { get, set, api } = makeHarness({
    pendingAction: pending,
    pendingDuelDefenderCardId: defenderStakeId,
    players: [
      player({ id: 'p1', name: 'Атакующий', hand: attackerHand }),
      player({ id: 'p2', name: 'Защитник', isBot: true, gold: 3, hand: defenderHand })
    ]
  });

  // Attacker tells the truth, defender's shield ("Рыцарь") is a bluff -> breakthrough.
  attackerAcceptDuel(get, set, 'p1');
  assert.equal(api.duelOutcome?.resultType, 'attacker_breakthrough');
  assert.equal(
    api.players.find(p => p.id === 'p1')!.hand.some(c => c.id === attackerStakeId),
    false,
    "the attacker's staked instance has left their hand"
  );
  assert.equal(
    api.players.find(p => p.id === 'p2')!.hand.some(c => c.id === defenderStakeId),
    false,
    "the defender's staked instance has left their hand"
  );

  closeDuelOutcome(get, set);

  assert.equal(api.duelOutcome, null, 'duel outcome modal must close');
  assert.ok(api.pendingAction, 'the winning attack is still resolving');
  assert.equal(
    api.cardFlightEvent?.isDuel,
    true,
    'the duel flight owns both cards — no second "home" flight may be started for a card that already left'
  );

  // Mirrors StakedCardArena's `showPile` guard: even though hasCardDeparted was
  // reset to false while the effect resolves (no veto held), identity keeps the
  // ghost card hidden — neither duel card is in a hand any more.
  const attacker = api.players.find(p => p.id === 'p1')!;
  const defender = api.players.find(p => p.id === 'p2')!;
  const duelCardsSpent =
    !attacker.hand.some(c => c.id === api.pendingAction!.stakedCardId) &&
    !defender.hand.some(c => c.id === api.pendingDuelDefenderCardId);
  const showPile = !duelCardsSpent && !api.hasCardDeparted;
  assert.equal(showPile, false, 'the departed duel card must not be re-staged on the table');

  timerManager.clearAll();
  console.log('duelResolver.check: ok');
}
