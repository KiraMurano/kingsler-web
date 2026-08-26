import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { StakedCardArena } from './StakedCardArena';
import { Button } from './ui/Button';
import type { GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './targeting';
import { dur } from '../motion/tokens.ts';

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
  const reduce = !!useReducedMotion();
  /* `.targetbar` centres itself with the `translate` property rather than
     with `transform`, precisely so that the two never fight: `transform`
     belongs to motion here. */
  const rise = reduce ? 0 : 8;

  return (
    <section className="arena">
      {/* Deck and discard used to be two invisible points just inside the
          felt's rim. They are real piles now, standing outside the table
          where they cannot collide with a seat panel — see `CardPiles`. */}
      <div className="stage">
        <StakedCardArena />
      </div>

      <AnimatePresence>
        {pendingTargetAction && (
          <motion.div
            key="targetbar"
            className="targetbar"
            initial={{ opacity: 0, y: rise }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: rise }}
            transition={{ duration: reduce ? 0.12 : dur.fade, ease: [0.4, 0, 0.2, 1] }}
          >
            <span>
              Выберите цель для <strong>«{pendingTargetAction.name}»</strong>
            </span>
            <Button tone="danger" size="sm" hotkey="Esc" onClick={onCancelTarget}>
              Отмена
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
