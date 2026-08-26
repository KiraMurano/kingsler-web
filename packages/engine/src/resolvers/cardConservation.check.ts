/**
 * A staked or tabled card must never just vanish. The engine no longer emits
 * flight events — the presentation layer derives each card's zone from state —
 * so what has to hold is where the card *instance* ends up: an unchallenged
 * stake stays in its owner's hand, a vetoed stake stays there too, and an
 * instant is in the discard once its reaction window closes. Every case also
 * runs the `cardCensus` invariant: no `CardId` may be cloned or destroyed.
 * Run: npx tsx packages/engine/src/resolvers/cardConservation.check.ts
 */
import assert from 'node:assert/strict';
import type { Action, CardId, CardInstance, GameCard, GameState, Player } from '../types.ts';
import { triggerVetoWindowOrResolveEffect } from './doubtResolver.ts';
import { resolveRoleActionEffect } from './roleResolver.ts';
import { checkEndgameAndAdvanceTurn } from './turnResolver.ts';
import { timerManager } from '../utils/timerManager.ts';
import { allCardIds, assertCardCensus, type CardCensusState } from './cardCensus.check.ts';

/** Like `mintDeck`, but ids stay unique across hands — two seats both holding
 *  `c0` would make the whole-state card census meaningless. */
let mintedInCheck = 0;
function mintDeck(cards: GameCard[]): CardInstance[] {
  return cards.map(card => ({ id: `k${mintedInCheck++}`, card }));
}

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
    pendingDuelDefenderCardId: null as CardId | null,
    isVaBanqueActive: false,
    isVetoed: false,
    isPendingActionAfterTruthChallenge: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
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

  return { get, set, api, census: api as unknown as CardCensusState };
}

/** Where does this instance live right now? */
function handOf(api: { players: Player[] }, playerId: string): CardId[] {
  return api.players.find(p => p.id === playerId)!.hand.map(c => c.id);
}

// 1. No one at the table holds "Право вето" — the common case. The stake was
//    never revealed, so the instance must simply still be in the actor's hand.
{
  const hand = mintDeck(['Наследник', 'Шут']);
  const stakedId = hand[0].id;
  const { get, set, api, census } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });
  const ids = allCardIds(census);

  const action: Action = {
    id: 'a1',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  triggerVetoWindowOrResolveEffect(get, set, action, false);

  assert.ok(
    handOf(api, 'p1').includes(stakedId),
    'with no veto holder the unrevealed stake stays in its own hand'
  );
  assert.equal(api.discardPile.some(c => c.id === stakedId), false, 'and it must not reach the discard');
  assertCardCensus(census, ids, 'no veto holder');
  timerManager.clearAll();
}

// 2. The action gets vetoed before anyone even doubted — the reveal never
//    happened, so the staked instance must still be in its owner's hand.
{
  const hand = mintDeck(['Казначей', 'Шут']);
  const stakedId = hand[0].id;
  const { get, set, api, census } = makeHarness({
    isVetoed: true,
    players: [player({ id: 'p1', name: 'Анна', hand })]
  });
  const ids = allCardIds(census);

  const action: Action = {
    id: 'a2',
    type: 'role',
    name: 'Казначей',
    actorId: 'p1',
    roleClaim: 'Казначей',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };

  triggerVetoWindowOrResolveEffect(get, set, action, false);

  assert.ok(
    handOf(api, 'p1').includes(stakedId),
    'a veto before any reveal leaves the stake in its owner’s hand'
  );
  assertCardCensus(census, ids, 'veto before reveal');
  timerManager.clearAll();
}

// 3b. A veto clears its "Право вето" table stamp as the action is cancelled —
//     it must not linger past the cancellation (which used to leave the stamp
//     and the returning card on the table at once, then blink both away).
{
  const { get, set, api, census } = makeHarness({
    isVetoed: true,
    overlayInstant: { card: 'Право вето', actorId: 'p2' },
    players: [player({ id: 'p1', name: 'Анна' })]
  });
  const ids = allCardIds(census);

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
  assert.equal(api.overlayInstant, null, 'the veto stamp must clear when the action is cancelled');
  assertCardCensus(census, ids, 'veto stamp cleared');
  timerManager.clearAll();
}

// 3. An instant's reaction window ends — the instant instance belongs to the
//    discard, and `checkEndgameAndAdvanceTurn` (the choke point that clears
//    `pendingAction`) must not strand it in a zone of its own.
{
  const instant = mintDeck(['Обвинение в измене']);
  const instantId = instant[0].id;
  const { get, set, api, census } = makeHarness({
    players: [player({ id: 'p1', name: 'Анна', actionTokens: 1, hand: mintDeck(['Наследник']) })],
    // The instant left the hand when it was played and is already in the
    // discard, exactly as `resolveInstantEffect` puts it there.
    discardPile: instant,
    pendingAction: {
      id: 'a3',
      type: 'instant',
      name: 'Обвинение в измене',
      instantType: 'Обвинение в измене',
      actorId: 'p1',
      stakedCardId: instantId,
      costGold: 0,
      costTokens: 1,
      description: ''
    }
  });
  const ids = allCardIds(census);

  checkEndgameAndAdvanceTurn(get, set);

  assert.equal(api.pendingAction, null, 'the reaction window is over');
  assert.ok(
    api.discardPile.some(c => c.id === instantId),
    'the resolved instant instance is in the discard pile'
  );
  assert.equal(
    handOf(api, 'p1').includes(instantId),
    false,
    'and it must not have been handed back'
  );
  assertCardCensus(census, ids, 'instant window closed');
  timerManager.clearAll();
}

console.log('cardConservation.check: ok');
