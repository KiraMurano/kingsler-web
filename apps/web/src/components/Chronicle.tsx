import React, { useMemo, useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { courtly } from '../lib/text';
import { Sheet } from './ui/Overlay';
import { Tabs } from './ui/Tabs';
import { UiIcon, renderWithIcons } from './ui/Icon';

type ChronicleFilter = 'all' | 'claims' | 'duels' | 'plots';

const MATCHERS: Record<Exclude<ChronicleFilter, 'all'>, string[]> = {
  claims: ['заявляет', 'НЕ ВЕРЮ', 'ПРАВДА', 'БЛЕФ', 'поймал'],
  duels: ['ДУЭЛЬ', 'дуэль', 'щит', 'ПРОБИТИЕ'],
  plots: ['Интригу', 'Заговор', 'Приём', 'Булла']
};

function toneOf(entry: string): string {
  if (
    entry.includes('ПОСЛЕДНЯЯ АУДИЕНЦИЯ') ||
    entry.includes('ПОБЕДИТЕЛЬ') ||
    entry.includes('НИЧЬЯ') ||
    entry.includes('КОРОНАЦИЯ')
  ) {
    return 'log__item--final';
  }
  if (
    entry.includes('поймал') ||
    entry.includes('ПОЗОР') ||
    entry.includes('отменяется')
  ) {
    return 'log__item--danger';
  }
  if (entry.includes('ДУЭЛЬ') || entry.includes('дуэль') || entry.includes('КОНТРАТАКА')) {
    return 'log__item--duel';
  }
  if (entry.includes('ПРАВДА') || entry.includes('действительно') || entry.includes('+1 👑')) {
    return 'log__item--truth';
  }
  return '';
}

interface ChronicleProps {
  open: boolean;
  onClose: () => void;
  onOpenRules: () => void;
}

export const Chronicle: React.FC<ChronicleProps> = ({ open, onClose, onOpenRules }) => {
  const {
    history,
    coronations,
    players
  } = useGameStore(
    useShallow(s => ({
      history: s.history,
      coronations: s.coronations,
      players: s.players
    }))
  );
  const [filter, setFilter] = useState<ChronicleFilter>('all');

  /* Кругов может идти несколько — в подзаголовке перечисляем всех. */
  const candidates = coronations
    .map(c => players.find(p => p.id === c.candidateId))
    .filter((p): p is (typeof players)[number] => !!p);

  const entries = useMemo(() => {
    const list = filter === 'all' ? history : history.filter(e => MATCHERS[filter].some(m => e.includes(m)));
    return list.map(courtly).filter(Boolean);
  }, [history, filter]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="left"
      width={380}
      title="Летопись"
      description={
        candidates.length
          ? `Коронация: ${candidates.map(p => p.name).join(', ')}`
          : `${history.length} записей`
      }
    >
      <Tabs<ChronicleFilter>
        active={filter}
        onChange={setFilter}
        items={[
          { id: 'all', label: 'Все' },
          { id: 'claims', label: 'Споры' },
          { id: 'duels', label: 'Дуэли' },
          { id: 'plots', label: 'Интриги' }
        ]}
      />

      <div className="panel__body">
        {entries.length === 0 ? (
          <div className="log__empty">Двор ещё безмолвствует.</div>
        ) : (
          <div className="log">
            {entries.map((entry, idx) => (
              <div
                key={`${idx}-${entry}`}
                className={`log__item ${idx === 0 ? 'log__item--fresh' : toneOf(entry)}`}
              >
                {renderWithIcons(entry)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel__foot">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          2 <UiIcon kind="bulla" size="xs" /> обращаются в 1 <UiIcon kind="crown" size="xs" />
        </span>
        <button type="button" className="iconbtn" onClick={onOpenRules}>
          Правила
        </button>
      </div>
    </Sheet>
  );
};
