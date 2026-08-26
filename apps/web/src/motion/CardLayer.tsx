/**
 * Every card at the table, in one fixed overlay.
 *
 * A card is a single DOM node keyed by its `CardId`. It mounts when the card
 * first exists and it does not unmount while the card exists anywhere — so
 * hand → stake → discard is one uninterrupted movement of one node, not an
 * exit animation followed by an entrance. Layout renders empty
 * `<CardAnchor>`s (see `AnchorRegistry.tsx`); this layer springs each card
 * toward the anchor its zone names.
 *
 * ## Transforms only
 *
 * Nothing here animates `width` or `height`. Every card-shaped hole in this
 * game is 2:3, so one uniform `scale` expresses every size change, from a
 * full hand card down to an opponent's mini-slot. Each card node is given a
 * fixed base size — the hand-card size — and is then translated and scaled:
 *
 *     x = rect.left, y = rect.top, scale = rect.width / baseWidth
 *
 * with `transform-origin: top left`, so the scaled node's top-left corner
 * lands exactly on the anchor's. Layout is never invalidated by an animating
 * card; the whole thing stays on the compositor.
 *
 * ## No React renders in the frame loop
 *
 * The per-frame work is: read the anchor's rect out of the registry's ref,
 * and push three numbers into `MotionValue`s with `.set()`. No `useState`,
 * no store subscription, nothing that could schedule a render. React only
 * re-renders this tree when the set of cards or their zones actually change —
 * which is a handful of times per turn, not sixty times per second.
 *
 * ## A missing anchor never teleports a card
 *
 * If the zone a card wants has no registered anchor — the duel boxes are
 * unmounted, a seat has not laid out yet — the card holds its last known
 * target and simply stays put. Only a card that has *never* had a target is
 * treated as new: it stays at `opacity: 0` until an anchor appears, then
 * jumps to it and fades in rather than flying in from the origin.
 *
 * ## The flip is a child
 *
 * The outer node owns translate/scale; a nested node owns `rotateY` for the
 * face flip. Projection and 3D never fight over the same transform, and the
 * flip reuses the existing `.flip` / `.flip__inner` / `.flip__face` art
 * treatment from `styles/layout.css`.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { MotionValue } from 'motion/react';
import type { CardId } from '@kinglier/engine/cardInstance';
import type { GameCard } from '@kinglier/engine/types';
import { CARD_INFO } from '@kinglier/engine/cards';
import { useAnchorRects } from './AnchorRegistry.tsx';
import { dur, spring } from './tokens.ts';
import { ZONE_PRECEDENCE, zoneKey } from './zones.ts';
import type { PlacedCard, Zone } from './zones.ts';

const CARD_BACK = '/assets/cards/back-dual-face.webp';

/**
 * The card node's intrinsic size, from which every other size is a `scale`.
 * Written as CSS rather than as numbers so it tracks the viewport on its own;
 * the numeric width is read back off a hidden element of exactly this size.
 */
const CARD_BASE_HEIGHT = 'min(32vh, 258px)';
const CARD_BASE_WIDTH = 'calc(min(32vh, 258px) * 2 / 3)';

/** Above the table and its badges, below backdrops, sheets and dialogs. */
const CARD_LAYER_Z = 75;

/**
 * How many deck cards are worth a DOM node. `deriveCardZones` honestly emits
 * every card in the deck — around forty-seven of them — all stacked on one
 * invisible corner anchor where at most the top one is ever seen. Only the
 * few that a draw could plausibly pull are drawn.
 */
const DECK_VISIBLE = 3;

/**
 * How long a card that has just flown *into* the deck keeps its node after
 * arriving. A reshuffle sends cards home; they need to finish the flight
 * before they are allowed to vanish into the culled remainder.
 */
const DECK_SETTLE_MS = 900;

/* -------------------------------------------------------------------------
   Interaction
   ------------------------------------------------------------------------- */

/**
 * Everything the layer needs to know about what a card *means*, supplied by
 * whoever owns the game state. Keeping this in a context is what lets `Hand`,
 * `OpponentSeat` and the rest stay dumb: they render anchors and nothing
 * else, while the one node that can actually be clicked lives here.
 */
export interface CardInteraction {
  /** Click / primary action on a playable card. */
  onActivate?: (cardId: CardId) => void;
  /** Open the card description modal. */
  onInspect?: (card: GameCard) => void;
  /** May this card be acted on right now? Drives hover, press and cursor. */
  isPlayable?: (placed: PlacedCard) => boolean;
  /** Short label pinned to the card, e.g. «вето», «на дуэль». */
  hintFor?: (placed: PlacedCard) => string | undefined;
}

const CardInteractionContext = createContext<CardInteraction>({});

export const CardInteractionProvider: React.FC<{
  value: CardInteraction;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <CardInteractionContext.Provider value={value}>{children}</CardInteractionContext.Provider>
);

/* -------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------- */

interface BaseSize {
  width: number;
  height: number;
}

interface Target {
  x: number;
  y: number;
  scale: number;
}

/** Set only on change: an unchanged `.set()` is wasted work sixty times a second. */
function drive(value: MotionValue<number>, next: number): void {
  if (value.get() !== next) value.set(next);
}

/**
 * A card's resting tilt, by zone. An instant laid over the stake sits askew
 * so both cards read as two objects rather than one; everything else lies
 * square. Task 7 extends this into the full per-transition catalog.
 */
function restingRotation(zone: Zone): number {
  return zone.kind === 'overlay' ? 12 : 0;
}

/** Touch and pen devices get no hover state — there is no cursor to follow. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarse(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

/* -------------------------------------------------------------------------
   One card
   ------------------------------------------------------------------------- */

const LayerCard: React.FC<{ placed: PlacedCard; getBase: () => BaseSize }> = ({
  placed,
  getBase
}) => {
  const rects = useAnchorRects();
  const interaction = useContext(CardInteractionContext);
  const reduce = !!useReducedMotion();
  const coarse = useCoarsePointer();

  const key = zoneKey(placed.zone);

  /* Targets are written every frame; the springs chase them. Under reduced
     motion the targets are used directly and the springs idle unused. */
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const targetScale = useMotionValue(1);
  const springX = useSpring(targetX, spring.flight);
  const springY = useSpring(targetY, spring.flight);
  const springScale = useSpring(targetScale, spring.settle);
  const x = reduce ? targetX : springX;
  const y = reduce ? targetY : springY;
  const scale = reduce ? targetScale : springScale;

  const rotate = useMotionValue(restingRotation(placed.zone));
  const rotateY = useMotionValue(placed.face.known !== null ? 180 : 0);
  const opacity = useMotionValue(0);

  const lastTarget = useRef<Target | null>(null);
  const placedOnce = useRef(false);

  useAnimationFrame(() => {
    const rect = rects.get(key);
    const base = getBase();
    if (rect && base.width > 0) {
      lastTarget.current = { x: rect.left, y: rect.top, scale: rect.width / base.width };
    }

    const target = lastTarget.current;
    /* Never had an anchor: stay invisible rather than sit at 0,0. */
    if (!target) return;

    if (!placedOnce.current) {
      placedOnce.current = true;
      /* Arrive, do not fly in from the origin. `jump` moves the spring and
         its target together without leaving velocity behind. */
      targetX.jump(target.x);
      targetY.jump(target.y);
      targetScale.jump(target.scale);
      springX.jump(target.x);
      springY.jump(target.y);
      springScale.jump(target.scale);
      animate(opacity, 1, { duration: reduce ? 0 : dur.fade });
      return;
    }

    drive(targetX, target.x);
    drive(targetY, target.y);
    drive(targetScale, target.scale);
  });

  /* Resting tilt follows the zone, so it changes on render, not per frame. */
  const restRotation = restingRotation(placed.zone);
  const mounted = useRef(false);
  useEffect(() => {
    if (reduce || !mounted.current) {
      rotate.set(restRotation);
      return;
    }
    const controls = animate(rotate, restRotation, spring.flight);
    return () => controls.stop();
  }, [restRotation, reduce, rotate]);

  /* The flip. Face-down whenever the viewer may not read the card. Under
     reduced motion the 3D turn is replaced by a crossfade of the two faces
     (see `frontStyle` below) and `rotateY` is pinned flat. */
  const known = placed.face.known;
  const flipped = known !== null;
  useEffect(() => {
    if (reduce) {
      rotateY.set(0);
      return;
    }
    const target = flipped ? 180 : 0;
    if (!mounted.current) {
      rotateY.set(target);
      return;
    }
    const controls = animate(rotateY, target, { duration: dur.flip, ease: [0.4, 0, 0.2, 1] });
    return () => controls.stop();
  }, [flipped, reduce, rotateY]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  /* Keep the last face we were allowed to see. The art is then already
     loaded and painted on the hidden side before a flip starts, and a card
     turning back face-down does not blank its front halfway through the
     turn, while the front is still pointing at the viewer. Adjusting state
     during render is the React-sanctioned way to remember a previous prop —
     it costs one extra render on the frame a face becomes readable. */
  const [lastKnown, setLastKnown] = useState<GameCard | null>(known);
  if (known !== null && known !== lastKnown) setLastKnown(known);
  const art = known ?? lastKnown;
  const info = art ? CARD_INFO[art] : undefined;

  const playable = interaction.isPlayable?.(placed) ?? false;
  const hint = interaction.hintFor?.(placed);
  const canInspect = !!interaction.onInspect && !!art;
  const interactive = playable || canInspect;
  const lift = playable && !coarse && !reduce;

  const onClick = () => {
    if (playable && interaction.onActivate) {
      interaction.onActivate(placed.id);
      return;
    }
    if (art && interaction.onInspect) interaction.onInspect(art);
  };

  return (
    <motion.div
      className="cardlayer__card"
      data-zone={key}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: CARD_BASE_HEIGHT,
        width: CARD_BASE_WIDTH,
        transformOrigin: 'top left',
        zIndex: ZONE_PRECEDENCE[placed.zone.kind],
        pointerEvents: 'none',
        x,
        y,
        scale,
        opacity
      }}
    >
      {/* Tilt, hover and press. Separate from the node above so the rotation
          pivots around the card's middle rather than the anchor corner. */}
      <motion.div
        className={`cardlayer__hit ${playable ? 'is-playable' : 'is-idle'}`}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: interactive ? 'pointer' : 'default',
          rotate
        }}
        whileHover={lift ? { y: -14, scale: 1.03, transition: spring.hover } : undefined}
        whileTap={playable ? { scale: 0.97, transition: spring.press } : undefined}
        onClick={interactive ? onClick : undefined}
        title={info ? `«${info.name}» — ${info.shortDescription}` : undefined}
      >
        {/* `.flip` is pure art treatment now — perspective, radius, border,
            shadow and `backface-visibility`. Size, entrance and the turn all
            belong to this layer; see `styles/layout.css`. */}
        <div className="flip">
          <motion.div
            className="flip__inner"
            style={{ transformStyle: reduce ? 'flat' : 'preserve-3d', rotateY }}
          >
            <div className="flip__face" style={{ backgroundImage: `url(${CARD_BACK})` }} />
            <div
              className={['flip__face', 'flip__face--front', info ? `cardframe cardframe--${info.category}` : '']
                .filter(Boolean)
                .join(' ')}
              style={{
                backgroundImage: info ? `url(${info.artImage})` : undefined,
                ...(reduce
                  ? {
                      /* Crossfade instead of a turn: lie flat, on top of the
                         back, and fade in when the face becomes readable. */
                      transform: 'none',
                      backfaceVisibility: 'visible' as const,
                      opacity: flipped ? 1 : 0,
                      transition: `opacity ${dur.fade}s linear`
                    }
                  : null)
              }}
            />
          </motion.div>
        </div>
        {hint && <span className="handcard__hint">{hint}</span>}
      </motion.div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------
   Deck culling
   ------------------------------------------------------------------------- */

/**
 * Which of `cards` actually get a node.
 *
 * Everything outside the deck is always drawn — culling a card that is on
 * the table or in a hand would be a card disappearing. Inside the deck only
 * the top `DECK_VISIBLE` are drawn, plus any card that was somewhere else a
 * moment ago and is still flying home, so a reshuffle animates instead of
 * popping. `wasElsewhere` holds the zones as of the *previous commit*, which
 * is what lets the very render where a card enters the deck still recognise
 * it as an arrival rather than as one of the anonymous forty-seven.
 *
 * The deck's own order is the order `deriveCardZones` emitted it in, which is
 * the order of `GameState.deck` — the top of the deck first.
 */
function sameIds(a: ReadonlySet<CardId>, b: ReadonlySet<CardId>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function nonDeckIds(cards: PlacedCard[]): Set<CardId> {
  const ids = new Set<CardId>();
  for (const placed of cards) if (placed.zone.kind !== 'deck') ids.add(placed.id);
  return ids;
}

function useDrawnCards(cards: PlacedCard[]): PlacedCard[] {
  /* Where every card was as of the previous `cards` array. Remembering a
     previous prop by adjusting state during render is the React-sanctioned
     pattern (the same one `LayerCard` uses for the last readable face); an
     effect would be a commit too late, and by then the arriving card would
     already have been culled and its node thrown away. */
  const [seen, setSeen] = useState<PlacedCard[]>(cards);
  const [elsewhere, setElsewhere] = useState<ReadonlySet<CardId>>(() => new Set());
  /* Cards that have just flown into the deck and are still settling there. */
  const [lingering, setLingering] = useState<ReadonlySet<CardId>>(() => new Set());

  if (seen !== cards) {
    const wasElsewhere = nonDeckIds(seen);
    const arrived = cards.filter(
      placed => placed.zone.kind === 'deck' && wasElsewhere.has(placed.id)
    );
    setSeen(cards);
    setElsewhere(prev => (sameIds(prev, wasElsewhere) ? prev : wasElsewhere));
    if (arrived.length > 0) {
      setLingering(prev => {
        const merged = new Set(prev);
        for (const placed of arrived) merged.add(placed.id);
        return merged;
      });
    }
  }

  const drawn: PlacedCard[] = [];
  let deckRank = 0;
  for (const placed of cards) {
    if (placed.zone.kind !== 'deck') {
      drawn.push(placed);
      continue;
    }
    const rank = deckRank++;
    if (rank < DECK_VISIBLE || elsewhere.has(placed.id) || lingering.has(placed.id)) {
      drawn.push(placed);
    }
  }

  /* Keyed on `lingering` itself, so an unrelated re-render never restarts the
     window; a fresh arrival does, which is the behaviour we want. */
  useEffect(() => {
    if (lingering.size === 0) return;
    const handle = setTimeout(() => setLingering(new Set()), DECK_SETTLE_MS);
    return () => clearTimeout(handle);
  }, [lingering]);

  return drawn;
}

/* -------------------------------------------------------------------------
   The layer
   ------------------------------------------------------------------------- */

export const CardLayer: React.FC<{ cards: PlacedCard[] }> = ({ cards }) => {
  const drawn = useDrawnCards(cards);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const baseSize = useRef<BaseSize>({ width: 0, height: 0 });
  const getBase = useCallback(() => baseSize.current, []);

  /* The base size is a CSS expression, so the only honest way to know its
     pixel value is to measure an element that carries it. A ResizeObserver
     catches every viewport change without costing anything per frame. */
  useLayoutEffect(() => {
    const node = baseRef.current;
    if (!node) return;
    const read = () => {
      const rect = node.getBoundingClientRect();
      baseSize.current = { width: rect.width, height: rect.height };
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="cardlayer"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: CARD_LAYER_Z,
        overflow: 'hidden'
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: CARD_BASE_HEIGHT,
          width: CARD_BASE_WIDTH,
          visibility: 'hidden',
          pointerEvents: 'none'
        }}
        ref={baseRef}
      />
      {drawn.map(placed => (
        <LayerCard key={placed.id} placed={placed} getBase={getBase} />
      ))}
    </div>
  );
};
