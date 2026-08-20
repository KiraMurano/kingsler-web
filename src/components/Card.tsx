import type { GameCard } from '../engine/types';
import { CARD_INFO, isPlot, isInstant } from '../engine/cards';

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
  const isPlotCard = isPlot(role);
  const isInstantCard = isInstant(role);
  const isLongTitle = info.name.length > 10;

  return (
    <div 
      className={`desktop-tarot-card ${isPlayable ? 'is-playable' : ''}`}
      onClick={onClick}
      style={{
        background: info.gradient,
        borderColor: isSelected ? 'var(--gold-light)' : info.borderColor,
        boxShadow: isSelected ? '0 0 30px rgba(253, 224, 71, 0.85)' : undefined
      }}
      title={`«${role}» — ${info.shortDescription}`}
    >
      {/* Single Category Badge in Top-Left Corner */}
      <div 
        className="card-top-category-badge"
        style={{
          borderColor: info.borderColor,
          background: isPlotCard 
            ? 'rgba(202, 138, 4, 0.7)' 
            : isInstantCard 
              ? 'rgba(147, 51, 234, 0.7)' 
              : 'rgba(225, 29, 72, 0.7)'
        }}
      >
        {isPlotCard ? '🎴 ИНТРИГА' : isInstantCard ? '⚡ ИНСТАНТ' : '👑 РОЛЬ'}
      </div>

      {/* Card Title - Scaled to prevent text overflow */}
      <div 
        className="card-title-head cinzel-font"
        style={{ 
          fontSize: isLongTitle ? '0.70rem' : '0.82rem',
          letterSpacing: isLongTitle ? '0px' : '0.5px'
        }}
      >
        {info.name}
      </div>

      {/* Art Frame Circle with Fallback Badge */}
      <div className="card-art-circle">
        <img 
          src={info.artImage} 
          alt={info.name} 
          className="card-art-img-desktop"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div style={{ fontSize: '2.5rem', position: 'absolute', pointerEvents: 'none' }}>
          {info.badge}
        </div>
      </div>

      {/* Short Rule Description */}
      <div className="card-short-desc">
        {info.shortDescription}
      </div>

      {/* Bottom Footer Info */}
      <div className="card-bottom-bar">
        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.75)' }}>
          {info.blocksRole 
            ? `🛡️ vs ${info.blocksRole}` 
            : isPlotCard 
              ? '🎴 1 ⚡ интрига' 
              : isInstantCard 
                ? '⚡ 1 ⚡ инстант' 
                : '👑 1 ⚡ заявить'}
        </span>
        <span style={{ fontSize: '0.8rem' }}>{info.bottomIcon}</span>
      </div>
    </div>
  );
}
