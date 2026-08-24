import React from 'react';
import type { Action, GameCard, Player, TurnPhase } from '../engine/types';
import { compactIndex, useHandSlots } from '../lib/handSlots';
import { Card } from './Card';

interface HandProps {
  player: Player;
  pendingAction: Action | null;
  turnPhase: TurnPhase;
  isMyTurn: boolean;
  isTargetReaction: boolean;
  isVetoWindow: boolean;
  roleClaimOpen: boolean;
  stakedCardIndex: number;
  onCardClick: (card: GameCard, compactIndex: number) => void;
  onInspectStaked: (card: GameCard) => void;
}

export const Hand: React.FC<HandProps> = ({
  player,
  pendingAction,
  turnPhase,
  isMyTurn,
  isTargetReaction,
  isVetoWindow,
  roleClaimOpen,
  stakedCardIndex,
  onCardClick,
  onInspectStaked
}) => {
  const { slots, leaving } = useHandSlots(player.hand);

  return (
    <div className="hand">
      {([0, 1] as const).map(index => {
        const live = slots[index];
        const gone = leaving[index];
        const engineIndex = compactIndex(player.hand, slots, index);
        const staked =
          pendingAction?.type === 'role' &&
          pendingAction.actorId === player.id &&
          turnPhase !== 'IDLE' &&
          engineIndex >= 0 &&
          pendingAction.stakedCardIndex === engineIndex;
        const vetoReady = !!live && isVetoWindow && live === 'Право вето';
        const card = gone ?? live;

        return (
          <div key={index} className="hand__slot">
            <div className="handcard handcard--empty" aria-hidden />
            {!gone && live && staked && (
              <div
                className="handcard handcard--staked"
                onClick={() => onInspectStaked((pendingAction.roleClaim ?? live) as GameCard)}
                title="Карта выставлена на кон"
              >
                <span className="handcard__staked-label">на кону</span>
                <span className="handcard__staked-claim">«{pendingAction.roleClaim ?? live}»</span>
              </div>
            )}
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
