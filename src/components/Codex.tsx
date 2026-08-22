import React, { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { 
  ALL_ROLES, 
  ALL_PLOTS, 
  ALL_INSTANTS, 
  CARD_DESCRIPTIONS 
} from '../data/cardDescriptions';

import {
  getCardMaxCopies,
  TOTAL_ROLES_COUNT,
  TOTAL_PLOTS_COUNT,
  TOTAL_INSTANTS_COUNT,
  TOTAL_DECK_SIZE 
} from '../engine/cards';

import type { GameCard } from '../engine/types';
import { Sheet } from './ui/Sheet';
import { Tabs } from './ui/Tabs';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface CodexProps {
  open: boolean;
  onClose: () => void;
  onOpenRules?: () => void;
  onSelectCardToInspect: (card: GameCard) => void;
}

export const Codex: React.FC<CodexProps> = ({ 
  open, 
  onClose,
  onOpenRules,
  onSelectCardToInspect
}) => {
  const { deck, discardPile, players } = useGameStore();
  const [activeTab, setActiveTab] = useState<'all' | 'roles' | 'plots' | 'instants'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const human = players.find(p => !p.isBot);

  const allCardsList: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

  const displayedCards = allCardsList.filter(c => {
    if (activeTab === 'roles' && !ALL_ROLES.includes(c as any)) return false;
    if (activeTab === 'plots' && !ALL_PLOTS.includes(c as any)) return false;
    if (activeTab === 'instants' && !ALL_INSTANTS.includes(c as any)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const info = CARD_DESCRIPTIONS[c];
      return c.toLowerCase().includes(q) || info.shortDescription.toLowerCase().includes(q) || info.title.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      width="440px"
      title="📖 КОДЕКС КАРТ И КОЛОДА"
      description={`В игре ${TOTAL_DECK_SIZE} карт • ${TOTAL_ROLES_COUNT} ролей • ${TOTAL_PLOTS_COUNT} интриг • ${TOTAL_INSTANTS_COUNT} инстантов`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
        {/* Deck & Discard Tracker Strip */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.7)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Badge variant="sapphire" icon="🂠" size="md">
              Колода: {deck.length}
            </Badge>
            <Badge variant={discardPile.length > 0 ? 'ruby' : 'secondary'} icon="🗑️" size="md">
              Сброс: {discardPile.length}
            </Badge>
          </div>

          <div style={{ fontSize: '0.84rem', color: '#94a3b8', fontWeight: 600 }}>
            Всего: {TOTAL_DECK_SIZE}
          </div>
        </div>

        {/* Search Bar */}
        <input
          type="text"
          placeholder="🔍 Поиск карты по названию или свойству..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'rgba(10, 15, 29, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        />

        {/* Category Tabs */}
        <Tabs
          activeTab={activeTab}
          onChange={setActiveTab}
          size="sm"
          items={[
            { id: 'all', label: 'Все', count: allCardsList.length },
            { id: 'roles', label: '👑 Роли', count: ALL_ROLES.length },
            { id: 'plots', label: '🎴 Интриги', count: ALL_PLOTS.length },
            { id: 'instants', label: '⚡ Инстанты', count: ALL_INSTANTS.length }
          ]}
        />

        {/* Cards Grid / List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
          {displayedCards.map(card => {
            const info = CARD_DESCRIPTIONS[card];
            const isHeldByHuman = human?.hand.includes(card);
            const maxCopies = getCardMaxCopies(card);

            return (
              <div 
                key={card} 
                className="codex-role-card"
                style={{
                  borderColor: isHeldByHuman ? 'rgba(74, 222, 128, 0.5)' : undefined,
                  background: isHeldByHuman 
                    ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)' 
                    : undefined,
                  cursor: 'pointer'
                }}
                onClick={() => onSelectCardToInspect(card)}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {/* Miniature 2:3 card art */}
                  <div 
                    style={{
                      width: '46px',
                      aspectRatio: '2 / 3',
                      borderRadius: '6px',
                      border: `1.5px solid ${info.borderColor}`,
                      overflow: 'hidden',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6)'
                    }}
                  >
                    <img 
                      src={info.artImage} 
                      alt={info.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{info.badge}</span>
                        <span style={{ fontWeight: 800, color: 'var(--gold-light)', fontSize: '0.98rem' }}>
                          {info.name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {isHeldByHuman && (
                          <Badge variant="emerald" size="sm">В руке</Badge>
                        )}
                        <Badge variant="secondary" size="sm">В колоде: {maxCopies}</Badge>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.84rem', color: '#cbd5e1', lineHeight: 1.35 }}>
                      {info.shortDescription}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>


        {/* Footer */}
        {onOpenRules && (
          <div style={{ paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Button variant="ghost" size="sm" style={{ width: '100%' }} onClick={onOpenRules}>
              📖 Открыть полный свод правил игры
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
};
