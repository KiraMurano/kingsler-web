import { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_INFO } from '../engine/cards';
import type { GameCard } from '../engine/types';

interface CodexProps {
  onOpenRules: () => void;
  onRestart?: () => void;
}

export function Codex({ onOpenRules }: CodexProps) {
  const { deck, discardPile, players } = useGameStore();
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'roles' | 'plots' | 'instants'>('all');
  const [showDiscardView, setShowDiscardView] = useState(false);

  const human = players.find(p => !p.isBot);

  const allCardsList: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

  // Count occurrences in discard pile
  const discardCounts = allCardsList.reduce((acc, card) => {
    acc[card] = discardPile.filter(r => r === card).length;
    return acc;
  }, {} as Record<GameCard, number>);

  const displayedCards = allCardsList.filter(c => {
    if (activeTab === 'roles') return ALL_ROLES.includes(c as any);
    if (activeTab === 'plots') return ALL_PLOTS.includes(c as any);
    if (activeTab === 'instants') return ALL_INSTANTS.includes(c as any);
    return true;
  });

  const getMaxCopies = (card: GameCard): number => {
    if (ALL_ROLES.includes(card as any)) return 3;
    if (card === 'Право вето') return 5;
    if (card === 'Тайный заговор') return 3;
    return 2;
  };

  const getTypeDescription = (card: GameCard): string => {
    const info = CARD_INFO[card];
    if (info.category === 'role') return '👑 Роль (3 копии)';
    if (card === 'Тайный заговор') return '🎴 Интрига (3 копии, 1 ⚡)';
    if (info.category === 'plot') return '🎴 Интрига (2 копии, 1 ⚡)';
    if (card === 'Право вето') return '⚡ Инстант (5 копий, 0 ⚡)';
    if (card === 'Перенаправление') return '⚡ Инстант (2 копии, 0 ⚡)';
    return '⚡ Инстант (2 копии, 1 ⚡)';
  };

  return (
    <aside className="codex-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title cinzel-font">
          <span>📖</span>
          <span>КОДЕКС КАРТ</span>
        </div>
        <button 
          className="nav-pill-btn" 
          onClick={onOpenRules}
          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
          title="Открыть полные правила"
        >
          Правила
        </button>
      </div>

      {/* Deck & Discard Tracker Strip */}
      <div className="codex-deck-tracker" style={{ flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="deck-info-pill">
            <span>🂠 Колода:</span>
            <span style={{ color: '#fff', fontSize: '0.88rem' }}>{deck.length}</span>
          </div>

          <button
            type="button"
            className="deck-info-pill"
            style={{ 
              background: showDiscardView ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              padding: '2px 8px',
              cursor: 'pointer'
            }}
            onClick={() => setShowDiscardView(!showDiscardView)}
            title="Нажмите, чтобы просмотреть карты в сбросе"
          >
            <span>🗑️ Сброс:</span>
            <span style={{ color: '#fca5a5', fontSize: '0.88rem' }}>{discardPile.length}</span>
          </button>
        </div>

        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>В игре: 44 карты (18 ролей, 13 интриг, 13 инстантов)</span>
          <span style={{ color: '#93c5fd' }}>{showDiscardView ? 'Скрыть ▲' : 'Счётчик ▼'}</span>
        </div>
      </div>

      {/* Tabs for Category filtering */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '2px', padding: '4px 8px', background: 'rgba(0,0,0,0.2)' }}>
        <button
          type="button"
          className="codex-filter-tab"
          style={{
            padding: '4px 2px',
            fontSize: '0.65rem',
            fontWeight: 800,
            background: activeTab === 'all' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
            border: activeTab === 'all' ? '1px solid #f59e0b' : '1px solid transparent',
            color: activeTab === 'all' ? '#fbbf24' : '#94a3b8',
            borderRadius: '4px'
          }}
          onClick={() => setActiveTab('all')}
        >
          Все (17)
        </button>
        <button
          type="button"
          className="codex-filter-tab"
          style={{
            padding: '4px 2px',
            fontSize: '0.65rem',
            fontWeight: 800,
            background: activeTab === 'roles' ? 'rgba(225, 29, 72, 0.25)' : 'transparent',
            border: activeTab === 'roles' ? '1px solid #fb7185' : '1px solid transparent',
            color: activeTab === 'roles' ? '#fda4af' : '#94a3b8',
            borderRadius: '4px'
          }}
          onClick={() => setActiveTab('roles')}
        >
          👑 Роли (6)
        </button>
        <button
          type="button"
          className="codex-filter-tab"
          style={{
            padding: '4px 2px',
            fontSize: '0.65rem',
            fontWeight: 800,
            background: activeTab === 'plots' ? 'rgba(202, 138, 4, 0.25)' : 'transparent',
            border: activeTab === 'plots' ? '1px solid #facc15' : '1px solid transparent',
            color: activeTab === 'plots' ? '#fde047' : '#94a3b8',
            borderRadius: '4px'
          }}
          onClick={() => setActiveTab('plots')}
        >
          🎴 Интриги (6)
        </button>
        <button
          type="button"
          className="codex-filter-tab"
          style={{
            padding: '4px 2px',
            fontSize: '0.65rem',
            fontWeight: 800,
            background: activeTab === 'instants' ? 'rgba(147, 51, 234, 0.25)' : 'transparent',
            border: activeTab === 'instants' ? '1px solid #c084fc' : '1px solid transparent',
            color: activeTab === 'instants' ? '#e9d5ff' : '#94a3b8',
            borderRadius: '4px'
          }}
          onClick={() => setActiveTab('instants')}
        >
          ⚡ Инстанты (5)
        </button>
      </div>

      {/* Discard Pile Detailed Counter */}
      {showDiscardView && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '8px 10px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px',
          maxHeight: '140px',
          overflowY: 'auto'
        }}>
          {allCardsList.map(card => {
            const count = discardCounts[card] || 0;
            const max = getMaxCopies(card);
            return (
              <div 
                key={card}
                style={{
                  fontSize: '0.68rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '2px 4px',
                  background: count > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '4px'
                }}
              >
                <span>{CARD_INFO[card].badge} {card}:</span>
                <span style={{ fontWeight: 800, color: count === max ? '#ef4444' : count > 0 ? '#fbbf24' : '#94a3b8' }}>
                  {count}/{max}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* List of Cards */}
      <div className="codex-roles-list">
        {displayedCards.map(card => {
          const info = CARD_INFO[card];
          const isHeldByHuman = human?.hand.includes(card);
          const isExpanded = selectedCard === card;
          const inDiscard = discardCounts[card] || 0;
          const maxCopies = getMaxCopies(card);

          return (
            <div 
              key={card} 
              className="codex-role-card"
              style={{
                borderColor: isHeldByHuman ? 'rgba(74, 222, 128, 0.45)' : undefined,
                background: isHeldByHuman 
                  ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 23, 42, 0.7) 100%)' 
                  : undefined
              }}
              onClick={() => setSelectedCard(isExpanded ? null : card)}
            >
              <div className="codex-role-header">
                <div className="codex-role-name">
                  <span>{info.badge}</span>
                  <span>{info.name}</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {inDiscard > 0 && (
                    <span style={{ fontSize: '0.6rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '1px 4px', borderRadius: '4px' }}>
                      🗑️ {inDiscard}/{maxCopies}
                    </span>
                  )}
                  {isHeldByHuman && (
                    <span className="held-badge">У вас</span>
                  )}
                </div>
              </div>

              <div className="codex-role-desc">
                {info.shortDescription}
              </div>

              {isExpanded && (
                <div className="codex-role-details">
                  <div style={{ color: 'var(--gold-light)', fontWeight: 800, marginBottom: '2px' }}>
                    {info.title}
                  </div>
                  <div>{info.fullDescription}</div>
                  <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '0.66rem' }}>
                    Тип: {getTypeDescription(card)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
