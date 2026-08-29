import React from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { canBeTargetedBy } from '@kinglier/engine/targeting';
import { useShallow } from 'zustand/react/shallow';
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
  const {
    players,
    activePlayerId,
    pendingAction,
    opening,
    viewerId
  } = useGameStore(
    useShallow(s => ({
      players: s.players,
      activePlayerId: s.activePlayerId,
      pendingAction: s.pendingAction,
      opening: s.opening,
      viewerId: s.viewerId
    }))
  );
  /*
   * Пока идёт открытие партии, активного места нет.
   *
   * `activePlayerId` проставлен с самого `startGame` — это и есть победитель
   * жребия, — и подсветка места выдавала его ЗАДОЛГО до того, как монетка
   * оторвётся от стола: игрок смотрел бросок, уже зная результат. Ход
   * начинается вместе с концом открытия, тогда место и загорается.
   */
  const activeSeatId = opening ? null : activePlayerId;
  const human = pickViewer(players, viewerId);
  const opponents = seatOpponents(players, human);

  const isValidTarget = (player: Player): boolean => {
    if (!pendingTargetAction || player.id === human?.id) return false;

    if (pendingTargetAction.instantType === 'Перенаправление') {
      if (pendingAction?.actorId === player.id) return false;
      return !pendingAction?.roleClaim || canBeTargetedBy(player, pendingAction.roleClaim);
    }

    return !pendingTargetAction.roleClaim || canBeTargetedBy(player, pendingTargetAction.roleClaim);
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
            isActive={activeSeatId === player.id}
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
