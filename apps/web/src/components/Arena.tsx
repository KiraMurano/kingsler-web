import React from 'react';
import { StakedCardArena } from './StakedCardArena';
import { Button } from './ui/Button';
import type { GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './targeting';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';

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
      {/* Where cards come from and where they go. There are no visible piles
          on the felt — there is no room for them — so these are two invisible
          points just inside the table's rim: draws arc out of the top-left,
          the discard swallows cards into the top-right. They are anchors and
          nothing else, hence `opacity: 0`. */}
      <CardAnchor className="cardanchor--deck" zone={{ kind: 'deck' }} />
      <CardAnchor className="cardanchor--discard" zone={{ kind: 'discard' }} />

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
