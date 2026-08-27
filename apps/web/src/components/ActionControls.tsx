/**
 * The one panel that tells the player what they may do right now.
 *
 * Every phase of the turn wants a different set of buttons, so the panel's
 * contents are replaced wholesale several times per turn. Replacing them
 * outright is what used to make the box snap from one height to another in a
 * single frame — one of the complaints this motion pass exists to answer.
 *
 * The fix is structural rather than cosmetic. Instead of ten `return
 * <Panel …>` statements, the body picks *one* `PanelView` — a small record of
 * title, note, buttons and alert flag — and there is exactly one render path.
 * That single view is keyed by the phase it belongs to and handed to an
 * `AnimatePresence` in `popLayout` mode: the outgoing buttons are lifted out
 * of layout flow and sink away while the incoming ones arrive from above, and
 * the frame around them — which is now the outer `motion.div`, not part of the
 * swapped subtree — interpolates its height over `dur.panel` instead of
 * jumping. Because the frame persists, its border colour also crosses from
 * calm to alert as a CSS transition rather than as a cut.
 *
 * `busy` is deliberately *not* part of the key: clicking a button must show
 * the "waiting" line inside the panel that is already there, not replace the
 * panel with a copy of itself.
 */
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Role } from '@kinglier/engine/types';
import { pickViewer } from '../lib/viewer';
import { idOf } from '@kinglier/engine/cardInstance';
import { dur } from '../motion/tokens.ts';
import { Button } from './ui/Button';
import { UiIcon } from './ui/Icon';

interface ActionControlsProps {
  onOpenNormalActions: () => void;
}

/** How far the swapped contents travel, in px. Enough to read as a direction. */
const SLIDE = 8;

/** Reduced motion keeps the crossfade and drops the travel and the resize. */
const REDUCED_FADE = 0.12;

const EASE = [0.4, 0, 0.2, 1] as const;

/**
 * What the panel shows for one phase. `variant` distinguishes two views that
 * share a phase — the shield picker and the redirect picker both live inside
 * the target's reaction window — so switching between them animates too.
 */
interface PanelView {
  variant: string;
  title: string;
  note?: React.ReactNode;
  alert?: boolean;
  busy?: string | null;
  children: React.ReactNode;
}

export const ActionControls: React.FC<ActionControlsProps> = ({ onOpenNormalActions }) => {
  const {
    players,
    activePlayerId,
    turnPhase,
    turnSubPhase,
    hasUsedNormalActionThisTurn,
    isVetoed,
    pendingAction,
    pendingDoubtDoubterId,
    viewerId,
    doubtAction,
    passDoubt,
    targetAcceptAttack,
    targetDoubtAttack,
    targetDeclareDuel,
    attackerRetreatDuel,
    attackerAcceptDuel,
    playInstant,
    passVetoWindow,
    openConspiracyDialog,
    endTurnManually
  } = useGameStore();

  const [duelPicker, setDuelPicker] = useState(false);
  const [redirectPicker, setRedirectPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [vetoDismissed, setVetoDismissed] = useState(false);
  const reduce = !!useReducedMotion();

  const human = pickViewer(players, viewerId);

  // Any real change to the reaction window means the click landed and the
  // game moved on — drop the "waiting" indicator so it never gets stuck.
  const windowKey = `${turnPhase}|${activePlayerId}|${pendingAction?.id ?? ''}|${pendingDoubtDoubterId ?? ''}|${isVetoed}`;
  useEffect(() => {
    setBusy(null);
    setVetoDismissed(false);
  }, [windowKey]);

  /** Wrap a button's handler so clicking it immediately shows a "waiting" state
   *  instead of leaving the player guessing whether the click registered. */
  const act = (label: string, fn: () => void) => () => {
    setBusy(label);
    fn();
  };

  if (!human) return null;

  const isMyTurn = activePlayerId === human.id && turnPhase === 'IDLE' && !pendingAction;
  const isActor = pendingAction?.actorId === human.id;
  const isTarget = pendingAction?.targetId === human.id;
  const hasTokens = human.actionTokens >= 1;
  const redirectId = idOf(human.hand, 'Перенаправление');
  const pendingDoubter = pendingDoubtDoubterId
    ? players.find(p => p.id === pendingDoubtDoubterId)
    : null;

  let view: PanelView;

  if (pendingDoubter) {
    const mine = pendingDoubter.id === human.id;
    view = {
      variant: 'reveal',
      title: 'Проверка',
      note: mine ? 'Вы вскрываете карту.' : `${pendingDoubter.name} вскрывает карту.`,
      alert: true,
      children: (
        <Button tone="danger" block disabled sub="карта сейчас откроется">
          Не верю
        </Button>
      )
    };
  } else if (turnPhase === 'TARGET_REACTION_WINDOW' && isTarget) {
    /* 1. The victim of a targeted attack decides how to answer. */
    const attacker = players.find(p => p.id === pendingAction?.actorId);
    const shieldRole: Role = pendingAction?.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
    const redirectOptions = players.filter(
      p =>
        p.id !== human.id &&
        p.id !== attacker?.id &&
        (pendingAction?.roleClaim !== 'Шантажист' || p.favor > 0) &&
        (pendingAction?.roleClaim !== 'Вор' || p.gold > 0)
    );

    if (redirectPicker) {
      const options = redirectOptions;
      view = {
        variant: 'redirect-picker',
        title: 'Перенаправление',
        note: 'Переведите нападение на другого придворного.',
        alert: true,
        busy,
        children: (
          <>
            {options.map(p => (
              <Button
                key={p.id}
                tone="gold"
                block
                onClick={act('Перенаправляем атаку…', () => {
                  setRedirectPicker(false);
                  if (redirectId) playInstant(human.id, 'Перенаправление', redirectId, p.id);
                })}
              >
                {p.name}
              </Button>
            ))}
            <Button tone="bare" size="sm" block onClick={() => setRedirectPicker(false)}>
              Назад
            </Button>
          </>
        )
      };
    } else if (duelPicker) {
      view = {
        variant: 'duel-picker',
        title: 'Выбор щита',
        note: `Положите карту взакрытую и заявите «${shieldRole}».`,
        alert: true,
        busy,
        children: (
          <>
            {human.hand.map(({ card, id }) => {
              const truthful = card === shieldRole;
              return (
                <Button
                  key={id}
                  tone={truthful ? 'good' : 'gold'}
                  block
                  sub={truthful ? 'Правда — щит настоящий' : 'Блеф — рискованно'}
                  onClick={act('Готовим дуэль…', () => {
                    setDuelPicker(false);
                    targetDeclareDuel(human.id, id);
                  })}
                >
                  {card}
                </Button>
              );
            })}
            <Button tone="bare" size="sm" block onClick={() => setDuelPicker(false)}>
              Назад
            </Button>
          </>
        )
      };
    } else {
      view = {
        variant: 'under-attack',
        title: 'Вас атакуют',
        note: (
          <>
            {attacker?.name} заявляет роль «{pendingAction?.roleClaim}». Выберите ответ.
          </>
        ),
        alert: true,
        busy,
        children: (
          <>
            <Button
              tone="calm"
              block
              hotkey="1"
              sub={<>Позволить эффект • 0 <UiIcon kind="move" size="xs" /></>}
              onClick={act('Действие вступает в силу…', () => targetAcceptAttack(human.id))}
            >
              Принять
            </Button>
            <Button
              tone="danger"
              block
              hotkey="2"
              disabled={!hasTokens}
              sub={
                hasTokens ? (
                  <>Проверить заявление • 1 <UiIcon kind="move" size="xs" /></>
                ) : (
                  <>Нет жетонов • 0 <UiIcon kind="move" size="xs" /></>
                )
              }
              onClick={act('Вскрываем карту…', () => targetDoubtAttack(human.id))}
            >
              Не верю
            </Button>
            <Button
              tone="gold"
              block
              hotkey="3"
              disabled={!hasTokens}
              sub={
                hasTokens ? (
                  <>Щит «{shieldRole}» • 1 <UiIcon kind="move" size="xs" /></>
                ) : (
                  <>Нет жетонов • 0 <UiIcon kind="move" size="xs" /></>
                )
              }
              onClick={() => setDuelPicker(true)}
            >
              Дуэль
            </Button>
            {redirectId && redirectOptions.length > 0 && (
              <Button
                tone="arcane"
                block
                sub={<>Инстант из руки • 0 <UiIcon kind="move" size="xs" /></>}
                onClick={() => setRedirectPicker(true)}
              >
                Перенаправить
              </Button>
            )}
          </>
        )
      };
    }
  } else if (turnPhase === 'DUEL_ATTACKER_WINDOW' && isActor) {
    /* 2. Attacker answers a declared duel. */
    view = {
      variant: 'duel-answer',
      title: 'Вызов на дуэль',
      note: 'Обе карты вскроются одновременно.',
      alert: true,
      busy,
      children: (
        <>
          <Button
            tone="danger"
            block
            hotkey="2"
            sub="Одновременное вскрытие"
            onClick={act('Вскрываем карты…', () => attackerAcceptDuel(human.id))}
          >
            Принять бой
          </Button>
          <Button
            tone="calm"
            block
            hotkey="1"
            sub="Карта уходит в сброс"
            onClick={act('Карта уходит в сброс…', () => attackerRetreatDuel(human.id))}
          >
            Отступить
          </Button>
        </>
      )
    };
  } else if (turnPhase === 'DOUBT_WINDOW' && !isActor) {
    /* 3. The court may challenge a claim. */
    view = {
      variant: 'doubt',
      title: 'Окно сомнений',
      note: <>Заявлена роль «{pendingAction?.roleClaim}». Проверить или пропустить?</>,
      alert: true,
      busy,
      children: (
        <>
          <Button
            tone="danger"
            block
            hotkey="D"
            disabled={!hasTokens}
            sub={
              hasTokens ? (
                <>Разоблачить блеф • 1 <UiIcon kind="move" size="xs" /></>
              ) : (
                <>Нет жетонов • 0 <UiIcon kind="move" size="xs" /></>
              )
            }
            onClick={act('Вскрываем карту…', () => doubtAction(human.id))}
          >
            Не верю
          </Button>
          <Button
            tone="good"
            block
            hotkey="V"
            sub="Пропустить проверку"
            onClick={act('Ждём остальных игроков…', () => passDoubt(human.id))}
          >
            Верю
          </Button>
        </>
      )
    };
  } else if (turnPhase === 'VETO_WINDOW' && !vetoDismissed) {
    /* 4. Veto window before the effect lands. Closes immediately on click,
       same as every other action popup — no lingering panel. */
    const vetoId = idOf(human.hand, 'Право вето');
    const canVeto = !!vetoId && !isVetoed;
    view = {
      variant: 'veto',
      title: 'Окно вето',
      note: <>Готовится эффект «{pendingAction?.roleClaim || pendingAction?.name}».</>,
      alert: true,
      children: (
        <>
          {canVeto && (
            <Button
              tone="danger"
              block
              sub={<>Отменить действие • 0 <UiIcon kind="move" size="xs" /></>}
              onClick={() => {
                setVetoDismissed(true);
                if (vetoId) playInstant(human.id, 'Право вето', vetoId);
              }}
            >
              Наложить вето
            </Button>
          )}
          <Button
            tone="calm"
            block
            sub="Позволить эффект"
            onClick={() => {
              setVetoDismissed(true);
              passVetoWindow(human.id);
            }}
          >
            Продолжить
          </Button>
        </>
      )
    };
  } else {
    /* 5. Own turn. */
    const canUseNormalAction = turnSubPhase === 'NORMAL_ACTION_PHASE' && !hasUsedNormalActionThisTurn;
    const conspiracyCharges =
      human.activePlot?.type === 'Тайный заговор' ? (human.activePlot.charges ?? 0) : 0;

    view = {
      variant: isMyTurn ? 'turn' : 'idle',
      title: isMyTurn ? 'Ваш ход' : 'Ожидание',
      busy,
      children: (
        <>
          <Button
            tone="calm"
            block
            hotkey="1"
            disabled={!isMyTurn || !hasTokens || !canUseNormalAction}
            sub={canUseNormalAction ? <>1 <UiIcon kind="move" size="xs" /></> : 'уже было'}
            onClick={onOpenNormalActions}
          >
            Действие двора
          </Button>

          {isMyTurn && conspiracyCharges >= 1 && (
            <Button
              tone="arcane"
              block
              sub={
                conspiracyCharges <= 2 ? (
                  <>Сбить до {conspiracyCharges} <UiIcon kind="coin" size="xs" /> • 1 <UiIcon kind="move" size="xs" /></>
                ) : conspiracyCharges === 3 ? (
                  <>До 3 <UiIcon kind="coin" size="xs" /> или 1 <UiIcon kind="crown" size="xs" /> • 1 <UiIcon kind="move" size="xs" /></>
                ) : (
                  <>До 4 <UiIcon kind="coin" size="xs" /> или 1 <UiIcon kind="crown" size="xs" /> • без вето</>
                )
              }
              onClick={() => openConspiracyDialog(false)}
            >
              Свершить заговор · {conspiracyCharges}/4
            </Button>
          )}

          <Button
            tone="gold"
            block
            hotkey="Пробел"
            disabled={!isMyTurn}
            sub={
              human.actionTokens > 0 ? (
                <>Сохранить {human.actionTokens} <UiIcon kind="move" size="sm" /> на защиту</>
              ) : (
                'Добор карт и передача хода'
              )
            }
            onClick={act('Передаём ход…', endTurnManually)}
          >
            Завершить ход
          </Button>
        </>
      )
    };
  }

  const panelKey = `${windowKey}|${view.variant}`;
  const fade = reduce ? REDUCED_FADE : dur.panel;
  const travel = reduce ? 0 : SLIDE;

  return (
    <motion.div
      className={`actions ${view.alert ? 'actions--alert' : ''}`}
      /* The frame outlives every swap, so its height is a thing that can be
         interpolated. `size` rather than `true`: the panel is pinned to the
         bottom of the hero row and has no business sliding sideways when a
         neighbour resizes. */
      layout={reduce ? false : 'size'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: fade, ease: EASE, layout: { duration: fade, ease: EASE } }}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={panelKey}
          className="actions__view"
          initial={{ opacity: 0, y: -travel }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: travel }}
          transition={{ duration: fade, ease: EASE }}
        >
          <div className="actions__head">
            <span className="actions__title">{view.title}</span>
          </div>
          {view.note && <div className="actions__note">{view.note}</div>}
          <div className={`actions__grid${view.busy ? ' actions__grid--busy' : ''}`}>
            {view.children}
          </div>
          <AnimatePresence initial={false}>
            {view.busy && (
              <motion.div
                key="busy"
                className="actions__busy"
                initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : 4 }}
                transition={{ duration: reduce ? REDUCED_FADE : dur.fade, ease: EASE }}
              >
                <span className="actions__busy-dot" />
                {view.busy}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
