import React, { useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { getCardMaxCopies, TOTAL_DECK_SIZE } from '@kinglier/engine/cards';
import type { GameCard } from '@kinglier/engine/types';
import { Sheet } from './ui/Overlay';
import { Tabs } from './ui/Tabs';
import { Tag } from './ui/Tag';
import { pickViewer } from '../lib/viewer';

type CodexTab = 'all' | 'roles' | 'plots' | 'instants';

interface CodexProps {
  open: boolean;
  onClose: () => void;
  onSelectCard: (card: GameCard) => void;
}

const ALL_CARDS: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

export const Codex: React.FC<CodexProps> = ({ open, onClose, onSelectCard }) => {
  const { deck, discardPile, players, viewerId } = useGameStore();
  const [tab, setTab] = useState<CodexTab>('all');
  const [query, setQuery] = useState('');

  const human = pickViewer(players, viewerId);

  const visible = ALL_CARDS.filter(card => {
    if (tab === 'roles' && !ALL_ROLES.includes(card as never)) return false;
    if (tab === 'plots' && !ALL_PLOTS.includes(card as never)) return false;
    if (tab === 'instants' && !ALL_INSTANTS.includes(card as never)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const info = CARD_DESCRIPTIONS[card];
    return (
      card.toLowerCase().includes(q) ||
      info.title.toLowerCase().includes(q) ||
      info.shortDescription.toLowerCase().includes(q)
    );
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      width={440}
      title="Кодекс двора"
      description={`Всего ${TOTAL_DECK_SIZE} карт · в колоде ${deck.length} · в сбросе ${discardPile.length}`}
    >
      <div style={{ padding: '12px 16px 0' }}>
        <input
          className="field"
          type="text"
          placeholder="Поиск по названию или свойству"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        items={[
          { id: 'all', label: 'Все', count: ALL_CARDS.length },
          { id: 'roles', label: 'Роли', count: ALL_ROLES.length },
          { id: 'plots', label: 'Интриги', count: ALL_PLOTS.length },
          { id: 'instants', label: 'Инстанты', count: ALL_INSTANTS.length }
        ]}
      />

      <div className="panel__body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visible.map(card => {
            const info = CARD_DESCRIPTIONS[card];
            const held = human?.hand.includes(card);
            return (
              <div
                key={card}
                className={`codexrow ${held ? 'codexrow--held' : ''}`}
                onClick={() => onSelectCard(card)}
              >
                <div className={`codexrow__art cardframe cardframe--${info.category}`}>
                  <img src={info.artImage} alt={info.name} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8
                    }}
                  >
                    <span className="codexrow__name">{info.name}</span>
                    {held ? (
                      <Tag tone="truth">в руке</Tag>
                    ) : (
                      <Tag>{getCardMaxCopies(card)} шт.</Tag>
                    )}
                  </div>
                  <div className="codexrow__desc">{info.shortDescription}</div>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <div className="log__empty">Ничего не найдено.</div>}
        </div>
      </div>
    </Sheet>
  );
};
