import React from 'react';
import type { Player, GameCard } from '../engine/types';
import { useGameStore } from '../engine/GameStore';
import { CARD_DESCRIPTIONS } from '../data/cardDescriptions';
import { Badge } from './ui/Badge';

interface PlayerAvatarProps {
  player: Player;
  isActive: boolean;
  isTargetable?: boolean;
  onTarget?: () => void;
  onInspectCard?: (card: GameCard) => void;
  style?: React.CSSProperties;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ 
  player, 
  isActive, 
  isTargetable, 
  onTarget,
  onInspectCard,
  style 
}) => {
  const { 
    pendingAction, 
    turnPhase, 
    duelOutcome, 
    revealOutcome,
    activeSpeechReactions,
    floatingResourceEvents,
    players
  } = useGameStore();

  const playerFloats = floatingResourceEvents.filter(e => e.playerId === player.id);

  // Derive dynamic speech / reaction bubble for this player
  let speechText: string | null = null;

  if (turnPhase !== 'IDLE') {
    speechText = activeSpeechReactions[player.id] || null;

    if (!speechText) {
      if (isActive && pendingAction && pendingAction.actorId === player.id) {
        if (pendingAction.type === 'normal') {
          speechText = `«${pendingAction.name}»`;
        } else if (pendingAction.type === 'plot') {
          speechText = `«Интрига: ${pendingAction.plotType}»`;
        } else {
          speechText = `«Заявляю: ${pendingAction.roleClaim}!»`;
        }
      } else if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === player.id) {
        speechText = `«Меня атакуют! Защищаюсь!»`;
      } else if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === player.id) {
        speechText = `«Вызов на Дуэль принят!»`;
      } else if (turnPhase === 'REVEAL_OUTCOME' && revealOutcome?.accuserId === player.id) {
        speechText = `«Не верю! Проверяю!»`;
      } else if (turnPhase === 'DUEL_OUTCOME' && duelOutcome && (duelOutcome.attackerId === player.id || duelOutcome.defenderId === player.id)) {
        speechText = `«К барьеру!»`;
      }
    }
  }

  const hasCardStakedOnTable = pendingAction && pendingAction.type === 'role' && pendingAction.actorId === player.id && turnPhase !== 'IDLE';

  const targetPlayer = player.activePlot?.targetPlayerId 
    ? players.find(p => p.id === player.activePlot?.targetPlayerId) 
    : null;

  const activePlotInfo = player.activePlot ? CARD_DESCRIPTIONS[player.activePlot.type] : null;

  return (
    <div 
      className="bot-seat-node"
      style={{
        cursor: isTargetable ? 'pointer' : 'default',
        ...style
      }}
      onClick={isTargetable ? onTarget : undefined}
    >
      {/* Floating Resource Badges (+1 ⚜️, +3 🪙, +1 👑, etc.) */}
      {playerFloats.map(ev => (
        <div 
          key={ev.id} 
          className={`resource-float-pill ${ev.isGain ? 'float-gain' : 'float-loss'} cinzel-font`}
        >
          {ev.text}
        </div>
      ))}

      {/* Dynamic Speech / Reaction Bubble */}
      {speechText && (
        <div className="bot-speech-bubble cinzel-font">
          {speechText}
        </div>
      )}

      {/* Round Avatar with Gold Ring & Number Badge */}
      <div className={`bot-avatar-frame ${isActive ? 'active-turn' : ''} ${isTargetable ? 'is-targetable' : ''}`}>
        {isTargetable && (
          <div className="avatar-target-reticle cinzel-font">
            🎯
          </div>
        )}
        <img 
          src={player.avatar} 
          alt={player.name} 
          className="bot-avatar-img"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/avatars/sasha.jpg';
          }}
        />
        <div className="bot-seat-badge">{player.seatNumber}</div>
      </div>

      {/* Info Plate below avatar */}
      <div className="bot-info-plate">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span className="bot-name-text">{player.name}</span>
          
          {/* Action Tokens Badge */}
          <Badge 
            variant={player.actionTokens > 0 ? 'sapphire' : 'ghost'} 
            size="sm"
            icon="⚡"
            title={`Жетоны действия: ${player.actionTokens}/2`}
          >
            {player.actionTokens}
          </Badge>
        </div>
        
        {/* Stats Strip: Crowns & Gold & Seals */}
        <div className="bot-stats-strip">
          <Badge variant="gold" size="sm" icon="👑" title="Короны влияния">{player.favor}</Badge>
          <Badge variant="amber" size="sm" icon="🪙" title="Золотые монеты">{player.gold}</Badge>
          <Badge variant="purple" size="sm" icon="⚜️" title="Королевские печати">{player.seals}</Badge>
        </div>

        {/* In-Hand Cards Indicator */}
        <div className="bot-cards-in-hand-strip">
          {hasCardStakedOnTable ? (
            <>
              <span className="bot-inhand-card-icon held" title="1 карта в руке">🂠</span>
              <span className="bot-inhand-card-icon on-stake" title="1 карта выставлена на стол">⚡</span>
            </>
          ) : (
            <>
              <span className="bot-inhand-card-icon held" title="Карта в руке">🂠</span>
              <span className="bot-inhand-card-icon held" title="Карта в руке">🂠</span>
            </>
          )}
        </div>
      </div>

      {/* ACTIVE INTRIGUE CARD ON TABLE (Played physically on table in front of bot) */}
      {player.activePlot && activePlotInfo && (
        <div 
          className="table-active-plot-card"
          onClick={(e) => {
            e.stopPropagation();
            if (onInspectCard) onInspectCard(player.activePlot!.type);
          }}
          title={`Активная интрига: ${player.activePlot.type}. Нажмите для описания.`}
        >
          <div className="table-plot-card-inner">
            <img 
              src={activePlotInfo.artImage} 
              alt={activePlotInfo.name} 
              className="table-plot-card-img" 
            />
            
            {/* Status / Charge Overlays */}
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
