import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { GameCard, Player } from '@kinglier/engine/types';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { courtly } from '../lib/text';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';
import { dur } from '../motion/tokens.ts';
import { Bolts, Deltas, Res, Seals } from './ui/Res';
import { Portrait } from './Portrait';
import { PlotSlot } from './PlotSlot';
import { CrownsTrack } from './PlayerCrest';

export type SeatSide = 'left' | 'top' | 'right';

/**
 * How long a line of speech takes to fade away. Inherited from the hand-rolled
 * presence hook this component used to call — an exit that got shorter when it
 * moved onto `AnimatePresence` would read as the bubble being cut off.
 */
const SPEECH_OUT_S = 0.28;

const EASE = [0.4, 0, 0.2, 1] as const;

interface OpponentSeatProps {
  player: Player;
  side: SeatSide;
  isActive: boolean;
  isTargetable?: boolean;
  isDimmed?: boolean;
  onTarget?: () => void;
  /**
   * Vestigial: card inspection moved to the card layer along with the cards
   * themselves. Kept so `SeatsRow` still typechecks until it stops passing it.
   */
  onInspectCard?: (card: GameCard) => void;
}

function useSeatSpeech(player: Player): string | null {
  const {
    pendingAction,
    turnPhase,
    duelOutcome,
    revealOutcome,
    activeSpeechReactions
  } = useGameStore(
    useShallow(s => ({
        pendingAction: s.pendingAction,
        turnPhase: s.turnPhase,
        duelOutcome: s.duelOutcome,
        revealOutcome: s.revealOutcome,
        activeSpeechReactions: s.activeSpeechReactions
    }))
  );

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
  onTarget
}) => {
  const floatingResourceEvents = useGameStore(s => s.floatingResourceEvents);

  const speech = useSeatSpeech(player);
  const reduce = !!useReducedMotion();
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
        <PlotSlot plot={player.activePlot} ownerId={player.id} ownerName={player.name} />
      </div>

      {/* Чип и рука — один ряд: только внутри него рука знает высоту чипа и
          может встать с ним вровень. Растянуть её прямо в `.seat` нельзя —
          тот тянется во всю высоту стола (см. комментарий к `.seat--left`). */}
      <div className="seat__row">
        <div
          className="seat__chip"
          onClick={isTargetable ? onTarget : undefined}
          title={isTargetable ? `Выбрать целью: ${player.name}` : undefined}
        >
          <Deltas events={deltas} kind="other" />

          <div className="seat__head">
            <div className="seat__toprow">
              <div className="seat__role">
                {player.title ?? player.archetype?.title ?? 'Придворный'}
              </div>
              <span className="delta-anchor seat__bolts">
                <Bolts tokens={player.actionTokens} />
                <Deltas events={deltas} kind="act" />
              </span>
            </div>
            <div className="seat__namerow">
              <span className="seat__name">{player.name}</span>
              {isTargetable && (
                <span className="seat__role" style={{ color: 'var(--crimson-soft)' }}>
                  цель
                </span>
              )}
            </div>
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

          {/* One line at a time: the bubble is absolutely positioned under the
              chip, so `mode="wait"` lets the old line sink away before the new
              one rises instead of printing the two on top of each other. */}
          <AnimatePresence mode="wait">
            {speech && (
              <motion.div
                key={speech}
                className="bubble"
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: reduce ? 0.12 : dur.fade, ease: EASE }
                }}
                exit={{
                  opacity: 0,
                  y: reduce ? 0 : 8,
                  transition: { duration: reduce ? 0.12 : SPEECH_OUT_S, ease: EASE }
                }}
              >
                {speech}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Holes, not cards. Both slots are always rendered so a card leaving
            slot 0 does not slide slot 1 across, and the card that fills one is
            drawn — back or face — by `CardLayer`. */}
        <div className="seat__hand" title="Карты в руке">
          {([0, 1] as const).map(slot => (
            <CardAnchor
              key={slot}
              className="minislot"
              zone={{ kind: 'hand', playerId: player.id, slot }}
            >
              <span className="minicard minicard--empty" />
            </CardAnchor>
          ))}
        </div>
      </div>
    </div>
  );
};
