import type { Player } from '../engine/types';
import { useGameStore } from '../engine/GameStore';

interface PlayerStatusBarProps {
  player: Player;
  isActive: boolean;
}

export function PlayerStatusBar({ player, isActive }: PlayerStatusBarProps) {
  const { damagedPlayerIds, floatingResourceEvents } = useGameStore();
  const isEliminated = player.reputation <= 0;
  const isTakingDamage = damagedPlayerIds.includes(player.id);
  const myFloats = floatingResourceEvents.filter(e => e.playerId === player.id);

  return (
    <div className={`player-dashboard-plate ${isTakingDamage ? 'node-taking-damage' : ''}`}>
      {/* Floating Resource Badges for Human */}
      {myFloats.map(ev => (
        <div 
          key={ev.id} 
          className={`resource-float-pill ${ev.isGain ? 'float-gain' : 'float-loss'} cinzel-font`}
          style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
        >
          {ev.text}
        </div>
      ))}

      {/* Player Avatar with Blood Damage Flash */}
      <div className={`player-dashboard-avatar ${isActive ? 'my-turn-active' : ''} ${isTakingDamage ? 'damage-blood-flash' : ''}`}>
        <img 
          src={player.avatar} 
          alt={player.name} 
          className="bot-avatar-img"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/avatars/sasha.jpg';
          }}
        />
        {isTakingDamage && <div className="avatar-damage-overlay" />}
        <div className="bot-seat-badge" style={{ width: '18px', height: '18px', fontSize: '0.65rem' }}>
          {player.seatNumber}
        </div>
      </div>

      {/* Meta info & Resources */}
      <div className="player-meta-info">
        <div className="player-title-row">
          <span className="player-title-name">ВЫ (Претендент)</span>
          {isActive && !isEliminated && (
            <span className="my-turn-badge cinzel-font">ВАШ ХОД</span>
          )}
          {isEliminated && (
            <span style={{ fontSize: '0.65rem', color: 'var(--red-heart)', fontWeight: 800 }}>ИЗГНАН</span>
          )}
        </div>

        {/* Resources Row */}
        <div className="player-resource-pills">
          {/* Crowns */}
          <div className="res-pill crown-res">
            <span>👑</span>
            <span className="res-val">{player.favor}</span>
            <span className="res-label">/ 7 корон</span>
          </div>

          {/* Gold */}
          <div className="res-pill gold-res">
            <span>💰</span>
            <span className="res-val">{player.gold}</span>
            <span className="res-label">золота</span>
          </div>

          {/* Hearts with drop animation on damage */}
          <div className="res-pill" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            {Array.from({ length: 3 }).map((_, i) => {
              const isAliveHeart = i < player.reputation;
              const isFallingHeart = isTakingDamage && i === player.reputation;

              if (isFallingHeart) {
                return (
                  <span key={i} className="heart-dropping-anim" style={{ fontSize: '0.85rem' }}>
                    💔
                  </span>
                );
              }

              return (
                <span key={i} style={{ opacity: isAliveHeart ? 1 : 0.25, fontSize: '0.85rem' }}>
                  {isAliveHeart ? '❤️' : '🖤'}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
