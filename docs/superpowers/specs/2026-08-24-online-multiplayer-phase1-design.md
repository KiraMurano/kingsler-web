# Kinglier Online — Phase 1: Realtime Core Engine (Design)

Date: 2026-08-24
Status: Approved, ready for implementation planning

## Context

Kinglier is a Coup-style bluffing card game currently implemented as a
client-only React + Zustand SPA. The entire engine — deck, hidden hands,
turn resolution, and bot AI — runs inside the browser (`src/engine/**`,
~5,500 lines). There is no networking; the "opponents" are always local
bots.

The goal is to turn this into an online game for up to 4 human players,
with any unfilled or disconnected seats played by the existing bot AI,
self-hosted on the user's own VPS (Docker available).

## Full Project Scope (for context) and Phasing

The full ask (private links + public lobby/matchmaking + email/magic-link
accounts + public-scale hosting) spans multiple independent subsystems.
It is split into phases, each with its own design → plan → implementation
cycle:

1. **Phase 1 (this document):** server-authoritative realtime engine —
   private room links, seat management, bot fill-in for empty/disconnected
   seats, reconnect grace period. No accounts yet (nickname + room code).
2. **Phase 2:** authentication (email + magic link), backed by a database.
3. **Phase 3:** public lobby / matchmaking (open games list, quick match),
   built on Phase 1's room engine and Phase 2's identities.
4. **Phase 4:** production hardening if load grows — horizontal scaling
   (Redis-backed Colyseus driver), anti-abuse/rate limiting, match
   history/stats persistence.

This document covers **Phase 1 only**. It intentionally avoids decisions
that would need to be reworked later: seats are modeled so a `userId`
from Phase 2 can slot in without changing the room/seat data shape.

## Hard Constraint

Kinglier's core mechanic is bluffing over hidden information (secret role
cards, staked cards, deck order). Because of this, **the server must be
the sole source of truth for game state**. Clients may never receive
another player's hidden card contents or deck order in any network
message — this is a security/gameplay requirement, not a trade-off to be
weighed against convenience.

## Key Existing-Code Finding

The existing resolvers (`src/engine/resolvers/*.ts`) already take a
Zustand-shaped `(get, set)` pair rather than importing the store
directly:

```12:17:src/engine/resolvers/normalActionResolver.ts
type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function executeNormalAction(
```

`zustand`'s `create()` has no DOM/React dependency and runs fine in
Node. This means the ~5,000 lines of game rules and bot AI can run
**unchanged** on the server — the work is in orchestration, not in
rewriting rules.

The one required engine change: several pieces are currently module-level
singletons, which is fine for one browser tab but breaks when one Node
process hosts many concurrent rooms:

- `useGameStore` (`src/engine/GameStore.ts`) — must become a
  `createGameStore()` factory, one instance per room.
- `timerManager` (`src/engine/utils/timerManager.ts`) — instance per room.
- `BotTimerRegistry` and `botMemory` (`src/engine/bot/botEngine.ts`,
  `src/engine/bot/botMemory.ts`) — instance per room.

This refactor is required regardless of which transport/framework is
chosen, since it's about multi-tenancy, not networking.

## Repository Layout

Move to npm workspaces (native npm feature, no extra monorepo tooling
needed at this scale):

- `packages/engine` — pure game logic, moved from `src/engine/**`
  (types, cards, resolvers, bot AI). No React/DOM imports.
- `apps/web` — the existing Vite frontend, depends on `packages/engine`.
- `apps/server` — new Node process running the Colyseus server, depends
  on `packages/engine`.

The existing offline (vs. local bots, no server) mode is **not removed**.
It keeps using `packages/engine` directly and unchanged in `apps/web`.
Online mode is an additive code path in `apps/web` that talks to
`apps/server` instead of calling resolvers directly.

## Realtime Transport: Colyseus

Chosen over a hand-rolled `ws` server or Socket.IO because Phase 3 will
need public matchmaking and Phase 1 needs reconnection — Colyseus
provides both (`joinOrCreate`/room listing, `allowReconnection`)
out of the box, avoiding custom code for problems that are otherwise
non-trivial to get right (reconnection races, id collisions).

Colyseus's Schema-based automatic state diffing is **not** used — that
would require rewriting `types.ts` under Colyseus's decorator-based
Schema classes. Instead, game state is pushed as plain JSON messages,
matching the client/server split described below.

### Room lifecycle

- One `KinglierRoom` per game, max 4 clients, `roomId` doubles as the
  shareable room code.
- Room phases: `WAITING` (lobby, players joining) → `PLAYING` → `GAME_OVER`.
- Any client in `WAITING` can start the game; at that point empty seats
  are filled with bots (from the existing `ALL_BOT_CANDIDATES` pool).

### Client → server messages

Action intents mirror the existing `Action`-shaped calls already used by
`GameStore` (`performAction`, `doubtAction`, `targetDeclareDuel`, etc.):
`room.send('action', { type, name, targetId, ... })`. The server
validates it's a legal action for that player/phase before applying it
via the existing resolver functions.

### Server → client messages

After every state change, the server computes a per-player redacted view
and pushes it only to that client: `client.send('state', redacted)`.
Broadcasting is always targeted per-recipient — there is no single
shared state message sent to all clients.

## State Redaction

A new pure function, `redactStateForPlayer(state: GameState, viewerId: string): PublicGameState`,
is the single choke point for hiding information. It:

- Replaces `hand` entries for every player other than `viewerId` with
  placeholders (same array length, no `role`/card identity).
- Hides deck contents/order and any not-yet-revealed discard entries.
- Passes through `informantPeekData` only when `viewerId === observerId`.
- Passes through everything already meant to be public (resources,
  history log, resolved reveals, duel outcomes after resolution).

This is the highest-risk new piece of code (a leak breaks the bluffing
mechanic entirely), so it gets an assert-based self-check following the
project's existing convention (see `GameStore.check.ts`,
`botTargeting.check.ts`): `packages/engine/redaction.check.ts`, run via
`npx tsx packages/engine/redaction.check.ts`, asserting that no card
identity for non-viewer hands/deck ever appears in the redacted output.

## Bot Fill-In and Reconnect

- Seats unfilled when the host starts the game, and seats belonging to a
  player who disconnects mid-game, are handed to the existing bot AI
  (`botEngine`/`botTurnPlanner`), now running against the server-side
  per-room store instance instead of the browser store.
- On disconnect, Colyseus's `allowReconnection(client, seconds)` holds
  the seat for a 60-second grace period. The client persists a
  `reconnectionToken` in `localStorage` and attempts `room.reconnect(...)`
  on reload within that window.
- If the grace period expires without reconnection, the bot takes over
  that seat for the remainder of the match (the human does not get the
  seat back mid-game).

## Client Changes (`apps/web`)

Online mode is "thin": the client never decides whether a move is legal,
never resolves duels/doubts, and never sees hidden data — it renders
whatever state the server sends and forwards user intents as action
messages. Purely cosmetic/local state (card-flight animations, countdown
timers, hover effects) stays client-side since it carries no game-rules
authority.

Concretely, a new client-side "online store" implements the same shape
the existing React components already read (`useGameStore`-like
selectors), but is populated by incoming `state` messages instead of
running resolvers, and its action methods forward to
`room.send('action', ...)` instead of mutating state locally. This
minimizes changes to `src/components/**`.

## Deployment

Single Docker image for Phase 1:

- Multi-stage build: build `apps/web` (Vite `dist/`), build `apps/server`
  (TypeScript → JS), copy both into a final Node runtime image.
- `apps/server`'s Colyseus app (an Express app under the hood) serves the
  static `apps/web/dist` files and the WebSocket upgrade on the same
  port. One container, one exposed port.
- No database, no Redis in Phase 1 — room state lives in the process's
  memory, which is sufficient for the dozens-of-concurrent-games target;
  Phase 4 revisits this only if it's actually needed.
- The user's existing VPS reverse proxy terminates TLS and proxies both
  HTTP and the `wss://` upgrade to the container's port.

## Testing

Follows the project's existing lightweight convention (`*.check.ts`,
assert-based, no test framework, run with `npx tsx`):

- `packages/engine/redaction.check.ts` — the redaction leak check
  described above (the one genuinely new, risky piece of logic).
- Existing `*.check.ts` files move with their modules into
  `packages/engine` unchanged.
- Room lifecycle (join/start/bot-fill/reconnect) gets a similar
  `apps/server/room.check.ts` smoke check once the room implementation
  exists, exercised at plan/implementation time.

## Explicitly Out of Scope for Phase 1

- Accounts, login, magic-link email (Phase 2).
- Public game listing / matchmaking (Phase 3).
- Horizontal scaling, Redis, anti-abuse, match history persistence
  (Phase 4).
