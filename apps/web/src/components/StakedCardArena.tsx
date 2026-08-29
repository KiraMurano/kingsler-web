/**
 * The middle of the table: badges, the duel frame, and the holes cards fly
 * into. It draws no card of its own — `CardLayer` owns every card node — so
 * everything here is layout plus the Russian labels that name what is
 * happening.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useShallow } from 'zustand/react/shallow';
import type { GameCard } from '@kinglier/engine/data/cardDescriptions';
import type { Player } from '@kinglier/engine/types';
import { courtly } from '../lib/text';
import { genOf } from '@kinglier/engine/utils/russianText';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';
import { dur } from '../motion/tokens.ts';

/** Last word of a titled name: «Графиня Елена» → «Елена». */
function givenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/**
 * Бейдж короткий, поэтому титул отбрасывается: «Вор против Елены», а не
 * «Вор против Графини Елены». Склоняется только имя бота — ник живого игрока
 * остаётся как есть.
 */
function claimBadge(claim: string, target?: Player | null): string {
  if (!target) return claim;
  const кого = genOf({ name: givenName(target.name), isBot: target.isBot });
  return `${claim} против ${кого}`;
}

/**
 * The label under a card on the table — «Наследник против Бориса», «дуэль».
 *
 * It used to snap from one claim to the next mid-action; now the old wording
 * sinks away before the new one rises, keyed on the text itself so an
 * unchanged badge is left alone. `mode="wait"` rather than the default: the
 * badge is absolutely positioned, so two of them at once would simply print
 * over each other.
 *
 * The anchors around it are deliberately *not* inside any `AnimatePresence`.
 * `CardLayer` measures anchors every frame; an anchor that lingered while
 * fading and drifting would drag the cards chasing it along with it.
 */
const ClaimBadge: React.FC<{ text: string; solo?: boolean }> = ({ text, solo }) => {
  const reduce = !!useReducedMotion();
  const rise = reduce ? 0 : 6;
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={text}
        className={solo ? 'claimbadge claimbadge--solo' : 'claimbadge'}
        initial={{ opacity: 0, y: rise }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -rise }}
        transition={{ duration: reduce ? 0.12 : dur.fade, ease: [0.4, 0, 0.2, 1] }}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  );
};

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
  } = useGameStore(
    useShallow(s => ({
      players: s.players,
      pendingAction: s.pendingAction,
      turnPhase: s.turnPhase,
      duelOutcome: s.duelOutcome,
      pendingDuelDefenderRoleClaim: s.pendingDuelDefenderRoleClaim,
      overlayInstant: s.overlayInstant
    }))
  );

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
        <ClaimBadge solo text={claimBadge(label, target)} />
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
          <ClaimBadge text={claimBadge(laid, target)} />
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
          <ClaimBadge text={claimBadge(plot, target)} />
        </div>
      </div>
    );
  }

  /* 4. Duel — two cards clash. */
  const isDuelOutcome = turnPhase === 'DUEL_OUTCOME' && !!duelOutcome;
  if (turnPhase === 'DUEL_CLASH' || isDuelOutcome) {
    const defenderClaim = (pendingDuelDefenderRoleClaim ||
      duelOutcome?.defenderClaim ||
      'Казначей') as GameCard;
    const attackerClaim = String(
      pendingAction?.roleClaim || duelOutcome?.attackerRevealedRole || ''
    );
    return (
      <div className="staked">
        {/*
          Ристалище, а не короб.
          Ничего непрозрачного поверх карт здесь нет и быть не может: слой карт
          лежит выше арены, и всякая плашка, поднятая над ним, закрыла бы те
          самые карты, ради которых нарисована. Поэтому «рамка» — это подсвет
          снизу и две золотые линии, а слово стоит под картами, где им не
          мешает.
        */}
        <div className="duel">
          <div className="duel__lists" aria-hidden />

          <div className="duel__row">
            <div className="duel__side">
              <CardAnchor zone={{ kind: 'duel', side: 'attacker' }}>
                {/* Ва-банк едет на дуэль вместе со ставкой, которую он
                    удваивает. Без своего якоря здесь зона `overlay` оставалась
                    незарегистрированной, и слой карт держал карту на прежнем
                    месте: ставка улетала в середину стола, а Ва-банк оставался
                    висеть там, где заявку делали. Якорь вложен в сторону
                    атакующего — Ва-банк принадлежит его заявке, а не столу. */}
                {overlayAnchor}
                <ClaimBadge text={claimBadge(attackerClaim, target)} />
              </CardAnchor>
            </div>
            <div className="duel__side">
              <CardAnchor zone={{ kind: 'duel', side: 'defender' }}>
                <ClaimBadge text={String(defenderClaim)} />
              </CardAnchor>
            </div>
          </div>

          <div className="duel__cry">
            <span className="duel__rule" aria-hidden />
            <span className="duel__word">Дуэль</span>
            <span className="duel__rule duel__rule--r" aria-hidden />
          </div>
        </div>
      </div>
    );
  }

  /* 5. A single staked card under scrutiny. */
  const claimed = String(pendingAction?.roleClaim || pendingAction?.name || '');
  const badge = overlayInstant
    ? overlayInstant.card === 'Перенаправление'
      ? claimBadge(overlayInstant.card, target)
      : overlayInstant.card
    : claimBadge(claimed, target);

  return (
    <div className="staked">
      <div className="staked__pile">
        <CardAnchor zone={{ kind: 'stake' }} />
        {overlayAnchor}
        <ClaimBadge text={badge} />
      </div>
    </div>
  );
};
