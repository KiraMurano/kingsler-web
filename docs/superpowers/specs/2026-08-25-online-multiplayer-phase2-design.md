# Kinglier Online — Phase 2: Accounts + Production Reconnection (Design)

Date: 2026-08-25
Status: Approved, ready for implementation planning

## Context

Phase 1 (`docs/superpowers/specs/2026-08-24-online-multiplayer-phase1-design.md`)
shipped a server-authoritative realtime engine: private room-code lobbies,
bot fill-in, and a 60-second server-side reconnection grace period
(`allowReconnection` + `KinglierRoom.onDrop`). That server-side piece works,
but the client never uses it — `OnlineGameClient.tryReconnect()` exists but
is called nowhere, there is no "reconnecting…" UI, and the only identity a
player has is a nickname typed fresh into the lobby every time, tied to a
`localStorage` reconnection token scoped to one browser. Losing that token
(new device, cleared storage, incognito) permanently loses the seat.

Per Phase 1's phasing plan, Phase 2 is accounts (email + magic-link,
database-backed). This document folds in one more requirement: reconnection
must be rebuilt on top of that persistent account identity (`userId`)
instead of the fragile per-browser token, so a player can always get back
into their match by logging in again — any device, any browser — for as
long as the grace period hasn't expired.

## Full Project Scope and Phasing (updated)

1. **Phase 1 (done):** server-authoritative realtime engine, private room
   links, bot fill-in, server-side reconnection grace period.
2. **Phase 2 (this document):** email + magic-link accounts backed by a
   database; reconnection redesigned around `userId` instead of
   browser-local tokens; login required to use the app at all (including
   offline-vs-bots mode).
3. **Phase 3:** public lobby / matchmaking, built on Phase 1's room engine
   and Phase 2's identities.
4. **Phase 4:** production hardening if load grows — horizontal scaling,
   anti-abuse/rate limiting beyond the basics in this document, match
   history/stats persistence.

## Hard Constraints

- Everything from Phase 1's hard constraints still applies (server is sole
  source of truth; no hidden card data ever crosses the network).
- A magic-link token is single-use and short-lived (15 minutes). Clicking
  it twice, or after expiry, must fail cleanly.
- A session token must never embed data that can go stale silently
  (nickname, email) — only a stable `userId`. Anything display-related is
  re-read from the database on each authenticated request.
- Magic-link requests are rate-limited per email (one outstanding request
  per 60 seconds) to avoid accidentally mail-bombing a real inbox from a
  buggy client retry loop.

## Key Dependency Finding: this needs zero new npm packages

Colyseus 0.17 (already a dependency) bundles `@colyseus/auth`, which ships:

- `JWT.sign` / `JWT.verify` — HS256 JWT signing/verification backed by
  `JWT_SECRET`, already using the `jsonwebtoken` package transitively
  installed with `colyseus`.
- `auth.middleware()` — an Express middleware that reads the `Authorization:
  Bearer` header and verifies it, usable directly on any custom route.
- On the client SDK (`@colyseus/sdk`, already a dependency of `apps/web`):
  `client.auth.token = '<jwt>'` persists the token (via the SDK's own
  storage abstraction) and the shared `HTTP` client automatically attaches
  it as `Authorization: Bearer` to **every** subsequent request made
  through `client.http.*` — including the HTTP matchmake call Colyseus
  performs internally for `create`/`joinById`. Server-side, `Room.onAuth(
  client, options, context)` receives that same value pre-extracted as
  `context.token`.

This means account auth plumbing (token storage, header attachment, and the
room-join auth hook) is framework-provided; the only genuinely new code is
the magic-link issuance/verification and the `userId`-keyed seat/reconnect
logic. Combined with Node.js 22's built-in `node:sqlite` (stable enough for
this scale, zero native compilation) and a direct `fetch()` call to
Resend's REST API instead of installing their SDK, **Phase 2 adds no new
entries to any `package.json`.**

We deliberately do *not* use `@colyseus/auth`'s `auth.routes()` router —
that machinery is built around password registration/login and
forgot-password flows (`onRegisterWithEmailAndPassword`,
`onFindUserByEmail` returning a `password` field, etc.), which doesn't fit
a passwordless magic-link model. We use only its low-level primitives
(`JWT`, `middleware()`) and write our own three routes.

## Data Model (`node:sqlite`)

One file, e.g. `data/kinglier.db`, opened once at server startup with
`CREATE TABLE IF NOT EXISTS` migrations inline (no migration framework —
two tables, this is all Phase 2 needs):

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
```

(`created_at` is what the 60-second rate limit in the request route below actually
queries against — `expires_at` alone would need error-prone arithmetic to recover it.)

`token_hash` stores a SHA-256 hash of a random 32-byte token (`node:crypto`,
the same style already used for room codes in `KinglierRoom.ts`) — not the
raw token, so a leaked database dump can't be used to forge sessions.

No `sessions` table: the session token is a self-contained JWT
(`{ userId }`, 30-day expiry). Logout is client-side only (delete the
stored token) — there is no server-side revocation list. This is a
deliberate simplification for a self-hosted friends-scale game, not a
banking app.

`ponytail:` no session revocation list — ceiling: a stolen 30-day token
stays valid until it expires; ceiling raised by adding a `sessions` table
with a `revoked_at` column and checking it in `onAuth`, if ever needed.

## Auth Flow

Three routes, mounted on the existing Express app from `apps/server/src/app.ts`:

- `POST /api/auth/request-link { email }`
  - Reject if a non-expired, unused token already exists for this email
    younger than 60 seconds (rate limit).
  - Generate a random token, store its hash + email + expiry (+15 min).
  - `fetch('https://api.resend.com/emails', ...)` with the verified sender
    (`auth@send.kingsler.ru`) and a link
    `${PUBLIC_URL}/api/auth/verify?token=...`.
  - Always responds `200` regardless of whether the email exists yet (a
    new `users` row is created on first successful verify, not on
    request) — this also avoids leaking which emails are registered.
  - If `RESEND_API_KEY` isn't set (local dev only — a real deploy always
    configures it), skips the token/email round-trip entirely and responds
    with `{ ok: true, devToken }`, an already-signed session JWT for that
    email. The client logs in immediately with it. Any email is accepted;
    there is no confirmation step to bypass in dev.

- `GET /api/auth/verify?token=...`
  - Hash the incoming token, look up by hash; reject if missing, expired,
    or already used. Mark `used_at`.
  - Find or create the `users` row for that email (nickname defaults to
    the email's local part, e.g. `ivan` from `ivan@example.com`).
  - Sign a session JWT via `JWT.sign({ userId })`.
  - Redirect to the web app root with the token in the URL fragment
    (`/#token=...`, never sent to the server in subsequent requests/logs
    since fragments aren't part of the HTTP request).

- `GET /api/me` (protected by `auth.middleware()`)
  - Reads the fresh `users` row for `req.auth.userId`.
  - Looks up the in-memory active-seat registry (see below) for that
    `userId`.
  - Responds `{ user: { id, email, nickname }, activeRoom: { roomId,
    playerId } | null }`.

- `PATCH /api/me { nickname }` (protected) — updates the nickname column.

Client: on boot, if the URL has `#token=...`, read it, set
`colyseusClient.auth.token = token`, strip the fragment. Otherwise, if a
token is already persisted from a previous session, it's already loaded by
the SDK. Call `client.http.get('/api/me')`; unauthenticated → show the
landing screen (email input → "check your email"); authenticated → show
the main menu, with the account's nickname shown (small edit affordance
calling `PATCH /api/me`).

## Reconnection Redesigned Around `userId`

`KinglierRoom`'s `Seat` gains a `userId` field:

```ts
interface Seat {
  playerId: string;
  userId: string;
  sessionId: string;
  nickname: string;
  connected: boolean;
  botControlled: boolean;
}
```

`onAuth(client, options, context)`: `JWT.verify(context.token)` → `{
userId }`; reject the connection (throw) if missing/invalid — every room
join now requires a logged-in account. Read the fresh nickname from
`users` and return `{ userId, nickname }` as `client.auth`.

`onJoin(client, options)`:
- If an existing seat has this `userId`:
  - If it's still `connected` (a stale second connection, e.g. two open
    tabs) — disconnect the old `Client` first, then rebind.
  - If `botControlled` — reject; once the bot has taken over, per Phase
    1's design, the human doesn't get the seat back mid-match.
  - Otherwise — this is a reconnect. Cancel the pending grace timer,
    rebind `sessionId`, set `connected = true`, send the current state.
- Else, if `phase === 'WAITING'` — create a new seat as today, but
  `nickname` comes from `client.auth.nickname`, not a client-supplied
  option.
- Else (`phase !== 'WAITING'` and no existing seat) — reject, "game
  already in progress" (unchanged from Phase 1).

`onDrop(client)`: mark the seat `connected = false`, broadcast the lobby,
and start a plain `setTimeout(RECONNECTION_GRACE_SECONDS)` stored on the
seat. **`allowReconnection`/Colyseus's own `reconnectionToken` mechanism is
no longer used** — our own `userId`-matched `onJoin` above is what lets a
reconnecting client back in, from any device. If the timer fires before
that happens, mark `botControlled = true` and call
`worker.setSeatBotControlled(seat.playerId)`.

An in-memory registry (new file, `apps/server/src/activeSeats.ts`):
`Map<userId, { roomId, playerId }>`, updated by every `KinglierRoom` on
seat creation/removal/bot handoff. This is what `/api/me` reads to answer
"do you have a game to return to?" It intentionally lives in process
memory, not the database — it's operational state, not something that
should survive a server restart (a restart already drops all active
rooms today, per Phase 1's design).

Client-side: on boot, if `/api/me` returns an `activeRoom`, skip the
lobby/menu entirely and call `joinById(activeRoom.roomId)` directly. During
an active game, if the room connection drops unexpectedly (not a
user-initiated leave), show a "Переподключение…" overlay and retry
`joinById` with backoff (1s, 2s, 4s, capped at ~10s) until it succeeds or
the user navigates away. This replaces the dead `tryReconnect`/localStorage
token code, which is deleted.

## Client Changes Summary

- New: landing/login screen (email → "check your email" → magic link).
- `Lobby.tsx`: remove the nickname text input; show the account nickname
  (read from `/api/me`) instead, with a small "изменить имя" control.
- New: "Переподключение…" overlay component, mounted wherever the online
  game screen is, listening for unexpected room disconnects.
- `Root.tsx`: gate every mode (including offline-vs-bots) behind
  `/api/me` succeeding; on success, if `activeRoom` is present, jump
  straight into the game.
- Delete: `OnlineGameClient.tryReconnect`, the `kinglier:reconnect:*`
  `localStorage` keys, the nickname `useState` in `Lobby.tsx`.

## Deployment Changes

- New env vars: `JWT_SECRET`, `RESEND_API_KEY`, `MAGIC_LINK_FROM` (e.g.
  `Kinglier <auth@send.kingsler.ru>`), `PUBLIC_URL` (used to build the
  verify link), `DB_PATH` (default `data/kinglier.db`).
- `Dockerfile`: no new build steps (no native compilation needed for
  `node:sqlite`). Add `VOLUME /repo/data` (or document the bind mount) so
  the SQLite file survives image rebuilds.
- `docker run` in the deploy skill/README needs a `-v
  <host-path>:/repo/data` mount added — call this out explicitly in the
  implementation plan since forgetting it silently resets all accounts on
  every deploy.

## Testing

Same `*.check.ts` convention as Phase 1:

- `apps/server/src/db.check.ts` — schema creation, insert/read roundtrip.
- `apps/server/src/auth/magicLink.check.ts` — issue → verify (succeeds,
  single-use enforced, expired rejected, rate limit enforced).
- `apps/server/src/KinglierRoom.reconnect.check.ts` — rewritten: two real
  users (real session JWTs signed via `JWT.sign` in the check script)
  join, start a match, one drops, reconnects with the same `userId` via a
  *new* `Client`/`Room` connection (simulating a different device) before
  the grace period — asserts the seat is *not* handed to the bot and the
  reconnecting client receives the current state for its own seat. A
  second scenario confirms the existing bot-handoff-after-timeout behavior
  still works when no reconnect happens.
- Update `KinglierRoom.lobby.check.ts` / `.actions.check.ts` to sign and
  pass real session tokens instead of a bare `nickname` option.

## Explicitly Out of Scope for Phase 2

- Password-based login, OAuth providers (the `@colyseus/auth` primitives
  used here don't require adopting these; they stay unused).
- Public matchmaking (Phase 3).
- Horizontal scaling, advanced anti-abuse/rate limiting beyond the basic
  per-email cooldown above, match history persistence (Phase 4).
- Avatar/profile picture customization.
