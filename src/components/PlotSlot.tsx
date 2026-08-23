import React from 'react';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';
import { useGameStore } from '../engine/GameStore';
import type { ActivePlotData, GameCard } from '../engine/types';

interface PlotSlotProps {
  plot: ActivePlotData | null;
  ownerName: string;
  onInspect?: (card: GameCard) => void;
}

export const PlotSlot: React.FC<PlotSlotProps> = ({ plot, ownerName, onInspect }) => {
  const players = useGameStore(s => s.players);
  if (!plot) return null;

  const info = CARD_DESCRIPTIONS[plot.type];
  if (!info) return null;

  const target = plot.targetPlayerId ? players.find(p => p.id === plot.targetPlayerId) : null;

  return (
    <button
      type="button"
      className="feltplot cardframe cardframe--plot"
      onClick={() => onInspect?.(plot.type)}
      title={`${ownerName}: «${plot.type}»${target ? ` → ${target.name}` : ''}`}
    >
      <img className="feltplot__img" src={info.artImage} alt={info.name} />
      <span className="feltplot__name">{info.name}</span>
      {plot.charges !== undefined && (
        <span className="plotcard__charge">
          {plot.charges}
          {plot.type === 'Тайный заговор' ? '/4' : ''}
        </span>
      )}
    </button>
  );
};
