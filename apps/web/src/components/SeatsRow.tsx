import React from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { OpponentSeat, type SeatSide } from './OpponentSeat';
import type { GameCard, Player } from '@kinglier/engine/types';
import type { PendingTargetAction } from './targeting';

interface SeatsRowProps {
  pendingTargetAction: PendingTargetAction | null;
  onSelectTarget: (targetId: string) => void;
  onInspectCard: (card: GameCard) => void;
}

const SIDE_BY_SEAT: Record<number, SeatSide> = {
  2: 'left',
  3: 'top',
  4: 'right'
};

export const SeatsRow: React.FC<SeatsRowProps> = ({
  pendingTargetAction,
  onSelectTarget,
  onInspectCard
}) => {
  const { players, activePlayerId, pendingAction } = useGameStore();
  const human = players.find(p => !p.isBot);
  const opponents = players.filter(p => p.isBot).sort((a, b) => a.seatNumber - b.seatNumber);

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
      {opponents.map((player, i) => {
        const targetable = isValidTarget(player);
        const side = SIDE_BY_SEAT[player.seatNumber] ?? (['left', 'top', 'right'] as const)[i] ?? 'top';
        return (
          <OpponentSeat
            key={player.id}
            player={player}
            side={side}
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
