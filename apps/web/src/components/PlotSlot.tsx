import React, { useMemo } from 'react';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Action, ActivePlotData, GameCard } from '@kinglier/engine/types';
import { usePresence } from '../lib/presence';

interface PlotSlotProps {
  plot: ActivePlotData | null;
  ownerId: string;
  ownerName: string;
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
    type: pending.plotType,
    targetPlayerId: pending.targetId,
    charges: pending.plotType === 'Тайный заговор' ? 0 : undefined
  };
}

export const PlotSlot: React.FC<PlotSlotProps> = ({ plot, ownerId, ownerName, onInspect }) => {
  const players = useGameStore(s => s.players);
  const pendingAction = useGameStore(s => s.pendingAction);
  const incoming = useMemo(
    () => laidPlotPreview(pendingAction, ownerId),
    [pendingAction, ownerId]
  );
  const display = incoming ?? plot;
  const { shown, exiting } = usePresence(display);
  if (!shown) return null;

  const info = CARD_DESCRIPTIONS[shown.type];
  if (!info) return null;

  const target = shown.targetPlayerId ? players.find(p => p.id === shown.targetPlayerId) : null;

  return (
    <button
      key={shown.id}
      type="button"
      className={`feltplot cardframe cardframe--plot${exiting ? ' feltplot--out' : ''}`}
      onClick={() => onInspect?.(shown.type)}
      title={`${ownerName}: «${shown.type}»${target ? ` → ${target.name}` : ''}`}
    >
      <img className="feltplot__img" src={info.artImage} alt={info.name} />
      <span className="feltplot__name">{info.name}</span>
      {target && <span className="feltplot__owner">{target.name}</span>}
      {shown.charges !== undefined && (
        <span className="plotcard__charge">
          {shown.charges}
          {shown.type === 'Тайный заговор' ? '/4' : ''}
        </span>
      )}
    </button>
  );
};
