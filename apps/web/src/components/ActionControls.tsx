import React, { useEffect, useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Role } from '@kinglier/engine/types';
import { pickViewer } from '../lib/viewer';
import { Button } from './ui/Button';
import { UiIcon } from './ui/Icon';

interface ActionControlsProps {
  onOpenNormalActions: () => void;
}

const Panel: React.FC<{
  title: string;
  note?: React.ReactNode;
  alert?: boolean;
  busy?: string | null;
  children: React.ReactNode;
}> = ({ title, note, alert, busy, children }) => (
  <div className={`actions ${alert ? 'actions--alert' : ''}`}>
    <div className="actions__head">
      <span className="actions__title">{title}</span>
    </div>
    {note && <div className="actions__note">{note}</div>}
    <div className={`actions__grid${busy ? ' actions__grid--busy' : ''}`}>{children}</div>
    {busy && (
      <div className="actions__busy">
        <span className="actions__busy-dot" />
        {busy}
      </div>
    )}
  </div>
);

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
  const redirectIndex = human.hand.indexOf('Перенаправление');
  const pendingDoubter = pendingDoubtDoubterId
    ? players.find(p => p.id === pendingDoubtDoubterId)
    : null;

  if (pendingDoubter) {
    const mine = pendingDoubter.id === human.id;
    return (
      <Panel
        title="Проверка"
        note={mine ? 'Вы вскрываете карту.' : `${pendingDoubter.name} вскрывает карту.`}
        alert
      >
        <Button tone="danger" block disabled sub="карта сейчас откроется">
          Не верю
        </Button>
      </Panel>
    );
  }

  /* 1. The victim of a targeted attack decides how to answer. */
  if (turnPhase === 'TARGET_REACTION_WINDOW' && isTarget) {
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
      return (
        <Panel title="Перенаправление" note="Переведите нападение на другого придворного." alert busy={busy}>
          {options.map(p => (
            <Button
              key={p.id}
              tone="gold"
              block
              onClick={act('Перенаправляем атаку…', () => {
                setRedirectPicker(false);
                playInstant(human.id, 'Перенаправление', redirectIndex, p.id);
              })}
            >
              {p.name}
            </Button>
          ))}
          <Button tone="bare" size="sm" block onClick={() => setRedirectPicker(false)}>
            Назад
          </Button>
        </Panel>
      );
    }

    if (duelPicker) {
      return (
        <Panel
          title="Выбор щита"
          note={`Положите карту взакрытую и заявите «${shieldRole}».`}
          alert
          busy={busy}
        >
          {human.hand.map((card, idx) => {
            const truthful = card === shieldRole;
            return (
              <Button
                key={idx}
                tone={truthful ? 'good' : 'gold'}
                block
                sub={truthful ? 'Правда — щит настоящий' : 'Блеф — рискованно'}
                onClick={act('Готовим дуэль…', () => {
                  setDuelPicker(false);
                  targetDeclareDuel(human.id, idx);
                })}
              >
                {card}
              </Button>
            );
          })}
          <Button tone="bare" size="sm" block onClick={() => setDuelPicker(false)}>
            Назад
          </Button>
        </Panel>
      );
    }

    return (
      <Panel
        title="Вас атакуют"
        note={
          <>
            {attacker?.name} заявляет роль «{pendingAction?.roleClaim}». Выберите ответ.
          </>
        }
        alert
        busy={busy}
      >
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
        {redirectIndex !== -1 && redirectOptions.length > 0 && (
          <Button
            tone="arcane"
            block
            sub={<>Инстант из руки • 0 <UiIcon kind="move" size="xs" /></>}
            onClick={() => setRedirectPicker(true)}
          >
            Перенаправить
          </Button>
        )}
      </Panel>
    );
  }

  /* 2. Attacker answers a declared duel. */
  if (turnPhase === 'DUEL_ATTACKER_WINDOW' && isActor) {
    return (
      <Panel title="Вызов на дуэль" note="Обе карты вскроются одновременно." alert busy={busy}>
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
      </Panel>
    );
  }

  /* 3. The court may challenge a claim. */
  if (turnPhase === 'DOUBT_WINDOW' && !isActor) {
    return (
      <Panel
        title="Окно сомнений"
        note={<>Заявлена роль «{pendingAction?.roleClaim}». Проверить или пропустить?</>}
        alert
        busy={busy}
      >
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
      </Panel>
    );
  }

  /* 4. Veto window before the effect lands. Closes immediately on click,
     same as every other action popup — no lingering panel. */
  if (turnPhase === 'VETO_WINDOW' && !vetoDismissed) {
    const vetoIndex = human.hand.indexOf('Право вето');
    const canVeto = vetoIndex !== -1 && !isVetoed;
    return (
      <Panel
        title="Окно вето"
        note={<>Готовится эффект «{pendingAction?.roleClaim || pendingAction?.name}».</>}
        alert
      >
        {canVeto && (
          <Button
            tone="danger"
            block
            sub={<>Отменить действие • 0 <UiIcon kind="move" size="xs" /></>}
            onClick={() => {
              setVetoDismissed(true);
              playInstant(human.id, 'Право вето', vetoIndex);
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
      </Panel>
    );
  }

  /* 5. Own turn. */
  const canUseNormalAction = turnSubPhase === 'NORMAL_ACTION_PHASE' && !hasUsedNormalActionThisTurn;
  const conspiracyCharges =
    human.activePlot?.type === 'Тайный заговор' ? (human.activePlot.charges ?? 0) : 0;

  return (
    <Panel title={isMyTurn ? 'Ваш ход' : 'Ожидание'} busy={busy}>
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
    </Panel>
  );
};
