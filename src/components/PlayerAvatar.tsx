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
    damagedPlayerIds,
    activeSpeechReactions,
    floatingResourceEvents 
  } = useGameStore();

  const isEliminated = player.reputation <= 0;
  const isTakingDamage = damagedPlayerIds.includes(player.id);
  const playerFloats = floatingResourceEvents.filter(e => e.playerId === player.id);

  // Derive dynamic speech / reaction bubble for this player (Only during active action/phase!)
  let speechText: string | null = null;

  if (turnPhase !== 'IDLE') {
    speechText = activeSpeechReactions[player.id] || null;

    if (!speechText) {
      if (isActive && pendingAction && pendingAction.actorId === player.id) {
        if (pendingAction.type === 'normal') {
          speechText = `«${pendingAction.name}»`;
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

  return (
    <div 
      className={`bot-seat-node ${isTakingDamage ? 'node-taking-damage' : ''}`}
      style={{
        opacity: isEliminated ? 0.35 : 1,
        cursor: isTargetable ? 'pointer' : 'default',
        ...style
      }}
      onClick={isTargetable ? onTarget : undefined}
    >
      {/* Floating Resource Badges (+3 💰, -2 💰, +1 👑, -1 👑) */}
      {playerFloats.map(ev => (
        <div 
          key={ev.id} 
          className={`resource-float-pill ${ev.isGain ? 'float-gain' : 'float-loss'} cinzel-font`}
        >
          {ev.text}
        </div>
      ))}

      {/* Dynamic Speech / Reaction Bubble */}
      {speechText && !isEliminated && (
        <div className="bot-speech-bubble cinzel-font">
          {speechText}
        </div>
      )}

      {/* Round Avatar with Gold Ring, Damage Flash & Number Badge */}
      <div className={`bot-avatar-frame ${isActive ? 'active-turn' : ''} ${isTargetable ? 'is-targetable' : ''} ${isTakingDamage ? 'damage-blood-flash' : ''}`}>
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
        {/* Red damage vignette overlay */}
        {isTakingDamage && <div className="avatar-damage-overlay" />}
        <div className="bot-seat-badge">{player.seatNumber}</div>
      </div>

      {/* Info Plate below avatar */}
      <div className="bot-info-plate">
        <span className="bot-name-text">{player.name}</span>
        
        {player.archetype && (
          <span 
            className="bot-archetype-tag" 
            title={`${player.archetype.title}: ${player.archetype.description}`}
          >
            {player.archetype.badge} {player.archetype.title}
          </span>
        )}

        {/* Stats: Crowns & Gold */}
        <div className="bot-stats-strip">
          <span style={{ color: 'var(--gold-light)' }}>👑 {player.favor}</span>
          <span style={{ color: '#fbbf24' }}>💰 {player.gold}</span>
        </div>

        {/* 3 Reputation Hearts with Drop Animation on Damage */}
        <div className="bot-hearts-strip">
          {Array.from({ length: 3 }).map((_, i) => {
            const isAliveHeart = i < player.reputation;
            const isFallingHeart = isTakingDamage && i === player.reputation;

            if (isFallingHeart) {
              return (
                <span key={i} className="heart-dropping-anim" title="Потеря репутации!">
                  💔
                </span>
              );
            }

            return (
              <span key={i} style={{ opacity: isAliveHeart ? 1 : 0.2 }}>
                {isAliveHeart ? '❤️' : '🖤'}
              </span>
            );
          })}
        </div>

        {/* In-Hand Cards Indicator: Shows 1 in hand + 1 on stake if acting */}
        {!isEliminated && (
          <div className="bot-cards-fan" title={`У игрока ${player.hand.length} карт(ы)`}>
            {hasCardStakedOnTable ? (
              <>
                <div className="mini-card-back" title="1 карта в руке" />
                <div className="mini-card-staked-slot" title="1 карта на столе" />
              </>
            ) : (
              player.hand.map((_, i) => (
                <div key={i} className="mini-card-back" />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
