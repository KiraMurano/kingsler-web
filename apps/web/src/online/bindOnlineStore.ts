import type { Room } from '@colyseus/sdk';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { GameState } from '@kinglier/engine/types';
import type { PublicGameState } from '@kinglier/engine/net/redaction';

const NETWORKED_METHODS = [
  'performAction', 'skipNormalActionPhase', 'endTurnManually', 'playPlotAction',
  'playInstant', 'doubtAction', 'passDoubt', 'proceedAfterVetoWindow',
  'targetAcceptAttack', 'targetDoubtAttack', 'targetDeclareDuel',
  'attackerRetreatDuel', 'attackerAcceptDuel', 'closeDuelOutcome',
  'closeInformantPeek', 'closeRevealOutcome', 'openConspiracyDialog',
  'closeConspiracyDialog', 'activateConspiracy', 'endTurn'
] as const;

function noop(): void {}

function sendAction(room: Room, method: string) {
  return (...args: unknown[]) => room.send('action', { method, args });
}

/** Turns a redacted network payload back into the shape the shared store (and
 *  every existing component) already expects. `deck`/`discardPile` are only
 *  ever used for their `.length` client-side (see Codex.tsx), so filled
 *  placeholder arrays of the right size stand in for the real, hidden cards. */
function toStorePatch(data: PublicGameState): Partial<GameState> {
  const { deckSize, discardPileSize, ...rest } = data;
  return {
    ...rest,
    deck: new Array(deckSize).fill('Наследник'),
    discardPile: new Array(discardPileSize).fill('Наследник')
  } as unknown as Partial<GameState>;
}

/** Swaps the shared store's action methods for network-forwarding versions and
 *  starts applying every incoming `state` message. Existing components keep
 *  reading `useGameStore()` exactly as they do in offline mode. */
export function bindOnlineStore(room: Room): () => void {
  const networked = Object.fromEntries(NETWORKED_METHODS.map(method => [method, sendAction(room, method)]));
  useGameStore.setState(networked as unknown as Partial<GameState>);

  room.onMessage('state', (data: PublicGameState) => {
    useGameStore.setState(toStorePatch(data));
  });

  return () => {
    const reset = Object.fromEntries(NETWORKED_METHODS.map(method => [method, noop]));
    useGameStore.setState(reset as unknown as Partial<GameState>);
  };
}
