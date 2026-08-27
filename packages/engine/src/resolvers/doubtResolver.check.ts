/**
 * Online games can seat 2+ real humans. A DOUBT_WINDOW must stay open until
 * every non-actor human has weighed in — one player's "Верю" must not
 * resolve the check on behalf of the others. Run:
 *   npx tsx src/resolvers/doubtResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardInstance, GameCard, GameState, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
import { executeRevealOutcome } from './doubtResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { ACTION_HOLD_MS } from '../timing.ts';

function human(id: string, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(hand),
    activePlot: null
  };
}

function bot(id: string, hand: GameCard[]): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 2,
    isBot: true,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 0, // can't doubt — keeps this check deterministic
    hand: mintDeck(hand),
    activePlot: null
  };
}

useGameStore.getState().startGame();
useGameStore.setState({
  players: [
    human('p1', ['Наследник', 'Шут']),
    human('p2', ['Казначей', 'Рыцарь']),
    human('p3', ['Вор', 'Шут']),
    bot('b1', ['Казначей', 'Рыцарь'])
  ],
  activePlayerId: 'p1'
});

useGameStore.getState().performAction({
  type: 'role',
  name: 'Наследник',
  roleClaim: 'Наследник',
  actorId: 'p1',
  stakedCardId: useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id,
  costGold: 0,
  costTokens: 1,
  description: ''
});
assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW');

useGameStore.getState().passDoubt('p2');
assert.equal(
  useGameStore.getState().turnPhase,
  'DOUBT_WINDOW',
  'p3 has not passed yet — the window must stay open, not resolve on p2 alone'
);
assert.ok(useGameStore.getState().pendingAction, 'action must still be pending while p3 has not reacted');

// p2 clicking twice (e.g. a double network retry) must not fool the count.
useGameStore.getState().passDoubt('p2');
assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW', 'a repeated pass from the same player must not count twice');

useGameStore.getState().passDoubt('p3');
assert.equal(
  useGameStore.getState().turnPhase,
  'IDLE',
  'every non-actor human has now passed (bot has 0 tokens) — the action resolves'
);

// --- Same fairness fix for VETO_WINDOW's "Продолжить" (passVetoWindow). ---
useGameStore.getState().startGame();
useGameStore.setState({
  players: [
    human('p1', ['Наследник', 'Шут']),
    human('p2', ['Казначей', 'Рыцарь']),
    human('p3', ['Право вето', 'Шут'])
  ],
  activePlayerId: 'p1'
});

const vetoTestAction = {
  id: 'a-veto',
  type: 'role' as const,
  name: 'Наследник',
  roleClaim: 'Наследник' as const,
  actorId: 'p1',
  stakedCardId: useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id,
  costGold: 0,
  costTokens: 1,
  description: ''
};
useGameStore.setState({ pendingAction: vetoTestAction });
useGameStore.getState()._triggerVetoWindowOrResolveEffect(vetoTestAction, false);
assert.equal(useGameStore.getState().turnPhase, 'VETO_WINDOW');

useGameStore.getState().passVetoWindow('p2');
assert.equal(
  useGameStore.getState().turnPhase,
  'VETO_WINDOW',
  'p3 (who actually holds "Право вето") has not reacted yet — must not resolve on p2 alone'
);

useGameStore.getState().passVetoWindow('p2'); // repeated click must not double-count
assert.equal(useGameStore.getState().turnPhase, 'VETO_WINDOW', 'a repeated pass from the same player must not count twice');

useGameStore.getState().passVetoWindow('p3');
await new Promise(resolve => setTimeout(resolve, ACTION_HOLD_MS + 200));
assert.equal(
  useGameStore.getState().turnPhase,
  'IDLE',
  'every non-actor human has passed — the action proceeds'
);

/* -------------------------------------------------------------------------
 * Reveal must only ever take the staked card. Addressing the stake by hand
 * index used to alias onto the neighbour once the splice shortened the hand,
 * which made the surviving card disappear from the player's hand in the UI.
 * ---------------------------------------------------------------------- */

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(['Наследник', 'Шут']),
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    deck: [] as CardInstance[],
    discardPile: [] as CardInstance[],
    activePlayerId: 'p1',
    turnPhase: 'DOUBT_WINDOW' as GameState['turnPhase'],
    turnSubPhase: 'CARD_PLAY_PHASE' as GameState['turnSubPhase'],
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    pendingAction: null as Action | null,
    pendingDoubtDoubterId: null as string | null,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    revealOutcome: null as GameState['revealOutcome'],
    activeSpeechReactions: {} as Record<string, string>,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    overlayInstant: null,
    history: [] as string[],
    ...overrides
  };

  const get = () => api as unknown as GameState;
  const set = (partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)) => {
    const patch = typeof partial === 'function' ? partial(get()) : partial;
    Object.assign(api, patch);
  };

  const state = api as unknown as GameState;
  state.addSealsToPlayer = () => {};
  state.closeRevealOutcome = () => {};
  state._checkEndgameAndAdvanceTurn = () => {};
  state._triggerVetoWindowOrResolveEffect = () => {};

  return { get, set, api };
}

// The reported bug: revealing the staked card must not make the OTHER card
// in hand un-findable. Addressing by index used to alias onto the survivor
// once the splice shortened the hand.
{
  const hand = mintDeck(['Наследник', 'Шут']);
  const stakedId = hand[0].id;
  const survivorId = hand[1].id;

  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });

  const action: Action = {
    id: 'bug1',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  api.pendingAction = action;

  executeRevealOutcome(get, set, 'p2');

  const actor = api.players.find(p => p.id === 'p1')!;
  assert.equal(actor.hand.length, 1, 'only the staked card leaves the hand');
  assert.equal(actor.hand[0].id, survivorId, 'the survivor keeps its own identity');
  assert.ok(
    api.discardPile.some(c => c.id === stakedId),
    'the staked instance is the one that reached the discard'
  );
  timerManager.clearAll();
}

// Same guarantee when the staked card is the SECOND one in hand — the case
// index addressing got outright wrong, revealing (and discarding) the
// neighbour instead of the card that was actually put on the table.
{
  const hand = mintDeck(['Шут', 'Наследник']);
  const stakedId = hand[1].id;
  const survivorId = hand[0].id;

  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });

  const action: Action = {
    id: 'bug2',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  api.pendingAction = action;

  executeRevealOutcome(get, set, 'p2');

  const actor = api.players.find(p => p.id === 'p1')!;
  assert.equal(api.revealOutcome?.revealedRole, 'Наследник', 'the card on the table is the one revealed');
  assert.equal(api.revealOutcome?.wasTruth, true, 'the claim matches the staked card, so it is the truth');
  assert.equal(actor.hand.length, 1, 'only the staked card leaves the hand');
  assert.equal(actor.hand[0].id, survivorId, 'the survivor keeps its own identity');
  assert.ok(
    api.discardPile.some(c => c.id === stakedId),
    'the staked instance is the one that reached the discard'
  );
  timerManager.clearAll();
}

console.log('doubtResolver.check.ts passed.');
