import React, { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';
import type { Role } from '../engine/types';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface ActionControlsProps {
  onOpenNormalActions: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  onOpenNormalActions
}) => {
  const { 
    players, 
    activePlayerId, 
    turnPhase, 
    turnSubPhase,
    hasUsedNormalActionThisTurn,
    pendingAction, 
    doubtAction, 
    passDoubt, 
    targetAcceptAttack, 
    targetDoubtAttack, 
    targetDeclareDuel, 
    attackerRetreatDuel, 
    attackerAcceptDuel, 
    playInstant,
    skipNormalActionPhase,
    endTurnManually 
  } = useGameStore();

  const [selectingDuelCard, setSelectingDuelCard] = useState(false);
  const [selectingRedirectTarget, setSelectingRedirectTarget] = useState(false);

  const human = players.find(p => !p.isBot);
  if (!human) return null;

  const isMyTurn = activePlayerId === human.id && turnPhase === 'IDLE';
  const isActor = pendingAction?.actorId === human.id;
  const isTarget = pendingAction?.targetId === human.id;

  const hasTokens = human.actionTokens >= 1;
  const redirectIndex = human.hand.indexOf('Перенаправление');

  // 1. TARGET REACTION WINDOW (Victim's exclusive decision)
  if (turnPhase === 'TARGET_REACTION_WINDOW') {
    const actor = players.find(p => p.id === pendingAction?.actorId);
    const requiredRole: Role = pendingAction?.roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
    const blockingRoleDeclined = pendingAction?.roleClaim === 'Вор' ? 'Казначеем' : 'Рыцарем';

    if (isTarget) {
      if (selectingRedirectTarget) {
        const redirectTargets = players.filter(
          p => p.id !== human.id && p.id !== actor?.id && (pendingAction?.roleClaim !== 'Шантажист' || p.favor > 0)
        );
        return (
          <div className="player-actions-toolbar" style={{ gap: '6px' }}>
            <div style={{ fontSize: '0.74rem', color: '#fbbf24', fontWeight: 800, textAlign: 'center' }}>
              🔀 Выберите новую цель для атаки:
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {redirectTargets.map(t => (
                <Button
                  key={t.id}
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    setSelectingRedirectTarget(false);
                    playInstant(human.id, 'Перенаправление', redirectIndex, t.id);
                  }}
                >
                  {t.name}
                </Button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectingRedirectTarget(false)}
              >
                ◀ Назад
              </Button>
            </div>
          </div>
        );
      }

      if (selectingDuelCard) {
        return (
          <div className="player-actions-toolbar" style={{ gap: '6px' }}>
            <div style={{ fontSize: '0.74rem', color: '#fbbf24', fontWeight: 800, textAlign: 'center' }}>
              🛡️ Выберите карту из руки на Дуэль (заявляется «{requiredRole}»):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px' }}>
              {human.hand.map((cardRole, idx) => {
                const info = CARD_DESCRIPTIONS[cardRole];
                const isTruth = cardRole === requiredRole;
                return (
                  <Button
                    key={idx}
                    variant={isTruth ? 'green' : 'gold'}
                    size="sm"
                    style={{
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                    onClick={() => {
                      setSelectingDuelCard(false);
                      targetDeclareDuel(human.id, idx);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{info?.badge}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{cardRole}</span>
                    </div>
                    <Badge variant={isTruth ? 'emerald' : 'amber'} size="sm">
                      {isTruth ? 'ПРАВДА' : 'БЛЕФ'}
                    </Badge>
                  </Button>
                );
              })}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectingDuelCard(false)}
                title="Вернуться к выбору действия"
              >
                ◀ Назад
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="player-actions-toolbar">
          <div style={{ fontSize: '0.74rem', color: '#fef08a', fontWeight: 800, textAlign: 'center', marginBottom: '2px' }}>
            ⚔️ {actor?.name} атакует вас ролью «{pendingAction?.roleClaim}»!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: redirectIndex !== -1 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '6px' }}>
            {/* Option 1: Accept */}
            <Button 
              variant="blue"
              size="sm"
              subtext="Без спора • 0 ⚡"
              onClick={() => {
                setSelectingDuelCard(false);
                targetAcceptAttack(human.id);
              }}
            >
              🏳️ Принять
            </Button>
            
            {/* Option 2: Doubt */}
            <Button 
              variant="red"
              size="sm"
              disabled={!hasTokens}
              subtext={hasTokens ? 'Стоит 1 ⚡' : '0 ⚡ (закрыто)'}
              onClick={() => {
                setSelectingDuelCard(false);
                targetDoubtAttack(human.id);
              }}
              title={hasTokens ? 'Проверить на блеф (стоит 1 ⚡)' : 'Недостаточно жетонов действия (0 ⚡)'}
            >
              ⚔️ Не верю!
            </Button>

            {/* Option 3: Duel */}
            <Button 
              variant="gold"
              size="sm"
              subtext={`Щит ${blockingRoleDeclined} • 0 ⚡`}
              onClick={() => setSelectingDuelCard(true)}
            >
              🤺 Дуэль!
            </Button>

            {/* Option 4: Redirection Instant if held in hand */}
            {redirectIndex !== -1 && (
              <Button 
                variant="purple"
                size="sm"
                subtext="Инстант • 0 ⚡"
                onClick={() => setSelectingRedirectTarget(true)}
              >
                🔀 Перенаправить
              </Button>
            )}
          </div>
        </div>
      );
    }
  }

  // 2. DUEL ATTACKER WINDOW (Attacker's decision)
  if (turnPhase === 'DUEL_ATTACKER_WINDOW') {
    if (isActor) {
      return (
        <div className="player-actions-toolbar">
          <Button 
            variant="red"
            size="md"
            hotkey="2"
            subtext="Одновременное вскрытие карт"
            onClick={() => attackerAcceptDuel(human.id)}
          >
            ⚔️ Принять дуэль!
          </Button>
          <Button 
            variant="blue"
            size="md"
            hotkey="1"
            subtext="Сбросить карту в сброс"
            onClick={() => attackerRetreatDuel(human.id)}
          >
            🏳️ Отступить
          </Button>
        </div>
      );
    }
  }

  // 3. DOUBT WINDOW (Court check for truth vs bluff)
  if (turnPhase === 'DOUBT_WINDOW' && !isActor) {
    return (
      <div className="player-actions-toolbar" style={{ gap: '6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', width: '100%' }}>
          <Button 
            variant="red"
            size="md"
            hotkey="D"
            disabled={!hasTokens}
            subtext={hasTokens ? 'Разоблачить • 1 ⚡' : 'Нет жетонов • 0 ⚡'}
            onClick={() => doubtAction(human.id)}
            title={hasTokens ? 'Проверить заявление на блеф (тратит 1 ⚡)' : 'У вас 0 жетонов действия'}
          >
            ⚔️ Не верю!
          </Button>

          <Button 
            variant="green"
            size="md"
            hotkey="V"
            subtext="Пропустить ход"
            onClick={() => passDoubt(human.id)}
          >
            ✋ Верю
          </Button>
        </div>
      </div>
    );
  }

  // 4. VETO_WINDOW (Dedicated window before applying effect)
  if (turnPhase === 'VETO_WINDOW') {
    const vetoIdx = human.hand.indexOf('Право вето');
    const canVeto = vetoIdx !== -1 && !useGameStore.getState().isVetoed;
    const { proceedAfterVetoWindow } = useGameStore.getState();

    return (
      <div className="player-actions-toolbar" style={{ gap: '6px', background: 'rgba(49, 10, 10, 0.95)', border: '1px solid #ef4444', borderRadius: '12px', padding: '10px' }}>
        <div style={{ fontSize: '0.76rem', color: '#fecaca', fontWeight: 800, textAlign: 'center', width: '100%' }}>
          🚫 ОКНО ВЕТО: Применяется эффект «{pendingAction?.roleClaim || pendingAction?.name}»!
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', width: '100%' }}>
          {canVeto && (
            <Button
              variant="red"
              size="md"
              subtext="Отменить действие в сброс"
              onClick={() => playInstant(human.id, 'Право вето', vetoIdx)}
            >
              🚫 НАЛОЖИТЬ ВЕТО! • 0 ⚡
            </Button>
          )}

          <Button
            variant="blue"
            size="md"
            subtext="Применить эффект"
            onClick={proceedAfterVetoWindow}
          >
            ✨ Продолжить ➔
          </Button>
        </div>
      </div>
    );
  }

  // 5. DEFAULT IDLE ACTION BAR WITH 3-PHASE CONTROLS
  const isNormalPhase = turnSubPhase === 'NORMAL_ACTION_PHASE' && !hasUsedNormalActionThisTurn;

  return (
    <div className="player-actions-toolbar" style={{ gap: '6px' }}>
      {/* Subphase 2: Normal Action Button */}
      <Button 
        variant="blue"
        size="md"
        hotkey="1"
        disabled={!isMyTurn || !hasTokens || !isNormalPhase}
        subtext={isNormalPhase ? 'Пир, Слух, Смена, Золото • 1 ⚡' : '⛔ Пропущено (1 на ход)'}
        onClick={onOpenNormalActions}
        title={isNormalPhase ? 'Открыть меню обычных действий' : 'Фаза обычных действий пропущена или уже использована'}
      >
        🕊️ Обычное действие
      </Button>

      {/* Button to skip Normal Action and go directly to Cards */}
      {isMyTurn && isNormalPhase && (
        <Button 
          variant="gold"
          size="sm"
          subtext="Фаза 3: Роли и Интриги"
          onClick={skipNormalActionPhase}
          title="Пропустить обычное действие и перейти сразу к розыгрышу карт из руки"
        >
          ⏭️ К картам ➔
        </Button>
      )}

      {/* Secret Conspiracy Activation Button in own turn (2, 3 or 4 charges) */}
      {isMyTurn && human.activePlot?.type === 'Тайный заговор' && (human.activePlot.charges ?? 0) >= 2 && (
        <Button 
          variant="purple"
          size="md"
          subtext={human.activePlot.charges === 2 ? 'Сброс до 3 🪙 • 1 ⚡' : human.activePlot.charges === 3 ? 'Лишить 1 👑 • 1 ⚡' : '🛡️ Без Вето! • 1 ⚡'}
          onClick={() => useGameStore.getState().openConspiracyDialog(false)}
          title="Свершить Заговор (стоит 1 ⚡)"
        >
          ⚔️ Свершить Заговор ({human.activePlot.charges}/4)
        </Button>
      )}

      {/* End Turn Manually Button */}
      <Button 
        variant="red"
        size="md"
        hotkey="Пробел"
        disabled={!isMyTurn}
        subtext={human.actionTokens > 0 ? 'Сохранить жетоны на защиту' : 'Добор карт и передача хода'}
        onClick={endTurnManually}
        title="Завершить ход и сохранить оставшиеся жетоны действия для проверок на чужих ходах"
      >
        ✋ {human.actionTokens > 0 ? `Завершить ход • ${human.actionTokens} ⚡` : 'Завершить ход'}
      </Button>
    </div>
  );
};
