/**
 * Обычные действия — четыре карточки со своим артом.
 *
 * Были строками, и на то была причина: арта у действий не существовало, а
 * пустая плитка обещает больше, чем в ней есть. Арт появился — и обещание
 * стало правдой. Формат и вид держит общий `ActionCard`: то же самое показано
 * в кодексе, и показано должно быть одинаково.
 *
 * «Сменить карты» уводит выбор на стол: какую карту сбросить — видно по самой
 * карте, а не по её названию в списке. Модалка закрывается, над столом
 * повисает просьба отметить карты, и отмеченные приподнимаются в руке.
 */
import React from 'react';
import type { InspectableItem } from '@kinglier/engine/data/cardDescriptions';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { Tag } from './ui/Tag';
import { Dialog } from './ui/Overlay';
import { UiIcon } from './ui/Icon';
import { startTargeting } from './targeting';
import { ActionCard } from './ActionCard';
import { pickViewer } from '../lib/viewer';

export const CourtActionsDialog: React.FC<{
  onClose: () => void;
  onInspectCard: (card: InspectableItem) => void;
  /** Открыть выбор карт к обмену прямо за столом. */
  onStartExchange: () => void;
}> = ({ onClose, onInspectCard, onStartExchange }) => {
  const { players, viewerId, performAction, rules } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      performAction: s.performAction,
      rules: s.rules
    }))
  );
  const human = pickViewer(players, viewerId);
  if (!human) return null;

  /* Цены и кап пира берутся из правил партии: их задаёт хост, и диалог обязан
     показывать те числа, по которым реально играют. */
  const feastCap = rules.crownsToWin - 1;
  const hasTokens = human.actionTokens >= 1;
  const feastOff = !hasTokens || human.gold < rules.feastCost || human.favor >= feastCap;
  const rumourOff = !hasTokens || human.gold < rules.rumorCost;

  return (
    <Dialog
      open
      onClose={onClose}
      width={460}
      title="Обычные действия"
      description={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Tag tone="cold">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              1 <UiIcon kind="move" size="xs" /> за действие
            </span>
          </Tag>
          <span>Их нельзя оспорить или заблокировать</span>
        </span>
      }
    >
      <div className="actionlist">
        <ActionCard
          action="Просить содержание"
          off={!hasTokens}
          onClick={() => {
            if (!hasTokens) return;
            onClose();
            performAction({
              type: 'normal',
              name: 'Просить содержание',
              actorId: human.id,
              costGold: 0,
              costTokens: 1,
              description: 'Получает 1 🪙 из казны.'
            });
          }}
        >
          Возьмите 1 <UiIcon kind="coin" size="xs" /> из королевской казны.
        </ActionCard>

        <ActionCard
          action="Устроить пир"
          off={feastOff}
          onClick={() => {
            if (feastOff) return;
            onClose();
            performAction({
              type: 'normal',
              name: 'Устроить пир',
              actorId: human.id,
              costGold: rules.feastCost,
              costTokens: 1,
              description: `Платит ${rules.feastCost} 🪙 и получает +1 👑.`
            });
          }}
        >
          Потратьте {rules.feastCost} <UiIcon kind="coin" size="xs" />, чтобы купить 1{' '}
          <UiIcon kind="crown" size="xs" />. Победную корону таким образом получить нельзя.
        </ActionCard>

        <ActionCard
          action="Распустить слух"
          off={rumourOff}
          onClick={() => {
            if (rumourOff) return;
            onClose();
            startTargeting({
              type: 'normal',
              name: 'Распустить слух',
              cost: rules.rumorCost,
              description: `Заплатил ${rules.rumorCost} 🪙: выбранный игрок теряет -1 👑.`
            });
          }}
        >
          Потратьте {rules.rumorCost} <UiIcon kind="coin" size="xs" />, чтобы немедленно сбросить 1{' '}
          <UiIcon kind="crown" size="xs" /> у соперника. Срывает{' '}
          {/* Название карты — не текст, а ссылка на неё: игрок читает про
              «Королевский приём» ровно там, где впервые о нём услышал.
              `span`, а не `button`: карточка сама кнопка, и кнопка внутри
              кнопки — невалидная разметка. */}
          <span
            className="cardlink"
            onClick={e => {
              e.stopPropagation();
              onInspectCard('Королевский приём');
            }}
          >
            Королевский приём
          </span>{' '}
          и сжигает{' '}
          <span
            className="cardlink"
            onClick={e => {
              e.stopPropagation();
              onInspectCard('Охранная грамота');
            }}
          >
            Охранную грамоту
          </span>
          .
        </ActionCard>

        <ActionCard
          action="Сменить карты"
          off={!hasTokens}
          onClick={() => {
            if (!hasTokens) return;
            onClose();
            onStartExchange();
          }}
        >
          Сбросьте одну или обе карты и немедленно доберите новые.
        </ActionCard>
      </div>
    </Dialog>
  );
};
