import type { Player } from '../engine/types';
import { useGameStore } from '../engine/GameStore';

interface PlayerStatusBarProps {
  player: Player;
  isActive: boolean;
}

export function PlayerStatusBar({ player, isActive }: PlayerStatusBarProps) {
  const { floatingResourceEvents, players } = useGameStore();
  const myFloats = floatingResourceEvents.filter(e => e.playerId === player.id);

  const targetPlayer = player.activePlot?.targetPlayerId 
    ? players.find(p => p.id === player.activePlot?.targetPlayerId) 
    : null;

  return (
    <div className="player-dashboard-plate">
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

      {/* Player Avatar */}
      <div className={`player-dashboard-avatar ${isActive ? 'my-turn-active' : ''}`}>
        <img 
          src={player.avatar} 
          alt={player.name} 
          className="bot-avatar-img"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/avatars/sasha.jpg';
          }}
        />
        <div className="bot-seat-badge" style={{ width: '18px', height: '18px', fontSize: '0.65rem' }}>
          {player.seatNumber}
        </div>
      </div>

      {/* Meta info & Resources */}
      <div className="player-meta-info">
        <div className="player-title-row">
          <span className="player-title-name">ВЫ (Претендент)</span>
          {isActive && (
            <span className="my-turn-badge cinzel-font">ВАШ ХОД</span>
          )}

          {/* Active Plot Badge if present */}
          {player.activePlot && (
            <span 
              className="cinzel-font"
              style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                background: 'linear-gradient(90deg, #ca8a04, #eab308)',
                color: '#000',
                padding: '2px 8px',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 0 10px rgba(234, 179, 8, 0.4)'
              }}
              title="Ваша активная Интрига на столе"
            >
              <span>🎴</span>
              <span>{player.activePlot.type}</span>
              {player.activePlot.charges !== undefined && (
                <span>({player.activePlot.charges}{player.activePlot.type === 'Тайный заговор' ? '/4' : ''})</span>
              )}
              {targetPlayer && <span>→ {targetPlayer.name}</span>}
            </span>
          )}
        </div>

        {/* Resources Grid in 2 Clean Rows */}
        <div className="player-resource-grid">
          {/* Row 1: Action Tokens & Crowns */}
          <div className="player-resource-row">
            {/* Action Tokens (⚡ 2/2) */}
            <div 
              className="res-pill token-res" 
              style={{ 
                borderColor: player.actionTokens > 0 ? 'rgba(56, 189, 248, 0.6)' : 'rgba(148, 163, 184, 0.3)', 
                background: player.actionTokens > 0 ? 'rgba(2, 132, 199, 0.25)' : 'rgba(30, 41, 59, 0.3)' 
              }}
              title="Жетоны действия: тратятся на Роли, Базовые действия, Интриги и проверки «Не верю!»"
            >
              <span>⚡</span>
              <span className="res-val" style={{ color: player.actionTokens > 0 ? '#7dd3fc' : '#94a3b8' }}>
                {player.actionTokens}
              </span>
              <span className="res-label">/ 2 действия</span>
            </div>

            {/* Crowns */}
            <div className="res-pill crown-res" title="Короны Благосклонности (цель: 6 для победы)">
              <span>👑</span>
              <span className="res-val">{player.favor}</span>
              <span className="res-label">/ 6 корон</span>
            </div>
          </div>

          {/* Row 2: Gold & Royal Seals */}
          <div className="player-resource-row">
            {/* Gold */}
            <div className="res-pill gold-res" title="Золотые монеты">
              <span>💰</span>
              <span className="res-val">{player.gold}</span>
              <span className="res-label">золота</span>
            </div>

            {/* Royal Seals (⚜️ 2 = 1 👑) */}
            <div 
              className="res-pill seal-res" 
              style={{ borderColor: 'rgba(192, 132, 252, 0.5)', background: 'rgba(88, 28, 135, 0.2)' }} 
              title="Королевские печати (2 ⚜️ автоматически превращаются в 1 👑)"
            >
              <span>⚜️</span>
              <span className="res-val" style={{ color: '#e9d5ff' }}>{player.seals}</span>
              <span className="res-label">/ 2 печати</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
