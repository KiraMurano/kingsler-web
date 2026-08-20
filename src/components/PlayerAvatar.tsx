import type { Player } from '../engine/types';
import { useGameStore } from '../engine/GameStore';

interface PlayerAvatarProps {
  player: Player;
  isActive: boolean;
  isTargetable?: boolean;
  onTarget?: () => void;
  style?: React.CSSProperties;
}

export function PlayerAvatar({ 
  player, 
  isActive, 
  isTargetable, 
  onTarget, 
  style 
}: PlayerAvatarProps) {
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
        speechText = `«Меня атакуют! Что делать?..»`;
      } else if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === player.id) {
        speechText = `«Мне бросили вызов на Дуэль!»`;
      } else if (turnPhase === 'REVEAL_OUTCOME' && revealOutcome?.accuserId === player.id) {
        speechText = `«Не верю! Проверяю!»`;
      } else if (turnPhase === 'DUEL_OUTCOME' && duelOutcome && (duelOutcome.attackerId === player.id || duelOutcome.defenderId === player.id)) {
        speechText = `«К барьеру!»`;
      }
    }
  }

  // Check if this player currently has a card staked on the table
  const hasCardStakedOnTable = pendingAction && pendingAction.type === 'role' && pendingAction.actorId === player.id && turnPhase !== 'IDLE';

  const targetPlayer = player.activePlot?.targetPlayerId 
    ? players.find(p => p.id === player.activePlot?.targetPlayerId) 
    : null;

  return (
    <div 
      className="bot-seat-node"
      style={{
        cursor: isTargetable ? 'pointer' : 'default',
        ...style
      }}
      onClick={isTargetable ? onTarget : undefined}
    >
      {/* Floating Resource Badges (+1 ⚜️, +3 💰, +1 👑, etc.) */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <span className="bot-name-text">{player.name}</span>
          {/* Action Tokens Badge */}
          <span 
            style={{ 
              fontSize: '0.65rem', 
              color: player.actionTokens > 0 ? '#38bdf8' : '#64748b', 
              fontWeight: 800,
              background: player.actionTokens > 0 ? 'rgba(2, 132, 199, 0.2)' : 'rgba(30, 41, 59, 0.4)',
              padding: '0 4px',
              borderRadius: '4px',
              border: `1px solid ${player.actionTokens > 0 ? '#0284c7' : '#334155'}`
            }}
            title={`Жетоны действия: ${player.actionTokens}/2`}
          >
            ⚡ {player.actionTokens}
          </span>
        </div>
        
        {player.archetype && (
          <span 
            className="bot-archetype-tag" 
            title={`${player.archetype.title}: ${player.archetype.description}`}
          >
            {player.archetype.badge} {player.archetype.title}
          </span>
        )}

        {/* Active Plot Badge if bot has one on the table */}
        {player.activePlot && (
          <div 
            style={{
              fontSize: '0.6rem',
              fontWeight: 800,
              background: 'linear-gradient(90deg, #ca8a04, #eab308)',
              color: '#000',
              padding: '1px 6px',
              borderRadius: '4px',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              boxShadow: '0 0 6px rgba(234, 179, 8, 0.4)'
            }}
            title={`Активная Интрига: ${player.activePlot.type}`}
          >
            <span>🎴</span>
            <span>{player.activePlot.type}</span>
            {player.activePlot.charges !== undefined && <span>({player.activePlot.charges})</span>}
            {targetPlayer && <span>→ {targetPlayer.name}</span>}
          </div>
        )}

        {/* Stats: Crowns & Gold */}
        <div className="bot-stats-strip">
          <span style={{ color: 'var(--gold-light)' }} title="Короны влияния (цель: 6)">👑 {player.favor}</span>
          <span style={{ color: '#fbbf24' }} title="Золотые монеты">💰 {player.gold}</span>
        </div>

        {/* Royal Seals (⚜️ 0/2) */}
        <div className="bot-seals-strip" title="Королевские печати (2 ⚜️ = 1 👑)">
          <span style={{ fontSize: '0.66rem', color: '#c084fc', fontWeight: 800 }}>⚜️ {player.seals}/2</span>
          <div className="seal-indicators" style={{ display: 'inline-flex', gap: '2px', marginLeft: '4px' }}>
            <span style={{ opacity: player.seals >= 1 ? 1 : 0.25, fontSize: '0.7rem' }}>⚜️</span>
            <span style={{ opacity: player.seals >= 2 ? 1 : 0.25, fontSize: '0.7rem' }}>⚜️</span>
          </div>
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
    </div>
  );
}
