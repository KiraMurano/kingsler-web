import type { Room } from '@colyseus/sdk';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { GameState } from '@kinglier/engine/types';
import type { PublicGameState } from '@kinglier/engine/net/redaction';

const NETWORKED_METHODS = [
  'markReady',
  'performAction', 'skipNormalActionPhase', 'endTurnManually', 'playPlotAction',
  'playInstant', 'doubtAction', 'passDoubt', 'passVeto',
  'targetAcceptAttack', 'targetDoubtAttack', 'targetDeclareDuel',
  'closeDuelOutcome',
  'closeInformantPeek', 'closeRevealOutcome', 'openConspiracyDialog',
  'closeConspiracyDialog', 'activateConspiracy', 'endTurn'
] as const;

function sendAction(room: Room, method: string) {
  return (...args: unknown[]) => room.send('action', { method, args });
}

/** Turns a redacted network payload back into the shape the shared store (and
 *  every existing component) already expects. The discard is an open graveyard
 *  and arrives in full. The deck never does — only its size — so it is faked as
 *  face-down instances under synthetic ids (`srv-deck-<i>`): nothing reads a
 *  deck card's face client-side, only `deck.length` (see Codex.tsx).
 *  Opponents' hand cards keep their real ids but arrive with `card: null`
 *  (redaction hides the face); a placeholder face keeps the card renderable as
 *  a card back. Nothing displays an opponent's hand card by name, so the
 *  placeholder never leaks real information. */
export function toStorePatch(data: PublicGameState): Partial<GameState> {
  const { deckSize, discardPileSize: _size, players, ...rest } = data;
  return {
    ...rest,
    deck: Array.from({ length: deckSize }, (_, i) => ({ id: `srv-deck-${i}`, card: 'Наследник' })),
    players: players.map(p => ({
      ...p,
      hand: p.hand.map(({ id, card }) => ({ id, card: card ?? 'Наследник' }))
    }))
  } as unknown as Partial<GameState>;
}

/** Swaps the shared store's action methods for network-forwarding versions and
 *  starts applying every incoming `state` message. Existing components keep
 *  reading `useGameStore()` exactly as they do in offline mode. */
export function bindOnlineStore(room: Room): () => void {
  const originals = Object.fromEntries(
    NETWORKED_METHODS.map(method => [method, useGameStore.getState()[method]])
  );
  const networked = Object.fromEntries(NETWORKED_METHODS.map(method => [method, sendAction(room, method)]));
  useGameStore.setState(networked as unknown as Partial<GameState>);

  room.onMessage('state', (data: PublicGameState) => {
    useGameStore.setState(toStorePatch(data));
  });

  return () => {
    useGameStore.setState(originals as unknown as Partial<GameState>);
  };
}
