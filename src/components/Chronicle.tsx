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
          <div className="chronicle-final-badge cinzel-font">
            👑 Фаворит: {candidate.name}
          </div>
        )}
      </div>

      {/* Chronicle Log Feed */}
      <div className="chronicle-feed" ref={feedRef}>
        {history.map((entry, idx) => {
          const isLatest = idx === 0;
          const isDanger = entry.includes('поймал') || entry.includes('ПОЗОР') || entry.includes('ОБА ПОПАЛИСЬ') || entry.includes('отменяется') || entry.includes('отступает');
          const isTruth = entry.includes('ПРАВДА') || entry.includes('действительно') || entry.includes('+1 👑') || entry.includes('+1 ⚜️') || entry.includes('КОРОНАЦИЯ') || entry.includes('трансформировались');
          const isFinal = entry.includes('ПОСЛЕДНЯЯ АУДИЕНЦИЯ') || entry.includes('ПОБЕДИТЕЛЬ') || entry.includes('НИЧЬЯ');
          const isDuel = entry.includes('ДУЭЛЬ') || entry.includes('вызов на дуэль') || entry.includes('ПРОБИТИЕ') || entry.includes('КОНТРАТАКА');
          const isAttack = entry.includes('атакует') || entry.includes('крадет') || entry.includes('Шантажирует') || entry.includes('забирает');

          let itemClass = 'chronicle-item';
          if (isLatest) itemClass += ' highlight-latest';
          if (isFinal) itemClass += ' final-event';
          else if (isDanger) itemClass += ' danger-event';
          else if (isTruth) itemClass += ' truth-event';
          else if (isDuel) itemClass += ' duel-event';
          else if (isAttack) itemClass += ' attack-event';

          // Extract icon or decorative flair
          let icon = '📜';
          if (entry.includes('👑') || entry.includes('КОРОНАЦИЯ') || entry.includes('АУДИЕНЦИЯ')) icon = '👑';
          else if (entry.includes('⚜️')) icon = '⚜️';
          else if (entry.includes('⚔️') || entry.includes('ДУЭЛЬ') || entry.includes('🤺')) icon = '⚔️';
          else if (entry.includes('💰')) icon = '💰';
          else if (entry.includes('🎭')) icon = '🎭';
          else if (entry.includes('👁️')) icon = '👁️';
          else if (entry.includes('🛡️')) icon = '🛡️';
          else if (entry.includes('🔄')) icon = '🔄';
          else if (entry.includes('🍷')) icon = '🍷';
          else if (entry.includes('🤡')) icon = '🤡';
          else if (entry.includes('🏳️')) icon = '🏳️';

          return (
            <div key={idx} className={itemClass}>
              <div className="chronicle-item-icon">{icon}</div>
              <div className="chronicle-item-content">
                <span className="chronicle-text">{entry}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="chronicle-footer">
        <div className="chronicle-footer-content">
          <span className="chronicle-ratio-pill cinzel-font">2 ⚜️ = 1 👑</span>
          <button 
            type="button" 
            className="chronicle-help-btn"
            onClick={onOpenRules}
          >
            <span>📖 Свод законов</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
