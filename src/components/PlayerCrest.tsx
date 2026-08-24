import React from 'react';
import type { GameCard, Player } from '../engine/types';
import { useGameStore } from '../engine/GameStore';
import { Bolts, Deltas, Res, Seals, type DeltaEvent } from './ui/Res';
import { Portrait } from './Portrait';
import { PlotSlot } from './PlotSlot';

const CROWNS_TO_WIN = 6;

export const CrownsTrack: React.FC<{
  favor: number;
  compact?: boolean;
  events?: readonly DeltaEvent[];
}> = ({ favor, compact, events = [] }) => (
  <div className={`crowns ${compact ? 'crowns--compact' : ''}`}>
    <div className="crowns__head">
      <span className="eyebrow">До престола</span>
      <span className="crowns__value delta-anchor">
        👑 {favor}/{CROWNS_TO_WIN}
        <Deltas events={events} kind="crown" />
      </span>
    </div>
    <div className="crowns__track">
      {Array.from({ length: CROWNS_TO_WIN }).map((_, i) => (
        <span key={i} className={`crowns__seg ${favor > i ? 'crowns__seg--on' : ''}`} />
      ))}
    </div>
  </div>
);

interface PlayerCrestProps {
  player: Player;
  isActive: boolean;
  onInspectCard?: (card: GameCard) => void;
}

export const PlayerCrest: React.FC<PlayerCrestProps> = ({ player, isActive, onInspectCard }) => {
  const floatingResourceEvents = useGameStore(s => s.floatingResourceEvents);
  const deltas = floatingResourceEvents.filter(e => e.playerId === player.id);

  return (
    <aside className={`crest ${isActive ? 'crest--active' : ''}`}>
      <Deltas events={deltas} kind="other" />

      <div className="crest__plot">
        <PlotSlot plot={player.activePlot} ownerName={player.name} onInspect={onInspectCard} />
      </div>

      <div className="crest__head">
        <Portrait src={player.avatar} name={player.name} className="crest__portrait" />
        <div>
          <div className="crest__namerow">
            <div className="crest__name">Претендент</div>
            <span className="delta-anchor">
              <Bolts tokens={player.actionTokens} />
              <Deltas events={deltas} kind="act" />
            </span>
          </div>
          <div className={`crest__state ${isActive ? 'crest__state--mine' : ''}`}>
            <span key={isActive ? 'mine' : 'wait'}>{isActive ? 'ваш ход' : 'ожидание'}</span>
          </div>
        </div>
      </div>

      <CrownsTrack favor={player.favor} events={deltas} />

      <div className="crest__res">
        <span className="delta-anchor">
          <Res kind="gold" value={player.gold} />
          <Deltas events={deltas} kind="gold" />
        </span>
        <span className="delta-anchor">
          <Seals count={player.seals} />
          <Deltas events={deltas} kind="seal" />
        </span>
      </div>
    </aside>
  );
};
