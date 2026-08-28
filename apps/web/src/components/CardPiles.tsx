/**
 * The deck and the discard, as two real piles standing beside the table.
 *
 * They used to be invisible points just inside the felt's rim. They are now
 * furniture: a face-down back with a counted caption under it, standing
 * together above the right-hand seat, where neither the felt, nor a seat
 * panel, nor the hand can ever reach them.
 *
 * Two things are worth knowing about them:
 *
 *  1. **Each pile is a `CardAnchor`, and the anchor is the back itself** —
 *     not the widget, which is taller by the height of its caption. A card
 *     flying to the discard has to land on the picture, not halfway down the
 *     word «Сброс».
 *
 *  2. **The pile never draws a *moving* card, and `CardLayer` never draws a
 *     *resting* one here.** Deck and discard are hidden zones over there: a
 *     card at rest in one sits at `opacity: 0`, having faded out over the
 *     last stretch of its approach. What the player sees at the end of that
 *     flight is this widget's static back. That is the whole trick behind a
 *     closed discard — nothing ever has to be turned face-down again, because
 *     the face that was on screen simply fades away as the pile takes it.
 */
import React from 'react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { CardAnchor } from '../motion/AnchorRegistry.tsx';
import { usePileArrivals } from '../motion/pileTally.ts';
import type { Zone } from '../motion/zones.ts';

const CARD_BACK = '/assets/cards/back-dual-face.webp';

const Pile: React.FC<{
  zone: Zone;
  className: string;
  label: string;
  count: number;
}> = ({ zone, className, label, count }) => (
  <div className={`pile ${className}`}>
    <CardAnchor className="pile__slot" zone={zone}>
      <div
        className={`pile__back${count === 0 ? ' pile__back--empty' : ''}`}
        style={count === 0 ? undefined : { backgroundImage: `url(${CARD_BACK})` }}
      />
    </CardAnchor>
    <span className="pile__count">
      {label}
      {count}
    </span>
  </div>
);

/**
 * Both piles. Counted straight off the store, so the numbers are live — and
 * in online play `deck` is a synthetic array sized from `deckSize`, which
 * makes `deck.length` right there too.
 */
export const CardPiles: React.FC = () => {
  const deckCount = useGameStore(s => s.deck.length);
  /* Движок кладёт карту в сброс в тот же миг, когда решает её судьбу, а лететь
     ей ещё почти секунду. Считаем доехавшее: подпись не должна обгонять
     картинку — см. `pileTally`. */
  const discardInFlight = usePileArrivals('discard');
  const discardCount = Math.max(0, useGameStore(s => s.discardPile.length) - discardInFlight);

  return (
    <div className="piles">
      <Pile
        zone={{ kind: 'deck' }}
        className="pile--deck"
        label="Колода: "
        count={deckCount}
      />
      {/* Closed, deliberately: the back is all anyone ever sees of it, and
          the pile is not clickable — there is nothing to browse. */}
      <Pile
        zone={{ kind: 'discard' }}
        className="pile--discard"
        label="Сброс: "
        count={discardCount}
      />
    </div>
  );
};
