import React from 'react';
import type { GameCard } from '@kinglier/engine/types';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';

export interface CardProps {
  card: GameCard;
  onClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
  hint?: string;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, onClick, isPlayable, isSelected, hint, className }) => {
  const info = CARD_DESCRIPTIONS[card] ?? CARD_DESCRIPTIONS['Наследник'];

  return (
    <div
      className={[
        'handcard',
        `cardframe cardframe--${info.category}`,
        isPlayable ? 'handcard--playable' : 'handcard--idle',
        isSelected ? 'handcard--selected' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      title={`«${info.name}» — ${info.shortDescription}`}
    >
      <img className="handcard__art" src={info.artImage} alt={info.name} loading="eager" />
      {hint && <span className="handcard__hint">{hint}</span>}
    </div>
  );
};
