/**
 * The middle of the table: badges, the duel frame, and the holes cards fly
 * into. It draws no card of its own — `CardLayer` owns every card node — so
 * everything here is layout plus the Russian labels that name what is
 * happening.
 */
import React from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { GameCard } from '@kinglier/engine/data/cardDescriptions';
import { courtly } from '../lib/text';
import { declineGen } from '@kinglier/engine/utils/russianText';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';

/** Last word of a titled name: «Графиня Елена» → «Елена». */
function givenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function claimBadge(claim: string, targetName?: string | null): string {
  return targetName ? `${claim} против ${declineGen(givenName(targetName))}` : claim;
}

interface StakedCardArenaProps {
  /**
   * Vestigial: card inspection moved to the card layer along with the cards
   * themselves. Kept so `Arena` still typechecks until it stops passing it.
   */
  onInspectCard?: (card: GameCard) => void;
}

export const StakedCardArena: React.FC<StakedCardArenaProps> = () => {
  const {
    players,
    pendingAction,
    turnPhase,
    duelOutcome,
    pendingDuelDefenderRoleClaim,
    overlayInstant
  } = useGameStore();

  const target = pendingAction?.targetId
    ? players.find(p => p.id === pendingAction.targetId)
    : null;

  if (!pendingAction && !overlayInstant) return null;

  const overlayAnchor = overlayInstant ? (
    <CardAnchor zone={{ kind: 'overlay' }} className="cardanchor--overlay" />
  ) : null;

  /* 1. Plain court action — a badge, no card is staked. */
  if (pendingAction?.type === 'normal') {
    const isCardExchange = pendingAction.name.includes('Сменить');
    const actorName = players.find(p => p.id === pendingAction.actorId)?.name ?? '';
    const exchangesTwoCards = (pendingAction.stakedCardIds?.length ?? 1) >= 2;
    const label = isCardExchange
      ? `${actorName} меняет карт${exchangesTwoCards ? 'ы' : 'у'}`
      : courtly(pendingAction.name);
    return (
      <div className="staked">
        <span className="claimbadge claimbadge--solo">{claimBadge(label, target?.name)}</span>
      </div>
    );
  }

  /* 2. An instant laid openly in the middle while its window runs. */
  if (pendingAction?.type === 'instant') {
    const laid = (pendingAction.instantType || pendingAction.name) as GameCard;
    return (
      <div className="staked">
        <div className="staked__pile">
          <CardAnchor zone={{ kind: 'table' }} />
          {overlayAnchor}
          <span className="claimbadge">{claimBadge(laid, target?.name)}</span>
        </div>
      </div>
    );
  }

  /* 3. Laying a plot goes to the seat slot, not the table. The table keeps
     only the veto overlay or an already-slotted plot being resolved. */
  if (pendingAction?.type === 'plot') {
    const plot = (pendingAction.plotType || pendingAction.name) as GameCard;
    const laying = !pendingAction.conspiracyEffect && !pendingAction.isMorningTrigger;
    if (laying && !overlayAnchor) return null;
    return (
      <div className="staked">
        <div className="staked__pile">
          {overlayAnchor}
          <span className="claimbadge">{claimBadge(plot, target?.name)}</span>
        </div>
      </div>
    );
  }

  /* 4. Duel — two cards clash. */
  const isDuelOutcome = turnPhase === 'DUEL_OUTCOME' && !!duelOutcome;
  if (turnPhase === 'DUEL_ATTACKER_WINDOW' || isDuelOutcome) {
    const defenderClaim = (pendingDuelDefenderRoleClaim ||
      duelOutcome?.defenderClaim ||
      'Казначей') as GameCard;
    const attackerClaim = String(
      pendingAction?.roleClaim || duelOutcome?.attackerRevealedRole || ''
    );
    return (
      <div className="staked">
        <div className="duel">
          <div className="duel__side">
            <CardAnchor zone={{ kind: 'duel', side: 'attacker' }}>
              <span className="claimbadge">{claimBadge(attackerClaim, target?.name)}</span>
            </CardAnchor>
          </div>

          <span className="duel__vs">дуэль</span>

          <div className="duel__side">
            <CardAnchor zone={{ kind: 'duel', side: 'defender' }}>
              <span className="claimbadge">{String(defenderClaim)}</span>
            </CardAnchor>
          </div>
        </div>
      </div>
    );
  }

  /* 5. A single staked card under scrutiny. */
  const claimed = String(pendingAction?.roleClaim || pendingAction?.name || '');
  const badge = overlayInstant
    ? overlayInstant.card === 'Перенаправление'
      ? claimBadge(overlayInstant.card, target?.name)
      : overlayInstant.card
    : claimBadge(claimed, target?.name);

  return (
    <div className="staked">
      <div className="staked__pile">
        <CardAnchor zone={{ kind: 'stake' }} />
        {overlayAnchor}
        <span className="claimbadge">{badge}</span>
      </div>
    </div>
  );
};
