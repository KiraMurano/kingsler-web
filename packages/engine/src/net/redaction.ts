import type { Player, GameCard, CardId } from '../types.ts';
import type { GameStateData } from './gameStateData.ts';

/** A hand card as other seats may see it: identity public, face hidden. */
export type PublicHandCard = { id: CardId; card: GameCard | null };

export type PublicPlayer = Omit<Player, 'hand'> & { hand: PublicHandCard[] };

export type PublicGameState = Omit<GameStateData, 'players' | 'deck' | 'discardPile'> & {
  viewerId: string;
  players: PublicPlayer[];
  deckSize: number;
  /** The graveyard is open by the rules — published in full, faces and all. */
  discardPile: GameStateData['discardPile'];
  discardPileSize: number;
};

export function redactStateForPlayer(state: GameStateData, viewerId: string): PublicGameState {
  const { players, deck, discardPile, informantPeekData, ...rest } = state;

  return {
    ...rest,
    viewerId,
    deckSize: deck.length,
    discardPile,
    discardPileSize: discardPile.length,
    informantPeekData: informantPeekData && informantPeekData.observerId === viewerId ? informantPeekData : null,
    players: players.map((p): PublicPlayer =>
      p.id === viewerId
        ? p
        : { ...p, hand: p.hand.map(({ id }) => ({ id, card: null })) }
    )
  };
}
