import React from 'react';
import { StakedCardArena } from './StakedCardArena';
import { Button } from './ui/Button';
import type { GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './targeting';

interface ArenaProps {
  pendingTargetAction: PendingTargetAction | null;
  onCancelTarget: () => void;
  /**
   * Vestigial: card inspection moved to the card layer along with the cards
   * themselves. Kept so `App` still typechecks until it stops passing it.
   */
  onInspectCard?: (card: GameCard) => void;
}

export const Arena: React.FC<ArenaProps> = ({ pendingTargetAction, onCancelTarget }) => {
  return (
    <section className="arena">
      {/* Deck and discard used to be two invisible points just inside the
          felt's rim. They are real piles now, standing outside the table
          where they cannot collide with a seat panel — see `CardPiles`. */}
      <div className="stage">
        <StakedCardArena />
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
