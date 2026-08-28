/**
 * Карточка карты в Кодексе.
 *
 * Шапка отвечает на «что это за карта» одной строкой: имя и бейджи стоят
 * рядом, потому что говорят об одном. Отдельной полкой под именем бейджи
 * читались как второй заголовок, а те, что жили в теле панели («Блокируется»,
 * «Целевое действие»), находились только после того, как правило прочитано —
 * хотя нужны раньше него.
 *
 * Цитата поднялась под шапку: это голос карты, и он должен звучать до правил,
 * а не после тактики, где его никто не дочитывал.
 */
import React from 'react';
import { CARD_DESCRIPTIONS, type GameCard } from '@kinglier/engine/data/cardDescriptions';
import { Dialog } from './ui/Overlay';
import { Tag } from './ui/Tag';
import { UiIcon, renderWithIcons } from './ui/Icon';

const CATEGORY_LABEL = {
  role: 'Роль',
  plot: 'Интрига',
  instant: 'Инстант'
} as const;

/**
 * Защитные реактивные инстанты (RULES §9): играются в чужое окно и не стоят
 * жетона. Всё остальное — активные: свой ход, 1 ⚡. Один список на оба бейджа,
 * чтобы «когда» и «почём» не разошлись.
 */
const REACTIVE_INSTANTS: GameCard[] = ['Право вето', 'Перенаправление'];

export const CardDetailModal: React.FC<{ card: GameCard | null; onClose: () => void }> = ({
  card,
  onClose
}) => {
  if (!card) return null;
  const info = CARD_DESCRIPTIONS[card];
  if (!info) return null;

  const isInstant = info.category === 'instant';
  const isReactive = isInstant && REACTIVE_INSTANTS.includes(card);

  return (
    <Dialog
      open
      onClose={onClose}
      width={640}
      title={
        <span className="detail__head">
          <span className="detail__name">{info.name}</span>
          <span className="detail__badges">
            <Tag tone="gold">{CATEGORY_LABEL[info.category]}</Tag>
            <Tag>В колоде: {info.copiesCount}</Tag>
            {isInstant && <Tag tone="cold">{isReactive ? 'В любой момент' : 'В свой ход'}</Tag>}
            {isInstant && (
              <Tag tone="cold">
                {isReactive ? 'Не требует' : 'Требует 1'} <UiIcon kind="move" size="xs" />
              </Tag>
            )}
            {info.targeted && <Tag tone="cold">Требуется цель</Tag>}
            {info.blocksRole && <Tag tone="truth">Блокирует: {info.blocksRole}</Tag>}
            {info.blockableBy && <Tag tone="bluff">Блокируется: {info.blockableBy}</Tag>}
          </span>
        </span>
      }
      description={info.loreQuote ? <span className="detail__lore">{info.loreQuote}</span> : undefined}
    >
      <div className="detail">
        <div className={`detail__art cardframe cardframe--${info.category}`}>
          <img src={info.artImage} alt={info.name} />
        </div>

        <div className="detail__col">
          <div className="notice notice--gold">{renderWithIcons(info.shortDescription)}</div>

          <div>
            <div className="detail__label">Правило карты</div>
            <div className="detail__rule">{renderWithIcons(info.fullDescription)}</div>
          </div>

          {info.strategyTip && (
            <div>
              <div className="detail__label">Тактика</div>
              <div className="detail__tip">{renderWithIcons(info.strategyTip)}</div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
