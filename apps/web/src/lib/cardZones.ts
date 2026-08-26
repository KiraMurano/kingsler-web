/**
 * Where every card is, derived from game state alone.
 *
 * `deriveCardZones` is the single source of truth for the card layer: given a
 * slice of the game state and the id of whoever is looking, it returns one
 * `PlacedCard` per card the table could need to draw, each in exactly one
 * zone. Nothing here touches React, the DOM or the store — the same state in
 * always yields the same placements out, which is what makes the motion layer
 * testable and interruptible.
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

export function deriveCardZones(state: ZoneState, viewerId: string): PlacedCard[] {
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
   * The graveyard is open by the rules, so an instance that has reached the
   * discard array is readable by everyone — even while a higher-precedence
   * rule is still drawing it somewhere else. This is what keeps a revealed
   * card face-up: the engine puts it in the discard at the same moment it
   * publishes the outcome, and when that outcome expires a second or two
   * later the card must not turn itself back over on its way to the corner.
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
    if (discarded.has(id)) return { known: faceIndex.get(id) ?? null };
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

  /* 6. hand — array index is the slot. Identity is stable now, so no
     name-matching reconciliation is needed; keeping a card in the slot it was
     already drawn in is a layout concern for the anchor grid, not this. */
  for (const p of players) {
    p.hand.forEach((held, index) => {
      const slot: 0 | 1 = index === 0 ? 0 : 1;
      claim(held.id, { kind: 'hand', playerId: p.id, slot }, faceFor(held.id, { ownerId: p.id }), p.id);
    });
  }

  /* 7. discard — the open graveyard, face-up for everyone, owned by nobody. */
  for (const d of discardPile) {
    claim(d.id, { kind: 'discard' }, { known: faceOfInstance(d) }, null);
  }

  /* 8. deck — included so a draw has somewhere to fly from. Face-down for
     everyone, including the viewer, however much the offline state knows. */
  for (const d of deck) {
    claim(d.id, { kind: 'deck' }, { known: null }, null);
  }

  return [...claimed.values()];
}
