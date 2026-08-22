import React from 'react';
import type { GameCard } from '../engine/types';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';

export interface CardProps {
  role: GameCard;
  onClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
  hintText?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ 
  role, 
  onClick, 
  isPlayable, 
  isSelected,
  hintText,
  className = '',
  style
}) => {
  const info = CARD_DESCRIPTIONS[role] || CARD_DESCRIPTIONS['Наследник'];

  return (
    <div 
      className={`desktop-tarot-card ${isPlayable ? 'is-playable' : ''} ${isSelected ? 'is-selected' : ''} ${className}`}
      onClick={onClick}
      style={{
        aspectRatio: '2 / 3',
        borderColor: isSelected 
          ? 'var(--gold-light)' 
          : isPlayable 
            ? info.borderColor 
            : 'rgba(217, 119, 6, 0.4)',
        boxShadow: isSelected 
          ? '0 0 35px rgba(253, 224, 71, 0.9), 0 12px 30px rgba(0,0,0,0.9)' 
          : undefined,
        ...style
      }}
      title={`«${role}» — ${info.shortDescription}`}
    >
      <img 
        src={info.artImage} 
        alt={info.name} 
        className="card-full-art-img"
        loading="eager"
      />

      {hintText && (
        <div className="card-hint-badge cinzel-font">
          {hintText}
        </div>
      )}
    </div>
  );
};
