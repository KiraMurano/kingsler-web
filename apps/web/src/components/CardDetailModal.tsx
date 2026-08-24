import React from 'react';
import { CARD_DESCRIPTIONS, type GameCard } from '@kinglier/engine/data/cardDescriptions';
import { Dialog } from './ui/Overlay';
import { Tag } from './ui/Tag';
import { Res } from './ui/Res';

const CATEGORY_LABEL = {
  role: 'Роль двора',
  plot: 'Интрига',
  instant: 'Инстант'
} as const;

export const CardDetailModal: React.FC<{ card: GameCard | null; onClose: () => void }> = ({
  card,
  onClose
}) => {
  if (!card) return null;
  const info = CARD_DESCRIPTIONS[card];
  if (!info) return null;

  const isFreeInstant = card === 'Право вето' || card === 'Перенаправление';

  return (
    <Dialog
      open
      onClose={onClose}
      width={640}
      title={info.name}
      description={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Tag tone="gold">{CATEGORY_LABEL[info.category]}</Tag>
          <Tag>{info.title}</Tag>
          <Tag>в колоде {info.copiesCount}</Tag>
          {info.cost > 0 && <Res kind="gold" value={info.cost} suffix="цена" />}
          {info.category === 'instant' && (
            <Res kind="act" value={isFreeInstant ? 0 : 1} muted={isFreeInstant} />
          )}
        </div>
      }
    >
      <div className="detail">
        <div className={`detail__art cardframe cardframe--${info.category}`}>
          <img src={info.artImage} alt={info.name} />
        </div>

        <div className="detail__col">
          <div className="notice notice--gold">{info.shortDescription}</div>

          <div>
            <div className="detail__label">Правило карты</div>
            <div className="detail__rule">{info.fullDescription}</div>
          </div>

          {(info.blocksRole || info.blockableBy || info.targeted) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {info.blocksRole && <Tag tone="truth">Блокирует: {info.blocksRole}</Tag>}
              {info.blockableBy && <Tag tone="bluff">Блокируется: {info.blockableBy}</Tag>}
              {info.targeted && <Tag tone="cold">Целевое действие</Tag>}
            </div>
          )}

          {info.strategyTip && (
            <div>
              <div className="detail__label">Тактика</div>
              <div className="detail__tip">{info.strategyTip}</div>
            </div>
          )}

          {info.loreQuote && <div className="detail__lore">{info.loreQuote}</div>}
        </div>
      </div>
    </Dialog>
  );
};
