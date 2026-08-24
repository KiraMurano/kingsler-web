import React from 'react';
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
  return (
    <section className="arena">
      <div className="stage">
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
