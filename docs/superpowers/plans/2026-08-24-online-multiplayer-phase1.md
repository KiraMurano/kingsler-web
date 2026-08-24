# Kinglier Online Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-tab, browser-only Kinglier game into a self-hostable online game for up to 4 players over WebSockets, with empty or disconnected seats played by the existing bot AI.

**Architecture:** npm workspaces split the code into `packages/engine` (the existing, unmodified game rules + bot AI, reused verbatim), `apps/web` (the existing React UI, given a thin network-aware mode), and `apps/server` (a new Colyseus room that runs one instance of `packages/engine` per match, isolated inside its own `worker_threads` Worker so the engine's existing module-level singletons — `useGameStore`, `timerManager`, `botMemory` — need zero code changes even with many concurrent matches in one process). The server is the sole source of truth; a `redactStateForPlayer` function is the single choke point that strips hidden card data before anything crosses the network.

**Tech Stack:** TypeScript, React 19, Zustand 5 (existing), Colyseus 0.17 (`colyseus`, `@colyseus/sdk`), Express 5, Node.js `worker_threads`, `tsx` (run TypeScript directly, no build step for the server), Docker.

## Global Constraints

- The server is the sole source of truth for game state. No network message may ever contain another player's hidden hand contents or deck/discard card identities. (spec: Hard Constraint)
- Reuse `packages/engine`'s existing resolvers, types, and bot AI unmodified wherever possible — do not refactor singletons into DI-passed instances; isolate them per room via `worker_threads` instead. (spec: Key Existing-Code Finding)
- No database, no Redis, no build step for the server in Phase 1 — one Docker container, one exposed port, room state in process memory. (spec: Deployment)
- Tests follow the project's existing convention: assert-based `*.check.ts` files run via `npx tsx path/to/file.check.ts`, no test framework. (spec: Testing)
- Reconnection grace period: 60 seconds by default, then the seat is handed to the bot AI for the rest of the match. (spec: Bot Fill-In and Reconnect)
- Accounts, public matchmaking, horizontal scaling are explicitly out of scope for this plan. (spec: Explicitly Out of Scope for Phase 1)
- Do not hardcode dependency version numbers when adding new packages — install with the package manager and let it pin the resolved version.

---

## Task 1: Convert the repo to npm workspaces and relocate the engine into `packages/engine`

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`
- Create: `apps/web/package.json` (moved from root `package.json`)
- Move: `src/engine/**` → `packages/engine/src/**`
- Move: `src/**` (everything else), `public/**`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json` → `apps/web/`
- Modify: root `package.json` (becomes the workspace root)
- Delete: root `package-lock.json` (regenerated)

**Interfaces:**
- Produces: `@kinglier/engine` — an npm workspace package whose subpath exports mirror the current `src/engine/*` file layout exactly (e.g. `@kinglier/engine/GameStore`, `@kinglier/engine/types`, `@kinglier/engine/cards`, `@kinglier/engine/Bot`, `@kinglier/engine/utils/russianText`). Every later task imports from these subpaths.

- [ ] **Step 1: Create the workspace folders and move the engine**

```bash
mkdir -p packages/engine apps/web apps/server
git mv src/engine packages/engine/src
```

- [ ] **Step 2: Write `packages/engine/package.json`**

```json
{
  "name": "@kinglier/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./*": "./src/*.ts"
  }
}
```

- [ ] **Step 3: Write `packages/engine/tsconfig.json`** (same compiler options the engine already relied on, taken from the current root `tsconfig.app.json`, minus the DOM lib and JSX settings it never needed)

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.check.ts"]
}
```

- [ ] **Step 4: Move the rest of the app into `apps/web`**

```bash
git mv src apps/web/src
git mv public apps/web/public
git mv index.html apps/web/index.html
git mv vite.config.ts apps/web/vite.config.ts
git mv tsconfig.json apps/web/tsconfig.json
git mv tsconfig.app.json apps/web/tsconfig.app.json
git mv tsconfig.node.json apps/web/tsconfig.node.json
git mv .oxlintrc.json apps/web/.oxlintrc.json
git mv package.json apps/web/package.json
git rm package-lock.json
```

- [ ] **Step 5: Remove the `zustand` dependency from `apps/web/package.json`** (it moves to the engine package, which is the only place that imports it) — open `apps/web/package.json` and delete the `"zustand": "^5.0.15"` line from `dependencies`.

- [ ] **Step 6: Rewrite the engine import paths in `apps/web/src`**

Every import of the shape `'../engine/...'` or `'./engine/...'` becomes `'@kinglier/engine/...'`:

```bash
cd apps/web
grep -rl "engine/" src --include="*.ts" --include="*.tsx" | xargs sed -i '' -E "s#(\.\./|\./)engine/#@kinglier/engine/#g"
cd ../..
```

- [ ] **Step 7: Create the workspace root `package.json`**

```json
{
  "name": "kinglier-game",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "dev:web": "npm run dev --workspace=apps/web",
    "build:web": "npm run build --workspace=apps/web",
    "lint": "npm run lint --workspace=apps/web"
  }
}
```

- [ ] **Step 8: Install dependencies and add `zustand` + `tsx` to the engine package**

```bash
npm install
npm install zustand --workspace=packages/engine
npm install -D tsx --workspace=packages/engine
```

- [ ] **Step 9: Verify the move — build, lint, and run the existing checks**

```bash
npm run build --workspace=apps/web
npm run lint --workspace=apps/web
npx tsx packages/engine/src/GameStore.check.ts
npx tsx packages/engine/src/resolvers/duelResolver.check.ts
npx tsx packages/engine/src/resolvers/cardFlight.check.ts
npx tsx packages/engine/src/lib/handSlots.check.ts
```

Expected: the Vite build succeeds, oxlint reports no errors, and every check script prints its assertions passing with no `AssertionError`. If `handSlots.check.ts` fails to resolve `@kinglier/engine/...` imports, re-run Step 6's `sed` — that file lives in `apps/web/src/lib`, not inside the engine package, so it needs the same import rewrite.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: split repo into npm workspaces (packages/engine, apps/web)"
```

---

## Task 2: Let `startGame` seat real joined players, filling the rest with bots

**Files:**
- Modify: `packages/engine/src/types.ts` (`startGame` signature on `GameState`)
- Modify: `packages/engine/src/GameStore.ts` (`startGame` implementation)
- Create: `packages/engine/src/GameStore.seats.check.ts`

**Interfaces:**
- Produces: `GameState.startGame(seats?: { id: string; name: string; avatar?: string }[]) => void`. Called with no arguments (or `undefined`), behavior is unchanged from today (one human `p1` + 3 bots). Called with 1-4 seats, those become the human players in seat order 1..N, and bots fill seats N+1..4.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/GameStore.seats.check.ts
/**
 * startGame must seat real joined players in order and fill any remaining
 * seats (up to 4) with bots. Run: npx tsx packages/engine/src/GameStore.seats.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from './GameStore.ts';
import { TOTAL_DECK_SIZE } from './cards.ts';

useGameStore.getState().startGame([
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
]);

const state = useGameStore.getState();
assert.equal(state.players.length, 4, 'must always seat exactly 4 players');

const [seat1, seat2, seat3, seat4] = state.players;
assert.equal(seat1.id, 'p1');
assert.equal(seat1.name, 'Аня');
assert.equal(seat1.isBot, false);
assert.equal(seat1.seatNumber, 1);

assert.equal(seat2.id, 'p2');
assert.equal(seat2.name, 'Боря');
assert.equal(seat2.isBot, false);
assert.equal(seat2.seatNumber, 2);

assert.equal(seat3.isBot, true);
assert.equal(seat3.seatNumber, 3);
assert.equal(seat4.isBot, true);
assert.equal(seat4.seatNumber, 4);

for (const p of state.players) {
  assert.equal(p.hand.length, 2, `${p.id} must be dealt 2 cards`);
  assert.equal(p.gold, 2);
  assert.equal(p.actionTokens, 2);
}
assert.equal(state.deck.length, TOTAL_DECK_SIZE - 8, 'deck must be down by 4 players x 2 cards');
assert.equal(state.activePlayerId, 'p1', 'the first seated human goes first');

// Backward compatibility: calling with no seats keeps today's solo-vs-3-bots behavior.
useGameStore.getState().startGame();
const solo = useGameStore.getState();
assert.equal(solo.players.length, 4);
assert.equal(solo.players[0].id, 'p1');
assert.equal(solo.players.filter(p => !p.isBot).length, 1, 'no-args startGame must still mean exactly one human');

console.log('GameStore.seats.check.ts passed.');
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx tsx packages/engine/src/GameStore.seats.check.ts
```

Expected: `TypeError` or assertion failure, since `startGame` does not yet accept an argument.

- [ ] **Step 3: Update the `startGame` signature in `types.ts`**

In `packages/engine/src/types.ts`, find this line (around line 197):

```ts
  startGame: () => void;
```

Replace with:

```ts
  startGame: (seats?: { id: string; name: string; avatar?: string }[]) => void;
```

- [ ] **Step 4: Rewrite the `startGame` implementation in `GameStore.ts`**

Find the `startGame: () => { ... }` method (it currently starts around line 100 and ends around line 172 with the `history:` field before the closing `});`). Replace the player-construction block — from `const deck = createInitialDeck();` down to the closing of the `players` array — with:

```ts
  startGame: (seats) => {
    timerManager.clearAll();
    botMemory.clear();
    const deck = createInitialDeck(); // 44 unified cards

    const humanSeats = seats && seats.length > 0
      ? seats.slice(0, 4)
      : [{ id: 'p1', name: 'Вы', avatar: '/avatars/anton.jpg' }];

    const botsNeeded = 4 - humanSeats.length;
    const selectedBots = shuffleArray([...ALL_BOT_CANDIDATES]).slice(0, botsNeeded);

    const players: Player[] = [
      ...humanSeats.map((seat, idx) => ({
        id: seat.id,
        name: seat.name,
        avatar: seat.avatar ?? '/avatars/anton.jpg',
        seatNumber: idx + 1,
        isBot: false,
        gold: 2,
        favor: 0,
        seals: 0,
        actionTokens: 2,
        hand: [deck.pop()!, deck.pop()!],
        activePlot: null
      })),
      ...selectedBots.map((b, idx) => ({
        id: `b${idx + 1}`,
        name: b.name,
        avatar: b.avatar,
        seatNumber: humanSeats.length + idx + 1,
        isBot: true,
        archetype: b.archetype,
        gold: 2,
        favor: 0,
        seals: 0,
        actionTokens: 2,
        hand: [deck.pop()!, deck.pop()!],
        activePlot: null
      }))
    ];

    set({
      players,
      deck,
      discardPile: [],
      activePlayerId: players[0].id,
```

The rest of the `set({...})` call (from `turnPhase: 'IDLE',` through the closing `});`) stays exactly as it is today — only the `activePlayerId` line changes from the literal `'p1'` to `players[0].id`, and the block above it changes as shown.

- [ ] **Step 5: Run the check again**

```bash
npx tsx packages/engine/src/GameStore.seats.check.ts
```

Expected: `GameStore.seats.check.ts passed.` with no assertion errors.

- [ ] **Step 6: Re-run the pre-existing checks to confirm nothing broke**

```bash
npx tsx packages/engine/src/GameStore.check.ts
```

Expected: passes unchanged (it calls `startGame()` with no arguments).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/GameStore.ts packages/engine/src/GameStore.seats.check.ts
git commit -m "feat(engine): let startGame seat real joined players and fill the rest with bots"
```

---

## Task 3: State redaction for the network boundary

**Files:**
- Create: `packages/engine/src/net/gameStateData.ts`
- Create: `packages/engine/src/net/redaction.ts`
- Create: `packages/engine/src/net/redaction.check.ts`
- Modify: `packages/engine/src/types.ts` (add `viewerId` to `GameState`)

**Interfaces:**
- Produces: `toGameStateData(state: GameState): GameStateData` — strips the ~30 action-method function properties off the Zustand state, leaving only plain data.
- Produces: `redactStateForPlayer(data: GameStateData, viewerId: string): PublicGameState` — the single choke point hiding information from a given viewer. `apps/server` is the only future consumer; `packages/engine` has no other code that needs to call this. The result carries a `viewerId` field so the receiving client can tell which seat is its own — with 2+ human players, `players.find(p => !p.isBot)` (today's offline-only assumption) can no longer identify "me".

- [ ] **Step 1: Write `gameStateData.ts`**

```ts
// packages/engine/src/net/gameStateData.ts
import type { GameState } from '../types.ts';

/**
 * The data-only shape of GameState: every action method (performAction,
 * doubtAction, the internal `_foo` helpers, etc.) is excluded. Deriving this
 * structurally from GameState means it can never drift out of sync — any new
 * data field automatically appears here, any new method is automatically
 * excluded.
 */
export type GameStateData = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof GameState as GameState[K] extends (...args: any[]) => any ? never : K]: GameState[K];
};

export function toGameStateData(state: GameState): GameStateData {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'function') {
      data[key] = value;
    }
  }
  return data as GameStateData;
}
```

- [ ] **Step 2: Write the failing test for redaction**

```ts
// packages/engine/src/net/redaction.check.ts
/**
 * redactStateForPlayer is the only place allowed to decide what a given
 * player's browser is allowed to see. This check exists because a leak here
 * breaks the game's entire bluffing mechanic.
 * Run: npx tsx packages/engine/src/net/redaction.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from '../GameStore.ts';
import { toGameStateData } from './gameStateData.ts';
import { redactStateForPlayer } from './redaction.ts';

useGameStore.getState().startGame([
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
]);
const data = toGameStateData(useGameStore.getState());

const forP1 = redactStateForPlayer(data, 'p1');
assert.equal(forP1.viewerId, 'p1', 'the payload must say which seat the recipient is');

const realP1 = data.players.find(p => p.id === 'p1')!;
const redactedP1 = forP1.players.find(p => p.id === 'p1')!;
assert.deepEqual(redactedP1.hand, realP1.hand, 'a player must see their own hand');

for (const p of forP1.players.filter(p => p.id !== 'p1')) {
  assert.equal(p.hand.length, data.players.find(d => d.id === p.id)!.hand.length, 'hand length must be preserved');
  assert.ok(p.hand.every(card => card === null), `player ${p.id}'s hand must be fully hidden from p1`);
}

assert.equal('deck' in forP1, false, 'the raw deck array must never be sent');
assert.equal(forP1.deckSize, data.deck.length);

assert.equal('discardPile' in forP1, false, 'the raw discard array must never be sent (it can hold face-down returned cards)');
assert.equal(forP1.discardPileSize, data.discardPile.length);

// informantPeekData must only reach its intended observer.
const dataWithPeek = { ...data, informantPeekData: { observerId: 'p2', targetId: 'p1', newCard: data.players[0].hand[0] } };
const peekForP1 = redactStateForPlayer(dataWithPeek, 'p1');
const peekForP2 = redactStateForPlayer(dataWithPeek, 'p2');
assert.equal(peekForP1.informantPeekData, null, 'the peek target must not see the peeked card');
assert.deepEqual(peekForP2.informantPeekData, dataWithPeek.informantPeekData, 'the observer must see their own peek');

console.log('redaction.check.ts passed.');
```

- [ ] **Step 2b: Run it to confirm it fails**

```bash
npx tsx packages/engine/src/net/redaction.check.ts
```

Expected: fails to resolve `./redaction.ts` (module not found).

- [ ] **Step 3: Write `redaction.ts`**

```ts
// packages/engine/src/net/redaction.ts
import type { Player, GameCard } from '../types.ts';
import type { GameStateData } from './gameStateData.ts';

export type PublicPlayer = Omit<Player, 'hand'> & { hand: (GameCard | null)[] };

export type PublicGameState = Omit<GameStateData, 'players' | 'deck' | 'discardPile'> & {
  viewerId: string;
  players: PublicPlayer[];
  deckSize: number;
  discardPileSize: number;
};

export function redactStateForPlayer(state: GameStateData, viewerId: string): PublicGameState {
  const { players, deck, discardPile, informantPeekData, ...rest } = state;

  return {
    ...rest,
    viewerId,
    deckSize: deck.length,
    discardPileSize: discardPile.length,
    informantPeekData: informantPeekData && informantPeekData.observerId === viewerId ? informantPeekData : null,
    players: players.map((p): PublicPlayer =>
      p.id === viewerId ? p : { ...p, hand: p.hand.map(() => null) }
    )
  };
}
```

- [ ] **Step 4: Add `viewerId` to the `GameState` interface so the client store can read it in online mode**

Find in `packages/engine/src/types.ts` (near the other top-level identity fields, around line 153):

```ts
  activePlayerId: string;
```

Add directly below it:

```ts
  /** Only set in online mode: which seat this browser's connection is. Undefined offline. */
  viewerId?: string;
```

- [ ] **Step 5: Run the check again**

```bash
npx tsx packages/engine/src/net/redaction.check.ts
```

Expected: `redaction.check.ts passed.`

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/net
git commit -m "feat(engine): add state redaction for the network boundary"
```

---

## Task 4: Scaffold `apps/server` (Express + Colyseus, serves the built web app)

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/app.ts`, `apps/server/src/index.ts`

**Interfaces:**
- Produces: `createServer(): ReturnType<typeof defineServer>` from `apps/server/src/app.ts` — used by both the production entrypoint and every later check script that needs a live server to connect to.

- [ ] **Step 1: Write `apps/server/package.json`**

```json
{
  "name": "@kinglier/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  }
}
```

- [ ] **Step 2: Write `apps/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.check.ts"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install colyseus express --workspace=apps/server
npm install -D typescript @types/express @types/node tsx --workspace=apps/server
```

- [ ] **Step 4: Write `apps/server/src/app.ts`**

```ts
// apps/server/src/app.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineServer, defineRoom } from 'colyseus';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

export function createServer() {
  return defineServer({
    rooms: {
      // Room registration is added in Task 6.
    },
    express: app => {
      app.use(express.static(WEB_DIST));
    }
  });
}
```

- [ ] **Step 5: Write `apps/server/src/index.ts`**

```ts
// apps/server/src/index.ts
import { createServer } from './app.ts';

const PORT = Number(process.env.PORT ?? 2567);

createServer().listen(PORT);
console.log(`Kinglier server listening on :${PORT}`);
```

- [ ] **Step 6: Build the web app once so there's a `dist/` to serve, then start the server**

```bash
npm run build --workspace=apps/web
npm run start --workspace=apps/server
```

Expected: console prints `Kinglier server listening on :2567`. In a second terminal, `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:2567/` should print `200`. Stop the server (Ctrl+C) before continuing.

- [ ] **Step 7: Commit**

```bash
git add apps/server package.json package-lock.json
git commit -m "feat(server): scaffold apps/server with Express + Colyseus"
```

---

## Task 5: Isolate the game engine per room in a worker thread

**Files:**
- Create: `apps/server/src/gameWorker.ts` (runs inside the Worker)
- Create: `apps/server/src/GameWorkerClient.ts` (main-thread wrapper)
- Create: `apps/server/src/GameWorkerClient.check.ts`

**Interfaces:**
- Produces: `class GameWorkerClient { startGame(seats): void; call(method: string, args: unknown[]): void; setSeatBotControlled(playerId: string): void; onState(cb: (data: GameStateData) => void): () => void; terminate(): void }`. `KinglierRoom` (Task 6) is the only consumer.
- Consumes: `toGameStateData` from `@kinglier/engine/net/gameStateData` (Task 3), `useGameStore`, `ALL_BOT_CANDIDATES`, `startBotEngine` from `@kinglier/engine/GameStore` and `@kinglier/engine/Bot` (unchanged).

- [ ] **Step 1: Write the worker entry point, `gameWorker.ts`**

```ts
// apps/server/src/gameWorker.ts
import { parentPort } from 'node:worker_threads';
import { useGameStore } from '@kinglier/engine/GameStore';
import { startBotEngine } from '@kinglier/engine/Bot';
import { toGameStateData } from '@kinglier/engine/net/gameStateData';

if (!parentPort) {
  throw new Error('gameWorker.ts must only be run as a worker_threads Worker');
}
const port = parentPort;

// Every method a connected client is allowed to trigger. Internal helpers
// (the underscore-prefixed methods, addSealsToPlayer) are never reachable
// here even if a malicious message claims that method name.
const ALLOWED_METHODS = new Set([
  'performAction', 'skipNormalActionPhase', 'endTurnManually', 'playPlotAction',
  'playInstant', 'doubtAction', 'passDoubt', 'proceedAfterVetoWindow',
  'targetAcceptAttack', 'targetDoubtAttack', 'targetDeclareDuel',
  'attackerRetreatDuel', 'attackerAcceptDuel', 'closeDuelOutcome',
  'closeInformantPeek', 'closeRevealOutcome', 'openConspiracyDialog',
  'closeConspiracyDialog', 'activateConspiracy', 'endTurn'
]);

interface WorkerMessage {
  type: 'startGame' | 'call' | 'setBotSeat';
  seats?: { id: string; name: string; avatar?: string }[];
  method?: string;
  args?: unknown[];
  playerId?: string;
}

useGameStore.subscribe(state => {
  port.postMessage({ type: 'state', data: toGameStateData(state) });
});

startBotEngine();

port.on('message', (msg: WorkerMessage) => {
  switch (msg.type) {
    case 'startGame':
      useGameStore.getState().startGame(msg.seats);
      break;
    case 'call': {
      if (!msg.method || !ALLOWED_METHODS.has(msg.method)) return;
      const state = useGameStore.getState() as unknown as Record<string, (...args: unknown[]) => void>;
      state[msg.method](...(msg.args ?? []));
      break;
    }
    case 'setBotSeat':
      if (!msg.playerId) return;
      useGameStore.setState(state => ({
        players: state.players.map(p => (p.id === msg.playerId ? { ...p, isBot: true } : p))
      }));
      break;
    default:
      break;
  }
});
```

- [ ] **Step 2: Write `GameWorkerClient.ts`**

```ts
// apps/server/src/GameWorkerClient.ts
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SeatInput {
  id: string;
  name: string;
  avatar?: string;
}

interface WorkerOutMessage {
  type: 'state';
  data: GameStateData;
}

export class GameWorkerClient {
  private worker: Worker;
  private stateListeners = new Set<(data: GameStateData) => void>();

  constructor() {
    this.worker = new Worker(path.join(__dirname, 'gameWorker.ts'), {
      execArgv: ['--import', 'tsx/esm']
    });
    this.worker.on('message', (msg: WorkerOutMessage) => {
      if (msg.type === 'state') {
        for (const listener of this.stateListeners) listener(msg.data);
      }
    });
  }

  onState(listener: (data: GameStateData) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  startGame(seats: SeatInput[]): void {
    this.worker.postMessage({ type: 'startGame', seats });
  }

  call(method: string, args: unknown[]): void {
    this.worker.postMessage({ type: 'call', method, args });
  }

  setSeatBotControlled(playerId: string): void {
    this.worker.postMessage({ type: 'setBotSeat', playerId });
  }

  terminate(): void {
    void this.worker.terminate();
  }
}
```

- [ ] **Step 3: Write the failing test**

```ts
// apps/server/src/GameWorkerClient.check.ts
/**
 * Run: npx tsx apps/server/src/GameWorkerClient.check.ts
 */
import assert from 'node:assert/strict';
import { GameWorkerClient } from './GameWorkerClient.ts';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';

const worker = new GameWorkerClient();
const states: GameStateData[] = [];
worker.onState(data => states.push(data));

worker.startGame([
  { id: 'p1', name: 'Аня' },
  { id: 'p2', name: 'Боря' }
]);

await new Promise(resolve => setTimeout(resolve, 500));
assert.ok(states.length > 0, 'starting a game must broadcast at least one state');

const afterStart = states[states.length - 1];
assert.equal(afterStart.players.length, 4);
assert.equal(afterStart.players.filter(p => !p.isBot).length, 2);
assert.equal(afterStart.activePlayerId, 'p1');

const countBeforeAction = states.length;
worker.call('performAction', [{
  type: 'normal',
  name: 'Просить содержание',
  actorId: 'p1',
  costGold: 0,
  costTokens: 1,
  description: 'test'
}]);

await new Promise(resolve => setTimeout(resolve, 300));
assert.ok(states.length > countBeforeAction, 'a forwarded action must trigger a new state broadcast');

// An unknown/internal method must be silently ignored, not crash the worker.
worker.call('_executeNormalAction', []);
await new Promise(resolve => setTimeout(resolve, 100));

worker.terminate();
console.log('GameWorkerClient.check.ts passed.');
```

- [ ] **Step 4: Run it**

```bash
npx tsx apps/server/src/GameWorkerClient.check.ts
```

Expected: `GameWorkerClient.check.ts passed.` If the worker fails to start with a TypeScript-related error, confirm Step 2's `execArgv: ['--import', 'tsx/esm']` is present — this is what lets the worker thread load `.ts` files and resolve the `@kinglier/engine/*` package export map, since a `worker_threads` Worker does not inherit the parent process's loader hooks automatically.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/gameWorker.ts apps/server/src/GameWorkerClient.ts apps/server/src/GameWorkerClient.check.ts
git commit -m "feat(server): isolate the game engine per room in a worker thread"
```

---

## Task 6: `KinglierRoom` — lobby, seats, starting a match

**Files:**
- Create: `apps/server/src/KinglierRoom.ts`
- Modify: `apps/server/src/app.ts` (register the room)
- Create: `apps/server/src/KinglierRoom.lobby.check.ts`

**Interfaces:**
- Produces: `class KinglierRoom extends Room` registered under the name `'kinglier'`.
- Consumes: `GameWorkerClient` (Task 5), `redactStateForPlayer` + `GameStateData` (Task 3).

- [ ] **Step 1: Install the client SDK (needed by the check script in this task)**

```bash
npm install @colyseus/sdk --workspace=apps/web
```

- [ ] **Step 2: Write `KinglierRoom.ts`** (lobby + start only — action forwarding is Task 7, reconnection is Task 8; both are added to this same file)

```ts
// apps/server/src/KinglierRoom.ts
import { Room, Client } from 'colyseus';
import { GameWorkerClient, type SeatInput } from './GameWorkerClient.ts';
import { redactStateForPlayer } from '@kinglier/engine/net/redaction';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';

type Phase = 'WAITING' | 'PLAYING' | 'GAME_OVER';

interface Seat {
  playerId: string;
  sessionId: string;
  nickname: string;
  connected: boolean;
}

interface JoinOptions {
  nickname?: string;
}

interface LobbyMessage {
  seats: { playerId: string; nickname: string; connected: boolean }[];
  hostSessionId: string | null;
  phase: Phase;
}

export class KinglierRoom extends Room {
  maxClients = 4;

  private seats: Seat[] = [];
  private hostSessionId: string | null = null;
  private phase: Phase = 'WAITING';
  protected worker: GameWorkerClient | null = null;
  protected latestState: GameStateData | null = null;

  messages = {
    start: (client: Client) => this.handleStart(client)
  };

  onJoin(client: Client, options: JoinOptions) {
    if (this.phase !== 'WAITING') {
      throw new Error('game already in progress');
    }
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;

    const playerId = `p${this.seats.length + 1}`;
    const nickname = (options.nickname ?? '').trim().slice(0, 24) || playerId;
    this.seats.push({ playerId, sessionId: client.sessionId, nickname, connected: true });
    client.userData = { playerId };
    this.broadcastLobby();
  }

  onLeave(client: Client) {
    this.seats = this.seats.filter(s => s.sessionId !== client.sessionId);
    this.broadcastLobby();
  }

  onDispose() {
    this.worker?.terminate();
  }

  protected broadcastLobby(): void {
    const lobby: LobbyMessage = {
      seats: this.seats.map(s => ({ playerId: s.playerId, nickname: s.nickname, connected: s.connected })),
      hostSessionId: this.hostSessionId,
      phase: this.phase
    };
    this.broadcast('lobby', lobby);
  }

  protected handleStart(client: Client): void {
    if (this.phase !== 'WAITING' || client.sessionId !== this.hostSessionId || this.seats.length === 0) {
      return;
    }

    this.phase = 'PLAYING';
    this.worker = new GameWorkerClient();
    this.worker.onState(data => {
      this.latestState = data;
      for (const seat of this.seats) {
        if (!seat.connected) continue;
        const seatClient = this.clients.getById(seat.sessionId);
        if (seatClient) this.sendState(seatClient, seat.playerId);
      }
    });

    const seatInputs: SeatInput[] = this.seats.map(s => ({ id: s.playerId, name: s.nickname }));
    this.worker.startGame(seatInputs);
    this.broadcastLobby();
  }

  protected sendState(client: Client, playerId: string): void {
    if (!this.latestState) return;
    client.send('state', redactStateForPlayer(this.latestState, playerId));
  }
}
```

- [ ] **Step 3: Register the room in `app.ts`**

In `apps/server/src/app.ts`, replace the `rooms: { }` block with:

```ts
import { KinglierRoom } from './KinglierRoom.ts';

// ...

  return defineServer({
    rooms: {
      kinglier: defineRoom(KinglierRoom)
    },
```

- [ ] **Step 4: Write the failing test** (two simulated players join the same room by code, the host starts the game, both receive a redacted state)

```ts
// apps/server/src/KinglierRoom.lobby.check.ts
/**
 * Run: npx tsx apps/server/src/KinglierRoom.lobby.check.ts
 */
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createServer } from './app.ts';

const PORT = 27891;
const server = createServer();
server.listen(PORT);

const client = new Client(`ws://localhost:${PORT}`);

const host = await client.create('kinglier', { nickname: 'Аня' });
const guest = await client.joinById(host.roomId, { nickname: 'Боря' });

let lastLobby: unknown = null;
host.onMessage('lobby', data => { lastLobby = data; });
await new Promise(resolve => setTimeout(resolve, 200));
assert.ok(lastLobby, 'host must receive a lobby update after the guest joins');

type State = { players: { id: string; hand: (string | null)[]; isBot: boolean }[]; activePlayerId: string };
let hostState: State | null = null;
let guestState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });
guest.onMessage('state', (data: State) => { guestState = data; });

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

assert.ok(hostState, 'host must receive a state message once the game starts');
assert.ok(guestState, 'guest must receive a state message once the game starts');
assert.equal(hostState!.players.length, 4);
assert.equal(hostState!.players.filter(p => !p.isBot).length, 2, 'exactly the 2 joined humans, rest are bots');

host.leave();
guest.leave();
process.exit(0);
```

- [ ] **Step 5: Run it**

```bash
npm run build --workspace=apps/web
npx tsx apps/server/src/KinglierRoom.lobby.check.ts
```

Expected: the script exits `0` with no assertion errors (no explicit success `console.log` needed since `assert` throwing would exit non-zero; add one for clarity if desired).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/KinglierRoom.ts apps/server/src/app.ts apps/server/src/KinglierRoom.lobby.check.ts package.json package-lock.json
git commit -m "feat(server): add KinglierRoom lobby and match start"
```

---

## Task 7: Forward player actions to the worker with per-method authorization

**Files:**
- Modify: `apps/server/src/KinglierRoom.ts`
- Create: `apps/server/src/KinglierRoom.actions.check.ts`

**Interfaces:**
- Produces: the `action` message handler on `KinglierRoom`, gated by three authorization rules so a client can never act on another seat's behalf.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/KinglierRoom.actions.check.ts
/**
 * Run: npx tsx apps/server/src/KinglierRoom.actions.check.ts
 */
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createServer } from './app.ts';

const PORT = 27892;
createServer().listen(PORT);
const client = new Client(`ws://localhost:${PORT}`);

const host = await client.create('kinglier', { nickname: 'Аня' }); // becomes p1
const guest = await client.joinById(host.roomId, { nickname: 'Боря' }); // becomes p2

type State = { players: { id: string; gold: number }[]; activePlayerId: string };
let hostState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });
guest.onMessage('state', () => {});

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));
assert.equal(hostState!.activePlayerId, 'p1', 'p1 (the host) must go first');

const goldBefore = hostState!.players.find(p => p.id === 'p1')!.gold;

// Guest (p2) tries to act even though it is p1's turn — must be rejected.
guest.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p2', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(hostState!.players.find(p => p.id === 'p1')!.gold, goldBefore, "p2's out-of-turn action must be rejected");

// The host acting on p1's own turn must succeed.
host.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 3000));
assert.equal(hostState!.players.find(p => p.id === 'p1')!.gold, goldBefore + 1, "p1's own-turn action must apply");

host.leave();
guest.leave();
console.log('KinglierRoom.actions.check.ts passed.');
process.exit(0);
```

(The 3-second wait after the host's action matches the engine's existing `ACTION_HOLD_MS` = 2200ms delay before a normal action's effect actually lands — see `packages/engine/src/timing.ts`.)

- [ ] **Step 2: Run it to confirm it fails** (there is no `action` message handler yet, so both sends are no-ops and the second assertion fails because gold never increases)

```bash
npm run build --workspace=apps/web
npx tsx apps/server/src/KinglierRoom.actions.check.ts
```

- [ ] **Step 3: Add the authorization tables and `action` message handler to `KinglierRoom.ts`**

Add these constants above the `KinglierRoom` class:

```ts
const ACTIVE_PLAYER_ONLY_ACTIONS = new Set([
  'performAction', 'skipNormalActionPhase', 'endTurnManually',
  'playPlotAction', 'openConspiracyDialog', 'endTurn'
]);

const SELF_ONLY_ACTIONS = new Set([
  'doubtAction', 'passDoubt', 'targetAcceptAttack', 'targetDoubtAttack',
  'targetDeclareDuel', 'attackerRetreatDuel', 'attackerAcceptDuel',
  'activateConspiracy', 'playInstant'
]);

const UNRESTRICTED_ACTIONS = new Set([
  'closeDuelOutcome', 'closeInformantPeek', 'closeRevealOutcome',
  'proceedAfterVetoWindow', 'closeConspiracyDialog'
]);

interface ActionMessage {
  method: string;
  args: unknown[];
}
```

Add `action` to the `messages` object:

```ts
  messages = {
    start: (client: Client) => this.handleStart(client),
    action: (client: Client, payload: ActionMessage) => this.handleAction(client, payload)
  };
```

Add the handler method:

```ts
  protected handleAction(client: Client, payload: ActionMessage): void {
    if (this.phase !== 'PLAYING' || !this.worker || !this.latestState) return;
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    const { method, args } = payload;

    if (ACTIVE_PLAYER_ONLY_ACTIONS.has(method)) {
      if (this.latestState.activePlayerId !== seat.playerId) return;
    } else if (SELF_ONLY_ACTIONS.has(method)) {
      if (args[0] !== seat.playerId) return;
    } else if (!UNRESTRICTED_ACTIONS.has(method)) {
      return; // unknown method: reject
    }

    this.worker.call(method, args);
  }
```

- [ ] **Step 4: Run the check again**

```bash
npx tsx apps/server/src/KinglierRoom.actions.check.ts
```

Expected: `KinglierRoom.actions.check.ts passed.`

- [ ] **Step 5: Re-run Task 6's lobby check to confirm no regression**

```bash
npx tsx apps/server/src/KinglierRoom.lobby.check.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/KinglierRoom.ts apps/server/src/KinglierRoom.actions.check.ts
git commit -m "feat(server): forward player actions to the worker with per-method authorization"
```

---

## Task 8: Reconnection grace period and disconnect-to-bot handoff

**Files:**
- Modify: `apps/server/src/KinglierRoom.ts`
- Create: `apps/server/src/KinglierRoom.reconnect.check.ts`

**Interfaces:**
- Produces: `onDrop`/`onReconnect`/`onLeave` lifecycle handling on `KinglierRoom`, using Colyseus's `allowReconnection`.

- [ ] **Step 1: Write the failing test** (uses a 1-second grace period via an env var override so the test runs fast)

Note: `host.connection.close()` below simulates an unexpected drop by closing the underlying transport directly. If the installed `@colyseus/sdk` version doesn't expose `room.connection` the same way, use whatever the installed version's `Room` type actually exposes for the raw transport (check its `.d.ts`) — the important thing being exercised is a disconnect the server did **not** ask for (so `onDrop` fires, not `onLeave`), not this exact call.

```ts
// apps/server/src/KinglierRoom.reconnect.check.ts
/**
 * Run: npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
 */
import assert from 'node:assert/strict';
process.env.KINGLIER_RECONNECT_GRACE_SECONDS = '1';

import { Client } from '@colyseus/sdk';
import { createServer } from './app.ts';

const PORT = 27893;
createServer().listen(PORT);
const client = new Client(`ws://localhost:${PORT}`);

const host = await client.create('kinglier', { nickname: 'Аня' }); // p1
const guest = await client.joinById(host.roomId, { nickname: 'Боря' }); // p2

type State = { players: { id: string; isBot: boolean }[] };
let guestState: State | null = null;
guest.onMessage('state', (data: State) => { guestState = data; });

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

// Host disconnects unexpectedly (not a consented leave).
host.connection.close();
await new Promise(resolve => setTimeout(resolve, 200));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, false, 'seat must stay human during the grace period');

// Wait past the 1-second grace period.
await new Promise(resolve => setTimeout(resolve, 1500));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, true, 'seat must become bot-controlled after the grace period expires');

guest.leave();
console.log('KinglierRoom.reconnect.check.ts passed.');
process.exit(0);
```

- [ ] **Step 2: Run it to confirm it fails** (the seat never flips to bot-controlled today)

```bash
npm run build --workspace=apps/web
npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
```

- [ ] **Step 3: Add reconnection handling to `KinglierRoom.ts`**

Add this constant near the top of the file:

```ts
const RECONNECTION_GRACE_SECONDS = Number(process.env.KINGLIER_RECONNECT_GRACE_SECONDS ?? 60);
```

Replace the existing `onLeave` method with:

```ts
  async onDrop(client: Client): Promise<void> {
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    seat.connected = false;
    this.broadcastLobby();

    try {
      const rejoined = await this.allowReconnection(client, RECONNECTION_GRACE_SECONDS);
      seat.sessionId = rejoined.sessionId;
      seat.connected = true;
      rejoined.userData = { playerId: seat.playerId };
      this.broadcastLobby();
      this.sendState(rejoined, seat.playerId);
    } catch {
      this.worker?.setSeatBotControlled(seat.playerId);
    }
  }

  onLeave(client: Client): void {
    this.seats = this.seats.filter(s => s.sessionId !== client.sessionId);
    this.broadcastLobby();
  }
```

(`onDrop` now handles every unexpected disconnect; per Colyseus 0.17 semantics, `onLeave` only fires for consented leaves once `onDrop` is defined, so the WAITING-phase "remove the seat immediately" behavior from Task 6 now lives correctly in `onLeave` for the consented case, while `onDrop` covers the mid-game drop-and-maybe-return case.)

- [ ] **Step 4: Run the check again**

```bash
npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
```

Expected: `KinglierRoom.reconnect.check.ts passed.`

- [ ] **Step 5: Re-run Tasks 6 and 7's checks to confirm no regression**

```bash
npx tsx apps/server/src/KinglierRoom.lobby.check.ts
npx tsx apps/server/src/KinglierRoom.actions.check.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/KinglierRoom.ts apps/server/src/KinglierRoom.reconnect.check.ts
git commit -m "feat(server): reconnection grace period and disconnect-to-bot handoff"
```

---

## Task 9: Online client in `apps/web` — connect, lobby screen, reuse the existing UI unchanged

**Files:**
- Create: `apps/web/src/online/OnlineGameClient.ts`
- Create: `apps/web/src/online/bindOnlineStore.ts`
- Create: `apps/web/src/online/Lobby.tsx`, `apps/web/src/online/lobby.css`
- Create: `apps/web/src/Root.tsx`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Create: `apps/web/.env.development`

**Interfaces:**
- Consumes: `@kinglier/engine/GameStore` (`useGameStore`), `@colyseus/sdk`.
- Produces: `<Root />`, rendered from `main.tsx`, replacing `<App />` as the mounted component. `<App mode="offline" | "online" />` is the (slightly modified) existing game screen.

- [ ] **Step 1: Add the dev-time server URL**

```
# apps/web/.env.development
VITE_SERVER_WS_URL=ws://localhost:2567
```

- [ ] **Step 2: Write `OnlineGameClient.ts`**

```ts
// apps/web/src/online/OnlineGameClient.ts
import { Client, type Room } from '@colyseus/sdk';

const SERVER_URL = import.meta.env.VITE_SERVER_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export interface LobbySeat {
  playerId: string;
  nickname: string;
  connected: boolean;
}

export interface LobbyMessage {
  seats: LobbySeat[];
  hostSessionId: string | null;
  phase: 'WAITING' | 'PLAYING' | 'GAME_OVER';
}

export class OnlineGameClient {
  private client = new Client(SERVER_URL);
  room: Room | null = null;

  async createRoom(nickname: string): Promise<Room> {
    this.room = await this.client.create('kinglier', { nickname });
    this.persistReconnectionToken();
    return this.room;
  }

  async joinRoom(roomId: string, nickname: string): Promise<Room> {
    this.room = await this.client.joinById(roomId, { nickname });
    this.persistReconnectionToken();
    return this.room;
  }

  async tryReconnect(roomId: string): Promise<Room | null> {
    const token = localStorage.getItem(`kinglier:reconnect:${roomId}`);
    if (!token) return null;
    try {
      this.room = await this.client.reconnect(token);
      this.persistReconnectionToken();
      return this.room;
    } catch {
      localStorage.removeItem(`kinglier:reconnect:${roomId}`);
      return null;
    }
  }

  startGame(): void {
    this.room?.send('start');
  }

  private persistReconnectionToken(): void {
    if (!this.room) return;
    localStorage.setItem(`kinglier:reconnect:${this.room.roomId}`, this.room.reconnectionToken);
  }
}
```

- [ ] **Step 3: Write `bindOnlineStore.ts`**

```ts
// apps/web/src/online/bindOnlineStore.ts
import type { Room } from '@colyseus/sdk';
import { useGameStore } from '@kinglier/engine/GameStore';
import type { GameState } from '@kinglier/engine/types';
import type { PublicGameState } from '@kinglier/engine/net/redaction';

const NETWORKED_METHODS = [
  'performAction', 'skipNormalActionPhase', 'endTurnManually', 'playPlotAction',
  'playInstant', 'doubtAction', 'passDoubt', 'proceedAfterVetoWindow',
  'targetAcceptAttack', 'targetDoubtAttack', 'targetDeclareDuel',
  'attackerRetreatDuel', 'attackerAcceptDuel', 'closeDuelOutcome',
  'closeInformantPeek', 'closeRevealOutcome', 'openConspiracyDialog',
  'closeConspiracyDialog', 'activateConspiracy', 'endTurn'
] as const;

function noop(): void {}

function sendAction(room: Room, method: string) {
  return (...args: unknown[]) => room.send('action', { method, args });
}

/** Turns a redacted network payload back into the shape the shared store (and
 *  every existing component) already expects. `deck`/`discardPile` are only
 *  ever used for their `.length` client-side (see Codex.tsx), so filled
 *  placeholder arrays of the right size stand in for the real, hidden cards. */
function toStorePatch(data: PublicGameState): Partial<GameState> {
  const { deckSize, discardPileSize, ...rest } = data;
  return {
    ...rest,
    deck: new Array(deckSize).fill('Наследник'),
    discardPile: new Array(discardPileSize).fill('Наследник')
  } as unknown as Partial<GameState>;
}

/** Swaps the shared store's action methods for network-forwarding versions and
 *  starts applying every incoming `state` message. Existing components keep
 *  reading `useGameStore()` exactly as they do in offline mode. */
export function bindOnlineStore(room: Room): () => void {
  const networked = Object.fromEntries(NETWORKED_METHODS.map(method => [method, sendAction(room, method)]));
  useGameStore.setState(networked as unknown as Partial<GameState>);

  room.onMessage('state', (data: PublicGameState) => {
    useGameStore.setState(toStorePatch(data));
  });

  return () => {
    const reset = Object.fromEntries(NETWORKED_METHODS.map(method => [method, noop]));
    useGameStore.setState(reset as unknown as Partial<GameState>);
  };
}
```

- [ ] **Step 4: Write `lobby.css`**

```css
/* apps/web/src/online/lobby.css */
.lobby {
  max-width: 420px;
  margin: 10vh auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: center;
}

.lobby__title {
  font-size: 1.5rem;
}

.lobby__input {
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  border: 1px solid #5554;
  background: transparent;
  color: inherit;
  flex: 1;
}

.lobby__row {
  display: flex;
  gap: 0.5rem;
}

.lobby__error {
  color: #e08a8a;
}

.lobby__hint {
  font-size: 0.85rem;
  opacity: 0.8;
  word-break: break-all;
}

.lobby__seats {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lobby__seat--empty {
  opacity: 0.6;
}
```

- [ ] **Step 5: Write `Lobby.tsx`**

```tsx
// apps/web/src/online/Lobby.tsx
import { useEffect, useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { Button } from '../components/ui/Button';
import { OnlineGameClient, type LobbyMessage } from './OnlineGameClient';
import { bindOnlineStore } from './bindOnlineStore';
import './lobby.css';

interface LobbyProps {
  onGameStarted: () => void;
}

export function Lobby({ onGameStarted }: LobbyProps) {
  const clientRef = useRef<OnlineGameClient>(new OnlineGameClient());
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('room') ?? '');
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    room.onMessage('lobby', (data: LobbyMessage) => {
      setLobby(data);
      if (data.phase === 'PLAYING') {
        bindOnlineStore(room);
        onGameStarted();
      }
    });
  }, [room, onGameStarted]);

  const handleCreate = async () => {
    setError(null);
    try {
      const created = await clientRef.current.createRoom(nickname || 'Игрок');
      history.replaceState(null, '', `?room=${created.roomId}`);
      setRoom(created);
    } catch {
      setError('Не удалось создать комнату. Проверьте соединение с сервером.');
    }
  };

  const handleJoin = async () => {
    setError(null);
    if (!joinCode.trim()) return;
    try {
      const joined = await clientRef.current.joinRoom(joinCode.trim(), nickname || 'Игрок');
      setRoom(joined);
    } catch {
      setError('Комната не найдена или игра уже началась.');
    }
  };

  if (!room || !lobby) {
    return (
      <div className="lobby">
        <h1 className="lobby__title">👑 KINGLIER ONLINE</h1>
        <input
          className="lobby__input"
          placeholder="Ваше имя"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={24}
        />
        <div className="lobby__row">
          <Button tone="gold" block onClick={handleCreate}>Создать комнату</Button>
        </div>
        <div className="lobby__row">
          <input
            className="lobby__input"
            placeholder="Код комнаты"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
          />
          <Button tone="calm" onClick={handleJoin}>Войти</Button>
        </div>
        {error && <p className="lobby__error">{error}</p>}
      </div>
    );
  }

  const isHost = room.sessionId === lobby.hostSessionId;

  return (
    <div className="lobby">
      <h1 className="lobby__title">Комната {room.roomId}</h1>
      <p className="lobby__hint">
        Ссылка для друзей: {location.origin}{location.pathname}?room={room.roomId}
      </p>
      <ul className="lobby__seats">
        {lobby.seats.map(seat => (
          <li key={seat.playerId}>{seat.nickname}{seat.connected ? '' : ' (отключился)'}</li>
        ))}
        {Array.from({ length: 4 - lobby.seats.length }).map((_, i) => (
          <li key={`empty-${i}`} className="lobby__seat--empty">Свободно (займёт бот)</li>
        ))}
      </ul>
      {isHost
        ? <Button tone="gold" onClick={() => clientRef.current.startGame()}>Начать игру</Button>
        : <p>Ожидаем, пока хост начнёт игру…</p>}
    </div>
  );
}
```

- [ ] **Step 6: Gate `App.tsx`'s offline-only startup behind a `mode` prop**

In `apps/web/src/App.tsx`, near the top of the file (module scope, right after the imports), delete the bare top-level call:

```ts
startBotEngine();
```

(keep the `import { startBotEngine } from '@kinglier/engine/Bot';` line — it's used again inside the component in the next step).

Find the component signature:

```ts
export default function App() {
```

Replace with:

```ts
export default function App({ mode }: { mode: 'offline' | 'online' }) {
```

Find the mount effect:

```ts
  useEffect(() => {
    startGame();
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Replace with:

```ts
  useEffect(() => {
    if (mode === 'offline') {
      startBotEngine();
      startGame();
    }
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 6b: Fix "which seat is mine?" for online mode**

With 2+ human players, `players.find(p => !p.isBot)` (today's offline-only assumption, since offline always has exactly one human) can no longer identify the local player — every connected browser would resolve to the same seat. Find:

```ts
  const human = players.find(p => !p.isBot);
```

Replace with:

```ts
  const { viewerId } = useGameStore();
  const human = mode === 'online' ? players.find(p => p.id === viewerId) : players.find(p => !p.isBot);
```

(Add `viewerId` to the destructured fields pulled from `useGameStore()` at the top of the component instead, if you prefer a single destructure — either placement is fine as long as `viewerId` is read from the store.)

- [ ] **Step 7: Write `Root.tsx`**

```tsx
// apps/web/src/Root.tsx
import { useState } from 'react';
import App from './App';
import { Lobby } from './online/Lobby';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

  if (mode === 'menu') {
    return (
      <div className="lobby">
        <h1 className="lobby__title">👑 KINGLIER</h1>
        <button className="btn btn--gold" onClick={() => setMode('offline')}>Играть с ботами</button>
        <button className="btn" onClick={() => setMode('online-lobby')}>Играть онлайн</button>
      </div>
    );
  }

  if (mode === 'offline') {
    return <App mode="offline" />;
  }

  if (mode === 'online-lobby') {
    return <Lobby onGameStarted={() => setMode('online-game')} />;
  }

  return <App mode="online" />;
}
```

- [ ] **Step 8: Point `main.tsx` at `Root`**

In `apps/web/src/main.tsx`, replace:

```ts
import App from './App.tsx';
```
```tsx
    <App />
```

With:

```ts
import Root from './Root.tsx';
```
```tsx
    <Root />
```

- [ ] **Step 9: Verify the build and lint**

```bash
npm run build --workspace=apps/web
npm run lint --workspace=apps/web
```

Expected: both succeed. Fix any type errors surfaced by the `mode` prop or the `as unknown as Partial<GameState>` casts before continuing.

- [ ] **Step 10: Manual smoke test** — run the server and open two browser tabs

```bash
npm run start --workspace=apps/server
```

In two separate browser tabs, open `http://localhost:2567/`, click "Играть онлайн" in the first, "Создать комнату", copy the printed room link, open it in the second tab, join, click "Начать игру" as the host, and play a turn. Confirm: both tabs render the game board, only your own hand's card faces are visible, and opening the browser DevTools Network tab's WS frames on the *other* tab never contains your own hand's card names.

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): add online lobby and network-backed game mode"
```

---

## Task 10: Docker image and VPS deployment

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `README.md` (deployment section)

**Interfaces:**
- Produces: a single Docker image that runs `apps/server`, serving both the WebSocket protocol and the built `apps/web` static assets on one port.

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
**/node_modules
**/dist
.git
```

- [ ] **Step 2: Write the `Dockerfile`**

```dockerfile
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install
COPY . .
RUN npm run build --workspace=apps/web
RUN npx tsc -b packages/engine/tsconfig.json apps/server/tsconfig.json --noEmit

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=2567
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/server ./apps/server
COPY --from=build /repo/apps/web/dist ./apps/web/dist
COPY --from=build /repo/apps/web/package.json ./apps/web/package.json
EXPOSE 2567
CMD ["npm", "run", "start", "--workspace=apps/server"]
```

- [ ] **Step 3: Build and run the image locally**

```bash
docker build -t kinglier-game .
docker run --rm -p 2567:2567 kinglier-game
```

Expected: `Kinglier server listening on :2567` in the container logs; `http://localhost:2567/` serves the app in a browser exactly as in Task 9's manual smoke test.

- [ ] **Step 4: Document VPS deployment in `README.md`**

Add a new section:

```markdown
## Deploying to your own VPS (Docker)

1. Build the image on the server (or push it to a registry from CI and pull it):
   ```bash
   docker build -t kinglier-game .
   ```
2. Run it, publishing the container's port 2567 on the host:
   ```bash
   docker run -d --restart unless-stopped --name kinglier -p 2567:2567 kinglier-game
   ```
3. Point your existing reverse proxy (nginx/Caddy) at `127.0.0.1:2567`, terminating TLS there, and proxying both regular HTTP and the WebSocket upgrade (`Connection: Upgrade`, `Upgrade: websocket` headers) through to the container.
4. Set `VITE_SERVER_WS_URL` is **not** needed in production — the client defaults to same-origin `wss://your-domain`, since the same container serves both the static app and the WebSocket endpoint.
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore README.md
git commit -m "chore: add Docker image and VPS deployment docs"
```

---

## Final Verification

- [ ] Run every check script end to end from a clean `npm install` to confirm the whole Phase 1 slice is internally consistent:

```bash
npm install
npm run build --workspace=apps/web
npx tsx packages/engine/src/GameStore.check.ts
npx tsx packages/engine/src/GameStore.seats.check.ts
npx tsx packages/engine/src/net/redaction.check.ts
npx tsx packages/engine/src/resolvers/duelResolver.check.ts
npx tsx packages/engine/src/resolvers/cardFlight.check.ts
npx tsx packages/engine/src/lib/handSlots.check.ts
npx tsx apps/server/src/GameWorkerClient.check.ts
npx tsx apps/server/src/KinglierRoom.lobby.check.ts
npx tsx apps/server/src/KinglierRoom.actions.check.ts
npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
npm run lint --workspace=apps/web
docker build -t kinglier-game .
```

Expected: every command exits successfully with no assertion failures.
