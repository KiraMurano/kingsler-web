/**
 * Where every card is, derived from game state alone.
 *
 * `deriveCardZones` is the single source of truth for the card layer: given a
 * slice of the game state, the id of whoever is looking and the hand-slot book
 * (see `handSlotBook.ts`), it returns one `PlacedCard` per card the table
 * could need to draw, each in exactly one zone. Nothing here touches React,
 * the DOM or the store — the same inputs always yield the same placements out,
 * which is what makes the motion layer testable and interruptible.
 *
 * Two rules can want the same card at once: a role action stakes a card that
 * is still sitting in its owner's hand, and an instant is pushed into the
 * discard the moment it is played even while it is pictured on the table.
 * `ZONE_PRECEDENCE` settles those ties, and a card claimed by the higher rule
 * is never also emitted in the lower one.
 */
import type { GameCard, GameState } from '@kinglier/engine/types';
import type { CardId, CardInstance } from '@kinglier/engine/cardInstance';
import { ZONE_PRECEDENCE } from '../motion/zones.ts';
import type { Face, PlacedCard, Zone } from '../motion/zones.ts';
import type { SlotBook } from './handSlotBook.ts';
import type { FaceBook } from './faceBook.ts';

/** Exactly the part of the game state that placement depends on. */
export type ZoneState = Pick<
  GameState,
  | 'players'
  | 'deck'
  | 'discardPile'
  | 'pendingAction'
  | 'pendingDuelDefenderCardId'
  | 'overlayInstant'
  | 'revealOutcome'
  | 'duelOutcome'
  | 'turnPhase'
>;

/** Online play publishes other seats' cards as `{ id, card: null }`. */
function faceOfInstance(instance: CardInstance | undefined): GameCard | null {
  return (instance?.card as GameCard | null | undefined) ?? null;
}

/**
 * `overlayInstant` carries a card *face* and an actor, but no `CardId` — the
 * engine never recorded which instance it was. Resolve it back to a real
 * instance so the veto that flew out of a hand and the veto lying on the
 * table are the same DOM node:
 *
 *  1. the discard, newest first — `playInstant` moves an instant out of the
 *     hand and into the discard in the same update that sets the overlay, so
 *     this is where the real instance almost always is;
 *  2. the actor's hand, for any path that leaves the card held while it is
 *     pictured on the table;
 *  3. a synthesised, render-stable placeholder `overlay:<actorId>:<card>` if
 *     the instance is genuinely gone (a reshuffle swallowed it), so the layer
 *     still has something continuous to draw instead of popping a card out of
 *     existence mid-flight.
 */
function resolveOverlayCardId(
  state: ZoneState,
  overlay: { card: GameCard; actorId: string }
): CardId {
  for (let i = state.discardPile.length - 1; i >= 0; i--) {
    if (state.discardPile[i].card === overlay.card) return state.discardPile[i].id;
  }
  const actor = state.players.find(p => p.id === overlay.actorId);
  const held = actor?.hand.find(h => h.card === overlay.card);
  if (held) return held.id;
  return `overlay:${overlay.actorId}:${overlay.card}`;
}

/**
 * @param slots Which visual slot each held card owns, from `reconcileSlots`.
 *   Passing the book is what makes hand slots sticky; a seat the book does not
 *   mention falls back to the array index, which is only ever right on the
 *   very first render.
 * @param shownBefore With what face each card was last shown, from
 *   `rememberFaces`. It is what tells a card discarded after a reveal from one
 *   discarded unseen — in the discard array both look alike.
 */
export function deriveCardZones(
  state: ZoneState,
  viewerId: string,
  slots: SlotBook = {},
  shownBefore: FaceBook = {}
): PlacedCard[] {
  const {
    players,
    deck,
    discardPile,
    pendingAction,
    pendingDuelDefenderCardId,
    overlayInstant,
    revealOutcome,
    duelOutcome,
    turnPhase
  } = state;

  /* Every face the state knows about, whether or not the viewer may see it. */
  const faceIndex = new Map<CardId, GameCard | null>();
  for (const p of players) {
    for (const held of p.hand) faceIndex.set(held.id, faceOfInstance(held));
    if (p.activePlot) faceIndex.set(p.activePlot.cardId, p.activePlot.type);
  }
  for (const d of discardPile) faceIndex.set(d.id, faceOfInstance(d));
  for (const d of deck) faceIndex.set(d.id, faceOfInstance(d));

  /**
   * Cards the table is actively showing for scrutiny. This is narrower than
   * "the viewer knows the face": a discarded card is face-up to everyone but
   * nobody is staring at it, whereas a card under a reveal or a duel outcome
   * must be turned up right now.
   *
   * `verdicts` runs alongside: for each scrutinised card, whether the claim it
   * was staked on turned out to be true. That is what the ПРАВДА / БЛЕФ stamp
   * on the card's front face reads.
   */
  const scrutinised = new Map<CardId, GameCard>();
  const verdicts = new Map<CardId, boolean>();
  if (revealOutcome) {
    const stakedByAccused =
      pendingAction?.actorId === revealOutcome.accusedId ? pendingAction.stakedCardId : undefined;
    const accused = players.find(p => p.id === revealOutcome.accusedId);
    const fallback = accused?.hand.find(h => h.card === revealOutcome.revealedRole)?.id;
    const id = stakedByAccused ?? fallback;
    if (id) {
      scrutinised.set(id, revealOutcome.revealedRole);
      verdicts.set(id, revealOutcome.wasTruth);
    }
  }
  if (duelOutcome) {
    const attackerCardId =
      pendingAction?.actorId === duelOutcome.attackerId ? pendingAction.stakedCardId : undefined;
    if (attackerCardId) {
      scrutinised.set(attackerCardId, duelOutcome.attackerRevealedRole);
      verdicts.set(attackerCardId, duelOutcome.attackerWasTruth);
    }
    if (pendingDuelDefenderCardId) {
      scrutinised.set(pendingDuelDefenderCardId, duelOutcome.defenderRevealedRole);
      verdicts.set(pendingDuelDefenderCardId, duelOutcome.defenderWasTruth);
    }
  }

  /**
   * A card in the discard carries the face it left with, and no other.
   *
   * The pile is closed — `CardPiles` shows a back and nothing browsable — so
   * this face is on screen for exactly one moment: the flight into the corner.
   * The rule exists to keep a card that was revealed in a challenge from
   * turning back over when the outcome expires a second or two later, while
   * the card is still on its way. It must not do more than that: opening every
   * discarded card told the court what a neighbour had thrown away when they
   * exchanged their hand.
   */
  const discarded = new Set<CardId>(discardPile.map(d => d.id));

  /**
   * What the viewer may see. A card is open to everyone once it is laid out
   * in public (discard, plot slot, open instant) or turned up by an outcome;
   * otherwise only its owner reads it — and a card staked face-down on the
   * table is read by nobody at all, including the player who staked it. That
   * last rule is what gives the reveal something to reveal: `hidden: true`
   * means "this card is lying face-down in front of everyone".
   */
  function faceFor(
    id: CardId,
    opts: { open?: GameCard | null; ownerId?: string | null; hidden?: boolean } = {}
  ): Face {
    const shown = scrutinised.get(id);
    if (shown) return { known: shown };
    if (discarded.has(id)) return { known: shownBefore[id] ?? null };
    if (opts.hidden) return { known: null };
    if (opts.open !== undefined && opts.open !== null) return { known: opts.open };
    if (opts.ownerId && opts.ownerId === viewerId) return { known: faceIndex.get(id) ?? null };
    return { known: null };
  }

  /**
   * Highest-precedence claim wins. Emission below runs in descending
   * precedence order anyway, but resolving explicitly keeps the invariant
   * true no matter what order rules are added in later.
   */
  const claimed = new Map<CardId, PlacedCard>();
  function claim(id: CardId, zone: Zone, face: Face, ownerId: string | null): void {
    const previous = claimed.get(id);
    if (previous && ZONE_PRECEDENCE[previous.zone.kind] >= ZONE_PRECEDENCE[zone.kind]) return;
    const placed: PlacedCard = { id, zone, face, revealed: scrutinised.has(id), ownerId };
    if (verdicts.has(id)) placed.wasTruth = verdicts.get(id);
    claimed.set(id, placed);
  }

  /* 1. overlay — an instant laid on top of the current action. */
  if (overlayInstant) {
    const overlay = { card: overlayInstant.card as GameCard, actorId: overlayInstant.actorId };
    claim(
      resolveOverlayCardId(state, overlay),
      { kind: 'overlay' },
      { known: overlay.card },
      overlay.actorId
    );
  }

  /* 2. duel — both stakes leave their hands and clash in the middle. The
     defender's card is only named while the duel is live or its outcome is on
     screen; after that the ids stop meaning anything. */
  const duelIsLive =
    pendingDuelDefenderCardId !== null &&
    (turnPhase === 'DUEL_ATTACKER_WINDOW' || turnPhase === 'DUEL_OUTCOME');
  if (duelIsLive && pendingAction) {
    const attackerId = pendingAction.actorId;
    const defenderId = pendingAction.targetId ?? duelOutcome?.defenderId ?? null;
    if (pendingAction.stakedCardId) {
      claim(
        pendingAction.stakedCardId,
        { kind: 'duel', side: 'attacker' },
        faceFor(pendingAction.stakedCardId, { hidden: true }),
        attackerId
      );
    }
    claim(
      pendingDuelDefenderCardId,
      { kind: 'duel', side: 'defender' },
      faceFor(pendingDuelDefenderCardId, { hidden: true }),
      defenderId
    );
  }

  /* 3. stake — the face-down card a role claim rests on. It stays in the
     actor's hand array until the reveal, and stays named by the action after
     the engine has moved it to the discard, so this rule outranks both.

     `hidden` is the point of the whole zone: once a card is staked it is
     lying face-down in front of the court, unreadable even by the player who
     staked it. Anything else and «не верю» has nothing left to turn over. */
  if (pendingAction?.type === 'role' && pendingAction.stakedCardId) {
    claim(
      pendingAction.stakedCardId,
      { kind: 'stake' },
      faceFor(pendingAction.stakedCardId, { hidden: true }),
      pendingAction.actorId
    );
  }

  /* 4. table — an instant lying openly in the middle while its window runs.
     It is already in the discard array; the table claim keeps it visible. */
  if (pendingAction?.type === 'instant' && pendingAction.stakedCardId) {
    const laid = (pendingAction.instantType ?? pendingAction.name) as GameCard;
    claim(
      pendingAction.stakedCardId,
      { kind: 'table' },
      { known: laid },
      pendingAction.actorId
    );
  }

  /* 5. plot — a plot goes straight from the hand to its owner's slot; between
     leaving the hand and landing in `activePlot` the action is the only thing
     that still names it. */
  if (pendingAction?.type === 'plot' && pendingAction.stakedCardId) {
    const laid = (pendingAction.plotType ?? pendingAction.name) as GameCard;
    claim(
      pendingAction.stakedCardId,
      { kind: 'plot', playerId: pendingAction.actorId },
      { known: laid },
      pendingAction.actorId
    );
  }
  for (const p of players) {
    if (!p.activePlot) continue;
    claim(
      p.activePlot.cardId,
      { kind: 'plot', playerId: p.id },
      { known: p.activePlot.type },
      p.id
    );
  }

  /* 6. hand — the slot comes from the book, never from the array index. The
     engine keeps `hand` compact, so index 0 is simply "whichever card is left"
     after a splice: reading the slot off it makes an untouched card slide
     across when its neighbour is staked, and sends the end-of-turn refill to
     the wrong side of the hand. `reconcileSlots` remembers instead. */
  for (const p of players) {
    const book = slots[p.id];
    p.hand.forEach((held, index) => {
      const slot: 0 | 1 = book?.[held.id] ?? (index === 0 ? 0 : 1);
      claim(held.id, { kind: 'hand', playerId: p.id, slot }, faceFor(held.id, { ownerId: p.id }), p.id);
    });
  }

  /* 7. discard — the graveyard, owned by nobody. A card keeps the face it was
     shown with on the way in, and stays face-down if it was never shown. */
  for (const d of discardPile) {
    claim(d.id, { kind: 'discard' }, faceFor(d.id), null);
  }

  /* 8. deck — included so a draw has somewhere to fly from. Face-down for
     everyone, including the viewer, however much the offline state knows. */
  for (const d of deck) {
    claim(d.id, { kind: 'deck' }, { known: null }, null);
  }

  return [...claimed.values()];
}
