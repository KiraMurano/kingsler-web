/**
 * Every action type (normal, role, plot, instant) sits as a `pendingAction`
 * while turnPhase is already back to IDLE, waiting for its ACTION_HOLD_MS
 * timers to actually apply the effect. Ending the turn during that window
 * used to call `timerManager.clearAll()` and drop the effect entirely. Run:
 *   npx tsx src/engine/GameStore.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from './types.ts';
import { mintDeck } from './cardInstance.ts';
import { useGameStore } from './GameStore.ts';
import { ACTION_HOLD_MS, VETO_WINDOW_MS } from './timing.ts';

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
    actionTokens: 0, // can't doubt/veto — keeps this check deterministic
    hand: mintDeck(hand),
    activePlot: null
  };
}

// --- 1. Normal action ("Устроить пир") ---
useGameStore.getState().startGame();

const humanId = useGameStore.getState().players.find(p => !p.isBot)!.id;
useGameStore.setState({
  players: useGameStore.getState().players.map(p => (p.id === humanId ? { ...p, gold: 5 } : p))
});

useGameStore.getState().performAction({
  type: 'normal',
  name: 'Устроить пир',
  actorId: humanId,
  costGold: 3,
  costTokens: 1,
  description: 'Платит 3 🪙 и получает +1 👑.'
});

const favorBeforeResolve = useGameStore.getState().players.find(p => p.id === humanId)!.favor;
assert.equal(favorBeforeResolve, 0, 'the crown has not landed yet — action is still resolving');

// Clicking "end turn" right now must be a no-op: it must not clear the
// timer that grants the crown, and it must not hand the turn to the bot.
useGameStore.getState().endTurnManually();
assert.equal(useGameStore.getState().activePlayerId, humanId, 'end turn must be blocked while an action is pending');
assert.ok(useGameStore.getState().pendingAction, 'the pending action must survive the blocked end-turn attempt');

await new Promise(resolve => setTimeout(resolve, ACTION_HOLD_MS * 2 + 400));

const favorAfterResolve = useGameStore.getState().players.find(p => p.id === humanId)!.favor;
assert.equal(favorAfterResolve, 1, 'the feast must still grant its crown once it resolves');
assert.equal(useGameStore.getState().pendingAction, null, 'pending action must clear once fully resolved');

// Now that the action has actually resolved, ending the turn must work.
useGameStore.getState().endTurnManually();
assert.notEqual(useGameStore.getState().activePlayerId, humanId, 'end turn should now succeed');

// --- 2. Role action ("Наследник") — same guarantee through DOUBT_WINDOW,
//     the veto window that follows it, and the deferred effect application. ---
useGameStore.getState().startGame();
useGameStore.setState({
  players: [
    ...useGameStore.getState().players.filter(p => !p.isBot).map(p => ({ ...p, hand: mintDeck(['Наследник', 'Шут']), favor: 0 })),
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

useGameStore.getState().passDoubt('p1'); // no bot can doubt (0 tokens) -> proceeds to the veto window
assert.equal(
  useGameStore.getState().turnPhase,
  'VETO_WINDOW',
  'the veto window opens even though nobody holds «Право вето»'
);
assert.ok(useGameStore.getState().pendingAction, 'pending action must still be in flight');

const favorBeforeRole = useGameStore.getState().players.find(p => p.id === 'p1')!.favor;
assert.equal(favorBeforeRole, 0, 'the crown has not landed yet — role effect is still resolving');

useGameStore.getState().endTurnManually();
assert.equal(useGameStore.getState().activePlayerId, 'p1', 'end turn must be blocked while the role effect is pending');

await new Promise(resolve => setTimeout(resolve, VETO_WINDOW_MS + ACTION_HOLD_MS * 2 + 400));

assert.equal(useGameStore.getState().players.find(p => p.id === 'p1')!.favor, 1, 'the role effect must still land once resolved');
assert.equal(useGameStore.getState().pendingAction, null);

console.log('GameStore.check: ok');
