/**
 * Online games can seat 2+ real humans. A DOUBT_WINDOW must stay open until
 * every non-actor human has weighed in — one player's "Верю" must not
 * resolve the check on behalf of the others. Run:
 *   npx tsx src/resolvers/doubtResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
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
  stakedCardIndex: 0,
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
  stakedCardIndex: 0,
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

console.log('doubtResolver.check.ts passed.');
