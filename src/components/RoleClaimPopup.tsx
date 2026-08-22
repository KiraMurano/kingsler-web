import React, { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, CARD_DESCRIPTIONS, isPlot, isInstant } from '../data/cardDescriptions';
import type { PlotType, InstantType } from '../engine/types';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface RoleClaimPopupProps {
  stakedCardIndex: number;
  initialWithVaBanque?: boolean;
  onClose: () => void;
}

export const RoleClaimPopup: React.FC<RoleClaimPopupProps> = ({ 
  stakedCardIndex, 
  initialWithVaBanque = false, 
  onClose 
}) => {
  const { players, performAction, playPlotAction, playInstant, hasPlayedPlotThisTurn, hasPlayedRoleThisTurn } = useGameStore();
  const human = players.find(p => !p.isBot);

  const hasVaBanqueInHand = !!human?.hand.includes('Ва-банк');
  const canUseVaBanque = hasVaBanqueInHand && (human?.actionTokens ?? 0) >= 1 && !hasPlayedRoleThisTurn;

  const [withVaBanque, setWithVaBanque] = useState(initialWithVaBanque && canUseVaBanque);

  if (!human) return null;

  const activeStakedCard = human.hand[stakedCardIndex] || human.hand[0];
  const activeCardInfo = CARD_DESCRIPTIONS[activeStakedCard];
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
          boxShadow: withVaBanque ? '0 0 30px rgba(192, 132, 252, 0.45)' : undefined 
        } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {/* Header Strip */}
        <div className="role-popup-header">
          <div>
            <div className="role-popup-title cinzel-font" style={{ fontSize: '1.25rem' }}>
              {withVaBanque ? '🎲 Розыгрыш роли с ВА-БАНКОМ' : 'Розыгрыш или блеф картой'}
            </div>
            <div className="role-popup-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
              <span>Карта #{stakedCardIndex + 1}:</span>
              <strong style={{ color: 'var(--gold-light)' }}>{activeCardInfo?.badge} {activeStakedCard}</strong>
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
          <div 
            style={{ 
              marginBottom: '10px', 
              padding: '10px 14px', 
              background: withVaBanque ? 'rgba(147, 51, 234, 0.3)' : 'rgba(30, 27, 75, 0.5)', 
              border: withVaBanque ? '1.5px solid #e879f9' : '1px dashed #a855f7', 
              borderRadius: '10px' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: withVaBanque ? '#f5d0fe' : '#d8b4fe', fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🎲 Сыграть с ВА-БАНКОМ</span>
                  {withVaBanque && <Badge variant="purple" size="sm">АКТИВЕН x2 • 1 ⚡</Badge>}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e9d5ff', marginTop: '2px' }}>
                  При проверке: x2 эффект роли. При блефе: +2 ⚜️ ловцу. Без проверки: обычный x1.
                </div>
              </div>
              <Button
                variant={withVaBanque ? 'red' : 'gold'}
                size="sm"
                disabled={!canUseVaBanque && !withVaBanque}
                onClick={() => setWithVaBanque(!withVaBanque)}
                title={human.actionTokens < 1 ? 'Требуется 1 ⚡ жетон' : ''}
              >
                {withVaBanque ? 'Отключить' : 'Включить x2'}
              </Button>
            </div>
          </div>
        )}

        {/* Direct Action Option if the card is a Plot or Instant */}
        {!withVaBanque && isPlotCard && (
          <div 
            style={{ 
              marginBottom: '10px', 
              padding: '10px 14px', 
              background: hasPlayedPlotThisTurn ? 'rgba(100, 116, 139, 0.2)' : 'rgba(202, 138, 4, 0.2)', 
              border: hasPlayedPlotThisTurn ? '1px solid #64748b' : '1px solid #eab308', 
              borderRadius: '10px', 
              opacity: (hasPlayedPlotThisTurn || human.actionTokens < 1) ? 0.5 : 1 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: hasPlayedPlotThisTurn ? '#94a3b8' : '#facc15', fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🎴 Сыграть открыто как Интригу</span>
                  <Badge variant="amber" size="sm">1 ⚡</Badge>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#fef08a', marginTop: '2px' }}>
                  {hasPlayedPlotThisTurn ? 'Лимит: 1 Интрига за ход уже сыграна' : activeCardInfo?.shortDescription}
                </div>
              </div>
              <Button
                variant="gold"
                size="sm"
                disabled={hasPlayedPlotThisTurn || human.actionTokens < 1}
                onClick={handlePlayDirectPlot}
              >
                Выложить на стол
              </Button>
            </div>
          </div>
        )}

        {!withVaBanque && isInstantCard && activeStakedCard !== 'Ва-банк' && (
          <div 
            style={{ 
              marginBottom: '10px', 
              padding: '10px 14px', 
              background: 'rgba(147, 51, 234, 0.2)', 
              border: '1px solid #c084fc', 
              borderRadius: '10px', 
              opacity: human.actionTokens < 1 ? 0.5 : 1 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#e9d5ff', fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚡ {activeStakedCard === 'Шпион' || activeStakedCard === 'Дворцовый переполох' || activeStakedCard === 'Обвинение в измене' ? 'Сыграть открыто как Инстант' : 'Реактивный инстант'}</span>
                  <Badge variant="purple" size="sm">
                    {activeStakedCard === 'Право вето' || activeStakedCard === 'Перенаправление' ? '0 ⚡' : '1 ⚡'}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#d8b4fe', marginTop: '2px' }}>
                  {activeCardInfo?.shortDescription}
                </div>
              </div>
              {(activeStakedCard === 'Шпион' || activeStakedCard === 'Дворцовый переполох' || activeStakedCard === 'Обвинение в измене') && (
                <Button
                  variant="blue"
                  size="sm"
                  disabled={human.actionTokens < 1}
                  onClick={handlePlayDirectInstant}
                >
                  Сыграть
                </Button>
              )}
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.86rem', color: hasPlayedRoleThisTurn ? '#f87171' : 'rgba(255,255,255,0.85)', fontWeight: 700, marginBottom: '8px' }}>
          {hasPlayedRoleThisTurn 
            ? '⛔ Лимит: 1 действие Роли за ход уже выполнено' 
            : withVaBanque
              ? 'Выберите заявляемую Роль для розыгрыша под Ва-банком (1 ⚡):'
              : 'Или положите взакрытую и заявите любую Роль двора (1 ⚡):'}
        </div>

        {/* 3x2 Grid of Roles */}
        <div className="roles-grid-desktop" style={{ gap: '8px' }}>
          {ALL_ROLES.map(role => {
            const info = CARD_DESCRIPTIONS[role];
            const canAfford = human.gold >= info.cost && hasTokens && !hasPlayedRoleThisTurn;
            const isTrueCard = role === activeStakedCard;

            return (
              <button
                key={role}
                className={`role-select-card-desktop ${isTrueCard ? 'is-truth-role' : ''}`}
                disabled={!canAfford}
                style={{
                  padding: '10px 14px',
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
                    <span style={{ fontSize: '1.35rem' }}>{info.badge}</span>
                    <span style={{ fontWeight: 800, color: isTrueCard ? '#4ade80' : 'var(--gold-light)', fontSize: '0.98rem' }}>
                      {role}
                    </span>
                  </div>
                  {isTrueCard ? (
                    <Badge variant="emerald" size="sm">ПРАВДА</Badge>
                  ) : (
                    <Badge variant="amber" size="sm">БЛЕФ</Badge>
                  )}
                </div>

                <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', marginTop: '4px', lineHeight: 1.3 }}>
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
};
