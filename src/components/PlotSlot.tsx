import React from 'react';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';
import { useGameStore } from '../engine/GameStore';
import type { ActivePlotData, GameCard } from '../engine/types';
import { usePresence } from '../lib/presence';

interface PlotSlotProps {
  plot: ActivePlotData | null;
  ownerName: string;
  onInspect?: (card: GameCard) => void;
}

export const PlotSlot: React.FC<PlotSlotProps> = ({ plot, ownerName, onInspect }) => {
  const players = useGameStore(s => s.players);
  const { shown, exiting } = usePresence(plot);
  if (!shown) return null;

  const info = CARD_DESCRIPTIONS[shown.type];
  if (!info) return null;

  const target = shown.targetPlayerId ? players.find(p => p.id === shown.targetPlayerId) : null;

  return (
    <button
      type="button"
      className={`feltplot cardframe cardframe--plot${exiting ? ' feltplot--out' : ''}`}
      onClick={() => onInspect?.(shown.type)}
      title={`${ownerName}: «${shown.type}»${target ? ` → ${target.name}` : ''}`}
    >
      <img className="feltplot__img" src={info.artImage} alt={info.name} />
      <span className="feltplot__name">{info.name}</span>
      {shown.charges !== undefined && (
        <span className="plotcard__charge">
          {shown.charges}
          {shown.type === 'Тайный заговор' ? '/4' : ''}
        </span>
      )}
    </button>
  );
};
