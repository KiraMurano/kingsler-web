import React from 'react';
import type { Action, GameCard, Player } from '@kinglier/engine/types';
import { compactIndex, isCardStaked, useHandSlots } from '../lib/handSlots';
import { faces } from '@kinglier/engine/cardInstance';
import { Card } from './Card';

interface HandProps {
  player: Player;
  pendingAction: Action | null;
  isMyTurn: boolean;
  isTargetReaction: boolean;
  isVetoWindow: boolean;
  roleClaimOpen: boolean;
  stakedCardIndex: number;
  onCardClick: (card: GameCard, compactIndex: number) => void;
  onInspectStaked?: (card: GameCard) => void;
}

export const Hand: React.FC<HandProps> = ({
  player,
  pendingAction,
  isMyTurn,
  isTargetReaction,
  isVetoWindow,
  roleClaimOpen,
  stakedCardIndex,
  onCardClick
}) => {
  const handFaces = faces(player.hand);
  const { slots, leaving } = useHandSlots(handFaces);

  return (
    <div className="hand">
      {([0, 1] as const).map(index => {
        const live = slots[index];
        const gone = leaving[index];
        const engineIndex = compactIndex(handFaces, slots, index);
        const staked = isCardStaked(pendingAction, player.id, engineIndex);
        const vetoReady = !!live && isVetoWindow && live === 'Право вето';
        const card = gone ?? live;

        return (
          <div key={index} className="hand__slot">
            {!gone && live && !staked && (
              <Card
                card={live}
                isPlayable={isMyTurn || isTargetReaction || vetoReady}
                isSelected={roleClaimOpen && stakedCardIndex === engineIndex}
                hint={vetoReady ? 'вето' : isTargetReaction ? 'на дуэль' : undefined}
                onClick={() => onCardClick(live, engineIndex)}
              />
            )}
            {gone && card && <Card card={card} className="handcard--out" />}
          </div>
        );
      })}
    </div>
  );
};
