import type { GameCard } from '../engine/types';
import { CARD_INFO } from '../engine/cards';

interface CardProps {
  role: GameCard; // Accepts any GameCard (Role, Plot, Instant)
  onClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
  hintText?: string;
}

export function Card({ 
  role, 
  onClick, 
  isPlayable, 
  isSelected
}: CardProps) {
  const info = CARD_INFO[role] || CARD_INFO['Наследник'];

  return (
    <div 
      className={`desktop-tarot-card ${isPlayable ? 'is-playable' : ''} ${isSelected ? 'is-selected' : ''}`}
      onClick={onClick}
      style={{
        borderColor: isSelected ? 'var(--gold-light)' : isPlayable ? info.borderColor : 'rgba(217, 119, 6, 0.4)',
        boxShadow: isSelected ? '0 0 30px rgba(253, 224, 71, 0.9)' : undefined
      }}
      title={`«${role}» — ${info.shortDescription}`}
    >
      <img 
        src={info.artImage} 
        alt={info.name} 
        className="card-full-art-img"
        loading="eager"
      />
    </div>
  );
}

