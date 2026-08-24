import React, { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import type { Role } from '../engine/types';
import { Button } from './ui/Button';

interface ActionControlsProps {
  onOpenNormalActions: () => void;
}

const Panel: React.FC<{
  title: string;
  note?: React.ReactNode;
  alert?: boolean;
  children: React.ReactNode;
}> = ({ title, note, alert, children }) => (
  <div key={title} className={`actions ${alert ? 'actions--alert' : ''}`}>
    <div className="actions__head">
      <span className="actions__title">{title}</span>
    </div>
    {note && <div className="actions__note">{note}</div>}
    <div className="actions__grid">{children}</div>
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
    doubtAction,
    passDoubt,
    targetAcceptAttack,
    targetDoubtAttack,
    targetDeclareDuel,
    attackerRetreatDuel,
    attackerAcceptDuel,
    playInstant,
    proceedAfterVetoWindow,
    openConspiracyDialog,
    endTurnManually
  } = useGameStore();

  const [duelPicker, setDuelPicker] = useState(false);
  const [redirectPicker, setRedirectPicker] = useState(false);

  const human = players.find(p => !p.isBot);
  if (!human) return null;

  const isMyTurn = activePlayerId === human.id && turnPhase === 'IDLE';
  const isActor = pendingAction?.actorId === human.id;
  const isTarget = pendingAction?.targetId === human.id;
  const hasTokens = human.actionTokens >= 1;
  const redirectIndex = human.hand.indexOf('Перенаправление');

  /* 1. The victim of a targeted attack decides how to answer. */
  if (turnPhase === 'TARGET_REACTION_WINDOW' && isTarget) {
    const attacker = players.find(p => p.id === pendingAction?.actorId);
    const shieldRole: Role = pendingAction?.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';

    if (redirectPicker) {
      const options = players.filter(
        p =>
          p.id !== human.id &&
          p.id !== attacker?.id &&
          (pendingAction?.roleClaim !== 'Шантажист' || p.favor > 0)
      );
      return (
        <Panel title="Перенаправление" note="Переведите нападение на другого придворного." alert>
          {options.map(p => (
            <Button
              key={p.id}
              tone="gold"
              block
              onClick={() => {
                setRedirectPicker(false);
                playInstant(human.id, 'Перенаправление', redirectIndex, p.id);
              }}
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
        >
          {human.hand.map((card, idx) => {
            const truthful = card === shieldRole;
            return (
              <Button
                key={idx}
                tone={truthful ? 'good' : 'gold'}
                block
                sub={truthful ? 'Правда — щит настоящий' : 'Блеф — рискованно'}
                onClick={() => {
                  setDuelPicker(false);
                  targetDeclareDuel(human.id, idx);
                }}
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
      >
        <Button
          tone="calm"
          block
          hotkey="1"
          sub="Позволить эффект • 0 ⚡"
          onClick={() => targetAcceptAttack(human.id)}
        >
          Принять
        </Button>
        <Button
          tone="danger"
          block
          hotkey="2"
          disabled={!hasTokens}
          sub={hasTokens ? 'Проверить заявление • 1 ⚡' : 'Нет жетонов • 0 ⚡'}
          onClick={() => targetDoubtAttack(human.id)}
        >
          Не верю
        </Button>
        <Button
          tone="gold"
          block
          hotkey="3"
          disabled={!hasTokens}
          sub={hasTokens ? `Щит «${shieldRole}» • 1 ⚡` : 'Нет жетонов • 0 ⚡'}
          onClick={() => setDuelPicker(true)}
        >
          Дуэль
        </Button>
        {redirectIndex !== -1 && (
          <Button
            tone="arcane"
            block
            sub="Инстант из руки • 0 ⚡"
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
      <Panel title="Вызов на дуэль" note="Обе карты вскроются одновременно." alert>
        <Button
          tone="danger"
          block
          hotkey="2"
          sub="Одновременное вскрытие"
          onClick={() => attackerAcceptDuel(human.id)}
        >
          Принять бой
        </Button>
        <Button
          tone="calm"
          block
          hotkey="1"
          sub="Карта уходит в сброс"
          onClick={() => attackerRetreatDuel(human.id)}
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
      >
        <Button
          tone="danger"
          block
          hotkey="D"
          disabled={!hasTokens}
          sub={hasTokens ? 'Разоблачить блеф • 1 ⚡' : 'Нет жетонов • 0 ⚡'}
          onClick={() => doubtAction(human.id)}
        >
          Не верю
        </Button>
        <Button tone="good" block hotkey="V" sub="Пропустить проверку" onClick={() => passDoubt(human.id)}>
          Верю
        </Button>
      </Panel>
    );
  }

  /* 4. Veto window before the effect lands. */
  if (turnPhase === 'VETO_WINDOW') {
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
            sub="Отменить действие • 0 ⚡"
            onClick={() => playInstant(human.id, 'Право вето', vetoIndex)}
          >
            Наложить вето
          </Button>
        )}
        <Button tone="calm" block sub="Позволить эффект" onClick={proceedAfterVetoWindow}>
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
    <Panel
      title={isMyTurn ? 'Ваш ход' : 'Ожидание'}
      note={isMyTurn ? undefined : 'Жетоны берегите на проверки.'}
    >
      <Button
        tone="calm"
        block
        hotkey="1"
        disabled={!isMyTurn || !hasTokens || !canUseNormalAction}
        sub={canUseNormalAction ? '1 ⚡' : 'уже было'}
        onClick={onOpenNormalActions}
      >
        Действие двора
      </Button>

      {isMyTurn && conspiracyCharges >= 1 && (
        <Button
          tone="arcane"
          block
          sub={
            conspiracyCharges <= 2
              ? `Сбить до ${conspiracyCharges} 🪙 • 1 ⚡`
              : conspiracyCharges === 3
                ? 'До 3 🪙 или 1 👑 • 1 ⚡'
                : 'До 4 🪙 или 1 👑 • без вето'
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
          human.actionTokens > 0
            ? `Сохранить ${human.actionTokens} ⚡ на защиту`
            : 'Добор карт и передача хода'
        }
        onClick={endTurnManually}
      >
        Завершить ход
      </Button>
    </Panel>
  );
};
