import { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, CARD_INFO, isPlot, isInstant } from '../engine/cards';
import type { PlotType, InstantType } from '../engine/types';

interface RoleClaimPopupProps {
  stakedCardIndex: number;
  initialWithVaBanque?: boolean;
  onClose: () => void;
}

export function RoleClaimPopup({ stakedCardIndex, initialWithVaBanque = false, onClose }: RoleClaimPopupProps) {
  const { players, performAction, playPlotAction, playInstant, hasPlayedPlotThisTurn, hasPlayedRoleThisTurn } = useGameStore();
  const human = players.find(p => !p.isBot);

  const hasVaBanqueInHand = !!human?.hand.includes('Ва-банк');
  const canUseVaBanque = hasVaBanqueInHand && (human?.actionTokens ?? 0) >= 1 && !hasPlayedRoleThisTurn;

  const [withVaBanque, setWithVaBanque] = useState(initialWithVaBanque && canUseVaBanque);

  if (!human) return null;

  const activeStakedCard = human.hand[stakedCardIndex] || human.hand[0];
  const activeCardInfo = CARD_INFO[activeStakedCard];
  const isPlotCard = isPlot(activeStakedCard);
  const isInstantCard = isInstant(activeStakedCard);

  const requiredTokens = 1;
  const hasTokens = human.actionTokens >= 1;

  // Arrow position pointing directly at the staked card in hand
  const arrowPosition = stakedCardIndex === 0 ? '28%' : '72%';

  const handlePlayDirectPlot = () => {
    if (human.actionTokens < 1 || hasPlayedPlotThisTurn) return;
    onClose();
    if (activeStakedCard === 'Досье') {
      setTimeout(() => {
        (window as any).__startTargeting({
          type: 'plot',
          name: 'Досье',
          cost: 0,
          isPlotDirect: true,
          plotType: 'Досье',
          stakedCardIndex
        });
      }, 50);
    } else {
      playPlotAction(activeStakedCard as PlotType, stakedCardIndex);
    }
  };

  const handlePlayDirectInstant = () => {
    if (human.actionTokens < 1) return;
    onClose();
    if (activeStakedCard === 'Дворцовый переполох' || activeStakedCard === 'Перенаправление' || activeStakedCard === 'Шпион' || activeStakedCard === 'Обвинение в измене') {
      setTimeout(() => {
        (window as any).__startTargeting({
          type: 'instant',
          name: activeStakedCard,
          cost: 0,
          isInstantDirect: true,
          instantType: activeStakedCard as InstantType,
          stakedCardIndex
        });
      }, 50);
    } else {
      playInstant(human.id, activeStakedCard as InstantType, stakedCardIndex);
    }
  };

  return (
    <>
      <div className="popup-click-outside-backdrop" onClick={onClose} />

      <div 
        className="role-claim-popup-desktop"
        style={{ 
          '--arrow-left': arrowPosition,
          border: withVaBanque ? '2px solid #c084fc' : undefined,
          boxShadow: withVaBanque ? '0 0 25px rgba(192, 132, 252, 0.4)' : undefined 
        } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {/* Header Strip */}
        <div className="role-popup-header">
          <div>
            <div className="role-popup-title cinzel-font">
              {withVaBanque ? '🎲 Розыгрыш роли с ВА-БАНКОМ (x2)' : 'Розыгрыш или блеф картой'}
            </div>
            <div className="role-popup-subtitle">
              Карта #{stakedCardIndex + 1}: <strong style={{ color: 'var(--gold-light)' }}>{activeCardInfo?.badge} {activeStakedCard}</strong>
            </div>
          </div>

          <button 
            type="button"
            className="role-popup-close-btn"
            onClick={onClose}
            title="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Va-banque Combo Toggle if player holds Va-banque in hand */}
        {hasVaBanqueInHand && !hasPlayedRoleThisTurn && (
          <div style={{ marginBottom: '10px', padding: '6px 10px', background: withVaBanque ? 'rgba(147, 51, 234, 0.35)' : 'rgba(30, 27, 75, 0.5)', border: withVaBanque ? '2px solid #e879f9' : '1px dashed #a855f7', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: withVaBanque ? '#f5d0fe' : '#d8b4fe', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🎲 Сыграть с ВА-БАНКОМ</span>
                  {withVaBanque && <span style={{ fontSize: '0.65rem', background: '#9333ea', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>АКТИВЕН x2 (1 ⚡)</span>}
                </div>
                <div style={{ fontSize: '0.66rem', color: '#e9d5ff' }}>
                  При проверке: x2 эффект роли (+2 👑/+6 🪙/+4 🪙/кража x2, Шут: +4 🪙 и +1 👑; печати отменяются). При блефе: +2 ⚜️ ловцу. Без проверки: x1.
                </div>
              </div>
              <button
                type="button"
                className={`action-deck-btn ${withVaBanque ? 'btn-red' : 'btn-gold'}`}
                style={{ padding: '5px 12px', fontSize: '0.74rem', whiteSpace: 'nowrap' }}
                disabled={!canUseVaBanque && !withVaBanque}
                onClick={() => setWithVaBanque(!withVaBanque)}
                title={human.actionTokens < 1 ? 'Требуется 1 ⚡ жетон' : ''}
              >
                {withVaBanque ? 'Отключить' : 'Включить (модификатор)'}
              </button>
            </div>
          </div>
        )}

        {/* Direct Action Option if the card is a Plot or Instant */}
        {!withVaBanque && isPlotCard && (
          <div style={{ marginBottom: '10px', padding: '6px 10px', background: hasPlayedPlotThisTurn ? 'rgba(100, 116, 139, 0.2)' : 'rgba(202, 138, 4, 0.2)', border: hasPlayedPlotThisTurn ? '1px solid #64748b' : '1px solid #eab308', borderRadius: '8px', opacity: (hasPlayedPlotThisTurn || human.actionTokens < 1) ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: hasPlayedPlotThisTurn ? '#94a3b8' : '#facc15', fontSize: '0.82rem' }}>
                  🎴 Сыграть открыто как Интригу (1 ⚡)
                </div>
                <div style={{ fontSize: '0.68rem', color: '#fef08a' }}>
                  {hasPlayedPlotThisTurn ? 'Лимит: 1 Интрига за ход уже сыграна' : activeCardInfo?.shortDescription}
                </div>
              </div>
              <button
                type="button"
                className="action-deck-btn btn-gold"
                style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                disabled={hasPlayedPlotThisTurn || human.actionTokens < 1}
                onClick={handlePlayDirectPlot}
              >
                Выложить
              </button>
            </div>
          </div>
        )}

        {!withVaBanque && isInstantCard && activeStakedCard !== 'Ва-банк' && (
          <div style={{ marginBottom: '10px', padding: '6px 10px', background: 'rgba(147, 51, 234, 0.2)', border: '1px solid #c084fc', borderRadius: '8px', opacity: human.actionTokens < 1 ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#e9d5ff', fontSize: '0.82rem' }}>
                  {activeStakedCard === 'Шпион' || activeStakedCard === 'Дворцовый переполох' || activeStakedCard === 'Обвинение в измене'
                    ? '⚡ Сыграть открыто как Инстант (1 ⚡)'
                    : '⚡ Реактивный инстант (для защиты в чужой ход)'}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#d8b4fe' }}>
                  {activeCardInfo?.shortDescription}
                </div>
              </div>
              {(activeStakedCard === 'Шпион' || activeStakedCard === 'Дворцовый переполох' || activeStakedCard === 'Обвинение в измене') && (
                <button
                  type="button"
                  className="action-deck-btn btn-blue"
                  style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                  disabled={human.actionTokens < 1}
                  onClick={handlePlayDirectInstant}
                >
                  Сыграть
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.72rem', color: hasPlayedRoleThisTurn ? '#f87171' : 'rgba(255,255,255,0.7)', fontWeight: 700, marginBottom: '6px' }}>
          {hasPlayedRoleThisTurn 
            ? '⛔ Лимит: 1 действие Роли за ход уже выполнено.' 
            : withVaBanque
              ? 'Выберите заявляемую Роль для розыгрыша под Ва-банком (1 ⚡):'
              : 'Или положите взакрытую и заявите любую Роль двора (1 ⚡):'}
        </div>

        {/* 4x2 Grid of Roles */}
        <div className="roles-grid-desktop" style={{ gap: '8px' }}>
          {ALL_ROLES.map(role => {
            const info = CARD_INFO[role];
            const canAfford = human.gold >= info.cost && hasTokens && !hasPlayedRoleThisTurn;
            const isTrueCard = role === activeStakedCard;

            return (
              <button
                key={role}
                className={`role-select-card-desktop ${isTrueCard ? 'is-truth-role' : ''}`}
                disabled={!canAfford}
                style={{
                  padding: '8px 10px',
                  borderColor: isTrueCard ? 'rgba(74, 222, 128, 0.85)' : undefined,
                  background: isTrueCard 
                    ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.2) 0%, rgba(15, 23, 42, 0.95) 100%)' 
                    : undefined,
                  boxShadow: isTrueCard ? '0 0 16px rgba(34, 197, 94, 0.3)' : undefined
                }}
                onClick={() => {
                  onClose();
                  if (info.targeted) {
                    setTimeout(() => {
                      (window as any).__startTargeting({
                        type: 'role',
                        name: role,
                        roleClaim: role,
                        stakedCardIndex,
                        withVaBanque,
                        cost: info.cost
                      });
                    }, 50);
                  } else {
                    performAction({
                      type: 'role',
                      name: role,
                      roleClaim: role,
                      stakedCardIndex,
                      actorId: human.id,
                      withVaBanque,
                      costGold: info.cost,
                      costTokens: requiredTokens,
                      description: info.fullDescription
                    });
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.25rem' }}>{info.badge}</span>
                    <span style={{ fontWeight: 800, color: isTrueCard ? '#4ade80' : 'var(--gold-light)', fontSize: '0.85rem' }}>
                      {role}
                    </span>
                  </div>
                  {isTrueCard ? (
                    <span style={{ fontSize: '0.62rem', color: '#4ade80', fontWeight: 800 }}>✨ ПРАВДА</span>
                  ) : (
                    <span style={{ fontSize: '0.62rem', color: '#f59e0b', fontWeight: 700 }}>🎭 БЛЕФ</span>
                  )}
                </div>

                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px', lineHeight: 1.25 }}>
                  {withVaBanque 
                    ? (role === 'Наследник' ? '👑 +2 👑 при проверке (без печатей)!' :
                       role === 'Казначей' ? '🪙 +6 🪙 при проверке (без печатей)!' :
                       role === 'Рыцарь' ? '🪙 +4 🪙 при проверке (без печатей)!' :
                       role === 'Шут' ? '🎭 +4 🪙 и +1 👑 при проверке!' :
                       role === 'Вор' ? '🪙 Крадет до 4 🪙 при проверке!' :
                       '🗡️ Крадет 2 👑 при проверке!')
                    : info.shortDescription}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
