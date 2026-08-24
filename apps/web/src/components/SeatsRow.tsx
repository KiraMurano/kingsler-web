import React from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { OpponentSeat } from './OpponentSeat';
import { seatOpponents } from '../lib/seats';
import { pickViewer } from '../lib/viewer';
import type { GameCard, Player } from '@kinglier/engine/types';
import type { PendingTargetAction } from './targeting';

interface SeatsRowProps {
  pendingTargetAction: PendingTargetAction | null;
  onSelectTarget: (targetId: string) => void;
  onInspectCard: (card: GameCard) => void;
}

export const SeatsRow: React.FC<SeatsRowProps> = ({
  pendingTargetAction,
  onSelectTarget,
  onInspectCard
}) => {
  const { players, activePlayerId, pendingAction, viewerId } = useGameStore();
  const human = pickViewer(players, viewerId);
  const opponents = seatOpponents(players, human);

  const isValidTarget = (player: Player): boolean => {
    if (!pendingTargetAction || player.id === human?.id) return false;
    if (pendingTargetAction.instantType === 'Перенаправление') {
      if (pendingAction?.actorId === player.id) return false;
      if (pendingAction?.roleClaim === 'Шантажист' && player.favor === 0) return false;
      if (pendingAction?.roleClaim === 'Вор' && player.gold === 0) return false;
    }
    if (pendingTargetAction.roleClaim === 'Шантажист' && player.favor === 0) return false;
    return true;
  };

  return (
    <div className="seats">
      {opponents.map(player => {
        const targetable = isValidTarget(player);
        return (
          <OpponentSeat
            key={player.id}
            player={player}
            side={player.side}
            isActive={activePlayerId === player.id}
            isTargetable={targetable}
            isDimmed={!!pendingTargetAction && !targetable}
            onTarget={() => onSelectTarget(player.id)}
            onInspectCard={onInspectCard}
          />
        );
      })}
    </div>
  );
};
