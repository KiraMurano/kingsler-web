import { useEffect, useRef } from 'react';
import { useGameStore } from '../engine/GameStore';

interface ChronicleProps {
  onOpenRules?: () => void;
}

export function Chronicle({ onOpenRules }: ChronicleProps) {
  const { history, coronationCandidateId, players } = useGameStore();
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest event
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [history]);

  const candidate = coronationCandidateId ? players.find(p => p.id === coronationCandidateId) : null;

  return (
    <aside className="chronicle-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title cinzel-font">
          <span>📜</span>
          <span>ЛЕТОПИСЬ ДВОРА</span>
        </div>
        {candidate && (
          <div style={{ fontSize: '0.68rem', color: '#fef08a', background: 'rgba(245, 158, 11, 0.2)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            👑 Фаворит: {candidate.name}
          </div>
        )}
      </div>

      {/* Chronicle Log Feed */}
      <div className="chronicle-feed" ref={feedRef}>
        {history.map((entry, idx) => {
          const isLatest = idx === 0;
          const isDanger = entry.includes('поймал') || entry.includes('потеря') || entry.includes('теряет') || entry.includes('ПОЗОР') || entry.includes('изгнан') || entry.includes('атакует') || entry.includes('отнимает') || entry.includes('крадёт');
          const isTruth = entry.includes('ПРАВДА') || entry.includes('действительно') || entry.includes('сохранил') || entry.includes('получает +1 👑') || entry.includes('КОРОНАЦИЯ');
          const isDuel = entry.includes('ДУЭЛЬ') || entry.includes('вызов на дуэль') || entry.includes('ОТРАЖЕН');

          let customClass = '';
          if (isLatest) customClass += ' highlight-latest';
          if (isDanger) customClass += ' danger-event';
          else if (isTruth) customClass += ' truth-event';
          else if (isDuel) customClass += ' duel-event';

          // Extract icon or decorative flair
          let icon = '•';
          if (entry.includes('👑')) icon = '👑';
          else if (entry.includes('⚔️') || entry.includes('ДУЭЛЬ')) icon = '⚔️';
          else if (entry.includes('💰')) icon = '💰';
          else if (entry.includes('🎭')) icon = '🎭';
          else if (entry.includes('👁️')) icon = '👁️';
          else if (entry.includes('🛡️')) icon = '🛡️';
          else if (entry.includes('🔄')) icon = '🔄';
          else if (entry.includes('🍷')) icon = '🍷';
          else if (entry.includes('📜')) icon = '📜';

          return (
            <div key={idx} className={`chronicle-item ${customClass}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{icon}</span>
                <span style={{ flex: 1 }}>{entry}</span>
              </div>
            </div>
          );
        })}

        {history.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', marginTop: '20px' }}>
            Летопись пуста. Партия начинается...
          </div>
        )}
      </div>

      {/* Footer quick action */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Записей: {history.length}</span>
        {onOpenRules && (
          <button 
            type="button"
            onClick={onOpenRules}
            style={{ background: 'transparent', border: 'none', color: 'var(--gold-light)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Справка по терминам
          </button>
        )}
      </div>
    </aside>
  );
}
