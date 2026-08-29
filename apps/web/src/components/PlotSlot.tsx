/**
 * A seat's plot slot, as a hole plus its label.
 *
 * The plot card itself is drawn by `CardLayer` — `deriveCardZones` puts it in
 * `plot:<ownerId>` the moment the plot is laid, so it flies here out of the
 * hand shrinking as it goes instead of appearing. What stays behind is the
 * chrome the card art cannot carry: the plot's name, whom it is aimed at, and
 * the charge pip for «Тайный заговор».
 *
 * The anchor is rendered whether or not a plot is in it. An anchor that only
 * appeared once the plot landed would have no measured rect on the frame the
 * card starts moving, and the card would sit still until the next one.
 */
import React, { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Action, ActivePlotData, GameCard } from '@kinglier/engine/types';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';
import { dur } from '../motion/tokens.ts';

/**
 * How long the label takes to leave. It matches the exit the hand-rolled
 * presence hook used to give it, so a plot being resolved still reads as the
 * label letting go rather than as the label being deleted.
 */
const LABEL_OUT_S = 0.28;

const EASE = [0.4, 0, 0.2, 1] as const;

interface PlotSlotProps {
  plot: ActivePlotData | null;
  ownerId: string;
  ownerName: string;
  /**
   * Vestigial: inspection moved to the card layer along with the card. Kept
   * so callers still typecheck until they stop passing it.
   */
  onInspect?: (card: GameCard) => void;
}

function laidPlotPreview(pending: Action | null, ownerId: string): ActivePlotData | null {
  if (
    pending?.type !== 'plot' ||
    pending.actorId !== ownerId ||
    !pending.plotType ||
    pending.conspiracyEffect ||
    pending.isMorningTrigger
  ) {
    return null;
  }
  return {
    id: pending.id,
    cardId: pending.stakedCardId ?? pending.id,
    type: pending.plotType,
    targetPlayerId: pending.targetId,
    charges: pending.plotType === 'Тайный заговор' ? 0 : undefined
  };
}

export const PlotSlot: React.FC<PlotSlotProps> = ({ plot, ownerId, ownerName }) => {
  const players = useGameStore(s => s.players);
  const pendingAction = useGameStore(s => s.pendingAction);
  const incoming = useMemo(
    () => laidPlotPreview(pendingAction, ownerId),
    [pendingAction, ownerId]
  );
  const shown = incoming ?? plot;
  const reduce = !!useReducedMotion();

  const info = shown ? CARD_DESCRIPTIONS[shown.type] : undefined;
  const target = shown?.targetPlayerId
    ? players.find(p => p.id === shown.targetPlayerId)
    : null;

  return (
    <CardAnchor className="feltplot" zone={{ kind: 'plot', playerId: ownerId }}>
      {/* The anchor itself is never inside the `AnimatePresence` — `CardLayer`
          measures it every frame, and an anchor drifting through an exit
          animation would drag the plot card along with it. Only the label
          comes and goes. */}
      <AnimatePresence mode="wait">
        {shown && info && (
          <motion.span
            key={shown.id}
            className="feltplot__label"
            title={`${ownerName}: «${shown.type}»${target ? ` → ${target.name}` : ''}`}
            initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.96 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { duration: reduce ? 0.12 : dur.fade, ease: EASE }
            }}
            exit={{
              opacity: 0,
              y: reduce ? 0 : 10,
              scale: reduce ? 1 : 0.96,
              transition: { duration: reduce ? 0.12 : LABEL_OUT_S, ease: EASE }
            }}
          >
            {/* Пусто намеренно. Название карты напечатано на самом арте, а
                заряды переехали в слой карт: подпись здесь лежит НИЖЕ карты по
                z, и всё, что на ней нарисовано, оказывалось за картой.
                Осталась только рамка-заглушка под наведение и подсказку. */}
          </motion.span>
        )}
      </AnimatePresence>
    </CardAnchor>
  );
};
