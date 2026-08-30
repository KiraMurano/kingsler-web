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
 * ## The springs are integrated here, by hand
 *
 * Not out of bravado: the *catalog* (see `planFor`) gives each leg of a
 * journey its own spring, its own delay and its own fade, and it has to be
 * able to change all three in the middle of a flight. A `useSpring` is
 * configured once when it is created; swapping its configuration means
 * tearing the follower down and rebuilding it, which throws away exactly the
 * thing that makes springs worth having — the velocity the card is already
 * carrying. Twenty lines of semi-implicit Euler keep position and velocity in
 * a ref, so retargeting mid-flight, stiffening the spring mid-flight and
 * pausing the chase for a beat are all the same one-line change to that ref.
 *
 * The per-frame work stays what it was: read the anchor's rect out of the
 * registry's ref, integrate, and push numbers into `MotionValue`s. No
 * `useState`, no store subscription, nothing that schedules a render.
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
import { designRect } from '../lib/uiScale.ts';
import { dur, spring, tilt } from './tokens.ts';
import { ZONE_PRECEDENCE, zoneKey } from './zones.ts';
import type { PlacedCard, Zone, ZoneKind } from './zones.ts';

const CARD_BACK = '/assets/cards/back-dual-face.webp';

/**
 * The card node's intrinsic size, from which every other size is a `scale`.
 * Written as CSS rather than as numbers so it tracks the viewport on its own;
 * the numeric width is read back off a hidden element of exactly this size.
 */
const CARD_BASE_HEIGHT = 'min(calc(32 * var(--vh)), 258px)';
const CARD_BASE_WIDTH = 'calc(min(calc(32 * var(--vh)), 258px) * 2 / 3)';

/** Above the table and its badges, below backdrops, sheets and dialogs. */
const CARD_LAYER_Z = 75;

/**
 * How many deck cards are worth a DOM node. `deriveCardZones` honestly emits
 * every card in the deck — around forty-seven of them — all stacked on one
 * invisible corner anchor. Only the few that a draw could plausibly pull are
 * drawn, and even those are invisible until they leave.
 */
const DECK_VISIBLE = 3;

/**
 * How long a card that has just flown *into* the deck keeps its node after
 * arriving. A reshuffle sends cards home; they need to finish the flight
 * before they are allowed to vanish into the culled remainder.
 */
const DECK_SETTLE_MS = 900;

/** Position tolerance, in px, below which a card counts as arrived. */
const ARRIVED_PX = 0.6;

/** Reduced motion swaps every spring for this crossfade. */
const REDUCED_FADE_S = 0.12;

/**
 * Fraction of a journey over which a card entering or leaving an invisible
 * corner fades. §4 of the spec: «карта на подлёте к углу уменьшается и
 * гаснет, из угла — наоборот».
 */
const CORNER_FADE = 0.3;

/** Below this, a "journey" is really a nudge and fades on a timer instead. */
const MIN_FADE_TRAVEL_PX = 40;
const NUDGE_FADE_MS = 240;

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
  /**
   * What a card the viewer cannot read is *claiming* to be — the role a stake
   * was played on, the claim each side of a duel is standing behind. It is the
   * same word the claim badge under the card already prints, so it gives away
   * nothing; it is what makes a face-down card on the table clickable at all,
   * since there is no face to inspect. Returning the real face here would leak
   * a bluff, which is the one thing this game cannot afford.
   */
  claimFor?: (placed: PlacedCard) => GameCard | undefined;
  /** May this card be acted on right now? Drives hover, press and cursor. */
  isPlayable?: (placed: PlacedCard) => boolean;
  /**
   * Карта, которая ждёт, чтобы по ней нажали.
   *
   * Лежащая карта ничем не отличается от декорации, пока не шевельнётся:
   * заряженный «Тайный заговор» без этого выглядел как уже сыгранная интрига.
   * Лёгкое подрагивание — единственное, что говорит «по мне сейчас ходят».
   */
  isRestless?: (placed: PlacedCard) => boolean;
  /**
   * Is this a card in the viewer's own hand? Own cards answer to `onActivate`
   * whether or not they are playable, because the refusal — «Сейчас
   * распоряжается …» — is more useful than a card description the player did
   * not ask for. Everyone else's cards fall through to `onInspect`.
   */
  isOwnHand?: (placed: PlacedCard) => boolean;
  /** Is this card picked out right now, e.g. staked behind an open popup? */
  isSelected?: (placed: PlacedCard) => boolean;
}

const CardInteractionContext = createContext<CardInteraction>({});

export const CardInteractionProvider: React.FC<{
  value: CardInteraction;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <CardInteractionContext.Provider value={value}>{children}</CardInteractionContext.Provider>
);

/* -------------------------------------------------------------------------
   The motion catalog
   ------------------------------------------------------------------------- */

interface SpringSpec {
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * How one leg of a card's journey is flown. Recomputed the moment the card's
 * zone changes, and only then; everything else — a moving anchor, a resizing
 * window — is chased with whatever plan is current.
 */
interface Plan {
  /** Spring for the whole move. */
  move: SpringSpec;
  /**
   * Spring for the horizontal axis alone. Giving x a different stiffness from
   * y is what bends a straight line into an arc: the card gets across before
   * it comes down, the way a dealt card does.
   */
  moveX: SpringSpec;
  /** ms the card stays where it is before it starts chasing the new anchor. */
  delayMs: number;
  /** Resting tilt in degrees, or `null` to keep whatever tilt it has. */
  rotate: number | null;
  /** ms before the card is allowed to turn over, if its face also changed. */
  flipDelayMs: number;
  /** Whether this leg emerges from an invisible corner, sinks into one, or neither. */
  fade: 'in' | 'out' | 'none';
}

/** The two corners are anchors, not piles: a card at rest in one is not drawn. */
function isCorner(kind: ZoneKind): boolean {
  return kind === 'deck' || kind === 'discard';
}

/**
 * How high a scrutinised card rides. Above `ZONE_PRECEDENCE.overlay`, and by
 * a margin, so nothing the catalog does with the `+ 1` transit bump can put an
 * overlay back on top of a card the table is asking the court to read.
 */
const REVEALED_Z = ZONE_PRECEDENCE.overlay + 10;

/**
 * Where a card sits in the stack, at rest.
 *
 * Deliberately a *different* ordering from `ZONE_PRECEDENCE`, and the two must
 * not be collapsed into one table. `ZONE_PRECEDENCE` answers «which rule owns
 * this card» — it is what stops a staked card being drawn twice, and changing
 * it would change which zone a card lands in. This answers «what does the
 * player need to look at», which is a painting question with its own answer:
 * an action played under Ва-банк keeps its instant in the `overlay` zone lying
 * right across the stake, so when «не верю» turns the staked card over, the
 * card being revealed is the one card on the table nobody can see. A card
 * under scrutiny therefore rises above everything, its own overlay included,
 * for as long as the table is showing it.
 */
function stackOrder(placed: PlacedCard): number {
  if (placed.revealed && !isCorner(placed.zone.kind)) return REVEALED_Z;
  /* Оверлей, ушедший под сопровождаемые карты. Значение выбрано ниже `duel`,
     но выше `stake`: на дуэли Ва-банк обязан оказаться под обеими ставками
     сразу, не дожидаясь вскрытия, которое поднимет их на `REVEALED_Z`. */
  if (placed.underlay) return ZONE_PRECEDENCE.duel - 5;
  return ZONE_PRECEDENCE[placed.zone.kind];
}

/** Where a card lies at rest, by what it is doing. */
function restingRotation(zone: Zone): number | null {
  switch (zone.kind) {
    case 'overlay':
      return tilt.overlay;
    case 'stake':
      return tilt.stake;
    case 'duel':
      return zone.side === 'attacker' ? tilt.duelAttacker : tilt.duelDefender;
    case 'discard':
      /* Already fading into the corner — a straightening card on the way out
         is motion nobody asked for. It keeps the tilt it was lying at. */
      return null;
    default:
      return 0;
  }
}

const ARC: SpringSpec = { stiffness: 350, damping: 32, mass: 1 };

/** Context the catalog needs that the two zones do not carry themselves. */
interface LegContext {
  /** Hand slot being flown into, for staggering a two-card draw. */
  slot: number;
  /**
   * How long this card has been readable, in ms, or `null` if it is face-down.
   * A card that has just been turned over has to stay put long enough to be
   * read before it is allowed to leave — and a card nobody has turned over has
   * nothing to read, so it leaves at once.
   */
  faceUpForMs: number | null;
}

/**
 * The per-transition catalog, keyed on where the card was and where it is
 * going. Everything the table does to a card is one of these rows; nothing
 * anywhere else in the app writes a card animation.
 */
function planFor(from: Zone, to: Zone, ctx: LegContext): Plan {
  const base: Plan = {
    move: spring.flight,
    moveX: spring.flight,
    delayMs: 0,
    rotate: restingRotation(to),
    flipDelayMs: 0,
    fade: isCorner(from.kind) === isCorner(to.kind) ? 'none' : isCorner(to.kind) ? 'out' : 'in'
  };

  switch (to.kind) {
    case 'hand': {
      /* Dealt out of the top-left corner: face-down, arcing across, turning
         over as it lands. Two cards drawn at once are separated by a beat. */
      if (from.kind === 'deck') {
        return {
          ...base,
          moveX: ARC,
          delayMs: ctx.slot * dur.stagger * 1000,
          flipDelayMs: 260 + ctx.slot * dur.stagger * 1000
        };
      }
      /* Coming home to a slot it already owns: nobody doubted, the duel was
         called off. One continuous move, tighter than a flight, no fade. */
      return { ...base, move: spring.settle, moveX: spring.settle };
    }

    case 'discard': {
      /* An instant lying on top of the stake follows it out rather than
         leaving with it, so two cards departing the same point read as two. */
      if (from.kind === 'overlay') return { ...base, delayMs: dur.trail * 1000 };
      /* A card the table just turned over has to be readable before it goes.
         This pause belongs to the layer: the engine holds its outcome on
         screen for its own reasons and knows nothing about the flight. A card
         leaving one invisible corner for the other has nothing to be read and
         waits for nothing. */
      if (ctx.faceUpForMs !== null && !isCorner(from.kind)) {
        const readable = (dur.flip + dur.hold) * 1000;
        return { ...base, delayMs: Math.max(0, readable - ctx.faceUpForMs) };
      }
      return base;
    }

    /* Everything else — the stake, an overlay laid across it, the two sides
       of a duel, an instant laid open, a plot shrinking into its slot — is a
       flight to a new place at whatever tilt that place implies. */
    default:
      return base;
  }
}

/* -------------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------------- */

interface BaseSize {
  width: number;
  height: number;
}

interface Vec {
  x: number;
  y: number;
  scale: number;
}

/** Set only on change: an unchanged `.set()` is wasted work sixty times a second. */
function drive(value: MotionValue<number>, next: number): void {
  if (value.get() !== next) value.set(next);
}

/**
 * One semi-implicit Euler step of a damped spring, sub-stepped so a dropped
 * frame cannot blow the integration up. Returns the new position; velocity is
 * written back through `vel`.
 */
function integrate(
  pos: number,
  vel: { v: number },
  target: number,
  s: SpringSpec,
  deltaMs: number
): number {
  const clamped = Math.min(deltaMs, 64);
  const steps = Math.max(1, Math.ceil(clamped / 8));
  const h = clamped / steps / 1000;
  let p = pos;
  let v = vel.v;
  for (let i = 0; i < steps; i++) {
    const a = (s.stiffness * (target - p) - s.damping * v) / s.mass;
    v += a * h;
    p += v * h;
  }
  vel.v = v;
  return p;
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

/** Everything the frame loop keeps between frames. */
interface Flight {
  /** Integrated position, or `null` until an anchor has ever been found. */
  pos: Vec | null;
  vel: { x: { v: number }; y: { v: number }; scale: { v: number } };
  /** Last anchor rect seen for the *current* zone, in card-node coordinates. */
  target: Vec | null;
  /** Zone the current plan was made for, as a key and in full. */
  zone: string | null;
  zoneValue: Zone | null;
  /** Kind of the zone this leg left, for the in-transit stacking bump. */
  fromKind: ZoneKind;
  plan: Plan;
  /** Where the card waits out `plan.delayMs`. */
  parked: Vec | null;
  /** Timestamp at which the new target takes over. */
  startAt: number;
  /** Straight-line distance at the start of the leg, for the fade envelope. */
  travel: number;
  /** Timestamp the leg began, for fading a journey too short to measure. */
  legAt: number;
  arrived: boolean;
  /** When the card last became readable, for the pause before it leaves. */
  faceUpAt: number | null;
  /** Flip state the loop has already acted on. */
  flipped: boolean;
}

const LayerCard: React.FC<{ placed: PlacedCard; getBase: () => BaseSize }> = ({
  placed,
  getBase
}) => {
  const rects = useAnchorRects();
  const interaction = useContext(CardInteractionContext);
  const reduce = !!useReducedMotion();
  const coarse = useCoarsePointer();

  const key = zoneKey(placed.zone);
  const slot = placed.zone.kind === 'hand' ? placed.zone.slot : 0;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(0);
  const zIndex = useMotionValue(stackOrder(placed));
  const rotate = useMotionValue(restingRotation(placed.zone) ?? 0);
  const rotateY = useMotionValue(placed.face.known !== null ? 180 : 0);

  /* The lean towards the cursor. Static spring configuration, so these two
     may stay `useSpring` followers — only the flight springs need swapping. */
  const tiltXTarget = useMotionValue(0);
  const tiltYTarget = useMotionValue(0);
  const tiltX = useSpring(tiltXTarget, spring.hover);
  const tiltY = useSpring(tiltYTarget, spring.hover);

  const flipped = placed.face.known !== null;

  const flight = useRef<Flight>({
    pos: null,
    vel: { x: { v: 0 }, y: { v: 0 }, scale: { v: 0 } },
    target: null,
    zone: null,
    zoneValue: null,
    fromKind: placed.zone.kind,
    plan: {
      move: spring.flight,
      moveX: spring.flight,
      delayMs: 0,
      rotate: restingRotation(placed.zone),
      flipDelayMs: 0,
      fade: 'none'
    },
    parked: null,
    startAt: 0,
    travel: 0,
    legAt: 0,
    arrived: true,
    faceUpAt: null,
    flipped
  });

  useAnimationFrame((time, delta) => {
    const f = flight.current;
    const base = getBase();
    const rect = rects.get(key);

    /* Recomputed every frame rather than only on a zone change: a card can
       rise in the stack without moving an inch — that is exactly what a reveal
       under Ва-банк is — so the stacking order has to follow `revealed`, not
       just `zone`. `drive` makes an unchanged value free. */
    const resting = stackOrder(placed);

    /* 1. Where does this zone sit right now? A zone with no registered anchor
       leaves the last target standing; the card holds rather than teleports. */
    if (rect && base.width > 0) {
      f.target = { x: rect.left, y: rect.top, scale: rect.width / base.width };
    }
    const target = f.target;
    if (!target) return;

    /* 2. First sighting: arrive, do not fly in from the origin. */
    if (!f.pos) {
      f.pos = { ...target };
      f.zone = key;
      f.zoneValue = placed.zone;
      f.arrived = true;
      f.faceUpAt = flipped ? time : null;
      drive(x, target.x);
      drive(y, target.y);
      drive(scale, target.scale);
      drive(zIndex, resting);
      animate(opacity, isCorner(placed.zone.kind) ? 0 : 1, {
        duration: reduce ? 0 : dur.fade
      });
      return;
    }

    /* 3. Face changes are their own event, independent of the zone: a card
       can turn over without moving (a reveal) or move without turning (a
       stake). `faceUpAt` is what the catalog's readability pause is measured
       from, so it is tracked here rather than in the plan. */
    if (flipped !== f.flipped) {
      f.flipped = flipped;
      f.faceUpAt = flipped ? time : null;
      if (reduce) {
        rotateY.set(0);
      } else {
        animate(rotateY, flipped ? 180 : 0, {
          duration: dur.flip,
          delay: f.plan.flipDelayMs / 1000,
          ease: [0.4, 0, 0.2, 1]
        });
      }
    }

    /* 4. A new zone is a new leg: pick its row out of the catalog. */
    if (key !== f.zone) {
      const previous = f.zoneValue ?? placed.zone;
      const plan = planFor(previous, placed.zone, {
        slot,
        faceUpForMs: f.faceUpAt === null ? null : time - f.faceUpAt
      });
      f.zone = key;
      f.zoneValue = placed.zone;
      f.plan = plan;
      f.parked = { ...f.pos };
      f.startAt = time + (reduce ? 0 : plan.delayMs);
      f.travel = Math.hypot(target.x - f.pos.x, target.y - f.pos.y);
      f.legAt = f.startAt;
      f.arrived = false;
      /* Remembered so the card can ride above both the zone it left and the
         zone it is entering for as long as it is in transit — a card crossing
         the table is never briefly behind one it passes. Applied below. */
      f.fromKind = previous.kind;
      if (plan.rotate !== null) {
        if (reduce) rotate.set(plan.rotate);
        else animate(rotate, plan.rotate, { ...spring.settle, delay: plan.delayMs / 1000 });
      }
    }

    /* 5. Chase. While a leg is still parked the card keeps the position it
       held when the leg began — that is the pause a revealed card takes to be
       read, and the beat a trailing instant waits out. */
    const parked = time < f.startAt && f.parked ? f.parked : null;
    const chase = parked ?? target;

    if (reduce) {
      f.pos = { ...chase };
      f.vel.x.v = f.vel.y.v = f.vel.scale.v = 0;
    } else {
      const plan = f.plan;
      f.pos = {
        x: integrate(f.pos.x, f.vel.x, chase.x, plan.moveX, delta),
        y: integrate(f.pos.y, f.vel.y, chase.y, plan.move, delta),
        scale: integrate(f.pos.scale, f.vel.scale, chase.scale, plan.move, delta)
      };
    }

    const gap = Math.hypot(target.x - f.pos.x, target.y - f.pos.y);
    if (!parked && !f.arrived && gap < ARRIVED_PX && Math.abs(target.scale - f.pos.scale) < 0.002) {
      f.pos = { ...target };
      f.vel.x.v = f.vel.y.v = f.vel.scale.v = 0;
      f.arrived = true;
    }

    drive(zIndex, f.arrived ? resting : Math.max(ZONE_PRECEDENCE[f.fromKind], resting) + 1);
    drive(x, f.pos.x);
    drive(y, f.pos.y);
    drive(scale, f.pos.scale);

    /* 6. The corner envelope. A card sinking into a corner keeps its opacity
       until the last `CORNER_FADE` of the trip and then goes out; a card
       coming out of one arrives at full opacity that far in. Tying the fade
       to distance rather than to a duration means it always finishes exactly
       as the card lands, whatever the spring did on the way. */
    const at = isCorner(placed.zone.kind) ? 0 : 1;
    if (parked) {
      /* Still standing where the leg began, so it is *that* zone's opacity
         that applies, not the destination's: a card waiting its turn to be
         dealt is still in the corner and still invisible, and a card holding
         to be read is still on the table and still solid. `fade` encodes
         which of the two ends is a corner; when neither or both are, the
         destination's answer is also the origin's. */
      drive(opacity, f.plan.fade === 'in' ? 0 : f.plan.fade === 'out' ? 1 : at);
    } else if (f.arrived || f.plan.fade === 'none') {
      drive(opacity, at);
    } else if (f.travel < MIN_FADE_TRAVEL_PX) {
      const t = Math.min(1, (time - f.legAt) / NUDGE_FADE_MS);
      drive(opacity, f.plan.fade === 'out' ? 1 - t : t);
    } else {
      const left = gap / (f.travel * CORNER_FADE);
      drive(opacity, Math.max(0, Math.min(1, f.plan.fade === 'out' ? left : 1 - left)));
    }
  });

  /* Under reduced motion the 3D turn is replaced by a crossfade of the two
     faces (see `frontStyle` below) and `rotateY` is pinned flat. */
  useEffect(() => {
    if (reduce) rotateY.set(0);
  }, [reduce, rotateY]);

  /* Keep the last face we were allowed to see. The art is then already
     loaded and painted on the hidden side before a flip starts, and a card
     turning back face-down does not blank its front halfway through the
     turn, while the front is still pointing at the viewer. Adjusting state
     during render is the React-sanctioned way to remember a previous prop —
     it costs one extra render on the frame a face becomes readable. */
  const [lastKnown, setLastKnown] = useState<GameCard | null>(placed.face.known);
  if (placed.face.known !== null && placed.face.known !== lastKnown) {
    setLastKnown(placed.face.known);
  }
  const art = placed.face.known ?? lastKnown;
  const info = art ? CARD_INFO[art] : undefined;

  /* The verdict outlives the outcome that produced it. The engine clears
     `revealOutcome` a second or two before it clears the action, and a stamp
     that vanished while the card was still lying there would read as a bug.
     A card that has been judged never returns to a hand, so remembering the
     verdict for the life of the node is safe. */
  const [verdict, setVerdict] = useState<boolean | null>(null);
  if (placed.wasTruth !== undefined && placed.wasTruth !== verdict) setVerdict(placed.wasTruth);
  const showVerdict =
    verdict !== null && flipped && placed.zone.kind !== 'hand' && placed.zone.kind !== 'deck';

  const corner = isCorner(placed.zone.kind);
  const playable = !corner && (interaction.isPlayable?.(placed) ?? false);
  const own = !corner && (interaction.isOwnHand?.(placed) ?? false);
  const restless = !corner && !reduce && (interaction.isRestless?.(placed) ?? false);
  const selected = !corner && (interaction.isSelected?.(placed) ?? false);

  /**
   * What clicking this card opens.
   *
   * `placed.face.known`, deliberately, and never `art`: `art` falls back to
   * the last face this node was *ever* allowed to show, which is right for
   * painting the hidden side of a card mid-flip and catastrophically wrong
   * here — a player staking their own card face-down would otherwise click it
   * and be handed their own bluff's real identity, and a screen-share or a
   * glance over a shoulder would give the table the same. When the face is
   * hidden the card is inspected by what it *claims* to be instead.
   */
  const claimed = corner ? undefined : interaction.claimFor?.(placed);
  const inspectable = placed.face.known ?? claimed;
  const tip = inspectable ? CARD_INFO[inspectable] : undefined;
  const canInspect = !corner && !!interaction.onInspect && !!inspectable;
  const interactive = own || canInspect;
  const lift = playable && !coarse && !reduce;

  const onClick = () => {
    /* The player's own card answers to the game first: if it cannot be played
       right now, `onActivate` is what says so. Only somebody else's card —
       on the table, in a plot slot, in the graveyard — opens its description. */
    if (own && interaction.onActivate) {
      interaction.onActivate(placed.id);
      return;
    }
    if (inspectable && interaction.onInspect) interaction.onInspect(inspectable);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lift) return;
    const box = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (box.left + box.width / 2)) / (box.width / 2);
    const dy = (e.clientY - (box.top + box.height / 2)) / (box.height / 2);
    const cap = tilt.pointerMax;
    tiltYTarget.set(Math.max(-cap, Math.min(cap, dx * cap)));
    tiltXTarget.set(Math.max(-cap, Math.min(cap, -dy * cap)));
  };

  const releaseTilt = () => {
    tiltXTarget.set(0);
    tiltYTarget.set(0);
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
        perspective: 900,
        zIndex,
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
        className={[
          'cardlayer__hit',
          playable ? 'is-playable' : 'is-idle',
          own ? 'is-own' : '',
          selected ? 'is-selected' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: interactive ? 'pointer' : 'default',
          rotate,
          rotateX: reduce ? 0 : tiltX,
          rotateY: reduce ? 0 : tiltY,
          transformStyle: 'preserve-3d'
        }}
        /* Подрагивание — только когда карта ждёт нажатия и не поднята меню:
           поднятая карта уже отвечает игроку, дёргать её незачем. */
        /* Только `y`: `rotate` и `scale` на этом же узле — моушен-значения из
           `style` (наклон карты и наведение), и анимировать их отсюда значит
           драться с ними за одно свойство. */
        animate={
          selected && !reduce
            ? { y: -18 }
            : restless
              ? { y: [0, -4, 0, -2.5, 0] }
              : { y: 0 }
        }
        transition={
          restless && !selected
            ? { duration: 1.6, repeat: Infinity, repeatDelay: 1.1, ease: 'easeInOut' }
            : spring.hover
        }
        whileHover={lift ? { y: -14, scale: 1.03, transition: spring.hover } : undefined}
        whileTap={playable && !reduce ? { scale: 0.97, transition: spring.press } : undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={releaseTilt}
        onPointerDown={releaseTilt}
        onClick={interactive ? onClick : undefined}
        /* The tooltip names whatever the click would open, for the same
           reason: `info` is the art on the hidden side, `inspectable` is what
           the viewer is entitled to read. */
        title={tip ? `«${tip.name}» — ${tip.shortDescription}` : undefined}
      >
        {/* `.flip` is pure art treatment now — perspective, radius, border,
            shadow and `backface-visibility`. Size, entrance and the turn all
            belong to this layer; see `styles/layout.css`. */}
        <div className={`flip${flipped ? ' is-flipped' : ''}`}>
          <motion.div
            className="flip__inner"
            style={{ transformStyle: reduce ? 'flat' : 'preserve-3d', rotateY }}
          >
            <div className="flip__face" style={{ backgroundImage: `url(${CARD_BACK})` }} />
            <div
              className={[
                'flip__face',
                'flip__face--front',
                showVerdict ? (verdict ? 'flip__face--truth' : 'flip__face--bluff') : '',
                info ? `cardframe cardframe--${info.category}` : ''
              ]
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
                      transition: `opacity ${REDUCED_FADE_S}s linear`
                    }
                  : null)
              }}
            >
              {showVerdict && (
                <span className={`verdict ${verdict ? 'verdict--truth' : 'verdict--bluff'}`}>
                  {verdict ? 'Правда' : 'Блеф'}
                </span>
              )}
              {/* Заряды едут на самой карте, а не на подписи под слотом: слой
                  карт рисуется выше слота, и любая надпись под ним пряталась
                  за картой. */}
              {placed.charges !== undefined && (
                <span className="chargetag">{placed.charges}</span>
              )}
            </div>
          </motion.div>
        </div>
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
 * the order of `GameState.deck` — and the engine draws with `deck.pop()`, so
 * the *last* entries are the top of the deck and the ones a draw will pull.
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

  let deckTotal = 0;
  for (const placed of cards) if (placed.zone.kind === 'deck') deckTotal++;

  const drawn: PlacedCard[] = [];
  let deckSeen = 0;
  for (const placed of cards) {
    if (placed.zone.kind !== 'deck') {
      drawn.push(placed);
      continue;
    }
    /* Distance from the top of the deck, which is the end of the array. */
    const rank = deckTotal - 1 - deckSeen++;
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
      const rect = designRect(node);
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
