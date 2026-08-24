import type { Player, GameCard } from '../types.ts';
import type { GameStateData } from './gameStateData.ts';

export type PublicPlayer = Omit<Player, 'hand'> & { hand: (GameCard | null)[] };

export type PublicGameState = Omit<GameStateData, 'players' | 'deck' | 'discardPile'> & {
  viewerId: string;
  players: PublicPlayer[];
  deckSize: number;
  discardPileSize: number;
};

export function redactStateForPlayer(state: GameStateData, viewerId: string): PublicGameState {
  const { players, deck, discardPile, informantPeekData, ...rest } = state;

  return {
    ...rest,
    viewerId,
    deckSize: deck.length,
    discardPileSize: discardPile.length,
    informantPeekData: informantPeekData && informantPeekData.observerId === viewerId ? informantPeekData : null,
    players: players.map((p): PublicPlayer =>
      p.id === viewerId ? p : { ...p, hand: p.hand.map(() => null) }
    )
  };
}
