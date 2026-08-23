import React from 'react';
import { useGameStore } from '../engine/GameStore';
import { CARD_INFO } from '../engine/cards';
import { CARD_DESCRIPTIONS, type CardCategory, type GameCard } from '../data/cardDescriptions';
import { courtly } from '../lib/text';
import { declineAcc, declineGen } from '../engine/utils/russianText';

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
  onClick?: () => void;
}

const FlipCard: React.FC<FlipCardProps> = ({
  artImage,
  category,
  flipped,
  wasTruth,
  flightClass = '',
  flightLabel,
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
  </div>
);

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
  const target = pendingAction?.targetId
    ? players.find(p => p.id === pendingAction.targetId)
    : null;

  if (!pendingAction && !cardFlightEvent) return null;

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

  /* 1. Plain court action — a plaque, no card is staked. */
  if (pendingAction?.type === 'normal') {
    return (
      <div className="staked">
        <div className="plaque">
          <div className="plaque__tag">Действие двора</div>
          <div className="plaque__claim">
            {actor?.name} — <em>{courtly(pendingAction.name)}</em>
            {target && <> против {declineGen(target.name)}</>}
          </div>
          <div className="plaque__desc">{courtly(pendingAction.description)}</div>
        </div>
      </div>
    );
  }

  const isDuelWindow = turnPhase === 'DUEL_ATTACKER_WINDOW';
  const isDuelOutcome = turnPhase === 'DUEL_OUTCOME' && !!duelOutcome;
  const isDuelFlight = !!cardFlightEvent?.isDuel;
  const isRevealOutcome = turnPhase === 'REVEAL_OUTCOME' && !!revealOutcome;
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
              <span className="duel__tag">{actor?.name} — нападение</span>
              <FlipCard
                artImage={attackerRole ? CARD_INFO[attackerRole]?.artImage : undefined}
                category={attackerRole ? CARD_INFO[attackerRole]?.category : undefined}
                flipped={flipped}
                wasTruth={attackerTruth}
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
              <span className="duel__tag">{target?.name} — защита</span>
              <FlipCard
                artImage={CARD_INFO[defenderRole]?.artImage}
                category={CARD_INFO[defenderRole]?.category}
                flipped={flipped}
                wasTruth={defenderTruth}
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

        <div className={`plaque ${hasCardDeparted ? 'plaque--leaving' : ''}`}>
          <div className="plaque__tag">{isDuelOutcome ? 'Итог дуэли' : 'Вызов на дуэль'}</div>
          <div className="plaque__claim">
            {isDuelOutcome
              ? courtly(duelOutcome.message)
              : `${target?.name} выставил щит «${defenderClaim}» против ${actor ? declineGen(actor.name) : ''}`}
          </div>
        </div>
      </div>
    );
  }

  /* 3. A single staked card under scrutiny. */
  const claimed = (pendingAction?.roleClaim || pendingAction?.name || '') as GameCard;
  const revealed = (revealOutcome?.revealedRole ||
    cardFlightEvent?.revealedRole ||
    cardFlightEvent?.roleClaim ||
    pendingAction?.roleClaim) as GameCard | undefined;
  const wasTruth = revealOutcome
    ? revealOutcome.wasTruth
    : (cardFlightEvent?.wasTruth ?? false);
  const flipped =
    !!revealOutcome || (isSingleFlight && cardFlightEvent?.flightType === 'to_discard');

  let tag = 'Карта на кону';
  let desc = pendingAction?.description ? courtly(pendingAction.description) : 'Двор взвешивает заявление.';

  if (turnPhase === 'TARGET_REACTION_WINDOW' && target) {
    tag = 'Атака на игрока';
    desc = `${actor?.name} нападает на ${declineAcc(target.name)}. Жертва выбирает ответ.`;
  } else if (isRevealOutcome && revealOutcome) {
    tag = revealOutcome.wasTruth ? 'Правда доказана' : 'Пойман на лжи';
    desc = courtly(revealOutcome.message);
  }

  return (
    <div className="staked">
      {(!hasCardDeparted || isSingleFlight) && (
        <FlipCard
          artImage={revealed ? CARD_INFO[revealed]?.artImage : undefined}
          category={revealed ? CARD_INFO[revealed]?.category : CARD_INFO[claimed]?.category}
          flipped={flipped}
          wasTruth={wasTruth}
          flightClass={
            isSingleFlight
              ? flightClassFor(cardFlightEvent?.flightType, cardFlightEvent?.actorId)
              : ''
          }
          flightLabel={isSingleFlight ? flightLabel(cardFlightEvent?.flightType) : null}
          onClick={() => inspect(revealed || claimed)}
        />
      )}

      {pendingAction && (
        <div
          className={[
            'plaque',
            isRevealOutcome ? (revealOutcome!.wasTruth ? 'plaque--truth' : 'plaque--bluff') : '',
            hasCardDeparted ? 'plaque--leaving' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => inspect(revealed || claimed)}
        >
          <div className="plaque__tag">{tag}</div>
          <div className="plaque__claim">
            {actor?.name} заявляет <em>«{claimed}»</em>
            {target && <> против {declineGen(target.name)}</>}
          </div>
          <div className="plaque__desc">{desc}</div>
        </div>
      )}
    </div>
  );
};
