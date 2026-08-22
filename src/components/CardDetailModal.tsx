import React from 'react';
import { CARD_DESCRIPTIONS, type GameCard } from '../data/cardDescriptions';

import { Dialog } from './ui/Dialog';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export interface CardDetailModalProps {
  card: GameCard | null;
  onClose: () => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  onClose
}) => {
  if (!card) return null;

  const info = CARD_DESCRIPTIONS[card];
  if (!info) return null;

  const maxCopies = info.copiesCount;

  const getCategoryBadge = () => {
    switch (info.category) {
      case 'role':
        return <Badge variant="ruby" icon="👑">Роль</Badge>;
      case 'plot':
        return <Badge variant="amber" icon="🎴">Интрига</Badge>;
      case 'instant':
        return <Badge variant="purple" icon="⚡">Инстант</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={!!card}
      onClose={onClose}
      maxWidth="620px"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.4rem' }}>{info.badge}</span>
          <span>{info.name}</span>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>• {info.title}</span>
        </div>
      }
      description={
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          {getCategoryBadge()}
          <Badge variant="secondary" icon="🂠">В колоде: {maxCopies}</Badge>
          {info.cost > 0 && (
            <Badge variant="gold" icon="🪙">{info.cost} монет</Badge>
          )}
          {info.category === 'instant' && (
            <Badge variant={card === 'Право вето' || card === 'Перенаправление' ? 'emerald' : 'sapphire'}>
              {card === 'Право вето' || card === 'Перенаправление' ? '0 ⚡ Бесплатно' : '1 ⚡ Жетон'}
            </Badge>
          )}
        </div>
      }
    >
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: '170px 1fr',
          gap: '18px',
          alignItems: 'start'
        }}
      >
        {/* Left Column: 2:3 Aspect Ratio Card Artwork */}
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <div 
            style={{
              width: '170px',
              aspectRatio: '2 / 3',
              borderRadius: '12px',
              border: `2px solid ${info.borderColor || '#fbbf24'}`,
              overflow: 'hidden',
              boxShadow: `0 8px 30px rgba(0,0,0,0.9), 0 0 25px ${info.themeColor}55`,
              background: '#090d16',
              position: 'relative'
            }}
          >
            <img 
              src={info.artImage} 
              alt={info.name} 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }} 
            />
          </div>

          {/* Copies in Deck Chip */}
          <div 
            style={{
              fontSize: '0.88rem',
              color: '#94a3b8',
              textAlign: 'center',
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '6px'
            }}
          >
            <span>В колоде:</span>
            <strong style={{ color: '#fef08a' }}>{maxCopies} шт.</strong>
          </div>
        </div>


        {/* Right Column: Full Rules Description, Lore & Strategy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Quick Summary Pill */}
          <div 
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fef08a',
              fontSize: '0.94rem',
              fontWeight: 700,
              lineHeight: 1.4
            }}
          >
            {info.shortDescription}
          </div>

          {/* Full Rules */}
          <div>
            <div 
              style={{
                fontSize: '0.84rem',
                fontWeight: 800,
                color: '#cbd5e1',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px'
              }}
            >
              📜 Правило карты:
            </div>
            <div 
              style={{
                fontSize: '0.92rem',
                color: '#f1f5f9',
                lineHeight: 1.55,
                whiteSpace: 'pre-line',
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
            >
              {info.fullDescription}
            </div>
          </div>

          {/* Counters & Interactions */}
          {(info.blocksRole || info.blockableBy || info.targeted) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {info.blocksRole && (
                <Badge variant="emerald" icon="🛡️">
                  Блокирует: {info.blocksRole}
                </Badge>
              )}
              {info.blockableBy && (
                <Badge variant="ruby" icon="⚔️">
                  Блокируется: {info.blockableBy}
                </Badge>
              )}
              {info.targeted && (
                <Badge variant="sapphire" icon="🎯">
                  Целевое действие
                </Badge>
              )}
            </div>
          )}

          {/* Strategy Tip */}
          {info.strategyTip && (
            <div>
              <div 
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  color: '#fbbf24',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px'
                }}
              >
                💡 Тактический совет:
              </div>
              <div 
                style={{
                  fontSize: '0.88rem',
                  color: '#cbd5e1',
                  lineHeight: 1.45,
                  padding: '8px 12px',
                  background: 'rgba(251, 191, 36, 0.06)',
                  borderRadius: '6px',
                  borderLeft: '3px solid #fbbf24'
                }}
              >
                {info.strategyTip}
              </div>
            </div>
          )}

          {/* Lore Quote */}
          {info.loreQuote && (
            <div 
              style={{
                fontSize: '0.86rem',
                fontStyle: 'italic',
                color: '#94a3b8',
                lineHeight: 1.45,
                marginTop: '2px'
              }}
            >
              {info.loreQuote}
            </div>
          )}
        </div>

      </div>

      {/* Footer Close Button */}
      <div 
        style={{
          marginTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '12px',
          display: 'flex',
          justifyContent: 'flex-end'
        }}
      >
        <Button variant="gold" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Dialog>
  );
};
