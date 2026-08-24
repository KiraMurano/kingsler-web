import React from 'react';
import { useGameStore } from '../engine/GameStore';
import { StakedCardArena } from './StakedCardArena';
import { Button } from './ui/Button';
import type { GameCard } from '../engine/types';
import type { PendingTargetAction } from './targeting';

interface ArenaProps {
  pendingTargetAction: PendingTargetAction | null;
  onCancelTarget: () => void;
  onInspectCard: (card: GameCard) => void;
}

export const Arena: React.FC<ArenaProps> = ({
  pendingTargetAction,
  onCancelTarget,
  onInspectCard
}) => {
  const { pendingAction, cardFlightEvent, overlayInstant } = useGameStore();
  const showIdle = !pendingAction && !cardFlightEvent && !overlayInstant;

  return (
    <section className="arena">
      <div className="stage">
        {showIdle && <div className="stage__slot">На кону</div>}
        <StakedCardArena onInspectCard={onInspectCard} />
      </div>

      {pendingTargetAction && (
        <div className="targetbar">
          <span>
            Выберите цель для <strong>«{pendingTargetAction.name}»</strong>
          </span>
          <Button tone="danger" size="sm" hotkey="Esc" onClick={onCancelTarget}>
            Отмена
          </Button>
        </div>
      )}
    </section>
  );
};
