import React from 'react';
import type { Action, CardId, GameCard, Player } from '@kinglier/engine/types';
import { isCardStaked } from '../lib/handSlots';
import { Card } from './Card';

interface HandProps {
  player: Player;
  pendingAction: Action | null;
  isMyTurn: boolean;
  isTargetReaction: boolean;
  isVetoWindow: boolean;
  roleClaimOpen: boolean;
  stakedCardId: CardId | null;
  onCardClick: (card: GameCard, cardId: CardId) => void;
  onInspectStaked?: (card: GameCard) => void;
}

export const Hand: React.FC<HandProps> = ({
  player,
  pendingAction,
  isMyTurn,
  isTargetReaction,
  isVetoWindow,
  roleClaimOpen,
  stakedCardId,
  onCardClick
}) => (
  <div className="hand">
    {([0, 1] as const).map(slot => {
      const held = player.hand[slot];
      const staked = !!held && isCardStaked(pendingAction, player.id, held.id);
      const vetoReady = !!held && isVetoWindow && held.card === 'Право вето';

      return (
        <div key={slot} className="hand__slot">
          {held && !staked && (
            <Card
              card={held.card}
              isPlayable={isMyTurn || isTargetReaction || vetoReady}
              isSelected={roleClaimOpen && stakedCardId === held.id}
              hint={vetoReady ? 'вето' : isTargetReaction ? 'на дуэль' : undefined}
              onClick={() => onCardClick(held.card, held.id)}
            />
          )}
        </div>
      );
    })}
  </div>
);
