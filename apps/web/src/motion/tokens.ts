/**
 * The one source of truth for how movement feels at this table.
 *
 * Before this file the app had four unsynchronised constants — a CSS
 * `--dur-move`, a hand `transition: .22s`, a flip `transition: .75s` and a
 * pile of `@keyframes` durations — and every new animation invented a fifth.
 * Everything that moves now picks a spring from here, and the handful of
 * effects that stay on CSS read the mirrored custom properties in
 * `styles/tokens.css` (`--dur-flip`, `--dur-fade`, `--dur-panel`).
 *
 * The four springs are a ladder of urgency, not four arbitrary tunings:
 *
 *  - `flight`  a card crossing the table. Soft and heavy, with a visible
 *              overshoot, so a long journey reads as a journey.
 *  - `settle`  a card coming home to a slot it already owns. Tighter and
 *              lighter — it arrives rather than lands.
 *  - `hover`   the lift under the cursor. Fast enough to feel attached to
 *              the pointer rather than to be chasing it.
 *  - `press`   the push under a finger. Fastest of the four; a press that
 *              lags is a press that feels broken.
 *
 * Springs are interruptible by construction: retargeting one mid-flight
 * carries the current velocity across, which is the whole reason the motion
 * system is built on them instead of on keyframes.
 */

export const spring = {
  flight: { type: 'spring', stiffness: 260, damping: 30, mass: 1.0 },
  settle: { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 },
  hover: { type: 'spring', stiffness: 520, damping: 32, mass: 0.5 },
  press: { type: 'spring', stiffness: 700, damping: 30, mass: 0.4 }
} as const;

/**
 * Durations, in seconds, for the things a spring cannot express: a flip has
 * a fixed arc, a crossfade has a fixed length, a stagger is a fixed offset.
 *
 * `flip`, `fade` and `panel` are mirrored into CSS as milliseconds in
 * `styles/tokens.css`.
 *
 *  - `stagger` separates two cards that leave at the same instant, so a
 *    two-card draw reads as two cards rather than as one wide one.
 *  - `hold` is how long a card that has just turned face-up stays put before
 *    it is allowed to leave. A revealed card must be readable; the layer,
 *    not the engine, owns that pause.
 *  - `trail` is the gap between the staked card leaving for the discard and
 *    the instant that was lying on top of it following. It is longer than
 *    `stagger` on purpose: two cards departing from the *same* point need a
 *    clearer gap than two arriving at different slots.
 */
export const dur = {
  flip: 0.5,
  fade: 0.18,
  panel: 0.26,
  stagger: 0.06,
  hold: 0.4,
  trail: 0.18
} as const;

/**
 * Resting tilt, in degrees, by what the card is doing. A card lying square
 * on the felt reads as part of the table; a card at an angle reads as an
 * object someone just put down.
 */
export const tilt = {
  /** An instant laid across the action it interrupts. */
  overlay: 14,
  /** A card staked on a claim — swung in from the hand towards the middle. */
  stake: -4,
  /** The two cards of a duel, leaning into each other. */
  duelAttacker: -6,
  duelDefender: 6,
  /** How far the card under the cursor leans towards it. */
  pointerMax: 6
} as const;
