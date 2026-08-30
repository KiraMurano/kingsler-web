import React, { useState } from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { holds } from '@kinglier/engine/cardInstance';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { getCardMaxCopies, TOTAL_DECK_SIZE } from '@kinglier/engine/cards';
import type { GameCard } from '@kinglier/engine/types';
import type { InspectableItem, NormalAction } from '@kinglier/engine/data/cardDescriptions';
import { Sheet } from './ui/Overlay';
import { Tabs } from './ui/Tabs';
import { Tag } from './ui/Tag';
import { renderWithIcons } from './ui/Icon';
import { ActionCard } from './ActionCard';
import { pickViewer } from '../lib/viewer';
import { cardArt } from '../lib/cardArt.ts';

type CodexTab = 'actions' | 'roles' | 'plots' | 'instants';

interface CodexProps {
  open: boolean;
  onClose: () => void;
  onSelectCard: (item: InspectableItem) => void;
}

interface StandardActionInfo {
  id: string;
  name: NormalAction;
  cost: string;
  shortDescription: string;
}

const ALL_CARDS: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

export const Codex: React.FC<CodexProps> = ({ open, onClose, onSelectCard }) => {
  const {
    deck,
    discardPile,
    players,
    viewerId,
    rules
  } = useGameStore(
    useShallow(s => ({
      deck: s.deck,
      discardPile: s.discardPile,
      players: s.players,
      viewerId: s.viewerId,
      rules: s.rules
    }))
  );
  const [tab, setTab] = useState<CodexTab>('actions');
  const [query, setQuery] = useState('');

  const human = pickViewer(players, viewerId);

  const standardActions: StandardActionInfo[] = [
    {
      id: 'petition',
      name: 'Просить содержание',
      cost: '1 ⚡',
      shortDescription: 'Возьмите 1 🪙 из королевской казны. Нельзя заблокировать.'
    },
    {
      id: 'feast',
      name: 'Устроить пир',
      cost: `1 ⚡ · ${rules.feastCost} 🪙`,
      shortDescription: `Купите 1 👑 за ${rules.feastCost} 🪙. Победную корону пиром купить нельзя.`
    },
    {
      id: 'rumor',
      name: 'Распустить слух',
      cost: `1 ⚡ · ${rules.rumorCost} 🪙`,
      shortDescription: `Потратьте ${rules.rumorCost} 🪙, чтобы сбросить 1 👑 у соперника. Срывает Королевский приём и сжигает Охранную грамоту.`
    },
    {
      id: 'exchange',
      name: 'Сменить карты',
      cost: '1 ⚡',
      shortDescription: 'Сбросьте одну или обе карты и немедленно доберите новые из колоды.'
    }
  ];

  const visibleActions = standardActions.filter(act => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return act.name.toLowerCase().includes(q) || act.shortDescription.toLowerCase().includes(q);
  });

  const visibleCards = ALL_CARDS.filter(card => {
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

      <Tabs<CodexTab>
        active={tab}
        onChange={setTab}
        items={[
          { id: 'actions', label: 'Обычные действия', count: standardActions.length },
          { id: 'roles', label: 'Роли', count: ALL_ROLES.length },
          { id: 'plots', label: 'Интриги', count: ALL_PLOTS.length },
          { id: 'instants', label: 'Инстанты', count: ALL_INSTANTS.length }
        ]}
      />

      <div className="panel__body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tab === 'actions' ? (
            /* Тем же `ActionCard`, что и в модалке обычных действий: одно и
               то же показывают одинаково, иначе два похожих блока в двух
               файлах разойдутся на первой же правке. */
            visibleActions.map(act => (
              <ActionCard
                key={act.id}
                action={act.name}
                badge={<Tag tone="cold">{renderWithIcons(act.cost)}</Tag>}
                onClick={() => onSelectCard(act.name)}
              >
                {renderWithIcons(act.shortDescription)}
              </ActionCard>
            ))
          ) : (
            visibleCards.map(card => {
              const info = CARD_DESCRIPTIONS[card];
              const held = !!human && holds(human.hand, card);
              return (
                <div
                  key={card}
                  className={`codexrow ${held ? 'codexrow--held' : ''}`}
                  onClick={() => onSelectCard(card)}
                >
                  <div className={`codexrow__art cardframe cardframe--${info.category}`}>
                    <img src={cardArt(info.artImage, 256)} alt={info.name} />
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
                    <div className="codexrow__desc">{renderWithIcons(info.shortDescription)}</div>
                  </div>
                </div>
              );
            })
          )}
          {((tab === 'actions' && visibleActions.length === 0) ||
            (tab !== 'actions' && visibleCards.length === 0)) && (
            <div className="log__empty">Ничего не найдено.</div>
          )}
        </div>
      </div>
    </Sheet>
  );
};
