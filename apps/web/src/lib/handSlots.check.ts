/**
 * Self-check: hand slots stay put when a neighbour leaves.
 * Run: node --experimental-strip-types src/lib/handSlots.check.ts
 */
import assert from 'node:assert/strict';
import { compactIndex, isCardStaked, reconcileHandSlots, type HandSlots } from './handSlots.ts';
import type { Action, GameState, Player } from '@kinglier/engine/types';
import { triggerVetoWindowOrResolveEffect } from '@kinglier/engine/resolvers/doubtResolver';
import { timerManager } from '@kinglier/engine/utils/timerManager';

const empty: HandSlots = [null, null];

assert.deepEqual(reconcileHandSlots(empty, ['Вор', 'Казначей']), ['Вор', 'Казначей']);

assert.deepEqual(reconcileHandSlots(['Вор', 'Казначей'], ['Казначей']), [null, 'Казначей']);
assert.deepEqual(reconcileHandSlots(['Вор', 'Казначей'], ['Вор']), ['Вор', null]);

assert.deepEqual(reconcileHandSlots([null, 'Казначей'], ['Обыск покоев', 'Казначей']), [
  'Обыск покоев',
  'Казначей'
]);

assert.deepEqual(reconcileHandSlots(['Вор', 'Вор'], ['Вор']), ['Вор', null]);
assert.deepEqual(reconcileHandSlots([null, null], []), [null, null]);
assert.deepEqual(reconcileHandSlots(['Вор', 'Казначей'], []), [null, null]);

assert.equal(compactIndex(['Казначей'], [null, 'Казначей'], 1), 0);
assert.equal(compactIndex(['Вор', 'Вор'], ['Вор', 'Вор'], 1), 1);

/**
 * A staked role card must stay hidden in Hand (the "на кону" placeholder)
 * for as long as it's still `pendingAction` — including through the "nobody
 * holds Право вето" fast path, where `turnPhase` flips back to IDLE well
 * before the card actually flies off the table. Gating the placeholder on
 * `turnPhase` (as it used to) revealed the real card in hand at the same
 * moment the arena was still showing/animating it: the card visibly
 * appeared twice.
 */
function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 4,
    favor: 0,
    seals: 0,
    actionTokens: 1,
    hand: ['Наследник', 'Шут'],
    activePlot: null,
    ...partial
  };
}

function makeHarness(overrides: Partial<GameState> = {}) {
  const api = {
    players: [] as Player[],
    turnPhase: 'DOUBT_WINDOW' as GameState['turnPhase'],
    pendingAction: null as Action | null,
    isVetoed: false,
    hasCardDeparted: false,
    cardFlightEvent: null as GameState['cardFlightEvent'],
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
  state._resolvePendingActionEffect = () => {};
  state._checkEndgameAndAdvanceTurn = () => {
    api.pendingAction = null;
    api.turnPhase = 'IDLE';
  };

  return { get, set, api };
}

// No one holds "Право вето" — the common case. The staked card must read as
// staked right up to (and during) its flight home, never popping into view
// in hand while the arena is still showing/animating it.
{
  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand: ['Наследник', 'Шут'] }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: ['Казначей', 'Рыцарь'] })
    ]
  });

  const action: Action = {
    id: 'a1',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardIndex: 0,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  api.pendingAction = action;

  assert.equal(isCardStaked(api.pendingAction, 'p1', 0), true, 'staked before resolution starts');

  triggerVetoWindowOrResolveEffect(get, set, action, false);

  // The bug: this fast path flips turnPhase back to IDLE immediately while
  // the flight is still playing and pendingAction is still in flight.
  assert.equal(api.turnPhase, 'IDLE', 'turnPhase already flips back to IDLE here');
  assert.equal(api.cardFlightEvent?.flightType, 'to_hand', 'the card is mid-flight home');
  assert.equal(
    isCardStaked(api.pendingAction, 'p1', 0),
    true,
    'must still read as staked while turnPhase is IDLE and the card is mid-flight — otherwise the real card and the flying card render at once'
  );

  timerManager.clearAll();

  // Once the action is actually done, the slot must stop reading as staked.
  api.pendingAction = null;
  assert.equal(isCardStaked(api.pendingAction, 'p1', 0), false, 'no longer staked once pendingAction clears');
}

// A different player's staked card must never read as staked for someone else.
{
  const action: Action = {
    id: 'a2',
    type: 'role',
    name: 'Казначей',
    actorId: 'p2',
    roleClaim: 'Казначей',
    stakedCardIndex: 0,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  assert.equal(isCardStaked(action, 'p1', 0), false, 'wrong actor must not read as staked');
}

console.log('handSlots.check: ok');
