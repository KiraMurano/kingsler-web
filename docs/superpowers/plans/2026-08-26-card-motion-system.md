# Card Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every card movement at the table becomes one continuous, interruptible spring animation of a single DOM node, driven purely by state-derived zones.

**Architecture:** Cards get stable `CardId`s in the engine. A pure function derives `CardId → Zone` from game state. Layout renders empty anchors; a single fixed overlay layer renders one `motion.div` per card and springs it toward its anchor's measured rect. Engine stops owning animation timing entirely.

**Tech Stack:** TypeScript, React 19, Zustand, `motion` (framer-motion successor), Vite. Tests are standalone `*.check.ts` files run with `npx tsx`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-card-motion-system-design.md`. Read it before starting any task.
- Branch: `feat/card-motion-system`. Commit after every task.
- All user-facing copy is Russian. Never translate existing strings.
- Test convention: a file `foo.check.ts` next to `foo.ts`, using `node:assert/strict`, ending with `console.log('foo.check: ok')`. Run with `npx tsx <path>`.
- Typecheck the whole repo with `npm run build:web` (runs `tsc -b`). It must pass at the end of every task.
- Lint with `npm run lint` (oxlint). No new warnings.
- Two cards per hand, maximum. Seats are numbered 1–4; `p1` is always the local human offline.
- Do not change game rules. This is a presentation refactor plus one identity bugfix.

---

### Task 1: Card identity in the engine

**Files:**
- Modify: `packages/engine/src/cards.ts`
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/GameStore.ts`
- Modify: `packages/engine/src/resolvers/*.ts`
- Modify: `packages/engine/src/bot/*.ts`
- Modify: `packages/engine/src/net/redaction.ts`
- Modify: `apps/web/src/online/bindOnlineStore.ts`
- Modify: every `*.check.ts` that constructs a hand/deck/discard
- Create: `packages/engine/src/cardInstance.ts`
- Create: `packages/engine/src/cardInstance.check.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
// packages/engine/src/cardInstance.ts
export type CardId = string;
export interface CardInstance { id: CardId; card: GameCard }

/** Deterministic id minting for a fresh deck: c0, c1, … */
export function mintDeck(cards: GameCard[]): CardInstance[];
/** Face values only — for code that just needs names. */
export function faces(hand: CardInstance[]): GameCard[];
/** Id of the first instance of `card`, or null. */
export function idOf(hand: CardInstance[], card: GameCard): CardId | null;
/** Does this hand contain `card`? Replaces `hand.includes(card)`. */
export function holds(hand: CardInstance[], card: GameCard): boolean;
/** Instance by id, or null. */
export function byId(hand: CardInstance[], id: CardId | undefined): CardInstance | null;
/** Remove one instance by id, returning it and the new hand. */
export function pluck(hand: CardInstance[], id: CardId): { taken: CardInstance | null; rest: CardInstance[] };
```
  and the state shape changes: `Player.hand: CardInstance[]`, `GameState.deck: CardInstance[]`, `GameState.discardPile: CardInstance[]`, `ActivePlotData.cardId: CardId`.

- [ ] **Step 1: Write the failing test** — `packages/engine/src/cardInstance.check.ts`

```ts
import assert from 'node:assert/strict';
import { mintDeck, faces, idOf, holds, byId, pluck } from './cardInstance.ts';

const deck = mintDeck(['Шут', 'Шут', 'Казначей']);
assert.deepEqual(deck.map(d => d.id), ['c0', 'c1', 'c2'], 'ids are minted in order');
assert.deepEqual(faces(deck), ['Шут', 'Шут', 'Казначей']);

// Duplicate faces must stay distinguishable — this is the whole point.
assert.equal(idOf(deck, 'Шут'), 'c0', 'idOf returns the first instance');
assert.equal(idOf(deck, 'Рыцарь'), null);
assert.equal(holds(deck, 'Казначей'), true);
assert.equal(holds(deck, 'Рыцарь'), false);
assert.equal(byId(deck, 'c1')?.card, 'Шут');
assert.equal(byId(deck, 'nope'), null);
assert.equal(byId(deck, undefined), null);

const { taken, rest } = pluck(deck, 'c0');
assert.equal(taken?.id, 'c0');
assert.deepEqual(rest.map(r => r.id), ['c1', 'c2'], 'the other Шут survives');
assert.equal(deck.length, 3, 'pluck does not mutate');

const miss = pluck(deck, 'nope');
assert.equal(miss.taken, null);
assert.deepEqual(miss.rest.map(r => r.id), ['c0', 'c1', 'c2']);

console.log('cardInstance.check: ok');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx packages/engine/src/cardInstance.check.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/engine/src/cardInstance.ts`**

```ts
import type { GameCard } from './cards.ts';

export type CardId = string;
export interface CardInstance { id: CardId; card: GameCard }

export function mintDeck(cards: GameCard[]): CardInstance[] {
  return cards.map((card, i) => ({ id: `c${i}`, card }));
}

export function faces(hand: CardInstance[]): GameCard[] {
  return hand.map(h => h.card);
}

export function idOf(hand: CardInstance[], card: GameCard): CardId | null {
  return hand.find(h => h.card === card)?.id ?? null;
}

export function holds(hand: CardInstance[], card: GameCard): boolean {
  return hand.some(h => h.card === card);
}

export function byId(hand: CardInstance[], id: CardId | undefined): CardInstance | null {
  if (!id) return null;
  return hand.find(h => h.id === id) ?? null;
}

export function pluck(
  hand: CardInstance[],
  id: CardId
): { taken: CardInstance | null; rest: CardInstance[] } {
  const i = hand.findIndex(h => h.id === id);
  if (i === -1) return { taken: null, rest: [...hand] };
  return { taken: hand[i], rest: [...hand.slice(0, i), ...hand.slice(i + 1)] };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx packages/engine/src/cardInstance.check.ts`
Expected: `cardInstance.check: ok`

- [ ] **Step 5: Convert the state shape**

In `packages/engine/src/types.ts`:
- `import type { CardId, CardInstance } from './cardInstance';` and re-export both.
- `Player.hand: CardInstance[]`
- `GameState.deck: CardInstance[]`, `GameState.discardPile: CardInstance[]`
- `ActivePlotData` gains `cardId: CardId`.

In `packages/engine/src/GameStore.ts`, the deck is built and shuffled at `startGame`. Mint ids at construction with `mintDeck(...)` **after** shuffling so ids are stable but arbitrary, then deal. When the discard is reshuffled into the deck (deck exhaustion), reuse the existing instances — never re-mint.

- [ ] **Step 6: Fix every compile error the change surfaces**

Run `npm run build:web` and work the error list. The mechanical rewrites are:
- `player.hand.includes(X)` → `holds(player.hand, X)`
- `player.hand.indexOf(X)` → `idOf(player.hand, X)` (note: returns `CardId | null`, not a number — callers that wanted a number are being fixed in Task 2)
- `player.hand[i]` where a face value is wanted → `player.hand[i].card`
- `hand.map(c => …)` / `.filter` / `.some` over faces → wrap with `faces(hand)` or destructure `.card`
- `discardPile.push(card)` / `[...discardPile, card]` → push the `CardInstance`, not the face. When a card is discarded it must be the *same instance* that left the hand.
- `deck.pop()` already yields a `CardInstance`; keep it.
- `redaction.ts`: `PublicPlayer['hand']` becomes `{ id: CardId; card: GameCard | null }[]`, mapping own hand through unchanged and others through `{ id, card: null }`. `discardPile` is published in full (open graveyard); the deck still publishes only `deckSize`.
- `bindOnlineStore.ts`: stop faking `discardPile` with `new Array(n).fill('Наследник')` — use the real published array. Keep faking `deck` as `new Array(deckSize).fill(null)` shaped as `CardInstance[]` with synthetic ids `srv-deck-<i>`; nothing reads deck faces client-side except the Codex counter.

- [ ] **Step 7: Update every affected `.check.ts`**

Every check file that builds a hand literal (`hand: ['Наследник', 'Шут']`) needs `mintDeck(['Наследник', 'Шут'])` instead. Same for `deck` and `discardPile` literals. Assertions comparing discard contents must compare `faces(api.discardPile)`.

- [ ] **Step 8: Run everything**

```bash
npm run build:web && for f in $(find packages/engine/src apps/web/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```
Expected: build passes, every check prints `ok`.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "refactor(engine): give every card a stable CardId"
```

---

### Task 2: Address staked cards by id, not index

**Files:**
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/GameStore.ts`
- Modify: `packages/engine/src/resolvers/doubtResolver.ts`, `duelResolver.ts`, `instantResolver.ts`, `plotResolver.ts`, `normalActionResolver.ts`, `roleResolver.ts`, `turnResolver.ts`
- Modify: `packages/engine/src/bot/botTurnPlanner.ts`, `botReactions.ts`
- Modify: `apps/web/src/App.tsx`, `components/ActionControls.tsx`, `components/Hand.tsx`, `components/RoleClaimPopup.tsx`, `components/NormalActionsPopup.tsx`, `components/Modals.tsx`, `components/targeting.ts`
- Modify: `packages/engine/src/lib/handSlots.ts` consumers (the file itself is deleted in Task 8)
- Test: `packages/engine/src/resolvers/doubtResolver.check.ts`

**Interfaces:**
- Consumes: `CardId`, `byId`, `pluck`, `idOf` from Task 1.
- Produces: `Action.stakedCardId?: CardId`, `Action.stakedCardIds?: CardId[]`, `GameState.pendingDuelDefenderCardId: CardId | null`. Store methods change signature:
```ts
playPlotAction: (plotType: PlotType, cardId: CardId, targetPlayerId?: string) => void;
playInstant: (playerId: string, instantType: InstantType, cardId: CardId, targetPlayerId?: string) => void;
targetDeclareDuel: (playerId: string, cardId: CardId) => void;
```

- [ ] **Step 1: Write the failing regression test**

Append to `packages/engine/src/resolvers/doubtResolver.check.ts` a case that pins the reported bug. The hand has two cards; the staked one is revealed and discarded; the surviving card must still be findable by its own id, and the action's `stakedCardId` must not resolve to it.

```ts
// The reported bug: revealing the staked card must not make the OTHER card
// in hand un-findable. Addressing by index used to alias onto the survivor
// once the splice shortened the hand.
{
  const hand = mintDeck(['Наследник', 'Шут']);
  const stakedId = hand[0].id;
  const survivorId = hand[1].id;

  const { get, set, api } = makeHarness({
    players: [
      player({ id: 'p1', name: 'Анна', hand }),
      player({ id: 'p2', name: 'Борис', isBot: true, hand: mintDeck(['Казначей', 'Рыцарь']) })
    ]
  });

  const action: Action = {
    id: 'bug1',
    type: 'role',
    name: 'Наследник',
    actorId: 'p1',
    roleClaim: 'Наследник',
    stakedCardId: stakedId,
    costGold: 0,
    costTokens: 1,
    description: ''
  };
  api.pendingAction = action;

  resolveDoubt(get, set, 'p2');

  const actor = api.players.find(p => p.id === 'p1')!;
  assert.equal(actor.hand.length, 1, 'only the staked card leaves the hand');
  assert.equal(actor.hand[0].id, survivorId, 'the survivor keeps its own identity');
  assert.ok(
    api.discardPile.some(c => c.id === stakedId),
    'the staked instance is the one that reached the discard'
  );
  timerManager.clearAll();
}
```

Import `mintDeck` and `resolveDoubt` at the top of the check file, and make `makeHarness`/`player` accept `CardInstance[]` hands.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx packages/engine/src/resolvers/doubtResolver.check.ts`
Expected: FAIL — `stakedCardId` is not a known property of `Action`.

- [ ] **Step 3: Rename the field through the engine**

- `Action.stakedCardIndex?: number` → `stakedCardId?: CardId`
- `Action.stakedCardIndices?: number[]` → `stakedCardIds?: CardId[]`
- `GameState.pendingDuelDefenderCardIndex: number | null` → `pendingDuelDefenderCardId: CardId | null`
- `Action.cardAlreadyResolved` is **deleted** — nothing outside presentation used it, and presentation no longer needs it.

In `doubtResolver.ts` around the old line 141, replace the index dance:

```ts
const staked = byId(actor.hand, pendingAction.stakedCardId) ?? actor.hand[0];
const revealedRole = staked?.card ?? 'Наследник';
const wasTruth = revealedRole === claimedRole;
```

and around the old line 237, replace `actorHand.splice(stakedIndex, 1)`:

```ts
const { rest: actorHand } = pluck(actor.hand, staked.id);
newPlayers[actorIdx] = { ...newPlayers[actorIdx], hand: actorHand };
const newDiscard = [...get().discardPile, staked];
```

Apply the same `byId` + `pluck` shape in `duelResolver.ts`, `instantResolver.ts`, `plotResolver.ts` and `normalActionResolver.ts`. In `normalActionResolver.ts` the card-exchange path maps over `stakedCardIds` and plucks each one.

- [ ] **Step 4: Update the callers**

Store methods take `cardId: CardId` where they took `cardIndex: number`. In the web app, every call site currently passes a hand index; it now passes `human.hand[i].id` (or the id it already has in hand). `botTurnPlanner.ts` picks `bot.hand[plotIdx].id`. `botReactions.ts` uses `idOf(bot.hand, 'Право вето')` / `idOf(bot.hand, shieldRole)` and skips the reaction when it is `null`.

`apps/web/src/lib/handSlots.ts` `isCardStaked` becomes an id comparison:

```ts
export function isCardStaked(
  pendingAction: Pick<Action, 'type' | 'actorId' | 'stakedCardId'> | null | undefined,
  playerId: string,
  cardId: CardId
): boolean {
  return (
    pendingAction?.type === 'role' &&
    pendingAction.actorId === playerId &&
    pendingAction.stakedCardId === cardId
  );
}
```

`compactIndex` is deleted along with its tests — nothing needs a compact index any more.

- [ ] **Step 5: Run the tests**

```bash
npm run build:web && for f in $(find packages/engine/src apps/web/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```
Expected: build passes, all checks `ok`, including the new regression case.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(engine): address staked cards by id so a reveal cannot hide the other card"
```

---

### Task 3: Derive each card's zone from state

**Files:**
- Create: `apps/web/src/lib/cardZones.ts`
- Create: `apps/web/src/lib/cardZones.check.ts`

**Interfaces:**
- Consumes: `CardId`, `CardInstance`, `byId`, `idOf` from Task 1; `Action.stakedCardId` from Task 2.
- Produces:
```ts
export type Zone =
  | { kind: 'deck' }
  | { kind: 'hand'; playerId: string; slot: 0 | 1 }
  | { kind: 'stake' }
  | { kind: 'duel'; side: 'attacker' | 'defender' }
  | { kind: 'table' }
  | { kind: 'overlay' }
  | { kind: 'plot'; playerId: string }
  | { kind: 'discard' };

export type Face = { known: GameCard } | { known: null };

export interface PlacedCard {
  id: CardId;
  zone: Zone;
  face: Face;
  /** True while this card is being scrutinised — the table wants it flipped up. */
  revealed: boolean;
  ownerId: string | null;
}

export function zoneKey(zone: Zone): string;
export function deriveCardZones(
  state: Pick<GameState, 'players' | 'deck' | 'discardPile' | 'pendingAction' |
    'pendingDuelDefenderCardId' | 'overlayInstant' | 'revealOutcome' |
    'duelOutcome' | 'turnPhase'>,
  viewerId: string
): PlacedCard[];
```

`zoneKey` is the string an anchor registers itself under, e.g. `hand:p1:0`, `stake`, `plot:p3`, `discard`, `deck`, `duel:attacker`, `table`, `overlay`.

Placement precedence, highest first: `overlay` (the instant laid on top), `duel` sides, `stake`, `table`, `plot`, `hand`, `discard`, `deck`. A card claimed by a higher rule never also appears in a lower one.

Hand slot assignment: a player's hand array index maps directly to slot, since the engine keeps hands at ≤2 and identity is now stable — no reconciliation heuristic. When a hand holds one card whose id was previously in slot 1, it still lands in slot 0; slot stickiness is a *layout* concern handled by the anchor grid, not here.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/cardZones.check.ts`

Cover, at minimum, each of these with `assert`:
1. Two identical faces in hand get distinct ids and land in slots 0 and 1.
2. A role action with `stakedCardId` puts that card in `stake` and **leaves the other hand card in its hand slot** (the reported bug, at the presentation layer).
3. `overlayInstant` puts the veto card in `overlay` while the staked card stays in `stake`.
4. A card in `discardPile` is in `discard` and never also in a hand.
5. During `DUEL_ATTACKER_WINDOW` with `pendingDuelDefenderCardId` set, attacker's staked card is `duel:attacker` and the defender's is `duel:defender`.
6. An opponent's hand card has `face.known === null` for the viewer; the viewer's own is `face.known === '<card>'`.
7. `revealOutcome` makes the revealed card's `face.known` non-null and `revealed === true` even though it belongs to an opponent.
8. A card id present in `deck` is in zone `deck`.
9. `zoneKey` round-trips: distinct zones produce distinct keys, identical zones produce identical keys.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx apps/web/src/lib/cardZones.check.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `deriveCardZones`**

Pure, no React, no DOM, no store import. It takes the state slice and the viewer id and returns one `PlacedCard` per card the UI could possibly need to draw. Deck cards are included so a draw has an origin; they carry `face: { known: null }`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx apps/web/src/lib/cardZones.check.ts`
Expected: `cardZones.check: ok`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): derive each card's zone from game state"
```

---

### Task 4: Motion runtime — tokens, anchor registry, card layer

**Files:**
- Modify: `apps/web/package.json` (add `motion`)
- Create: `apps/web/src/motion/tokens.ts`
- Create: `apps/web/src/motion/AnchorRegistry.tsx`
- Create: `apps/web/src/motion/CardLayer.tsx`
- Modify: `apps/web/src/styles/tokens.css`

**Interfaces:**
- Consumes: `Zone`, `zoneKey`, `PlacedCard` from Task 3.
- Produces:
```ts
// tokens.ts
export const spring = {
  flight: { type: 'spring', stiffness: 260, damping: 30, mass: 1.0 },
  settle: { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 },
  hover:  { type: 'spring', stiffness: 520, damping: 32, mass: 0.5 },
  press:  { type: 'spring', stiffness: 700, damping: 30, mass: 0.4 }
} as const;
export const dur = { flip: 0.5, fade: 0.18, panel: 0.26, stagger: 0.06 } as const;

// AnchorRegistry.tsx
export const AnchorProvider: React.FC<{ children: React.ReactNode }>;
export const CardAnchor: React.FC<{
  zone: Zone;
  className?: string;
  children?: React.ReactNode;   // optional placeholder art, e.g. the empty slot frame
}>;
/** Live rect of a registered zone, or null if nothing registered it. */
export function useAnchorRect(key: string): DOMRect | null;
export function useAnchorRects(): (key: string) => DOMRect | null;
```

`CardAnchor` renders a plain `div` that occupies layout, registers its node under `zoneKey(zone)`, and never renders the card itself. The provider keeps a `Map<string, HTMLElement>` and recomputes rects on a `ResizeObserver` over the stage plus a `window` resize/scroll listener, bumping a version counter so consumers re-read.

`CardLayer` renders `position: fixed; inset: 0; pointer-events: none` and maps `PlacedCard[]` to `motion.div` keyed by `CardId`, animating `x`, `y`, `width`, `height`, `rotate` toward the anchor rect. Each card's inner element does the 3D flip, so projection and flip never fight. Cards re-enable `pointer-events` on themselves when their zone is interactive.

- [ ] **Step 1: Install the dependency**

```bash
npm install motion --workspace=apps/web
```

- [ ] **Step 2: Write `tokens.ts` and mirror it into CSS**

Add to `:root` in `apps/web/src/styles/tokens.css`: `--dur-flip: 500ms; --dur-fade: 180ms; --dur-panel: 260ms;` and keep `--ease-out` as is. Delete `--dur-move` only in Task 8, after its last consumer is gone.

- [ ] **Step 3: Implement `AnchorRegistry.tsx`**

- [ ] **Step 4: Implement `CardLayer.tsx`**

The card node reads its target rect each render. If the anchor is missing (nothing registered that zone yet), the card holds its last known rect rather than jumping to 0,0 — a missing anchor must never teleport a card.

- [ ] **Step 5: Verify the build**

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): motion tokens, anchor registry and card layer"
```

---

### Task 5: Hand and table move onto anchors

**Files:**
- Modify: `apps/web/src/components/Hand.tsx`
- Modify: `apps/web/src/components/StakedCardArena.tsx`
- Modify: `apps/web/src/components/Card.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles/layout.css`

`Hand` renders two `CardAnchor`s with `zone={{ kind: 'hand', playerId, slot }}` plus the empty-slot frame. It renders no card. Click handling moves to the layer card, which calls back through a context callback `onCardActivate(cardId)`.

`StakedCardArena` keeps the claim badges, the `дуэль` divider and the layout boxes, and renders `CardAnchor`s for `stake`, `table`, `overlay`, `duel:attacker`, `duel:defender`. Everything about `cardFlightEvent`, `hasCardDeparted`, `showPile` and `isSingleFlight` is deleted. Target size: about 80 lines.

`App.tsx` wraps `main.app__stage` in `AnchorProvider` and renders `CardLayer` as its last child.

- [ ] **Step 1: Rewrite `Hand.tsx` as anchors**
- [ ] **Step 2: Strip `StakedCardArena.tsx` to badges plus anchors**
- [ ] **Step 3: Move card affordances (hover, click, title) into the layer card**
- [ ] **Step 4: Wire `AnchorProvider` and `CardLayer` into `App.tsx`**
- [ ] **Step 5: Run the app and confirm play/reveal/return works**

```bash
npm run dev:web
```
Play an offline game: claim a role, have it doubted, watch the card flip and fly. Confirm the second hand card never disappears.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): hand and table render anchors, cards live in the layer"
```

---

### Task 6: Seats, plot slots, corner anchors

**Files:**
- Modify: `apps/web/src/components/OpponentSeat.tsx`
- Modify: `apps/web/src/components/PlotSlot.tsx`
- Modify: `apps/web/src/components/Arena.tsx`
- Modify: `apps/web/src/styles/layout.css`

Opponent mini-slots become `CardAnchor`s with `zone={{ kind:'hand', playerId, slot }}`; the `minicard--empty` frame stays as the anchor's child. `PlotSlot` becomes a `CardAnchor` for `plot:<playerId>` and keeps only its label, target name and charge pip. The table gains two invisible corner anchors inside `.table`: `deck` at the top-left, `discard` at the top-right, sized like a small card, `opacity: 0; pointer-events: none`.

- [ ] **Step 1: Opponent seats to anchors**
- [ ] **Step 2: Plot slot to anchor**
- [ ] **Step 3: Corner anchors in `Arena.tsx`**
- [ ] **Step 4: Verify a bot's turn, a plot being laid, and a discard all land correctly**
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): seat, plot and corner anchors"
```

---

### Task 7: Tune the motion catalog

**Files:**
- Modify: `apps/web/src/motion/CardLayer.tsx`
- Modify: `apps/web/src/motion/tokens.ts`

Per-transition treatment, keyed on the `(fromZone.kind → toZone.kind)` pair:

| From → To | Treatment |
| --- | --- |
| `deck` → `hand` | `spring.flight`, entry from the top-left corner face-down, flip to face on arrival, `dur.stagger` between the two cards |
| `hand` → `stake` | `spring.flight`, slight `rotate` toward centre, stays face-down |
| `stake` → `hand` | `spring.settle`, one continuous move, no fade |
| `stake` → `discard` | flip first (`dur.flip`), hold ~400ms, then `spring.flight` to the top-right corner, shrinking and fading over the last 30% |
| `hand` → `overlay` | `spring.flight` with a `rotate` of 10–16°, landing on top of the stake |
| `overlay` → `discard` | `spring.flight` delayed by `dur.stagger` after the stake card leaves |
| `hand` → `duel:*` | both sides converge simultaneously, synchronous flip |
| `hand` → `table` | `spring.flight`, face-up the whole way |
| `hand` → `plot` | `spring.flight` with width/height interpolating down to the slot size |
| anything → `deck` | shrink and fade into the top-left corner |

Hover and press live on the layer card: `whileHover` lifts with `spring.hover`, `whileTap` presses to `0.97` with `spring.press`, plus a pointer-tracked tilt capped at ±6° that is disabled on coarse pointers.

- [ ] **Step 1: Implement the transition table**
- [ ] **Step 2: Implement hover, press and tilt on the layer card**
- [ ] **Step 3: Play a full offline game and check every row of the catalog**
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): tune per-transition card motion"
```

---

### Task 8: Panel transitions, reduced motion, dead code

**Files:**
- Modify: `apps/web/src/components/ActionControls.tsx`
- Modify: `apps/web/src/components/OpponentSeat.tsx` (speech bubbles)
- Modify: `apps/web/src/components/Arena.tsx` (`targetbar`)
- Delete: `apps/web/src/lib/handSlots.ts`, `apps/web/src/lib/handSlots.check.ts`, `apps/web/src/lib/presence.ts`
- Modify: `packages/engine/src/utils/visualEffects.ts`
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/resolvers/cardFlight.check.ts`
- Modify: `apps/web/src/styles/layout.css`, `panels.css`, `tokens.css`

`ActionControls`'s `Panel` gets wrapped in `motion.div` with `layout` and an `AnimatePresence` keyed by the phase discriminator already computed as `windowKey`; content crossfades with an 8px vertical offset over `dur.panel` while the panel height interpolates.

Engine cleanup: delete `CardFlightEvent`, `GameState.cardFlightEvent`, `GameState.hasCardDeparted`, `triggerSingleCardFlight`, `triggerFaceCardFlight`, `triggerDuelCardFlight`, and every call site. `triggerResourceFloat` stays.

`cardFlight.check.ts` is rewritten to assert *zone outcomes* instead of event emission: after `triggerVetoWindowOrResolveEffect` with no veto holder, the staked instance is back in the actor's hand; after a veto before any reveal, likewise; after an instant's window closes, the instant instance is in `discardPile`.

CSS cleanup: delete `@keyframes fly-discard`, `fly-hand`, `fly-seat-left`, `fly-seat-mid`, `fly-seat-right`, `hand-in`, `hand-out`, `card-deal`, and the rules `.fly-*`, `.handcard--out`, `.minicard--out`, `.flypill`, and `--dur-move` once unused.

Reduced motion: a `useReducedMotion()` check in `CardLayer` swaps springs for `{ duration: 0 }` position changes with a 120ms opacity crossfade, and turns the 3D flip into a crossfade. Tilt and hover lift are disabled; hover keeps only the border/glow change.

- [ ] **Step 1: Animate the action panel**
- [ ] **Step 2: Animate `targetbar`, badges and speech bubbles with `AnimatePresence`**
- [ ] **Step 3: Rewrite `cardFlight.check.ts` against zones and run it**

Run: `npx tsx packages/engine/src/resolvers/cardFlight.check.ts`
Expected: `cardFlight.check: ok`

- [ ] **Step 4: Delete the dead modules, flags and CSS**
- [ ] **Step 5: Implement reduced motion**
- [ ] **Step 6: Full verification**

```bash
npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```
Expected: build passes, lint clean, every check `ok`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): smooth panel transitions, reduced motion, remove flight events"
```

---

## Self-Review

**Spec coverage:** §1 → Task 1; §2 → Task 3; §3 → Tasks 4–6; §4 → Task 6; §5 → Task 4; §6 → Task 7; §7 → Task 7; §8 → Task 8; §9 → Task 8; "what is deleted" → Task 8; testing → Tasks 1, 2, 3, 8. The bugfix for defect 5 is pinned by a regression test in Task 2 and again at the presentation layer in Task 3.

**Type consistency:** `CardId`, `CardInstance`, `mintDeck`, `faces`, `idOf`, `holds`, `byId`, `pluck` are defined in Task 1 and used with those exact names in Tasks 2, 3. `Zone`, `zoneKey`, `PlacedCard`, `deriveCardZones` are defined in Task 3 and consumed with those names in Tasks 4–7. `spring`, `dur`, `CardAnchor`, `AnchorProvider`, `useAnchorRect` are defined in Task 4 and consumed in Tasks 5–8. `stakedCardId` / `stakedCardIds` / `pendingDuelDefenderCardId` are introduced in Task 2 and referenced in Task 3.
