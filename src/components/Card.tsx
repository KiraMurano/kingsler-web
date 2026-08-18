import type { Role } from '../engine/types';
import { ROLE_INFO } from '../engine/roles';

interface CardProps {
  role: Role;
  onClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
}

export function Card({ role, onClick, isPlayable, isSelected }: CardProps) {
  const info = ROLE_INFO[role];

  return (
    <div 
      className={`desktop-tarot-card ${isPlayable ? 'is-playable' : ''}`}
      onClick={onClick}
      style={{
        background: info.gradient,
        borderColor: isSelected ? 'var(--gold-light)' : info.borderColor,
        boxShadow: isSelected ? '0 0 30px rgba(253, 224, 71, 0.85)' : undefined
      }}
      title={`Нажмите, чтобы сыграть карту «${role}» на стол`}
    >
      {/* Playable badge indicator when it's player's turn */}
      {isPlayable && (
        <div className="card-stake-hint cinzel-font">
          СЫГРАТЬ
        </div>
      )}

      {/* Card Title */}
      <div className="card-title-head cinzel-font">
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

      {/* Short Role Rule */}
      <div className="card-short-desc">
        {info.shortDescription}
      </div>

      {/* Bottom Counter Icon / Cost */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 4px' }}>
        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)' }}>
          {info.blocksRole ? `🛡️ vs ${info.blocksRole}` : info.cost > 0 ? `${info.cost} 💰` : '👑 Роль'}
        </span>
        <span style={{ fontSize: '0.8rem' }}>{info.bottomIcon}</span>
      </div>
    </div>
  );
}
