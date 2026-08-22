import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../engine/GameStore';
import { Sheet } from './ui/Sheet';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface ChronicleProps {
  open: boolean;
  onClose: () => void;
  onOpenRules?: () => void;
}

export const Chronicle: React.FC<ChronicleProps> = ({ 
  open, 
  onClose,
  onOpenRules 
}) => {
  const { history, coronationCandidateId, players } = useGameStore();
  const feedRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'claims' | 'duels' | 'plots'>('all');

  // Auto scroll to top when new events appear
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [history]);

  const candidate = coronationCandidateId ? players.find(p => p.id === coronationCandidateId) : null;

  const filteredHistory = history.filter(entry => {
    if (filter === 'claims') return entry.includes('заявляет') || entry.includes('НЕ ВЕРЮ') || entry.includes('ПРАВДА') || entry.includes('БЛЕФ') || entry.includes('поймал');
    if (filter === 'duels') return entry.includes('ДУЭЛЬ') || entry.includes('дуэль') || entry.includes('щит') || entry.includes('ПРОБИТИЕ');
    if (filter === 'plots') return entry.includes('Интригу') || entry.includes('Заговор') || entry.includes('Приём') || entry.includes('Булла');
    return true;
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="left"
      width="400px"
      title="📜 ЛЕТОПИСЬ ДВОРА"
      description={
        candidate ? (
          <Badge variant="gold" icon="👑">Фаворит: {candidate.name}</Badge>
        ) : (
          <span>Хроника всех событий, споров и дуэлей</span>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '4px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            className={`chronicle-tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            type="button"
            className={`chronicle-tab-btn ${filter === 'claims' ? 'active' : ''}`}
            onClick={() => setFilter('claims')}
          >
            ⚔️ Споры
          </button>
          <button
            type="button"
            className={`chronicle-tab-btn ${filter === 'duels' ? 'active' : ''}`}
            onClick={() => setFilter('duels')}
          >
            🤺 Дуэли
          </button>
          <button
            type="button"
            className={`chronicle-tab-btn ${filter === 'plots' ? 'active' : ''}`}
            onClick={() => setFilter('plots')}
          >
            🎴 Интриги
          </button>
        </div>

        {/* Chronicle Log Feed */}
        <div className="chronicle-feed" ref={feedRef} style={{ flex: 1, overflowY: 'auto' }}>
          {filteredHistory.map((entry, idx) => {
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

            let icon = '📜';
            if (entry.includes('👑') || entry.includes('КОРОНАЦИЯ')) icon = '👑';
            else if (entry.includes('⚜️')) icon = '⚜️';
            else if (entry.includes('⚔️') || entry.includes('ДУЭЛЬ') || entry.includes('🤺')) icon = '⚔️';
            else if (entry.includes('🪙')) icon = '🪙';
            else if (entry.includes('🎭')) icon = '🎭';
            else if (entry.includes('👁️')) icon = '👁️';
            else if (entry.includes('🛡️')) icon = '🛡️';
            else if (entry.includes('🔄')) icon = '🔄';
            else if (entry.includes('🍷')) icon = '🍷';
            else if (entry.includes('🤡')) icon = '🤡';
            else if (entry.includes('🚫')) icon = '🚫';

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

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Badge variant="purple" icon="⚜️">2 печати = 1 корона 👑</Badge>
          {onOpenRules && (
            <Button variant="ghost" size="sm" onClick={onOpenRules}>
              📖 Правила
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
};
