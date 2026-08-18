import { useState } from 'react';
import { useGameStore } from '../engine/GameStore';
import { ALL_ROLES, ROLE_INFO } from '../engine/roles';
import type { Role } from '../engine/types';

interface CodexProps {
  onOpenRules: () => void;
  onRestart: () => void;
}

export function Codex({ onOpenRules, onRestart }: CodexProps) {
  const { deck, discardPile, players } = useGameStore();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showDiscardView, setShowDiscardView] = useState(false);

  const human = players.find(p => !p.isBot);

  // Count occurrences in discard pile for each role
  const discardCounts = ALL_ROLES.reduce((acc, role) => {
    acc[role] = discardPile.filter(r => r === role).length;
    return acc;
  }, {} as Record<Role, number>);

  return (
    <aside className="codex-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title cinzel-font">
          <span>📖</span>
          <span>СВОД РОЛЕЙ</span>
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
          <span>Всего в игре: 24 карты (8 ролей × 3)</span>
          <span style={{ color: '#93c5fd' }}>{showDiscardView ? 'Скрыть сброс ▲' : 'Счётчик карт ▼'}</span>
        </div>
      </div>

      {/* Discard Pile Detailed Counter (When toggled) */}
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
          {ALL_ROLES.map(role => {
            const count = discardCounts[role] || 0;
            return (
              <div 
                key={role}
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
                <span>{ROLE_INFO[role].badge} {role}:</span>
                <span style={{ fontWeight: 800, color: count === 3 ? '#ef4444' : count > 0 ? '#fbbf24' : '#94a3b8' }}>
                  {count} / 3 в сбросе
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* List of 8 Court Roles */}
      <div className="codex-roles-list">
        {ALL_ROLES.map(role => {
          const info = ROLE_INFO[role];
          const isHeldByHuman = human?.hand.includes(role);
          const isExpanded = selectedRole === role;
          const inDiscard = discardCounts[role] || 0;

          return (
            <div 
              key={role} 
              className="codex-role-card"
              style={{
                borderColor: isHeldByHuman ? 'rgba(74, 222, 128, 0.45)' : undefined,
                background: isHeldByHuman 
                  ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 23, 42, 0.7) 100%)' 
                  : undefined
              }}
              onClick={() => setSelectedRole(isExpanded ? null : role)}
            >
              <div className="codex-role-header">
                <div className="codex-role-name">
                  <span>{info.badge}</span>
                  <span>{info.name}</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {inDiscard > 0 && (
                    <span style={{ fontSize: '0.6rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '1px 4px', borderRadius: '4px' }}>
                      🗑️ {inDiscard}/3
                    </span>
                  )}
                  {info.cost > 0 && (
                    <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 'bold' }}>
                      {info.cost} 💰
                    </span>
                  )}
                  {isHeldByHuman && (
                    <span style={{ fontSize: '0.58rem', color: '#4ade80', background: 'rgba(34, 197, 94, 0.2)', padding: '1px 4px', borderRadius: '4px', border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                      В РУКЕ
                    </span>
                  )}
                </div>
              </div>

              <div className="codex-role-desc">
                {isExpanded ? info.fullDescription : info.shortDescription}
              </div>

              {info.blocksRole && (
                <div className="codex-role-counter" style={{ color: '#4ade80' }}>
                  🛡️ Блокирует роль: «{info.blocksRole}»
                </div>
              )}

              {info.blockableBy && (
                <div className="codex-role-counter" style={{ color: '#f87171' }}>
                  ⚠️ Блокируется: «{info.blockableBy}»
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer controls */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', gap: '8px' }}>
        <button 
          className="action-deck-btn btn-blue" 
          style={{ flex: 1, padding: '6px', fontSize: '0.72rem' }}
          onClick={onOpenRules}
        >
          📜 Регламент
        </button>
        <button 
          className="action-deck-btn btn-red" 
          style={{ flex: 1, padding: '6px', fontSize: '0.72rem' }}
          onClick={onRestart}
        >
          🔄 Новая игра
        </button>
      </div>
    </aside>
  );
}
