import React from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { CARD_INFO } from '@kinglier/engine/cards';
import { CARD_DESCRIPTIONS, type CardCategory, type GameCard, type InstantType } from '@kinglier/engine/data/cardDescriptions';
import { courtly } from '../lib/text';
import { declineGen } from '@kinglier/engine/utils/russianText';

const CARD_BACK = '/assets/cards/back-dual-face.png';

interface StakedCardArenaProps {
  onInspectCard?: (card: GameCard) => void;
}

interface FlipCardProps {
  artImage?: string;
  category?: CardCategory;
  flipped: boolean;
  wasTruth: boolean;
  flightClass?: string;
  flightLabel?: string | null;
  badge?: string | null;
  onClick?: () => void;
}

const FlipCard: React.FC<FlipCardProps> = ({
  artImage,
  category,
  flipped,
  wasTruth,
  flightClass = '',
  flightLabel,
  badge,
  onClick
}) => (
  <div
    className={`flip ${flipped ? 'is-flipped' : ''} ${flightClass}`}
    onClick={onClick}
    title="Открыть описание карты"
  >
    <div className="flip__inner">
      <div className="flip__face" style={{ backgroundImage: `url(${CARD_BACK})` }} />
      <div
        className={[
          'flip__face',
          'flip__face--front',
          wasTruth ? 'flip__face--truth' : 'flip__face--bluff',
          category ? `cardframe cardframe--${category}` : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ backgroundImage: `url(${artImage})` }}
      >
        <span className={`verdict ${wasTruth ? 'verdict--truth' : 'verdict--bluff'}`}>
          {wasTruth ? 'ПРАВДА' : 'БЛЕФ'}
        </span>
      </div>
    </div>
    {flightLabel && (
      <span
        className={`flypill ${flightLabel === 'В сброс' ? 'flypill--discard' : 'flypill--hand'}`}
      >
        {flightLabel}
      </span>
    )}
    {badge && <span className="claimbadge">{badge}</span>}
  </div>
);

const FaceCard: React.FC<{
  card: GameCard;
  className?: string;
  onClick?: () => void;
}> = ({ card, className = '', onClick }) => {
  const info = CARD_INFO[card];
  return (
    <div
      className={[
        'tablecard',
        info?.category ? `cardframe cardframe--${info.category}` : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ backgroundImage: `url(${info?.artImage})` }}
      onClick={onClick}
      title="Открыть описание карты"
    />
  );
};

function overlayClass(card: InstantType): string {
  return card === 'Право вето' || card === 'Ва-банк' ? 'tablecard--veto' : 'tablecard--overlay';
}

/** Last word of a titled name: «Графиня Елена» → «Елена». */
function givenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function claimBadge(claim: string, targetName?: string | null): string {
  return targetName ? `${claim} против ${declineGen(givenName(targetName))}` : claim;
}

export const StakedCardArena: React.FC<StakedCardArenaProps> = ({ onInspectCard }) => {
  const {
    players,
    pendingAction,
    turnPhase,
    revealOutcome,
    duelOutcome,
    pendingDuelDefenderRoleClaim,
    cardFlightEvent,
    hasCardDeparted,
    overlayInstant,
    isPendingActionAfterTruthChallenge
  } = useGameStore();

  const target = pendingAction?.targetId
    ? players.find(p => p.id === pendingAction.targetId)
    : null;

  if (!pendingAction && !cardFlightEvent && !overlayInstant) return null;

  const inspect = (card?: string) => {
    if (card && onInspectCard && CARD_DESCRIPTIONS[card as GameCard]) {
      onInspectCard(card as GameCard);
    }
  };

  const seatOf = (playerId?: string) => players.find(p => p.id === playerId)?.seatNumber ?? 2;
  const flightClassFor = (
    destination: 'to_discard' | 'to_hand' | 'to_plot' | undefined,
    playerId?: string
  ) => {
    if (destination === 'to_discard') return 'fly-discard';
    return playerId === 'p1' ? 'fly-hand' : `fly-seat-${seatOf(playerId)}`;
  };
  const flightLabel = (destination?: 'to_discard' | 'to_hand' | 'to_plot') =>
    destination === 'to_discard' ? 'В сброс' : 'В руку';

  const overlayEl = overlayInstant ? (
    <FaceCard
      card={overlayInstant.card}
      className={overlayClass(overlayInstant.card)}
      onClick={() => inspect(overlayInstant.card)}
    />
  ) : null;

  /* 1. Plain court action — a badge, no card is staked. */
  if (pendingAction?.type === 'normal') {
    const isCardExchange = pendingAction.name.includes('Сменить');
    const actorName = players.find(p => p.id === pendingAction.actorId)?.name ?? '';
    const exchangesTwoCards = (pendingAction.stakedCardIndices?.length ?? 1) >= 2;
    const label = isCardExchange
      ? `${actorName} меняет карт${exchangesTwoCards ? 'ы' : 'у'}`
      : courtly(pendingAction.name);
    return (
      <div className="staked">
        <span className="claimbadge claimbadge--solo">
          {claimBadge(label, target?.name)}
        </span>
      </div>
    );
  }

  /* 1b. Instant laid openly on the table — kept mounted while it flies to
     discard so it never just pops out of existence when it resolves. */
  const faceFlight = !cardFlightEvent?.isDuel ? cardFlightEvent?.card : undefined;
  if (pendingAction?.type === 'instant' || (!pendingAction && faceFlight)) {
    const laid = pendingAction?.type === 'instant'
      ? (pendingAction.instantType || pendingAction.name) as GameCard
      : (faceFlight as GameCard);
    const flightClass = !pendingAction && faceFlight
      ? flightClassFor(cardFlightEvent?.flightType, cardFlightEvent?.actorId)
      : '';
    return (
      <div className="staked">
        <div className="staked__pile">
          <FaceCard card={laid} className={flightClass} onClick={() => inspect(laid)} />
          {overlayEl}
          {pendingAction && <span className="claimbadge">{claimBadge(laid, target?.name)}</span>}
        </div>
      </div>
    );
  }

  /* 1c. Laying a plot goes to the seat slot, not the table. Keep the table
     only for veto overlay or for resolving an already-slotted plot. */
  if (pendingAction?.type === 'plot') {
    const plot = (pendingAction.plotType || pendingAction.name) as GameCard;
    const laying = !pendingAction.conspiracyEffect && !pendingAction.isMorningTrigger;
    if (laying && !overlayEl) return null;
    return (
      <div className="staked">
        <div className="staked__pile">
          {overlayEl}
          <span className="claimbadge">{claimBadge(plot, target?.name)}</span>
        </div>
      </div>
    );
  }

  const isDuelWindow = turnPhase === 'DUEL_ATTACKER_WINDOW';
  const isDuelOutcome = turnPhase === 'DUEL_OUTCOME' && !!duelOutcome;
  const isDuelFlight = !!cardFlightEvent?.isDuel;
  const isSingleFlight = !!cardFlightEvent && !cardFlightEvent.isDuel;

  /* 2. Duel — two cards clash. */
  if (isDuelWindow || isDuelOutcome || isDuelFlight) {
    const defenderClaim = (pendingDuelDefenderRoleClaim ||
      duelOutcome?.defenderClaim ||
      'Казначей') as GameCard;

    const attackerRole = (duelOutcome?.attackerRevealedRole ||
      cardFlightEvent?.attackerRevealedRole ||
      pendingAction?.roleClaim) as GameCard | undefined;
    const defenderRole = (duelOutcome?.defenderRevealedRole ||
      cardFlightEvent?.defenderRevealedRole ||
      defenderClaim) as GameCard;

    const attackerTruth = duelOutcome
      ? duelOutcome.attackerWasTruth
      : (cardFlightEvent?.attackerWasTruth ?? false);
    const defenderTruth = duelOutcome
      ? duelOutcome.defenderWasTruth
      : (cardFlightEvent?.defenderWasTruth ?? false);

    const flipped =
      isDuelOutcome ||
      (isDuelFlight &&
        (cardFlightEvent?.attackerFlight === 'to_discard' ||
          cardFlightEvent?.defenderFlight === 'to_discard'));

    return (
      <div className="staked">
        {(!hasCardDeparted || isDuelFlight) && (
          <div className="duel">
            <div className="duel__side">
              <FlipCard
                artImage={attackerRole ? CARD_INFO[attackerRole]?.artImage : undefined}
                category={attackerRole ? CARD_INFO[attackerRole]?.category : undefined}
                flipped={flipped}
                wasTruth={attackerTruth}
                badge={claimBadge(String(pendingAction?.roleClaim || attackerRole || ''), target?.name)}
                flightClass={
                  isDuelFlight
                    ? flightClassFor(cardFlightEvent?.attackerFlight, cardFlightEvent?.attackerId)
                    : ''
                }
                flightLabel={isDuelFlight ? flightLabel(cardFlightEvent?.attackerFlight) : null}
                onClick={() => inspect(attackerRole)}
              />
            </div>

            <span className="duel__vs">дуэль</span>

            <div className="duel__side">
              <FlipCard
                artImage={CARD_INFO[defenderRole]?.artImage}
                category={CARD_INFO[defenderRole]?.category}
                flipped={flipped}
                wasTruth={defenderTruth}
                badge={String(defenderClaim)}
                flightClass={
                  isDuelFlight
                    ? flightClassFor(cardFlightEvent?.defenderFlight, cardFlightEvent?.defenderId)
                    : ''
                }
                flightLabel={isDuelFlight ? flightLabel(cardFlightEvent?.defenderFlight) : null}
                onClick={() => inspect(defenderRole)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* 3. A single staked card under scrutiny. */
  const claimed = (pendingAction?.roleClaim || pendingAction?.name || '') as GameCard;
  const revealed = (revealOutcome?.revealedRole ||
    cardFlightEvent?.revealedRole ||
    (isPendingActionAfterTruthChallenge ? pendingAction?.roleClaim : undefined) ||
    cardFlightEvent?.roleClaim) as GameCard | undefined;
  const wasTruth = revealOutcome
    ? revealOutcome.wasTruth
    : (isPendingActionAfterTruthChallenge && (cardFlightEvent?.wasTruth ?? true));
  const flipped =
    !!revealOutcome ||
    (!!isPendingActionAfterTruthChallenge && !!pendingAction?.roleClaim) ||
    (isSingleFlight && cardFlightEvent?.flightType === 'to_discard');

  // Once the staked card has actually departed (its flight finished), it must
  // never pop back — a lingering overlayInstant (e.g. the veto stamp) is not
  // a reason to redraw a card that already flew off the table.
  const showPile = !pendingAction?.cardAlreadyResolved && (!hasCardDeparted || isSingleFlight);

  const badge = overlayInstant
    ? overlayInstant.card === 'Перенаправление'
      ? claimBadge(overlayInstant.card, target?.name)
      : overlayInstant.card
    : claimBadge(String(claimed), target?.name);

  if (!showPile && !overlayEl) return null;

  return (
    <div className="staked">
      <div className="staked__pile">
        {showPile && (
          <FlipCard
            artImage={revealed ? CARD_INFO[revealed]?.artImage : undefined}
            category={revealed ? CARD_INFO[revealed]?.category : CARD_INFO[claimed]?.category}
            flipped={flipped}
            wasTruth={!!wasTruth}
            flightClass={
              isSingleFlight
                ? flightClassFor(cardFlightEvent?.flightType, cardFlightEvent?.actorId)
                : ''
            }
            flightLabel={isSingleFlight ? flightLabel(cardFlightEvent?.flightType) : null}
            badge={badge}
            onClick={() => inspect(revealed || claimed)}
          />
        )}
        {overlayEl}
      </div>
    </div>
  );
};
