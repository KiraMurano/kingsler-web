import React from 'react';
import type { Player, GameCard } from '../engine/types';
import { useGameStore } from '../engine/GameStore';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';
import { Badge } from './ui/Badge';

interface PlayerStatusBarProps {
  player: Player;
  isActive: boolean;
  onInspectCard?: (card: GameCard) => void;
}

export const PlayerStatusBar: React.FC<PlayerStatusBarProps> = ({ 
  player, 
  isActive,
  onInspectCard
}) => {
  const { floatingResourceEvents, players } = useGameStore();
  const myFloats = floatingResourceEvents.filter(e => e.playerId === player.id);

  const targetPlayer = player.activePlot?.targetPlayerId 
    ? players.find(p => p.id === player.activePlot?.targetPlayerId) 
    : null;

  const activePlotInfo = player.activePlot ? CARD_DESCRIPTIONS[player.activePlot.type] : null;

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
        <div className="bot-seat-badge" style={{ width: '20px', height: '20px', fontSize: '0.7rem' }}>
          {player.seatNumber}
        </div>
      </div>

      {/* Meta info & Resources */}
      <div className="player-meta-info">
        <div className="player-title-row">
          <span className="player-title-name">ВЫ (Претендент)</span>
          {isActive ? (
            <Badge variant="gold" size="sm" pulse icon="⚔️">ВАШ ХОД</Badge>
          ) : (
            <Badge variant="secondary" size="sm" icon="⏳">Ожидание</Badge>
          )}
        </div>

        {/* Resources Grid */}
        <div className="player-resource-grid">
          <div className="player-resource-row">
            {/* Action Tokens */}
            <Badge 
              variant={player.actionTokens > 0 ? 'sapphire' : 'ghost'} 
              size="md" 
              icon="⚡"
              title="Жетоны действия (восполняются до 2 в начале хода)"
            >
              {player.actionTokens} / 2 действия
            </Badge>

            {/* Crowns */}
            <Badge 
              variant="gold" 
              size="md" 
              icon="👑"
              title="Короны влияния (цель: 6 для победы)"
            >
              {player.favor} / 6 корон
            </Badge>
          </div>

          <div className="player-resource-row">
            {/* Gold */}
            <Badge 
              variant="amber" 
              size="md" 
              icon="🪙"
              title="Золотые монеты из казны"
            >
              {player.gold} монет
            </Badge>

            {/* Seals */}
            <Badge 
              variant="purple" 
              size="md" 
              icon="⚜️"
              title="Королевские печати (2 ⚜️ автоматически превращаются в 1 👑)"
            >
              {player.seals} / 2 печати
            </Badge>
          </div>
        </div>
      </div>

      {/* Active Intrigue Card in front of human on table */}
      {player.activePlot && activePlotInfo && (
        <div 
          className="human-active-plot-card"
          onClick={() => onInspectCard && onInspectCard(player.activePlot!.type)}
          title={`Ваша активная Интрига: ${player.activePlot.type}. Нажмите для описания.`}
        >
          <div className="table-plot-card-inner">
            <img 
              src={activePlotInfo.artImage} 
              alt={activePlotInfo.name} 
              className="table-plot-card-img" 
            />
            
            <div className="table-plot-card-overlay">
              <span className="table-plot-card-title">{activePlotInfo.name}</span>
              
              {player.activePlot.charges !== undefined && (
                <div style={{ marginTop: '2px' }}>
                  <Badge variant="purple" size="sm" icon="⚡">
                    {player.activePlot.charges} {player.activePlot.type === 'Тайный заговор' ? '/ 4' : ''}
                  </Badge>
                </div>
              )}

              {targetPlayer && (
                <div style={{ marginTop: '2px' }}>
                  <Badge variant="destructive" size="sm" icon="🎯">
                    {targetPlayer.name}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
