import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { GameCard, Player } from '@kinglier/engine/types';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { courtly, speechLine } from '../lib/text';
import { seatReaction } from '../lib/seatReaction';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';
import { spring } from '../motion/tokens.ts';
import { Bolts, Deltas, Res, Seals } from './ui/Res';
import { ReactionPortrait } from './ReactionPortrait';
import { PlotSlot } from './PlotSlot';
import { CrownsTrack } from './PlayerCrest';

export type SeatSide = 'left' | 'top' | 'right';

/**
 * Сколько реплика висит над местом, мс.
 *
 * Реплика — это сказанная фраза, а не табличка о состоянии: сказанное живёт,
 * пока его помнят, и гаснет само. Раньше она держалась до конца хода, и на
 * длинном ходу подпись «Верю.» стояла над игроком минутами, давно перестав
 * что-либо значить. Десять секунд — это время прочесть и связать фразу с тем,
 * что произошло; дальше она только занимает место под чипом.
 */
const SPEECH_LIFE_MS = 10_000;

/**
 * Сколько реплика появляется и сколько тает, с.
 *
 * Уход длиннее прихода намеренно: приход — событие, за ним следят, и он
 * должен быть быстрым; уход события не несёт, и резкость в нём читается как
 * обрыв. Перемещение и масштаб идут пружиной, прозрачность — временем:
 * пружинящая прозрачность мигает на отскоке.
 */
const SPEECH_IN_S = 0.22;
const SPEECH_OUT_S = 0.42;

const EASE = [0.4, 0, 0.2, 1] as const;

/**
 * Реплика, пока она жива.
 *
 * Часы заводятся на каждую новую фразу и на неё же гасятся: смена реплики —
 * это новая реплика, и десять секунд у неё свои. Живёт в интерфейсе, а не в
 * состоянии партии: срок жизни подписи ни на что в игре не влияет, а таймер в
 * движке был бы вторым таймером рядом с тем, которым идёт сама партия.
 */
function useTimedSpeech(speech: string | null): string | null {
  /* Отсчитанная фраза. Хранится сама фраза, а не флаг: новая реплика — это
     другая строка, и её десять секунд начинаются заново сами собой. */
  const [expired, setExpired] = useState<string | null>(null);

  /* Подстройка состояния прямо в рендере, а не в эффекте: эффект сбросил бы
     отметку кадром позже, и первый кадр новой реплики успел бы отрисоваться
     погашенным — то есть реплика мигала бы на появлении. */
  if (expired !== null && expired !== speech) setExpired(null);

  useEffect(() => {
    if (!speech) return;
    const timer = setTimeout(() => setExpired(speech), SPEECH_LIFE_MS);
    return () => clearTimeout(timer);
  }, [speech]);

  return speech !== null && speech !== expired ? speech : null;
}

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

/**
 * Что говорит игрок на своём месте — одной репликой.
 *
 * Точка в конце снимается один раз, на выходе: реплик здесь семь, и
 * «убрать точку» на каждом `return` — это семь мест, где её однажды забудут
 * убрать снова.
 */
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
  const said = ((): string | null => {
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
    if (turnPhase === 'DUEL_CLASH' && pendingAction?.actorId === player.id) {
      return '«К барьеру»';
    }
    if (turnPhase === 'REVEAL_OUTCOME' && revealOutcome?.accuserId === player.id) {
      return '«Не верю. Вскрывайте»';
    }
    if (
      turnPhase === 'DUEL_OUTCOME' &&
      duelOutcome &&
      (duelOutcome.attackerId === player.id || duelOutcome.defenderId === player.id)
    ) {
      return '«К барьеру!»';
    }
    return null;
  })();

  return said === null ? null : speechLine(said);
}

/** Ответ игрока в окне сомнения — на всё время окна, а не на две секунды. */
function useSeatReaction(playerId: string) {
  const {
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
  return seatReaction({
    turnPhase,
    pendingAction,
    pendingDoubtPassedIds,
    pendingDoubtDoubterId,
    pendingDoubtActionId,
    pendingVetoPassedIds,
    pendingVetoActionId,
    overlayInstant,
    playerId,
    revealOutcome
  });
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

  const speech = useTimedSpeech(useSeatSpeech(player));
  const reaction = useSeatReaction(player.id);
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
              {/* Признак — `isBot`, а не «изначально бот»: за столом важно, кто
                  думает машиной ПРЯМО СЕЙЧАС. Отвалившийся онлайн-игрок, чьё
                  место перехватил ИИ, помечается так же. */}
              {player.isBot && <span className="seat__botbadge">Бот</span>}
              <span className="seat__name">{player.name}</span>
              {isTargetable && (
                <span className="seat__role" style={{ color: 'var(--crimson-soft)' }}>
                  цель
                </span>
              )}
            </div>
          </div>

          <div className="seat__main">
            <ReactionPortrait
              src={player.avatar}
              name={player.name}
              className="seat__portrait"
              reaction={reaction}
              mirrored={side === 'right'}
            />

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
                initial={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.94 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: reduce
                    ? { duration: 0.12 }
                    : {
                        opacity: { duration: SPEECH_IN_S, ease: EASE },
                        y: spring.settle,
                        scale: spring.settle
                      }
                }}
                exit={{
                  opacity: 0,
                  y: reduce ? 0 : 10,
                  scale: reduce ? 1 : 0.96,
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
