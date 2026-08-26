/**
 * A staked/tabled card must never just vanish: it always flies to the hand,
 * the discard, or (for a vetoed reveal) the discard, and an instant always
 * flies to discard when its reaction window ends. Run:
 *   npx tsx src/engine/resolvers/cardFlight.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, GameState, Player } from '../types.ts';
import { triggerVetoWindowOrResolveEffect } from './doubtResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { checkEndgameAndAdvanceTurn } from './turnResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { mintDeck } from '../cardInstance.ts';

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 0,
    seals: 0,
    actionTokens: 1,
    hand: mintDeck(['Наследник', 'Шут']),
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
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    pendingAction: null as Action | null,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
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
  state._resolveRoleActionEffect = (a, after) => resolveRoleActionEffect(get, set, a, after);
  state._resolvePendingActionEffect = () => {};
  state._checkEndgameAndAdvanceTurn = () => {
    api.pendingAction = null;
    api.turnPhase = 'IDLE';
  };
  state.addSealsToPlayer = () => {};

  return { get, set, api };
}

// 1. No one at the table holds "Право вето" — the common case — must still
//    fly the staked role card home instead of skipping straight to resolve.
{
  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand: mintDeck(['Наследник', 'Шут']) }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });

  const action: Action = {
    id: 'a1',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  triggerVetoWindowOrResolveEffect(get, set, action, false);
  assert.equal(api.cardFlightEvent?.flightType, 'to_hand', 'no veto holder must still fly the card home');
  assert.equal(api.cardFlightEvent?.actorId, 'p1');
  timerManager.clearAll();
}

// 2. The action gets vetoed before anyone even doubted — the reveal never
//    happened, so the staked card must fly home, not disappear.
{
  const { get, set, api } = makeHarness({
    isVetoed: true,
    players: [player({ id: 'p1', name: 'Анна', hand: mintDeck(['Казначей', 'Шут']) })]
  });

  const action: Action = {
    id: 'a2',
    type: 'role',
    name: 'Казначей',
    actorId: 'p1',
    roleClaim: 'Казначей',
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  triggerVetoWindowOrResolveEffect(get, set, action, false);
  assert.equal(api.cardFlightEvent?.flightType, 'to_hand', 'a veto before any reveal must return the card to hand');
  timerManager.clearAll();
}

// 3b. A veto clears its "Право вето" table stamp the moment the staked card
//     starts flying home — it must not linger after the card has departed
//     (which used to make the departed card pop back into view, then have
//     both vanish abruptly once the turn finally advanced).
{
  const { get, set, api } = makeHarness({
    isVetoed: true,
    overlayInstant: { card: 'Право вето', actorId: 'p2' },
    players: [player({ id: 'p1', name: 'Анна' })]
  });

  const action: Action = {
    id: 'a3b',
    type: 'role',
    name: 'Казначей',
    actorId: 'p1',
    roleClaim: 'Казначей',
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  triggerVetoWindowOrResolveEffect(get, set, action, false);
  assert.equal(api.overlayInstant, null, 'the veto stamp must clear in sync with the card flying home');
  timerManager.clearAll();
}

// 3. An instant's reaction window ends — the choke point that always clears
//    `pendingAction` must send the instant flying to discard, not drop it.
{
  const { get, set, api } = makeHarness({
    players: [player({ id: 'p1', name: 'Анна', actionTokens: 1, hand: mintDeck(['Наследник']) })],
    pendingAction: {
      id: 'a3',
      type: 'instant',
      name: 'Обвинение в измене',
      instantType: 'Обвинение в измене',
      actorId: 'p1',
      costGold: 0,
      costTokens: 1,
      description: ''
    }
  });

  checkEndgameAndAdvanceTurn(get, set);
  assert.equal(api.cardFlightEvent?.flightType, 'to_discard', 'a resolved instant must fly to discard');
  assert.equal(api.cardFlightEvent?.card, 'Обвинение в измене');
  timerManager.clearAll();
}

console.log('cardFlight.check: ok');
