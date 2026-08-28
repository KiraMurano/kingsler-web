/**
 * Действия двора — четыре строки, а не плитки.
 *
 * Это ходы, а не карты: у них нет ни арта, ни лица, и крупная плитка обещала
 * больше, чем в них есть. Строка ровно по содержанию: название и одна фраза,
 * в которой уже названа цена. Отдельная плашка со стоимостью и подпись под ней
 * говорили одно и то же дважды.
 *
 * «Сменить карты» уводит выбор на стол: какую карту сбросить — видно по самой
 * карте, а не по её названию в списке. Модалка закрывается, над столом
 * повисает просьба отметить карты, и отмеченные приподнимаются в руке.
 */
import React from 'react';
import type { GameCard } from '@kinglier/engine/types';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { Tag } from './ui/Tag';
import { Dialog } from './ui/Overlay';
import { UiIcon } from './ui/Icon';
import { startTargeting } from './targeting';
import { pickViewer } from '../lib/viewer';

const FEAST_CROWN_CAP = 5;

/**
 * Недоступная строка не получает `disabled`, а гаснет классом.
 *
 * `disabled` на кнопке глушит клики и по всему, что внутри неё, а внутри
 * «Распустить слух» живёт ссылка на «Королевский приём» — прочитать про карту
 * должно быть можно и тогда, когда на само действие не хватает золота.
 * Кнопка при этом остаётся кнопкой и остаётся в обходе с клавиатуры;
 * недоступность объявляет `aria-disabled`.
 */
const row = (off: boolean) => `opt${off ? ' opt--off' : ''}`;

export const CourtActionsDialog: React.FC<{
  onClose: () => void;
  onInspectCard: (card: GameCard) => void;
  /** Открыть выбор карт к обмену прямо за столом. */
  onStartExchange: () => void;
}> = ({ onClose, onInspectCard, onStartExchange }) => {
  const { players, viewerId, performAction } = useGameStore(
    useShallow(s => ({
      players: s.players,
      viewerId: s.viewerId,
      performAction: s.performAction
    }))
  );
  const human = pickViewer(players, viewerId);
  if (!human) return null;

  const hasTokens = human.actionTokens >= 1;
  const feastOff = !hasTokens || human.gold < 3 || human.favor >= FEAST_CROWN_CAP;
  const rumourOff = !hasTokens || human.gold < 5;

  return (
    <Dialog
      open
      onClose={onClose}
      width={460}
      title="Действия двора"
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
      <div className="optlist">
        <button
          type="button"
          className={row(!hasTokens)}
          aria-disabled={!hasTokens}
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
          <div className="opt__name">Просить содержание</div>
          <div className="opt__desc">
            Возьмите 1 <UiIcon kind="coin" size="xs" /> из королевской казны.
          </div>
        </button>

        <button
          type="button"
          className={row(feastOff)}
          aria-disabled={feastOff}
          onClick={() => {
            if (feastOff) return;
            onClose();
            performAction({
              type: 'normal',
              name: 'Устроить пир',
              actorId: human.id,
              costGold: 3,
              costTokens: 1,
              description: 'Платит 3 🪙 и получает +1 👑.'
            });
          }}
        >
          <div className="opt__name">Устроить пир</div>
          <div className="opt__desc">
            Потратьте 3 <UiIcon kind="coin" size="xs" />, чтобы купить 1{' '}
            <UiIcon kind="crown" size="xs" />. Победную корону таким образом получить нельзя.
          </div>
        </button>

        <button
          type="button"
          className={row(rumourOff)}
          aria-disabled={rumourOff}
          onClick={() => {
            if (rumourOff) return;
            onClose();
            startTargeting({
              type: 'normal',
              name: 'Распустить слух',
              cost: 5,
              description: 'Заплатил 5 🪙: выбранный игрок теряет -1 👑.'
            });
          }}
        >
          <div className="opt__name">Распустить слух</div>
          <div className="opt__desc">
            Потратьте 5 <UiIcon kind="coin" size="xs" />, чтобы немедленно сбросить 1{' '}
            <UiIcon kind="crown" size="xs" /> у соперника. Срывает{' '}
            {/* Название карты — не текст, а ссылка на неё: игрок читает про
                «Королевский приём» ровно там, где впервые о нём услышал.
                `span`, а не `button`: строка сама кнопка, и кнопка внутри
                кнопки — невалидная разметка. */}
            <span
              className="cardlink"
              onClick={e => {
                e.stopPropagation();
                onInspectCard('Королевский приём');
              }}
            >
              Королевский приём
            </span>
            .
          </div>
        </button>

        <button
          type="button"
          className={row(!hasTokens)}
          aria-disabled={!hasTokens}
          onClick={() => {
            if (!hasTokens) return;
            onClose();
            onStartExchange();
          }}
        >
          <div className="opt__name">Сменить карты</div>
          <div className="opt__desc">
            Сбросьте одну или обе карты и немедленно доберите новые.
          </div>
        </button>
      </div>
    </Dialog>
  );
};
