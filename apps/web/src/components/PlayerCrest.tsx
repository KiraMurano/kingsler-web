import React from 'react';
import type { GameCard, Player } from '@kinglier/engine/types';
import { DEFAULT_PROFILE_TITLE } from '@kinglier/engine/profile';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { doubtVote } from '../lib/doubtVote';
import { Bolts, Deltas, Res, Seals, type DeltaEvent } from './ui/Res';
import { UiIcon } from './ui/Icon';
import { Portrait } from './Portrait';
import { CrossfadeText } from './ui/CrossfadeText';
import { AnimatedNumber } from './ui/AnimatedNumber';
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
        <UiIcon kind="crown" size="sm" /> <AnimatedNumber value={favor} />/{CROWNS_TO_WIN}
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
  const { floatingResourceEvents, turnPhase, pendingAction, pendingDoubtPassedIds } = useGameStore(
    useShallow(s => ({
      floatingResourceEvents: s.floatingResourceEvents,
      turnPhase: s.turnPhase,
      pendingAction: s.pendingAction,
      pendingDoubtPassedIds: s.pendingDoubtPassedIds
    }))
  );
  const deltas = floatingResourceEvents.filter(e => e.playerId === player.id);
  const vote = doubtVote({ turnPhase, pendingAction, pendingDoubtPassedIds, playerId: player.id });

  /* В окне сомнения «ваш ход / ожидание» ничего не говорит: держит ход не
     очередь, а неотвеченная проверка. */
  const state = vote === 'passed'
    ? 'вы поверили'
    : vote === 'waiting'
      ? 'ваш ответ ждут'
      : isActive
        ? 'ваш ход'
        : 'ожидание';

  return (
    <aside className={`crest ${isActive ? 'crest--active' : ''}`}>
      <Deltas events={deltas} kind="other" />

      <div className="crest__plot">
        <PlotSlot
          plot={player.activePlot}
          ownerId={player.id}
          ownerName={player.name}
          onInspect={onInspectCard}
        />
      </div>

      <div className="crest__head">
        <Portrait src={player.avatar} name={player.name} className="crest__portrait" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crest__toprow">
            <div className="crest__title">{player.title ?? DEFAULT_PROFILE_TITLE}</div>
            <span className="delta-anchor crest__bolts">
              <Bolts tokens={player.actionTokens} />
              <Deltas events={deltas} kind="act" />
            </span>
          </div>
          <div className="crest__namerow">
            <div className="crest__name">{player.name}</div>
          </div>
          <div
            className={[
              'crest__state',
              isActive && !vote ? 'crest__state--mine' : '',
              vote === 'waiting' ? 'crest__state--asked' : '',
              vote === 'passed' ? 'crest__state--mine' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <CrossfadeText>{state}</CrossfadeText>
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
