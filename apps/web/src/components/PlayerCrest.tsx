import React from 'react';
import type { GameCard, Player } from '@kinglier/engine/types';
import { DEFAULT_PROFILE_TITLE } from '@kinglier/engine/profile';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { seatReaction } from '../lib/seatReaction';
import { Bolts, Deltas, Res, Seals, type DeltaEvent } from './ui/Res';
import { UiIcon } from './ui/Icon';
import { ReactionPortrait } from './ReactionPortrait';
import { CrossfadeText } from './ui/CrossfadeText';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { PlotSlot } from './PlotSlot';

export const CrownsTrack: React.FC<{
  favor: number;
  compact?: boolean;
  events?: readonly DeltaEvent[];
}> = ({ favor, compact, events = [] }) => {
  /* Дорожка обязана показывать порог ИМЕННО ЭТОЙ партии: он настраивается
     перед стартом, и зашитая шестёрка врала бы и цифрой, и числом делений. */
  const crownsToWin = useGameStore(s => s.rules.crownsToWin);

  return (
    <div className={`crowns ${compact ? 'crowns--compact' : ''}`}>
      <div className="crowns__head">
        <span className="eyebrow">До престола</span>
        <span className="crowns__value delta-anchor">
          <UiIcon kind="crown" size="sm" /> <AnimatedNumber value={favor} />/{crownsToWin}
          <Deltas events={events} kind="crown" />
        </span>
      </div>
      {/* Число делений уезжает в CSS переменной: сетка сама делит ширину на
          столько колонок, сколько корон нужно для победы. */}
      <div className="crowns__track" style={{ '--crowns': crownsToWin } as React.CSSProperties}>
        {Array.from({ length: crownsToWin }).map((_, i) => (
          <span
            key={i}
            className={`crowns__seg ${favor > i ? 'crowns__seg--on' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
};

interface PlayerCrestProps {
  player: Player;
  isActive: boolean;
  onInspectCard?: (card: GameCard) => void;
}

export const PlayerCrest: React.FC<PlayerCrestProps> = ({ player, isActive, onInspectCard }) => {
  const {
    floatingResourceEvents,
    turnPhase,
    pendingAction,
    pendingDoubtPassedIds,
    pendingDoubtDoubterId,
    pendingDoubtActionId,
    pendingVetoPassedIds,
    pendingVetoActionId,
    overlayInstant,
    revealOutcome
  } = useGameStore(
    useShallow(s => ({
      floatingResourceEvents: s.floatingResourceEvents,
      turnPhase: s.turnPhase,
      pendingAction: s.pendingAction,
      pendingDoubtPassedIds: s.pendingDoubtPassedIds,
      pendingDoubtDoubterId: s.pendingDoubtDoubterId,
      pendingDoubtActionId: s.pendingDoubtActionId,
      pendingVetoPassedIds: s.pendingVetoPassedIds,
      pendingVetoActionId: s.pendingVetoActionId,
      overlayInstant: s.overlayInstant,
      revealOutcome: s.revealOutcome
    }))
  );
  const deltas = floatingResourceEvents.filter(e => e.playerId === player.id);
  const reaction = seatReaction({
    turnPhase,
    pendingAction,
    pendingDoubtPassedIds,
    pendingDoubtDoubterId,
    pendingDoubtActionId,
    pendingVetoPassedIds,
    pendingVetoActionId,
    overlayInstant,
    revealOutcome,
    playerId: player.id
  });

  /* В окне сомнения «ваш ход / ожидание» ничего не говорит: держит ход не
     очередь, а неотвеченная проверка. */
  const state = reaction === 'believed'
    ? 'вы поверили'
    : reaction === 'doubted'
      ? 'вы проверяете'
      : reaction === 'vetoed'
        ? 'вы наложили вето'
        : reaction === 'passed'
          ? 'вы пропустили'
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
        <ReactionPortrait
          src={player.avatar}
          name={player.name}
          className="crest__portrait"
          reaction={reaction}
        />
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
              (isActive && !reaction) || reaction === 'believed' ? 'crest__state--mine' : '',
              reaction === 'doubted' ? 'crest__state--asked' : ''
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
