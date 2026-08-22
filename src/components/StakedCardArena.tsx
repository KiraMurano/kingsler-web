import React from 'react';
import { useGameStore } from '../engine/GameStore';
import { CARD_INFO } from '../engine/cards';
import { CARD_DESCRIPTIONS, type GameCard } from '../data/cardDescriptions';

interface StakedCardArenaProps {
  onInspectCard?: (card: GameCard) => void;
}

export const StakedCardArena: React.FC<StakedCardArenaProps> = ({ onInspectCard }) => {
  const { 
    players, 
    activePlayerId,
    pendingAction, 
    turnPhase, 
    revealOutcome, 
    duelOutcome, 
    pendingDuelDefenderRoleClaim, 
    cardFlightEvent,
    hasCardDeparted
  } = useGameStore();

  const activePlayer = players.find(p => p.id === activePlayerId);
  const actor = pendingAction ? players.find(p => p.id === pendingAction.actorId) : activePlayer;
  const target = pendingAction?.targetId ? players.find(p => p.id === pendingAction.targetId) : null;

  const isDoubtWindow = turnPhase === 'DOUBT_WINDOW';
  const isTargetReaction = turnPhase === 'TARGET_REACTION_WINDOW';
  const isDuelAttackerWindow = turnPhase === 'DUEL_ATTACKER_WINDOW';
  const isDuelOutcome = turnPhase === 'DUEL_OUTCOME' && duelOutcome;
  const isRevealOutcome = turnPhase === 'REVEAL_OUTCOME' && revealOutcome;

  const isAnyActiveAction = isDoubtWindow || isTargetReaction || isDuelAttackerWindow || isDuelOutcome || isRevealOutcome || pendingAction;

  if (!isAnyActiveAction && !cardFlightEvent) {
    return null;
  }

  // 1. NORMAL ACTION CENTER VIEW (Plaque only, NO card!)
  if (pendingAction?.type === 'normal') {
    return (
      <div className="staked-arena-center">
        <div 
          className="center-action-plaque"
          style={{
            borderColor: 'rgba(59, 130, 246, 0.7)',
            boxShadow: '0 12px 35px rgba(0, 0, 0, 0.95), 0 0 25px rgba(59, 130, 246, 0.35)',
            minWidth: '240px',
            maxWidth: '310px',
            animation: 'pop-in-plaque 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
        >
          <div className="action-phase-tag" style={{ color: '#93c5fd', letterSpacing: '1px' }}>
            🕊️ ОБЫЧНОЕ ДЕЙСТВИЕ
          </div>
          
          <div className="action-actor-claim" style={{ fontSize: '0.88rem', margin: '4px 0' }}>
            <span style={{ color: 'var(--gold-light)' }}>{actor?.name}</span> выполняет: <span className="gold-gradient-text cinzel-font">{pendingAction.name}</span>
            {target && <span style={{ color: '#93c5fd' }}> ➔ {target.name}</span>}
          </div>
          
          <div className="action-effect-desc" style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
            {pendingAction.description}
          </div>
        </div>
      </div>
    );
  }

  // Single card flight class
  const isSingleFlight = !!(cardFlightEvent && !cardFlightEvent.isDuel);
  const singleFlightClass = isSingleFlight
    ? (cardFlightEvent.flightType === 'to_discard'
        ? 'flight-to-discard'
        : (cardFlightEvent.actorId === 'p1'
            ? 'flight-to-hand-p1'
            : `flight-to-bot-${players.find(p => p.id === cardFlightEvent.actorId)?.seatNumber || 2}`))
    : '';

  // Duel cards flight classes
  const isDuelFlight = !!(cardFlightEvent && cardFlightEvent.isDuel);
  const attackerDuelFlightClass = isDuelFlight
    ? (cardFlightEvent.attackerFlight === 'to_discard'
        ? 'flight-to-discard'
        : (cardFlightEvent.attackerId === 'p1'
            ? 'flight-to-hand-p1'
            : `flight-to-bot-${players.find(p => p.id === cardFlightEvent.attackerId)?.seatNumber || 2}`))
    : '';

  const defenderDuelFlightClass = isDuelFlight
    ? (cardFlightEvent.defenderFlight === 'to_discard'
        ? 'flight-to-discard'
        : (cardFlightEvent.defenderId === 'p1'
            ? 'flight-to-hand-p1'
            : `flight-to-bot-${players.find(p => p.id === cardFlightEvent.defenderId)?.seatNumber || 2}`))
    : '';

  if (!pendingAction && !cardFlightEvent) {
    return null;
  }

  const claimedRole = (pendingAction?.roleClaim || pendingAction?.name || '') as GameCard;
  const roleInfo = pendingAction?.roleClaim ? CARD_INFO[pendingAction.roleClaim] : null;

  const handleInspectCard = (cardName?: string) => {
    if (!cardName || !onInspectCard) return;
    if (CARD_DESCRIPTIONS[cardName as GameCard]) {
      onInspectCard(cardName as GameCard);
    }
  };

  // 1. DUEL CLASH ARENA VIEW (Attacker vs Defender cards side-by-side in center)
  if (isDuelAttackerWindow || isDuelOutcome || isDuelFlight) {
    const defender = target;
    const defenderRole = (pendingDuelDefenderRoleClaim || duelOutcome?.defenderClaim || 'Казначей') as GameCard;
    const defenderInfo = CARD_INFO[defenderRole];
    const isFlippedDuel = !!isDuelOutcome || (isDuelFlight && (cardFlightEvent?.attackerFlight === 'to_discard' || cardFlightEvent?.defenderFlight === 'to_discard'));

    const attackerTrueRole = (duelOutcome?.attackerRevealedRole || cardFlightEvent?.attackerRevealedRole || pendingAction?.roleClaim) as GameCard;
    const attackerTrueInfo = attackerTrueRole ? CARD_INFO[attackerTrueRole] : roleInfo;
    const attackerWasTruth = duelOutcome ? duelOutcome.attackerWasTruth : (cardFlightEvent?.attackerWasTruth ?? false);

    const defenderTrueRole = (duelOutcome?.defenderRevealedRole || cardFlightEvent?.defenderRevealedRole || defenderRole) as GameCard;
    const defenderTrueInfo = defenderTrueRole ? CARD_INFO[defenderTrueRole] : defenderInfo;
    const defenderWasTruth = duelOutcome ? duelOutcome.defenderWasTruth : (cardFlightEvent?.defenderWasTruth ?? false);

    return (
      <div className="staked-arena-center">
        {(!hasCardDeparted || isDuelFlight) && (
          <div className="duel-clash-arena">
            {/* Attacker Card 3D Flip */}
            <div 
              className={`duel-combatant-wrapper ${attackerDuelFlightClass}`}
              style={{ cursor: onInspectCard ? 'pointer' : 'default' }}
              onClick={() => handleInspectCard(attackerTrueRole || pendingAction?.roleClaim)}
              title="Нажмите, чтобы открыть описание карты атаки"
            >
              <span className="combatant-tag cinzel-font">
                {actor?.name} (Атака)
              </span>
              <div className={`staked-card-3d-wrap duel-card-3d ${isFlippedDuel ? 'flipped' : ''}`}>
                <div className="staked-card-inner">
                  {/* Face-down Tarot Card Back (No Text) */}
                  <div 
                    className="staked-card-face staked-card-clean-back"
                    style={{ backgroundImage: 'url(/assets/cards/back-dual-face.png)' }}
                  />

                  {/* Face-up True Role Artwork */}
                  <div 
                    className="staked-card-face staked-card-front"
                    style={{
                      backgroundImage: `url(${attackerTrueInfo?.artImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderColor: attackerWasTruth ? '#22c55e' : '#ef4444',
                      boxShadow: attackerWasTruth ? '0 0 35px #22c55e' : '0 0 35px #ef4444'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      bottom: '6px',
                      fontSize: '0.64rem',
                      fontWeight: 900,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: attackerWasTruth ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.8)'
                    }}>
                      {attackerWasTruth ? '✓ ПРАВДА' : '✗ БЛЕФ'}
                    </div>
                  </div>
                </div>
                {isDuelFlight && (
                  <div className={`flight-feedback-pill ${cardFlightEvent.attackerFlight === 'to_discard' ? 'pill-discard' : 'pill-hand'} cinzel-font`}>
                    {cardFlightEvent.attackerFlight === 'to_discard' ? '🂠 В сброс' : '✨ В руку'}
                  </div>
                )}
              </div>
            </div>

            {/* Clash Swords Center Icon */}
            <div className="duel-swords-icon">⚔️</div>

            {/* Defender Card 3D Flip */}
            <div 
              className={`duel-combatant-wrapper ${defenderDuelFlightClass}`}
              style={{ cursor: onInspectCard ? 'pointer' : 'default' }}
              onClick={() => handleInspectCard(defenderTrueRole || defenderRole)}
              title="Нажмите, чтобы открыть описание карты защиты"
            >
              <span className="combatant-tag cinzel-font">
                {defender?.name} (Защита)
              </span>
              <div className={`staked-card-3d-wrap duel-card-3d ${isFlippedDuel ? 'flipped' : ''}`}>
                <div className="staked-card-inner">
                  {/* Face-down Tarot Card Back (No Text) */}
                  <div 
                    className="staked-card-face staked-card-clean-back"
                    style={{ backgroundImage: 'url(/assets/cards/back-dual-face.png)' }}
                  />

                  {/* Face-up True Role Artwork */}
                  <div 
                    className="staked-card-face staked-card-front"
                    style={{
                      backgroundImage: `url(${defenderTrueInfo?.artImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderColor: defenderWasTruth ? '#22c55e' : '#ef4444',
                      boxShadow: defenderWasTruth ? '0 0 35px #22c55e' : '0 0 35px #ef4444'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      bottom: '6px',
                      fontSize: '0.64rem',
                      fontWeight: 900,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: defenderWasTruth ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.8)'
                    }}>
                      {defenderWasTruth ? '✓ ПРАВДА' : '✗ БЛЕФ'}
                    </div>
                  </div>
                </div>
                {isDuelFlight && (
                  <div className={`flight-feedback-pill ${cardFlightEvent.defenderFlight === 'to_discard' ? 'pill-discard' : 'pill-hand'} cinzel-font`}>
                    {cardFlightEvent.defenderFlight === 'to_discard' ? '🂠 В сброс' : '✨ В руку'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Plaque below Duel */}
        <div 
          className={`center-action-plaque ${hasCardDeparted ? 'plaque-departing' : ''}`} 
          style={{ borderColor: isDuelOutcome ? '#fbbf24' : '#ef4444' }}
        >
          <div className="action-phase-tag" style={{ color: isDuelOutcome ? '#fbbf24' : '#f87171' }}>
            {isDuelOutcome ? 'ИТОГ ДУЭЛИ 1-НА-1' : 'ВЫЗОВ НА ДУЭЛЬ!'}
          </div>
          <div className="action-actor-claim" style={{ fontSize: '0.82rem' }}>
            {isDuelOutcome 
              ? duelOutcome.message
              : `${defender?.name} выставил щит «${defenderRole}» против ${actor?.name}!`}
          </div>
        </div>
      </div>
    );
  }

  // 2. STANDARD STAKED CARD ARENA (Single Card in Center)
  const isFlipped = !!revealOutcome || (isSingleFlight && cardFlightEvent?.flightType === 'to_discard');
  const revealedRole = (revealOutcome 
    ? revealOutcome.revealedRole 
    : (cardFlightEvent?.revealedRole || cardFlightEvent?.roleClaim || pendingAction?.roleClaim)) as GameCard;
  const wasTruth = revealOutcome 
    ? revealOutcome.wasTruth 
    : (cardFlightEvent?.wasTruth ?? false);
  const revealedInfo = revealedRole ? CARD_INFO[revealedRole] : roleInfo;

  const inspectableCard = (revealedRole || claimedRole) as GameCard;

  let phaseTitle = 'КАРТА НА КОНУ';
  let phaseDesc = pendingAction?.description || 'Двор обдумывает сомнения...';

  if (isTargetReaction && target) {
    phaseTitle = 'АТАКА НА ИГРОКА';
    phaseDesc = `${actor?.name} атакует ${target.name}! Жертва выбирает реакцию.`;
  } else if (isRevealOutcome && revealOutcome) {
    if (revealOutcome.wasTruth) {
      phaseTitle = revealOutcome.vaBanqueBonus ? '🎲 ПРАВДА ПОД ВА-БАНКОМ (x2 ЭФФЕКТ)' : '🛡️ ПРАВДА ДОКАЗАНА (+1 ⚜️)';
    } else {
      phaseTitle = revealOutcome.vaBanqueBonus ? '🎭 ПОЙМАН НА ЛЖИ (+2 ⚜️)' : '🎭 ПОЙМАН НА ЛЖИ (+1 ⚜️)';
    }
    phaseDesc = revealOutcome.message;
  }

  return (
    <div className="staked-arena-center">
      {(!hasCardDeparted || isSingleFlight) && (
        <div 
          className={`staked-card-pedestal ${singleFlightClass}`}
          style={{ cursor: onInspectCard && CARD_DESCRIPTIONS[inspectableCard] ? 'pointer' : 'default' }}
          onClick={() => handleInspectCard(inspectableCard)}
          title="Нажмите, чтобы открыть подробное описание карты"
        >
          {/* 3D Flipping Card */}
          <div className={`staked-card-3d-wrap ${isFlipped ? 'flipped' : ''}`}>
            <div className="staked-card-inner">
              {/* Front of Staked Card: Clean Luxury Card Back (NO text on face-down card) */}
              <div 
                className="staked-card-face staked-card-clean-back"
                style={{ backgroundImage: 'url(/assets/cards/back-dual-face.png)' }}
              />

              {/* Back of Staked Card: Revealed True Card when flipped with glowing aura */}
              <div 
                className="staked-card-face staked-card-front"
                style={{
                  backgroundImage: `url(${revealedInfo?.artImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderColor: wasTruth ? '#22c55e' : '#ef4444',
                  boxShadow: wasTruth ? '0 0 45px rgba(34, 197, 94, 0.9)' : '0 0 45px rgba(239, 68, 68, 0.9)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  fontSize: '0.66rem',
                  fontWeight: 900,
                  padding: '3px 10px',
                  borderRadius: '4px',
                  background: wasTruth ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                  color: '#fff',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.8)'
                }}>
                  {wasTruth ? '✨ ПРАВДА' : '🎭 БЛЕФ'}
                </div>
              </div>
            </div>

            {/* Feedback pill on the flying card */}
            {isSingleFlight && (
              <div className={`flight-feedback-pill ${cardFlightEvent.flightType === 'to_discard' ? 'pill-discard' : 'pill-hand'} cinzel-font`}>
                {cardFlightEvent.flightType === 'to_discard' ? '🂠 В сброс' : '✨ В руку'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Central Action Info Plaque under Staked Card */}
      {pendingAction && (
        <div 
          className={`center-action-plaque ${hasCardDeparted ? 'plaque-departing' : ''}`}
          style={{
            borderColor: isRevealOutcome 
              ? (revealOutcome?.wasTruth ? '#22c55e' : '#ef4444')
              : 'rgba(245, 158, 11, 0.4)',
            cursor: onInspectCard && CARD_DESCRIPTIONS[inspectableCard] ? 'pointer' : 'default'
          }}
          onClick={() => handleInspectCard(inspectableCard)}
          title="Нажмите, чтобы открыть подробное описание карты"
        >
          <div 
            className="action-phase-tag"
            style={{
              color: isRevealOutcome 
                ? (revealOutcome?.wasTruth ? '#4ade80' : '#f87171')
                : 'var(--gold-light)'
            }}
          >
            {phaseTitle}
          </div>
          
          <div className="action-actor-claim">
            <span style={{ color: 'var(--gold-light)' }}>{actor?.name}</span> заявляет: <span className="gold-gradient-text cinzel-font">«{claimedRole}»</span>
            {target && <span style={{ color: '#93c5fd' }}> ➔ {target.name}</span>}
          </div>
          
          <div className="action-effect-desc">{phaseDesc}</div>
        </div>
      )}
    </div>
  );
};
