import { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { CARD_INFO } from '../engine/cards';
import type { Role } from '../engine/types';

interface ActionControlsProps {
  onOpenNormalActions: () => void;
}

export function ActionControls({
  onOpenNormalActions
}: ActionControlsProps) {
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
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, textAlign: 'center' }}>
              🔀 Выберите новую цель для атаки:
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
              {redirectTargets.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className="action-deck-btn btn-gold"
                  style={{ padding: '6px 12px', fontSize: '0.74rem' }}
                  onClick={() => {
                    setSelectingRedirectTarget(false);
                    playInstant(human.id, 'Перенаправление', redirectIndex, t.id);
                  }}
                >
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                className="action-deck-btn btn-blue"
                style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                onClick={() => setSelectingRedirectTarget(false)}
              >
                ◀ Назад
              </button>
            </div>
          </div>
        );
      }

      if (selectingDuelCard) {
        return (
          <div className="player-actions-toolbar" style={{ gap: '6px' }}>
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, textAlign: 'center' }}>
              🛡️ Выберите карту из руки на Дуэль (заявляется «{requiredRole}»):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px' }}>
              {human.hand.map((cardRole, idx) => {
                const info = CARD_INFO[cardRole];
                const isTruth = cardRole === requiredRole;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`action-deck-btn ${isTruth ? 'btn-green' : 'btn-gold'}`}
                    style={{
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      border: isTruth ? '2px solid #4ade80' : '1px solid #d97706'
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
                    <span style={{ fontSize: '0.62rem', color: isTruth ? '#bbf7d0' : '#fde68a', fontWeight: 700 }}>
                      {isTruth ? '✨ ПРАВДА' : '🎭 БЛЕФ'}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                className="action-deck-btn btn-blue"
                style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                onClick={() => setSelectingDuelCard(false)}
                title="Вернуться к выбору действия"
              >
                ◀ Назад
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="player-actions-toolbar">
          <div style={{ fontSize: '0.72rem', color: '#fef08a', fontWeight: 800, textAlign: 'center', marginBottom: '2px' }}>
            ⚔️ {actor?.name} атакует вас «{pendingAction?.roleClaim}»!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: redirectIndex !== -1 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '6px' }}>
            {/* Option 1: Accept */}
            <button 
              type="button"
              className="action-deck-btn btn-blue"
              onClick={() => {
                setSelectingDuelCard(false);
                targetAcceptAttack(human.id);
              }}
              style={{ padding: '6px 4px' }}
            >
              <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>🏳️ Принять</span>
              <span className="action-deck-btn-sub">Без спора (0 ⚡)</span>
            </button>
            
            {/* Option 2: Doubt (costs 1 Token) */}
            <button 
              type="button"
              className="action-deck-btn btn-red"
              disabled={!hasTokens}
              onClick={() => {
                setSelectingDuelCard(false);
                targetDoubtAttack(human.id);
              }}
              style={{ padding: '6px 4px', opacity: hasTokens ? 1 : 0.4 }}
              title={hasTokens ? 'Проверить на блеф (стоит 1 ⚡)' : 'Недостаточно жетонов действия (0 ⚡)'}
            >
              <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>⚔️ Не верю!</span>
              <span className="action-deck-btn-sub">{hasTokens ? 'Стоит 1 ⚡' : '0 ⚡ (закрыто)'}</span>
            </button>

            {/* Option 3: Duel */}
            <button 
              type="button"
              className="action-deck-btn btn-gold"
              onClick={() => setSelectingDuelCard(true)}
              style={{ padding: '6px 4px' }}
            >
              <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>🤺 Дуэль!</span>
              <span className="action-deck-btn-sub">Блок {blockingRoleDeclined} (0 ⚡)</span>
            </button>

            {/* Option 4: Redirection Instant if held in hand */}
            {redirectIndex !== -1 && (
              <button 
                type="button" 
                className="action-deck-btn btn-gold"
                onClick={() => setSelectingRedirectTarget(true)}
                style={{ padding: '6px 4px', border: '1px solid #fbbf24' }}
              >
                <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>🔀 Инстант</span>
                <span className="action-deck-btn-sub">Перенаправить (0 ⚡)</span>
              </button>
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
          <button 
            className="action-deck-btn btn-red"
            onClick={() => attackerAcceptDuel(human.id)}
            style={{ padding: '8px 12px' }}
          >
            <span className="action-deck-btn-title">
              ⚔️ Принять дуэль! <span className="hotkey-badge">[2]</span>
            </span>
            <span className="action-deck-btn-sub">Одновременное вскрытие карт</span>
          </button>
          <button 
            className="action-deck-btn btn-blue"
            onClick={() => attackerRetreatDuel(human.id)}
            style={{ padding: '6px 12px' }}
          >
            <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>
              🏳️ Отступить <span className="hotkey-badge">[1]</span>
            </span>
            <span className="action-deck-btn-sub">Сбросить карту в сброс</span>
          </button>
        </div>
      );
    }
  }

  // 3. DOUBT WINDOW (Court check for truth vs bluff)
  if (turnPhase === 'DOUBT_WINDOW' && !isActor) {
    return (
      <div className="player-actions-toolbar" style={{ gap: '6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', width: '100%' }}>
          {/* Left Button: Doubt / Check */}
          <button 
            className="action-deck-btn btn-red"
            disabled={!hasTokens}
            onClick={() => doubtAction(human.id)}
            style={{ padding: '8px 10px', opacity: hasTokens ? 1 : 0.4 }}
            title={hasTokens ? 'Проверить заявление на блеф (тратит 1 ⚡)' : 'У вас 0 жетонов действия ⚡'}
          >
            <span className="action-deck-btn-title">
              ⚔️ Не верю! <span className="hotkey-badge">[D]</span>
            </span>
            <span className="action-deck-btn-sub">
              {hasTokens ? 'Разоблачить (1 ⚡)' : 'Нет жетонов (0 ⚡)'}
            </span>
          </button>

          {/* Right Button: Pass / Trust */}
          <button 
            className="action-deck-btn btn-green"
            onClick={() => passDoubt(human.id)}
            style={{ padding: '8px 10px' }}
          >
            <span className="action-deck-btn-title">
              ✋ Верю <span className="hotkey-badge">[V]</span>
            </span>
            <span className="action-deck-btn-sub">Пропустить ход</span>
          </button>
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
      <div className="player-actions-toolbar" style={{ gap: '6px', background: 'rgba(49, 10, 10, 0.95)', border: '1px solid #ef4444' }}>
        <div style={{ fontSize: '0.74rem', color: '#fecaca', fontWeight: 800, textAlign: 'center', width: '100%' }}>
          🚫 ОКНО ВЕТО: Применяется эффект «{pendingAction?.roleClaim || pendingAction?.name}»!
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', width: '100%' }}>
          {canVeto && (
            <button
              type="button"
              className="action-deck-btn btn-red"
              onClick={() => playInstant(human.id, 'Право вето', vetoIdx)}
              style={{ padding: '8px 16px', border: '2px solid #f87171', background: 'linear-gradient(135deg, #991b1b, #dc2626)' }}
            >
              <span className="action-deck-btn-title" style={{ color: '#fff', fontSize: '0.85rem' }}>
                🚫 НАЛОЖИТЬ ВЕТО! (0 ⚡)
              </span>
              <span className="action-deck-btn-sub" style={{ color: '#fee2e2' }}>
                Отменить действие и отправить в сброс
              </span>
            </button>
          )}

          <button
            type="button"
            className="action-deck-btn btn-blue"
            onClick={proceedAfterVetoWindow}
            style={{ padding: '8px 16px' }}
          >
            <span className="action-deck-btn-title" style={{ fontSize: '0.78rem' }}>
              ✨ Продолжить ➔
            </span>
            <span className="action-deck-btn-sub">
              Применить эффект
            </span>
          </button>
        </div>
      </div>
    );
  }

  // 4. DEFAULT IDLE ACTION BAR WITH 3-PHASE CONTROLS
  const isNormalPhase = turnSubPhase === 'NORMAL_ACTION_PHASE' && !hasUsedNormalActionThisTurn;

  return (
    <div className="player-actions-toolbar" style={{ gap: '6px' }}>
      {/* Subphase 2: Normal Action Button */}
      <button 
        className="action-deck-btn btn-blue"
        disabled={!isMyTurn || !hasTokens || !isNormalPhase}
        onClick={onOpenNormalActions}
        style={{ padding: '8px 10px', opacity: (isMyTurn && hasTokens && isNormalPhase) ? 1 : 0.4 }}
        title={isNormalPhase ? 'Открыть меню обычных действий (Пир, Содержание, Слух, Смена)' : 'Фаза обычных действий пропущена или уже использована'}
      >
        <span className="action-deck-btn-title" style={{ fontSize: '0.76rem' }}>
          🕊️ Обычное действие <span className="hotkey-badge">[1]</span>
        </span>
        <span className="action-deck-btn-sub">
          {isNormalPhase ? 'Пир, Слух, Смена, Деньги (1 ⚡)' : '⛔ Пропущено (1/ход)'}
        </span>
      </button>

      {/* Button to skip Normal Action and go directly to Cards */}
      {isMyTurn && isNormalPhase && (
        <button 
          className="action-deck-btn btn-gold"
          style={{ padding: '8px 10px' }}
          onClick={skipNormalActionPhase}
          title="Пропустить обычное действие и перейти сразу к розыгрышу карт из руки"
        >
          <span className="action-deck-btn-title" style={{ fontSize: '0.76rem' }}>
            ⏭️ К картам ➔
          </span>
          <span className="action-deck-btn-sub">
            Фаза 3: Роли / Интриги
          </span>
        </button>
      )}

      {/* Secret Conspiracy Activation Button in own turn (2, 3 or 4 charges) */}
      {isMyTurn && human.activePlot?.type === 'Тайный заговор' && (human.activePlot.charges ?? 0) >= 2 && (
        <button 
          type="button"
          className="action-deck-btn btn-gold"
          style={{ padding: '8px 12px', border: '2px solid #c084fc', background: 'linear-gradient(135deg, #581c87, #7e22ce)' }}
          onClick={() => useGameStore.getState().openConspiracyDialog(false)}
          title="Свершить Заговор (стоит 1 ⚡)"
        >
          <span className="action-deck-btn-title" style={{ color: '#f3e8ff', fontSize: '0.78rem' }}>
            ⚔️ Свершить Заговор ({human.activePlot.charges}/4)
          </span>
          <span className="action-deck-btn-sub" style={{ color: '#e9d5ff' }}>
            {human.activePlot.charges === 2 
              ? 'Сброс до 3 🪙 (1 ⚡)' 
              : human.activePlot.charges === 3 
                ? 'Лишить 1 👑 или 3 🪙 (1 ⚡)' 
                : '🛡️ Сброс или Корона без Вето! (1 ⚡)'}
          </span>
        </button>
      )}

      {/* End Turn Manually Button (Preserving remaining action tokens for defense) */}
      <button 
        className="action-deck-btn btn-red"
        style={{ padding: '8px 10px' }}
        disabled={!isMyTurn}
        onClick={endTurnManually}
        title="Завершить ход и сохранить оставшиеся жетоны действия для проверок на чужих ходах"
      >
        <span className="action-deck-btn-title" style={{ fontSize: '0.74rem' }}>
          ✋ {human.actionTokens > 0 ? `Завершить ход (${human.actionTokens} ⚡ в запас)` : 'Завершить ход'} <span className="hotkey-badge">[Пробел]</span>
        </span>
        <span className="action-deck-btn-sub">
          {human.actionTokens > 0 ? 'Сохранить на «НЕ ВЕРЮ!»' : 'Добор карт и передача'}
        </span>
      </button>
    </div>
  );
}

