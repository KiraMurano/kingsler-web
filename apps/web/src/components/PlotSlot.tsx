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
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Action, ActivePlotData, GameCard } from '@kinglier/engine/types';
import { usePresence } from '../lib/presence';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';

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
  const display = incoming ?? plot;
  const { shown, exiting } = usePresence(display);

  const info = shown ? CARD_DESCRIPTIONS[shown.type] : undefined;
  const target = shown?.targetPlayerId
    ? players.find(p => p.id === shown.targetPlayerId)
    : null;

  return (
    <CardAnchor className="feltplot" zone={{ kind: 'plot', playerId: ownerId }}>
      {shown && info && (
        <span
          key={shown.id}
          className={`feltplot__label${exiting ? ' feltplot__label--out' : ''}`}
          title={`${ownerName}: «${shown.type}»${target ? ` → ${target.name}` : ''}`}
        >
          <span className="feltplot__name">{info.name}</span>
          {target && <span className="feltplot__owner">{target.name}</span>}
          {shown.charges !== undefined && (
            <span className="plotcard__charge">
              {shown.charges}
              {shown.type === 'Тайный заговор' ? '/4' : ''}
            </span>
          )}
        </span>
      )}
    </CardAnchor>
  );
};
