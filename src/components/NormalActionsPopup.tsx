import React from 'react';
import { useGameStore } from '../engine/GameStore';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface NormalActionsPopupProps {
  onClose: () => void;
}

export const NormalActionsPopup: React.FC<NormalActionsPopupProps> = ({ onClose }) => {
  const { players, performAction } = useGameStore();
  const human = players.find(p => !p.isBot);

  if (!human) return null;

  const hasTokens = human.actionTokens >= 1;

  return (
    <>
      <div className="popup-click-outside-backdrop" onClick={onClose} />

      <div 
        className="normal-actions-popup-desktop"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Strip */}
        <div className="role-popup-header">
          <div>
            <div className="role-popup-title cinzel-font" style={{ fontSize: '1.25rem' }}>
              Обычные действия двора
            </div>
            <div className="role-popup-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.86rem' }}>
              <Badge variant="sapphire" size="sm" icon="⚡">1 жетон</Badge>
              <span>Доступны всегда, их невозможно оспорить или заблокировать</span>
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

        {/* List of Normal Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
          {/* 1. Income */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '10px 14px' }}
            disabled={!hasTokens}
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '🪙 Просить содержание',
                actorId: human.id,
                costGold: 0,
                costTokens: 1,
                description: 'Получает 1 🪙 из казны.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '1.02rem' }}>🪙 Просить содержание</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge variant="sapphire" size="sm">1 ⚡</Badge>
                <Badge variant="emerald" size="sm">0 🪙</Badge>
              </div>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '2px' }}>
              Получите +1 🪙 золотой в личную казну напрямую из запаса.
            </div>
          </button>

          {/* 2. Feast */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '10px 14px' }}
            disabled={!hasTokens || human.gold < 3 || human.favor >= 5}
            onClick={() => {
              onClose();
              performAction({
                type: 'normal',
                name: '🍷 Устроить пир',
                actorId: human.id,
                costGold: 3,
                costTokens: 1,
                description: 'Платит 3 🪙 и получает +1 👑.'
              });
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '1.02rem' }}>🍷 Устроить пир</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge variant="sapphire" size="sm">1 ⚡</Badge>
                <Badge variant={human.favor >= 5 ? 'destructive' : 'gold'} size="sm">
                  {human.favor >= 5 ? 'Лимит 5 👑' : '3 🪙'}
                </Badge>
              </div>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '2px' }}>
              Заплатите 3 🪙 → получите +1 👑 (до 5 👑 максимум, 6-я победная только за действия и споры).
            </div>
          </button>

          {/* 3. Rumor */}
          <button 
            type="button"
            className="role-select-card-desktop"
            style={{ padding: '10px 14px' }}
            disabled={!hasTokens || human.gold < 5}
            onClick={() => {
              onClose();
              setTimeout(() => {
                (window as any).__startTargeting({
                  type: 'normal',
                  name: '📜 Распустить слух',
                  cost: 5,
                  description: 'Заплатил 5 🪙: выбранный игрок теряет -1 👑.'
                });
              }, 50);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '1.02rem' }}>📜 Распустить слух</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge variant="sapphire" size="sm">1 ⚡</Badge>
                <Badge variant="amber" size="sm">5 🪙</Badge>
              </div>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#cbd5e1', marginTop: '2px' }}>
              Заплатите 5 🪙 → выбранный соперник теряет -1 👑. Срывает Королевский приём и коронацию!
            </div>
          </button>

          {/* 4. Swap 1 or 2 Cards */}
          <div className="role-select-card-desktop" style={{ cursor: 'default', background: 'rgba(15, 23, 42, 0.85)', padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '1.02rem' }}>🔄 Сменить карты</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge variant="sapphire" size="sm">1 ⚡</Badge>
                <Badge variant="emerald" size="sm">Бесплатно</Badge>
              </div>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '8px' }}>
              Сбросьте 1 или 2 карты из руки на выбор и немедленно возьмите новые из колоды:
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: human.hand.length >= 2 ? '1fr 1fr' : '1fr', gap: '6px', marginBottom: human.hand.length >= 2 ? '6px' : '0' }}>
              {human.hand.map((cardRole, idx) => (
                <Button
                  key={idx}
                  variant="blue"
                  size="sm"
                  disabled={!hasTokens}
                  style={{ padding: '8px 10px', height: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  onClick={() => {
                    onClose();
                    performAction({
                      type: 'normal',
                      name: '🔄 Сменить карту',
                      stakedCardIndex: idx,
                      stakedCardIndices: [idx],
                      actorId: human.id,
                      costGold: 0,
                      costTokens: 1,
                      description: `Сбросил карту #${idx + 1} («${cardRole}») и бесплатно взял новую.`
                    });
                  }}
                >
                  <span style={{ fontSize: '0.74rem', color: '#93c5fd' }}>Сбросить только #{idx + 1}:</span>
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff' }}>{CARD_DESCRIPTIONS[cardRole]?.badge} {cardRole}</span>
                </Button>
              ))}
            </div>

            {human.hand.length >= 2 && (
              <Button
                variant="gold"
                size="sm"
                disabled={!hasTokens}
                style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}
                onClick={() => {
                  onClose();
                  performAction({
                    type: 'normal',
                    name: '🔄 Сменить 2 карты',
                    stakedCardIndices: [0, 1],
                    actorId: human.id,
                    costGold: 0,
                    costTokens: 1,
                    description: `Сбросил обе карты («${human.hand[0]}», «${human.hand[1]}») и бесплатно взял 2 новые.`
                  });
                }}
              >
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff' }}>🔄 Сменить обе карты</span>
                <Badge variant="gold" size="sm">2 новые карты 🂠🂠</Badge>
              </Button>
            )}
          </div>
        </div>

      </div>
    </>
  );
};
