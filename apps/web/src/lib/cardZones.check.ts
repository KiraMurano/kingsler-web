/**
 * Self-check: `deriveCardZones` must place every card in exactly one zone,
 * derived from game state alone.
 *
 * The case that matters most is #2: staking one card must never hide the
 * other one. The old presentation layer addressed the stake by hand index, so
 * once the engine spliced the revealed card out of the hand the index aliased
 * onto the neighbour and the survivor vanished from the table.
 *
 * Run: npx tsx apps/web/src/lib/cardZones.check.ts
 */
import assert from 'node:assert/strict';
import { deriveCardZones } from './cardZones.ts';
import type { ZoneState } from './cardZones.ts';
import { reconcileSlots } from './handSlotBook.ts';
import type { FaceBook } from './faceBook.ts';
import { zoneKey, ZONE_PRECEDENCE } from '../motion/zones.ts';
import type { PlacedCard, Zone } from '../motion/zones.ts';
import type { Action, GameCard, Player } from '@kinglier/engine/types';
import type { CardId, CardInstance } from '@kinglier/engine/cardInstance';
import { mintDeck } from '@kinglier/engine/cardInstance';

/* ------------------------------------------------------------------ */
/* Tiny state factory so the cases below stay readable.                */
/* ------------------------------------------------------------------ */

/**
 * `mintDeck` restarts at `c0` for every pile it is handed, so two hands minted
 * separately would share ids. Real play mints the whole deck once; here each
 * pile gets its own prefix so the ids stay globally unique.
 */
let mintedPiles = 0;
function pile(cards: GameCard[]): CardInstance[] {
  const tag = `k${mintedPiles++}`;
  return mintDeck(cards).map(instance => ({ ...instance, id: `${tag}${instance.id}` }));
}

function player(over: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: over.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...over
  };
}

function makeState(over: Partial<ZoneState> & Pick<ZoneState, 'players'>): ZoneState {
  return {
    deck: [],
    discardPile: [],
    pendingAction: null,
    pendingDuelDefenderCardId: null,
    overlayInstant: null,
    revealOutcome: null,
    duelOutcome: null,
    turnPhase: 'IDLE',
    ...over
  };
}

function roleAction(over: Partial<Action> & Pick<Action, 'actorId'>): Action {
  return {
    id: 'a1',
    type: 'role',
    name: 'Наследник',
    roleClaim: 'Наследник',
    costGold: 0,
    costTokens: 1,
    description: '',
    ...over
  };
}

/** Every id shows up exactly once — the core invariant of the whole layer. */
function assertUnique(placed: PlacedCard[], label: string): void {
  const seen = new Set<CardId>();
  for (const c of placed) {
    assert.equal(seen.has(c.id), false, `${label}: ${c.id} placed twice (${zoneKey(c.zone)})`);
    seen.add(c.id);
  }
}

function at(placed: PlacedCard[], id: CardId, label: string): PlacedCard {
  const hits = placed.filter(c => c.id === id);
  assert.equal(hits.length, 1, `${label}: expected exactly one placement for ${id}, got ${hits.length}`);
  return hits[0];
}

function keyAt(placed: PlacedCard[], id: CardId, label: string): string {
  return zoneKey(at(placed, id, label).zone);
}

/* ------------------------------------------------------------------ */
/* 9. zoneKey round-trips.                                             */
/* ------------------------------------------------------------------ */
{
  const zones: Zone[] = [
    { kind: 'deck' },
    { kind: 'hand', playerId: 'p1', slot: 0 },
    { kind: 'hand', playerId: 'p1', slot: 1 },
    { kind: 'hand', playerId: 'p2', slot: 0 },
    { kind: 'stake' },
    { kind: 'duel', side: 'attacker' },
    { kind: 'duel', side: 'defender' },
    { kind: 'table' },
    { kind: 'overlay' },
    { kind: 'plot', playerId: 'p3' },
    { kind: 'discard' }
  ];
  const keys = zones.map(zoneKey);
  assert.equal(new Set(keys).size, keys.length, 'distinct zones must produce distinct keys');
  assert.equal(
    zoneKey({ kind: 'hand', playerId: 'p1', slot: 0 }),
    zoneKey({ kind: 'hand', playerId: 'p1', slot: 0 }),
    'identical zones must produce identical keys'
  );
  assert.equal(zoneKey({ kind: 'hand', playerId: 'p1', slot: 1 }), 'hand:p1:1');
  assert.equal(zoneKey({ kind: 'plot', playerId: 'p3' }), 'plot:p3');
  assert.equal(zoneKey({ kind: 'duel', side: 'attacker' }), 'duel:attacker');
  assert.equal(zoneKey({ kind: 'discard' }), 'discard');

  // Precedence is a strict ordering — the derivation leans on it.
  assert.ok(ZONE_PRECEDENCE.overlay > ZONE_PRECEDENCE.duel);
  assert.ok(ZONE_PRECEDENCE.duel > ZONE_PRECEDENCE.stake);
  assert.ok(ZONE_PRECEDENCE.stake > ZONE_PRECEDENCE.table);
  assert.ok(ZONE_PRECEDENCE.table > ZONE_PRECEDENCE.plot);
  assert.ok(ZONE_PRECEDENCE.plot > ZONE_PRECEDENCE.hand);
  assert.ok(ZONE_PRECEDENCE.hand > ZONE_PRECEDENCE.discard);
  assert.ok(ZONE_PRECEDENCE.discard > ZONE_PRECEDENCE.deck);
}

/* ------------------------------------------------------------------ */
/* 1. Two identical faces in hand keep distinct ids and distinct slots.*/
/* ------------------------------------------------------------------ */
{
  const hand = pile(['Шут', 'Шут']);
  const state = makeState({ players: [player({ id: 'p1', hand })] });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'twins');

  assert.notEqual(hand[0].id, hand[1].id, 'twin faces must still be distinct instances');
  assert.equal(keyAt(placed, hand[0].id, 'twins'), 'hand:p1:0');
  assert.equal(keyAt(placed, hand[1].id, 'twins'), 'hand:p1:1');
  assert.equal(at(placed, hand[0].id, 'twins').face.known, 'Шут', 'the viewer sees their own faces');
  assert.equal(at(placed, hand[1].id, 'twins').face.known, 'Шут');
  assert.equal(at(placed, hand[0].id, 'twins').ownerId, 'p1');
  assert.equal(placed.length, 2, 'nothing else is on the table');
}

/* ------------------------------------------------------------------ */
/* 2. Staking one card must not hide the other. THE reported bug.      */
/* ------------------------------------------------------------------ */
{
  const hand = pile(['Наследник', 'Шут']);
  const stakedId = hand[0].id;
  const survivorId = hand[1].id;

  const state = makeState({
    players: [player({ id: 'p1', hand }), player({ id: 'p2', seatNumber: 2, hand: pile(['Вор']) })],
    pendingAction: roleAction({ actorId: 'p1', stakedCardId: stakedId }),
    turnPhase: 'DOUBT_WINDOW'
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'stake');

  assert.equal(keyAt(placed, stakedId, 'stake'), 'stake', 'the staked instance is on the table');
  assert.equal(
    keyAt(placed, survivorId, 'stake'),
    'hand:p1:1',
    'the other hand card stays in its own hand slot — this is the bug being pinned'
  );
  assert.equal(
    placed.filter(c => c.id === stakedId && c.zone.kind === 'hand').length,
    0,
    'a card claimed by `stake` must not also be emitted in `hand`'
  );
  assert.equal(at(placed, stakedId, 'stake').revealed, false, 'nobody is scrutinising it yet');
  assert.equal(at(placed, stakedId, 'stake').ownerId, 'p1');
  assert.equal(
    at(placed, stakedId, 'stake').wasTruth,
    undefined,
    'no verdict has been passed on it'
  );
  assert.equal(
    at(placed, stakedId, 'stake').face.known,
    null,
    'a staked card lies face-down for everyone, its own owner included — otherwise «не верю» has nothing to turn over'
  );
  assert.equal(
    at(placed, survivorId, 'stake').face.known,
    'Шут',
    'the card still in hand is still readable by its owner'
  );

  // Same state seen from the other side of the table: the staked card is
  // face-down for everyone, but it is still placed.
  const asP2 = deriveCardZones(state, 'p2');
  assertUnique(asP2, 'stake/p2');
  assert.equal(keyAt(asP2, stakedId, 'stake/p2'), 'stake');
  assert.equal(at(asP2, stakedId, 'stake/p2').face.known, null, 'an opponent cannot read the stake');

  // And after the engine has already moved the revealed instance to the
  // discard, `stake` still wins — the card flips on the table, it does not
  // teleport into the corner.
  const afterSplice = makeState({
    players: [player({ id: 'p1', hand: [hand[1]] })],
    discardPile: [hand[0]],
    pendingAction: roleAction({ actorId: 'p1', stakedCardId: stakedId }),
    turnPhase: 'REVEAL_OUTCOME'
  });
  const splicedBook = reconcileSlots(
    reconcileSlots({}, state.players),
    afterSplice.players
  );
  /* Между двумя кадрами был третий: исход спора на экране, карта вскрыта.
     Его след и несёт книга лиц — ровно так же, как её несёт `App`. */
  const afterReveal: FaceBook = { [stakedId]: 'Наследник' };
  const spliced = deriveCardZones(afterSplice, 'p1', splicedBook, afterReveal);
  assertUnique(spliced, 'stake/spliced');
  assert.equal(keyAt(spliced, stakedId, 'stake/spliced'), 'stake');
  assert.equal(
    keyAt(spliced, survivorId, 'stake/spliced'),
    'hand:p1:1',
    'the survivor keeps slot 1 even though the engine has made it hand index 0'
  );
  assert.equal(
    at(spliced, stakedId, 'stake/spliced').face.known,
    'Наследник',
    'once it has reached the graveyard it stays readable — a card that has been shown must not turn back over on its way to the corner'
  );
  const splicedAsP2 = deriveCardZones(afterSplice, 'p2', {}, afterReveal);
  assert.equal(
    at(splicedAsP2, stakedId, 'stake/spliced/p2').face.known,
    'Наследник',
    'the reveal was public, so this holds for every viewer who saw it'
  );
}

/* ------------------------------------------------------------------ */
/* 2b. The user's scenario, end to end: play LEFT, then draw.          */
/*                                                                     */
/* «Если я разыгрываю левую карту из руки, то правая потом перемещается */
/* на её место, такого быть не должно… вместо сыгранной из левого слота */
/* карты должен быть добор в левую ячейку.»                            */
/* ------------------------------------------------------------------ */
{
  const hand = pile(['Наследник', 'Шут']);
  const drawn = pile(['Рыцарь']);
  const [left, right] = hand;

  /* Turn start: both cards in hand, left in slot 0, right in slot 1. */
  const dealt = makeState({ players: [player({ id: 'p1', hand })] });
  let book = reconcileSlots({}, dealt.players);
  const atStart = deriveCardZones(dealt, 'p1', book);
  assert.equal(keyAt(atStart, left.id, 'sticky/dealt'), 'hand:p1:0');
  assert.equal(keyAt(atStart, right.id, 'sticky/dealt'), 'hand:p1:1');

  /* The LEFT card is staked. The engine splices it out, so the right card
     is now `hand[0]` — and must not budge. */
  const staked = makeState({
    players: [player({ id: 'p1', hand: [right] })],
    discardPile: [left],
    pendingAction: roleAction({ actorId: 'p1', stakedCardId: left.id }),
    turnPhase: 'DOUBT_WINDOW'
  });
  book = reconcileSlots(book, staked.players);
  const onTable = deriveCardZones(staked, 'p1', book);
  assertUnique(onTable, 'sticky/staked');
  assert.equal(keyAt(onTable, left.id, 'sticky/staked'), 'stake');
  assert.equal(
    keyAt(onTable, right.id, 'sticky/staked'),
    'hand:p1:1',
    'the untouched card stays on its own slot — it must not slide into the vacated one'
  );

  /* End of turn refills the hand. The engine appends the new card, so it is
     `hand[1]` — but the hole is on the LEFT, and that is where it goes. */
  const refilled = makeState({
    players: [player({ id: 'p1', hand: [right, drawn[0]] })],
    discardPile: [left]
  });
  book = reconcileSlots(book, refilled.players);
  const afterDraw = deriveCardZones(refilled, 'p1', book);
  assertUnique(afterDraw, 'sticky/refilled');
  assert.equal(
    keyAt(afterDraw, drawn[0].id, 'sticky/refilled'),
    'hand:p1:0',
    'the drawn card lands in the left slot, the one that was actually emptied'
  );
  assert.equal(
    keyAt(afterDraw, right.id, 'sticky/refilled'),
    'hand:p1:1',
    'and the card that was never played has held slot 1 through the whole turn'
  );
  assert.equal(keyAt(afterDraw, left.id, 'sticky/refilled'), 'discard');

  /* Without a book the old behaviour is still what you get — which is the
     bug, and exactly why `App` must pass one. */
  const unbooked = deriveCardZones(staked, 'p1');
  assert.equal(
    keyAt(unbooked, right.id, 'sticky/unbooked'),
    'hand:p1:0',
    'the array-index fallback is index-based, so a seat absent from the book still slides'
  );
}

/* ------------------------------------------------------------------ */
/* 3. An overlay instant lies on top of the stake.                     */
/* ------------------------------------------------------------------ */
{
  const hand = pile(['Наследник', 'Шут']);
  const veto: CardInstance = { id: 'v1', card: 'Право вето' };

  // The engine moves an instant into the discard the moment it is played,
  // while `overlayInstant` keeps it pictured on the table.
  const state = makeState({
    players: [
      player({ id: 'p1', hand }),
      player({ id: 'p2', seatNumber: 2, hand: pile(['Вор']) })
    ],
    discardPile: [veto],
    pendingAction: roleAction({ actorId: 'p1', stakedCardId: hand[0].id }),
    overlayInstant: { card: 'Право вето', actorId: 'p2' },
    turnPhase: 'VETO_WINDOW'
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'overlay');

  assert.equal(keyAt(placed, veto.id, 'overlay'), 'overlay', 'the played veto is the overlay card');
  assert.equal(
    placed.filter(c => c.id === veto.id && c.zone.kind === 'discard').length,
    0,
    'the overlay claim beats the discard claim for the same instance'
  );
  assert.equal(at(placed, veto.id, 'overlay').face.known, 'Право вето', 'an open instant is face-up for everyone');
  assert.equal(at(placed, veto.id, 'overlay').ownerId, 'p2');
  assert.equal(keyAt(placed, hand[0].id, 'overlay'), 'stake', 'the staked card stays on the stake');
  assert.equal(keyAt(placed, hand[1].id, 'overlay'), 'hand:p1:1');

  // Fallback: if the instance is nowhere to be found (already reshuffled
  // away), a stable placeholder keeps the layer drawing something.
  const orphan = makeState({
    players: [player({ id: 'p2', hand: [] })],
    overlayInstant: { card: 'Право вето', actorId: 'p2' }
  });
  const ghosted = deriveCardZones(orphan, 'p1');
  assertUnique(ghosted, 'overlay/orphan');
  assert.equal(ghosted.length, 1);
  assert.equal(ghosted[0].id, 'overlay:p2:Право вето', 'placeholder id is stable across renders');
  assert.equal(zoneKey(ghosted[0].zone), 'overlay');

  // A card still in hand is also acceptable as the overlay instance.
  const heldVeto = pile(['Право вето']);
  const held = makeState({
    players: [player({ id: 'p2', hand: heldVeto })],
    overlayInstant: { card: 'Право вето', actorId: 'p2' }
  });
  const heldPlaced = deriveCardZones(held, 'p2');
  assertUnique(heldPlaced, 'overlay/held');
  assert.equal(keyAt(heldPlaced, heldVeto[0].id, 'overlay/held'), 'overlay', 'overlay outranks hand');
}

/* ------------------------------------------------------------------ */
/* 4. Discarded cards live in the discard and nowhere else.            */
/* ------------------------------------------------------------------ */
{
  const hand = pile(['Шут', 'Вор']);
  const dead: CardInstance = { id: 'd1', card: 'Рыцарь' };
  const state = makeState({
    players: [player({ id: 'p1', hand })],
    discardPile: [dead]
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'discard');

  assert.equal(keyAt(placed, dead.id, 'discard'), 'discard');
  assert.equal(
    placed.filter(c => c.id === dead.id && c.zone.kind === 'hand').length,
    0,
    'a discarded card is never also in a hand'
  );
  assert.equal(
    at(placed, dead.id, 'discard').face.known,
    null,
    'nothing said this card was ever shown, so it lies face-down'
  );
  const afterShowing = deriveCardZones(state, 'p1', {}, { [dead.id]: 'Рыцарь' });
  assert.equal(
    at(afterShowing, dead.id, 'discard').face.known,
    'Рыцарь',
    'shown once, it keeps its face all the way to the corner'
  );
  assert.equal(at(placed, dead.id, 'discard').ownerId, null, 'the discard belongs to nobody');
  assert.equal(at(placed, dead.id, 'discard').revealed, false, 'face-up is not the same as under scrutiny');
}

/* ------------------------------------------------------------------ */
/* 5. A duel pulls both stakes out of their hands.                     */
/* ------------------------------------------------------------------ */
{
  const attackerHand = pile(['Рыцарь', 'Шут']);
  const defenderHand = pile(['Казначей', 'Вор']);
  const attackStakeId = attackerHand[0].id;
  const defendStakeId = defenderHand[1].id;

  const state = makeState({
    players: [
      player({ id: 'p1', hand: attackerHand }),
      player({ id: 'p2', seatNumber: 2, hand: defenderHand })
    ],
    pendingAction: roleAction({
      actorId: 'p1',
      name: 'Вор',
      roleClaim: 'Вор',
      targetId: 'p2',
      stakedCardId: attackStakeId
    }),
    pendingDuelDefenderCardId: defendStakeId,
    turnPhase: 'DUEL_ATTACKER_WINDOW'
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'duel');

  assert.equal(keyAt(placed, attackStakeId, 'duel'), 'duel:attacker');
  assert.equal(keyAt(placed, defendStakeId, 'duel'), 'duel:defender');
  assert.equal(at(placed, attackStakeId, 'duel').ownerId, 'p1');
  assert.equal(at(placed, defendStakeId, 'duel').ownerId, 'p2');
  assert.equal(
    keyAt(placed, attackerHand[1].id, 'duel'),
    'hand:p1:1',
    'the attacker keeps their unstaked card in slot 1, not slot 0'
  );
  assert.equal(keyAt(placed, defenderHand[0].id, 'duel'), 'hand:p2:0');
  assert.equal(
    placed.filter(c => c.zone.kind === 'stake').length,
    0,
    'a duel claim beats the stake claim for the same card'
  );
  assert.equal(at(placed, attackStakeId, 'duel').revealed, false, 'the clash has not been shown yet');
  assert.equal(at(placed, defendStakeId, 'duel').face.known, null, 'the defender shield is face-down for the attacker');
  assert.equal(
    at(placed, attackStakeId, 'duel').face.known,
    null,
    'and the attacker cannot read their own card once it is committed — both turn over together'
  );

  // Once the outcome is showing, both are turned face-up for everyone even
  // though the engine has already taken them out of both hands.
  const showing = makeState({
    ...state,
    players: [
      player({ id: 'p1', hand: [attackerHand[1]] }),
      player({ id: 'p2', seatNumber: 2, hand: [defenderHand[0]] })
    ],
    turnPhase: 'DUEL_OUTCOME',
    duelOutcome: {
      attackerId: 'p1',
      defenderId: 'p2',
      attackerClaim: 'Вор',
      defenderClaim: 'Казначей',
      attackerRevealedRole: 'Рыцарь',
      defenderRevealedRole: 'Вор',
      attackerWasTruth: false,
      defenderWasTruth: false,
      resultType: 'mutual_bluff',
      message: ''
    }
  });
  const clash = deriveCardZones(showing, 'p1');
  assertUnique(clash, 'duel/outcome');
  assert.equal(keyAt(clash, attackStakeId, 'duel/outcome'), 'duel:attacker');
  assert.equal(keyAt(clash, defendStakeId, 'duel/outcome'), 'duel:defender');
  assert.equal(at(clash, defendStakeId, 'duel/outcome').face.known, 'Вор', 'the outcome reveals the shield');
  assert.equal(at(clash, defendStakeId, 'duel/outcome').revealed, true);
  assert.equal(at(clash, attackStakeId, 'duel/outcome').revealed, true);
  assert.equal(
    at(clash, attackStakeId, 'duel/outcome').wasTruth,
    false,
    'a mutual bluff stamps both cards БЛЕФ'
  );
  assert.equal(at(clash, defendStakeId, 'duel/outcome').wasTruth, false);
}

/* ------------------------------------------------------------------ */
/* 6. Face visibility follows the viewer.                              */
/* ------------------------------------------------------------------ */
{
  const mine = pile(['Наследник', 'Шут']);
  const theirs = pile(['Вор', 'Рыцарь']);
  const state = makeState({
    players: [
      player({ id: 'p1', hand: mine }),
      player({ id: 'p2', seatNumber: 2, hand: theirs })
    ]
  });

  const asP1 = deriveCardZones(state, 'p1');
  assertUnique(asP1, 'faces');
  assert.equal(at(asP1, mine[0].id, 'faces').face.known, 'Наследник', 'the viewer reads their own hand');
  assert.equal(at(asP1, theirs[0].id, 'faces').face.known, null, "an opponent's hand is face-down");
  assert.equal(at(asP1, theirs[0].id, 'faces').ownerId, 'p2', 'but the card still belongs to its seat');
  assert.equal(keyAt(asP1, theirs[1].id, 'faces'), 'hand:p2:1');

  const asP2 = deriveCardZones(state, 'p2');
  assert.equal(at(asP2, theirs[0].id, 'faces').face.known, 'Вор', 'the same card is open to its owner');
  assert.equal(at(asP2, mine[0].id, 'faces').face.known, null);

  // Online: other seats arrive with a null face and the deck is synthetic.
  const hidden = [
    { id: 'srv-h0', card: null },
    { id: 'srv-h1', card: null }
  ] as unknown as CardInstance[];
  const srvDeck = [
    { id: 'srv-deck-0', card: null },
    { id: 'srv-deck-1', card: null }
  ] as unknown as CardInstance[];
  const online = makeState({
    players: [
      player({ id: 'p1', hand: mine }),
      player({ id: 'p2', seatNumber: 2, hand: hidden })
    ],
    deck: srvDeck
  });
  const placedOnline = deriveCardZones(online, 'p1');
  assertUnique(placedOnline, 'online');
  assert.equal(keyAt(placedOnline, 'srv-h1', 'online'), 'hand:p2:1');
  assert.equal(at(placedOnline, 'srv-h1', 'online').face.known, null, 'a null face is simply unknown');
  assert.equal(keyAt(placedOnline, 'srv-deck-0', 'online'), 'deck');
}

/* ------------------------------------------------------------------ */
/* 7. A reveal outcome turns an opponent's card face-up.               */
/* ------------------------------------------------------------------ */
{
  const accusedHand = pile(['Наследник', 'Шут']);
  const revealedId = accusedHand[0].id;
  const survivorId = accusedHand[1].id;

  // The engine has already moved the revealed instance to the discard.
  const state = makeState({
    players: [
      player({ id: 'p1', hand: pile(['Вор']) }),
      player({ id: 'p2', seatNumber: 2, hand: [accusedHand[1]] })
    ],
    discardPile: [accusedHand[0]],
    pendingAction: roleAction({ actorId: 'p2', roleClaim: 'Казначей', name: 'Казначей', stakedCardId: revealedId }),
    turnPhase: 'REVEAL_OUTCOME',
    revealOutcome: {
      accuserId: 'p1',
      accusedId: 'p2',
      claimedRole: 'Казначей',
      wasTruth: false,
      revealedRole: 'Наследник',
      message: ''
    }
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'reveal');

  const shown = at(placed, revealedId, 'reveal');
  assert.equal(shown.face.known, 'Наследник', "a reveal opens an opponent's card to everyone");
  assert.equal(shown.revealed, true, 'the table wants it turned face-up right now');
  assert.equal(zoneKey(shown.zone), 'stake', 'it flips on the table before it flies to the discard');
  assert.equal(
    shown.wasTruth,
    false,
    'claiming «Казначей» and turning up «Наследник» is a bluff — the card carries the verdict its stamp reads'
  );
  assert.equal(
    at(placed, survivorId, 'reveal').wasTruth,
    undefined,
    'no verdict is passed on a card nobody turned over'
  );
  assert.equal(
    at(placed, survivorId, 'reveal').face.known,
    null,
    'the rest of the accused hand stays hidden'
  );
  assert.equal(keyAt(placed, survivorId, 'reveal'), 'hand:p2:0');
}

/* ------------------------------------------------------------------ */
/* 8. Deck cards exist so a draw has an origin, always face-down.      */
/* ------------------------------------------------------------------ */
{
  const deck = pile(['Шут', 'Вор', 'Рыцарь']);
  const state = makeState({ players: [player({ id: 'p1', hand: [] })], deck });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'deck');

  assert.equal(placed.length, 3);
  for (const inst of deck) {
    assert.equal(keyAt(placed, inst.id, 'deck'), 'deck');
    assert.equal(at(placed, inst.id, 'deck').face.known, null, 'nobody may read the deck, not even the viewer');
    assert.equal(at(placed, inst.id, 'deck').ownerId, null);
  }
}

/* ------------------------------------------------------------------ */
/* Plots rest in their owner's slot, laid or landed.                   */
/* ------------------------------------------------------------------ */
{
  const laying = pile(['Досье', 'Шут']);
  const state = makeState({
    players: [player({ id: 'p1', hand: [laying[1]] })],
    pendingAction: {
      id: 'pl',
      type: 'plot',
      name: 'Досье',
      plotType: 'Досье',
      actorId: 'p1',
      stakedCardId: laying[0].id,
      costGold: 0,
      costTokens: 1,
      description: ''
    },
    turnPhase: 'VETO_WINDOW'
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'plot/laying');
  assert.equal(keyAt(placed, laying[0].id, 'plot/laying'), 'plot:p1', 'a plot flies straight to its slot');
  assert.equal(at(placed, laying[0].id, 'plot/laying').face.known, 'Досье', 'a plot in the slot is open');

  const landed = makeState({
    players: [
      player({
        id: 'p2',
        hand: [],
        activePlot: { id: 'pl', cardId: 'x9', type: 'Чёрная книга' }
      })
    ]
  });
  const after = deriveCardZones(landed, 'p1');
  assertUnique(after, 'plot/landed');
  assert.equal(keyAt(after, 'x9', 'plot/landed'), 'plot:p2');
  assert.equal(at(after, 'x9', 'plot/landed').face.known, 'Чёрная книга');
  assert.equal(at(after, 'x9', 'plot/landed').ownerId, 'p2');
}

/* ------------------------------------------------------------------ */
/* An instant laid openly sits on the table, face-up, above its discard.*/
/* ------------------------------------------------------------------ */
{
  const laid: CardInstance = { id: 'i7', card: 'Обыск покоев' };
  const state = makeState({
    players: [player({ id: 'p1', hand: pile(['Шут']) })],
    discardPile: [laid],
    pendingAction: {
      id: 'in',
      type: 'instant',
      name: 'Обыск покоев',
      instantType: 'Обыск покоев',
      actorId: 'p1',
      stakedCardId: laid.id,
      costGold: 0,
      costTokens: 1,
      description: ''
    },
    turnPhase: 'VETO_WINDOW'
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'table');
  assert.equal(keyAt(placed, laid.id, 'table'), 'table');
  assert.equal(at(placed, laid.id, 'table').face.known, 'Обыск покоев');
  assert.equal(at(placed, laid.id, 'table').ownerId, 'p1');
}

/* ------------------------------------------------------------------ */
/* 10. The global invariant on a crowded table.                        */
/* ------------------------------------------------------------------ */
{
  const p1Hand = pile(['Наследник', 'Шут']);
  const p2Hand = pile(['Вор', 'Рыцарь']);
  const p3Hand = pile(['Казначей', 'Казначей']);
  const deck = pile(['Шут', 'Вор']);
  const graveyard: CardInstance[] = [
    { id: 'g1', card: 'Рыцарь' },
    { id: 'g2', card: 'Право вето' }
  ];

  const state = makeState({
    players: [
      player({ id: 'p1', hand: p1Hand }),
      player({ id: 'p2', seatNumber: 2, hand: p2Hand, activePlot: { id: 'q', cardId: 'g3', type: 'Досье' } }),
      player({ id: 'p3', seatNumber: 3, hand: p3Hand })
    ],
    deck,
    discardPile: graveyard,
    pendingAction: roleAction({ actorId: 'p1', targetId: 'p2', stakedCardId: p1Hand[0].id }),
    pendingDuelDefenderCardId: p2Hand[0].id,
    overlayInstant: { card: 'Право вето', actorId: 'p3' },
    turnPhase: 'DUEL_ATTACKER_WINDOW'
  });
  const placed = deriveCardZones(state, 'p1');
  assertUnique(placed, 'crowded');

  const everyId = [
    ...p1Hand.map(c => c.id),
    ...p2Hand.map(c => c.id),
    ...p3Hand.map(c => c.id),
    ...deck.map(c => c.id),
    ...graveyard.map(c => c.id),
    'g3'
  ];
  assert.deepEqual(
    [...placed.map(c => c.id)].sort(),
    [...everyId].sort(),
    'every card in state is placed exactly once, and nothing is invented'
  );

  assert.equal(keyAt(placed, p1Hand[0].id, 'crowded'), 'duel:attacker');
  assert.equal(keyAt(placed, p2Hand[0].id, 'crowded'), 'duel:defender');
  assert.equal(keyAt(placed, 'g2', 'crowded'), 'overlay', 'the veto instance is lifted out of the discard');
  assert.equal(keyAt(placed, 'g1', 'crowded'), 'discard');
  assert.equal(keyAt(placed, 'g3', 'crowded'), 'plot:p2');
  assert.equal(keyAt(placed, p3Hand[1].id, 'crowded'), 'hand:p3:1');

  // No hand slot is ever double-booked.
  const handKeys = placed.filter(c => c.zone.kind === 'hand').map(c => zoneKey(c.zone));
  assert.equal(new Set(handKeys).size, handKeys.length, 'each hand slot holds at most one card');

  // And nothing outranked ends up in a lower zone.
  const kindOf = new Map<CardId, Zone['kind']>(placed.map(c => [c.id, c.zone.kind] as const));
  assert.equal(ZONE_PRECEDENCE[kindOf.get(p1Hand[0].id)!], ZONE_PRECEDENCE.duel);
  assert.ok(
    ZONE_PRECEDENCE[kindOf.get('g2')!] > ZONE_PRECEDENCE.discard,
    'the overlay claim outranks the discard claim'
  );
}

/* Чужая карта, ушедшая в сброс невскрытой, туда невскрытой и летит.
 *
 * Сброс закрыт (`CardPiles`: наверху лежит рубашка, листать нечего), поэтому
 * лицо карты в нём видно ровно один миг — пока она летит в угол. Правило
 * «в сбросе — значит открыта» писалось затем, чтобы уже вскрытая карта не
 * переворачивалась обратно, когда исход спора уходит с экрана. Но оно
 * открывало и те карты, которых никто не видел: чужой обмен карт руки
 * показывал двору, что именно сосед выбросил. */
{
  const p1Hand = pile(['Наследник', 'Шут']);
  const p2Hand = pile(['Казначей']);
  const dumped = pile(['Вор'])[0];

  const state = makeState({
    players: [player({ id: 'p1', hand: p1Hand }), player({ id: 'p2', hand: p2Hand })],
    discardPile: [dumped]
  });

  const unseen = deriveCardZones(state, 'p1').find(c => c.id === dumped.id)!;
  assert.equal(unseen.zone.kind, 'discard');
  assert.equal(unseen.face.known, null, 'карта, которой никто не видел, летит в сброс рубашкой');

  /* А та, что уже лежала лицом вверх, лицо и сохраняет: книга помнит,
     с каким лицом карту показывали в прошлый раз. */
  const book: FaceBook = { [dumped.id]: 'Вор' };
  const seen = deriveCardZones(state, 'p1', {}, book).find(
    c => c.id === dumped.id
  )!;
  assert.equal(seen.face.known, 'Вор', 'однажды показанная карта не переворачивается в полёте');
}

/* A face that no rule can read is simply unknown, never invented. */
{
  const state = makeState({ players: [] });
  assert.deepEqual(deriveCardZones(state, 'p1'), [], 'an empty table places nothing');
}

console.log('cardZones.check: ok');
