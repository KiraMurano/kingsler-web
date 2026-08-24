import React from 'react';
import type { GameCard, Player } from '@kinglier/engine/types';
import { useGameStore } from '@kinglier/engine/GameStore';
import { courtly } from '../lib/text';
import { useHandSlots } from '../lib/handSlots';
import { usePresence } from '../lib/presence';
import { Bolts, Deltas, Res, Seals } from './ui/Res';
import { Portrait } from './Portrait';
import { PlotSlot } from './PlotSlot';
import { CrownsTrack } from './PlayerCrest';

export type SeatSide = 'left' | 'top' | 'right';

interface OpponentSeatProps {
  player: Player;
  side: SeatSide;
  isActive: boolean;
  isTargetable?: boolean;
  isDimmed?: boolean;
  onTarget?: () => void;
  onInspectCard?: (card: GameCard) => void;
}

function useSeatSpeech(player: Player): string | null {
  const { pendingAction, turnPhase, duelOutcome, revealOutcome, activeSpeechReactions } =
    useGameStore();

  const scripted = activeSpeechReactions[player.id];
  if (scripted) return courtly(scripted);
  if (turnPhase === 'IDLE' && !pendingAction) return null;

  if (pendingAction?.actorId === player.id) {
    if (pendingAction.type === 'normal') return `«${courtly(pendingAction.name)}»`;
    if (pendingAction.type === 'plot') return `«Интрига: ${pendingAction.plotType}»`;
    if (pendingAction.type === 'instant') return `«${pendingAction.instantType}»`;
    return `«Заявляю: ${pendingAction.roleClaim}»`;
  }
  if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === player.id) {
    return '«Меня атакуют — я защищаюсь!»';
  }
  if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === player.id) {
    return '«Вызов принят.»';
  }
  if (turnPhase === 'REVEAL_OUTCOME' && revealOutcome?.accuserId === player.id) {
    return '«Не верю. Вскрывайте.»';
  }
  if (
    turnPhase === 'DUEL_OUTCOME' &&
    duelOutcome &&
    (duelOutcome.attackerId === player.id || duelOutcome.defenderId === player.id)
  ) {
    return '«К барьеру!»';
  }
  return null;
}

export const OpponentSeat: React.FC<OpponentSeatProps> = ({
  player,
  side,
  isActive,
  isTargetable,
  isDimmed,
  onTarget,
  onInspectCard
}) => {
  const { floatingResourceEvents } = useGameStore();

  const speech = useSeatSpeech(player);
  const { shown: spoken, exiting: speechOut } = usePresence(speech);
  const { slots, leaving } = useHandSlots(player.hand);
  const deltas = floatingResourceEvents.filter(e => e.playerId === player.id);

  return (
    <div
      className={[
        'seat',
        `seat--${side}`,
        isActive ? 'seat--active' : '',
        isTargetable ? 'seat--target' : '',
        isDimmed ? 'seat--dimmed' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="seat__plot">
        <PlotSlot
          plot={player.activePlot}
          ownerId={player.id}
          ownerName={player.name}
          onInspect={onInspectCard}
        />
      </div>

      <div
        className="seat__chip"
        onClick={isTargetable ? onTarget : undefined}
        title={isTargetable ? `Выбрать целью: ${player.name}` : undefined}
      >
        <Deltas events={deltas} kind="other" />

        <div className="seat__head">
          <div className="seat__namerow">
            <span className="seat__name">{player.name}</span>
            <span className="delta-anchor">
              <Bolts tokens={player.actionTokens} />
              <Deltas events={deltas} kind="act" />
            </span>
            {isTargetable && (
              <span className="seat__role" style={{ color: 'var(--crimson-soft)' }}>
                цель
              </span>
            )}
          </div>
          <div className="seat__role">{player.archetype?.title ?? 'Придворный'}</div>
        </div>

        <div className="seat__main">
          <Portrait src={player.avatar} name={player.name} className="seat__portrait" />

          <div className="seat__body">
            <CrownsTrack favor={player.favor} compact events={deltas} />
            <div className="seat__res">
              <span className="delta-anchor">
                <Res kind="gold" value={player.gold} />
                <Deltas events={deltas} kind="gold" />
              </span>
              <span className="delta-anchor">
                <Seals count={player.seals} />
                <Deltas events={deltas} kind="seal" />
              </span>
            </div>
          </div>
        </div>

        {spoken && (
          <div key={spoken} className={`bubble${speechOut ? ' bubble--out' : ''}`}>
            {spoken}
          </div>
        )}
      </div>

      <div className="seat__hand" title="Карты в руке">
        {([0, 1] as const).map(i => {
          const live = slots[i];
          const gone = leaving[i];
          return (
            <span key={i} className="minislot">
              <span className="minicard minicard--empty" />
              {live && !gone && (
                <img className="minicard" src="/assets/cards/back-dual-face.png" alt="" />
              )}
              {gone && (
                <img
                  className="minicard minicard--out"
                  src="/assets/cards/back-dual-face.png"
                  alt=""
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
};
