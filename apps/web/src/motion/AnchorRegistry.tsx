/**
 * Where each zone *is* on screen, measured continuously.
 *
 * Layout renders `<CardAnchor zone={…}>` wherever a card could rest. An
 * anchor is an empty box: it occupies space, it may draw an empty-slot frame
 * as its child, and it never draws a card. The cards all live in `CardLayer`
 * and spring toward whichever anchor their zone names, so a card changing
 * zone is one continuous movement of one DOM node rather than an unmount
 * here and a mount there.
 *
 * Two design decisions carry the whole file:
 *
 *  1. **Rects are read every frame, not on resize.** Anchors move for reasons
 *     no `ResizeObserver` reports: the action panel below the hand animates
 *     its own height, which shifts the hand row; a seat's badge appears and
 *     nudges its mini-slots. A once-per-frame `getBoundingClientRect()` over
 *     ~10 elements is one reflow per frame — the reads are batched together
 *     with no writes in between, so the browser only recomputes layout once —
 *     and it is the only way the cards stay glued to a moving layout.
 *
 *  2. **Rects never enter React state.** They are written into a ref and read
 *     back through `useAnchorRects().get(key)`. Putting a rect in state would
 *     re-render the whole card layer sixty times a second for no reason;
 *     consumers instead read the ref inside a frame callback and push the
 *     numbers straight into `MotionValue`s.
 *
 * One consequence of (2) worth knowing: `CardLayer`'s per-card frame
 * callbacks run inside motion's own `requestAnimationFrame`, which is
 * registered while the children mount — i.e. before this provider's effect
 * registers its loop. Cards therefore read rects measured on the *previous*
 * frame. That is a uniform ~16 ms lag shared by every card, invisible in
 * practice, and it is the safe direction to err: cards trail a moving layout
 * rather than predicting it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { zoneKey } from './zones.ts';
import type { Zone } from './zones.ts';

/** Live rects, keyed by `zoneKey(zone)`. */
export interface AnchorRects {
  /** The zone's rect as of the last frame, or `null` if nothing registered it. */
  get: (key: string) => DOMRect | null;
}

interface AnchorRegistry {
  /** Register a node under `key`; returns the unregister function. */
  register: (key: string, node: HTMLElement) => () => void;
  rects: AnchorRects;
}

const EMPTY_RECTS: AnchorRects = { get: () => null };

const AnchorContext = createContext<AnchorRegistry>({
  register: () => () => undefined,
  rects: EMPTY_RECTS
});

export const AnchorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const rectsRef = useRef<Map<string, DOMRect>>(new Map());

  const measure = useCallback((key: string, node: HTMLElement) => {
    rectsRef.current.set(key, node.getBoundingClientRect());
  }, []);

  const register = useCallback(
    (key: string, node: HTMLElement) => {
      nodesRef.current.set(key, node);
      /* Measure straight away so a card that mounts alongside its anchor has
         a target on its very first frame instead of a blank one. */
      measure(key, node);
      return () => {
        /* A remount can register the replacement before the old node
           unregisters; only retract the entry if it is still ours. */
        if (nodesRef.current.get(key) === node) {
          nodesRef.current.delete(key);
          /* Drop the rect too. A stale rect would let a card fly to where an
             anchor used to be; with no rect at all the card holds its last
             known target, which is what `CardLayer` is built to do. */
          rectsRef.current.delete(key);
        }
      };
    },
    [measure]
  );

  useEffect(() => {
    let handle = 0;
    const tick = () => {
      handle = requestAnimationFrame(tick);
      const rects = rectsRef.current;
      /* All reads, no writes: one reflow for the whole set. */
      for (const [key, node] of nodesRef.current) {
        if (!node.isConnected) continue;
        rects.set(key, node.getBoundingClientRect());
      }
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  const value = useMemo<AnchorRegistry>(
    () => ({
      register,
      rects: { get: key => rectsRef.current.get(key) ?? null }
    }),
    [register]
  );

  return <AnchorContext.Provider value={value}>{children}</AnchorContext.Provider>;
};

/**
 * A hole in the layout that a card can fly to. Holds space and size, draws
 * `children` (typically the empty-slot frame), never draws the card itself —
 * which is exactly why a hand slot does not collapse when its card is staked
 * on the table.
 */
export const CardAnchor: React.FC<{
  zone: Zone;
  className?: string;
  children?: React.ReactNode;
}> = ({ zone, className, children }) => {
  const { register } = useContext(AnchorContext);
  const key = zoneKey(zone);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return register(key, node);
  }, [key, register]);

  return (
    <div
      ref={ref}
      data-anchor={key}
      className={['cardanchor', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
};

/**
 * Read anchor rects without subscribing to them. Deliberately returns a
 * getter rather than the rects themselves: calling `get` inside a frame
 * callback costs a map lookup and re-renders nothing.
 */
/* The hook belongs beside the provider that feeds it; splitting it into its
   own module to appease fast refresh would only obscure the pairing. */
// oxlint-disable-next-line react/only-export-components
export function useAnchorRects(): AnchorRects {
  return useContext(AnchorContext).rects;
}
