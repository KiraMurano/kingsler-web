# Kinglier Online — Phase 2: Accounts + userId-based Reconnection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email + magic-link accounts (SQLite-backed) and rebuild online reconnection around the account's `userId` instead of the fragile per-browser localStorage token, gating the whole app (including offline-vs-bots) behind login.

**Architecture:** Two new SQLite tables (`users`, `magic_link_tokens`) opened via Node's built-in `node:sqlite`; three custom Express routes (`/api/auth/request-link`, `/api/auth/verify`, `/api/me` + `PATCH /api/me`) built on `@colyseus/auth`'s low-level `JWT` primitives (no password/OAuth machinery); `KinglierRoom`'s seats gain a `userId`, `onAuth` requires a valid session JWT, and `onJoin` matches returning players by `userId` instead of relying on Colyseus's own `allowReconnection`/reconnection-token mechanism (explicitly disabled client-side to avoid two competing reconnection paths). An in-memory `Map<userId, {roomId, playerId}>` answers "do you have a game to return to?" for cross-device rejoin. The client gets a shared authenticated `Client` (SDK) instance, a landing/login screen, and a "Переподключение…" overlay that retries `joinById` with backoff on unexpected drops during an active match.

**Tech Stack:** `node:sqlite` (Node 22+, built-in, zero native compilation), `@colyseus/auth`'s `JWT` (already bundled with `colyseus`), Resend's REST API via plain `fetch` (no SDK), existing `@colyseus/sdk` client already in `apps/web`. **No new npm packages in any `package.json`.**

## Global Constraints

- Zero new npm dependencies — every task below only uses packages already listed in `apps/server/package.json` / `apps/web/package.json`, or Node/browser built-ins.
- A magic-link token is single-use and expires after 15 minutes; requests for the same email are rate-limited to one per 60 seconds.
- A session JWT only ever embeds `{ userId }` — never nickname/email (those are re-read from the database on every authenticated request).
- Every `KinglierRoom` join (new seat or reconnect) requires a valid session JWT — there is no anonymous/nickname-only join anymore.
- `apps/server/src` compiles under `apps/server/tsconfig.json` (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly` are all on — unused params must be prefixed `_`, type-only imports must use `import type`). `*.check.ts` files are excluded from that build but must still run cleanly under `tsx`.
- `apps/web/src` compiles under `apps/web/tsconfig.app.json` with the same lint flags.
- Follow the existing `*.check.ts` convention (plain `node:assert/strict` script, no test framework) for every new piece of non-trivial logic.
- `data/kinglier.db` must survive container rebuilds — the Dockerfile needs a `VOLUME`, and the deploy skill's `docker run` needs a bind mount, or every deploy silently wipes all accounts.

---

### Task 1: SQLite data layer (`users` table)

**Files:**
- Create: `apps/server/src/db.ts`
- Create: `apps/server/src/db.check.ts`

**Interfaces:**
- Produces: `db: DatabaseSync` (the raw handle, exported for `magicLink.ts` to use directly), `UserRow { id, email, nickname, created_at }`, `findUserByEmail(email): UserRow | undefined`, `findUserById(id): UserRow | undefined`, `findOrCreateUserByEmail(email): UserRow`, `updateNickname(id, nickname): void`.

- [ ] **Step 1: Write the failing check script**

```ts
// apps/server/src/db.check.ts
/**
 * Run: npx tsx apps/server/src/db.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Static imports are hoisted and evaluate before any other top-level code in
// this file, so setting DB_PATH here would run too late — db.ts reads it
// once at module scope. Dynamic imports defer loading until after the env
// var is actually set, so every test gets its own throwaway database file.
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-db-')), 'test.db');

const { findOrCreateUserByEmail, findUserByEmail, findUserById, updateNickname } = await import('./db.ts');

const created = findOrCreateUserByEmail('ivan@example.com');
assert.equal(created.email, 'ivan@example.com');
assert.equal(created.nickname, 'ivan', 'nickname must default to the email local-part');
assert.ok(created.id, 'a new user must get a generated id');

const again = findOrCreateUserByEmail('ivan@example.com');
assert.equal(again.id, created.id, 'the same email must resolve to the same user, not a duplicate');

updateNickname(created.id, 'Ваня');
assert.equal(findUserById(created.id)!.nickname, 'Ваня');

assert.equal(findUserByEmail('nobody@example.com'), undefined);
assert.equal(findUserById('does-not-exist'), undefined);

console.log('db.check.ts passed.');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx apps/server/src/db.check.ts`
Expected: `Cannot find module './db.ts'` (or similar) — `db.ts` doesn't exist yet.

- [ ] **Step 3: Write `db.ts`**

```ts
// apps/server/src/db.ts
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/server/src -> apps/server -> apps -> <repo root>/data/kinglier.db.
// Resolved from this file's location (not process.cwd()) so it's correct
// whether the server is started from the repo root or from apps/server.
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../../data/kinglier.db');
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
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
`);

export interface UserRow {
  id: string;
  email: string;
  nickname: string;
  created_at: number;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function findOrCreateUserByEmail(email: string): UserRow {
  const existing = findUserByEmail(email);
  if (existing) return existing;

  const id = randomUUID();
  const nickname = (email.split('@')[0] ?? 'Игрок').slice(0, 24);
  db.prepare('INSERT INTO users (id, email, nickname, created_at) VALUES (?, ?, ?, ?)')
    .run(id, email, nickname, Date.now());
  return findUserById(id)!;
}

export function updateNickname(id: string, nickname: string): void {
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname.slice(0, 24), id);
}
```

- [ ] **Step 4: Run the check script again**

Run: `npx tsx apps/server/src/db.check.ts`
Expected: `db.check.ts passed.`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db.ts apps/server/src/db.check.ts
git commit -m "feat(server): add SQLite-backed users table via node:sqlite"
```

---

### Task 2: Magic-link token issuance and consumption

**Files:**
- Create: `apps/server/src/auth/magicLink.ts`
- Create: `apps/server/src/auth/magicLink.check.ts`

**Interfaces:**
- Consumes: `db` from `apps/server/src/db.ts` (Task 1).
- Produces: `issueMagicLinkToken(email: string): string | null` (null when rate-limited), `consumeMagicLinkToken(token: string): string | null` (the email, or null when invalid/expired/reused).

- [ ] **Step 1: Write the failing check script**

```ts
// apps/server/src/auth/magicLink.check.ts
/**
 * Run: npx tsx apps/server/src/auth/magicLink.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-magiclink-')), 'test.db');

const { issueMagicLinkToken, consumeMagicLinkToken } = await import('./magicLink.ts');

const token = issueMagicLinkToken('ivan@example.com');
assert.ok(token, 'a first request must issue a token');

const immediateRetry = issueMagicLinkToken('ivan@example.com');
assert.equal(immediateRetry, null, 'a second request within the cooldown must be rejected');

const otherEmail = issueMagicLinkToken('other@example.com');
assert.ok(otherEmail, 'the cooldown is per-email, not global');

const email = consumeMagicLinkToken(token!);
assert.equal(email, 'ivan@example.com');

const reused = consumeMagicLinkToken(token!);
assert.equal(reused, null, 'a token must only be usable once');

const unknown = consumeMagicLinkToken('does-not-exist');
assert.equal(unknown, null);

console.log('magicLink.check.ts passed.');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx apps/server/src/auth/magicLink.check.ts`
Expected: fails with a module-not-found error for `./magicLink.ts`.

- [ ] **Step 3: Write `magicLink.ts`**

```ts
// apps/server/src/auth/magicLink.ts
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db.ts';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new one-time magic-link token for the given email, unless one
 * was already issued in the last minute (returns null in that case, so the
 * caller can respond as if nothing happened — no error leaked to a client).
 */
export function issueMagicLinkToken(email: string): string | null {
  const recent = db.prepare(
    'SELECT created_at FROM magic_link_tokens WHERE email = ? ORDER BY created_at DESC LIMIT 1'
  ).get(email) as { created_at: number } | undefined;

  const now = Date.now();
  if (recent && now - recent.created_at < REQUEST_COOLDOWN_MS) {
    return null;
  }

  const token = randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO magic_link_tokens (token_hash, email, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)'
  ).run(hashToken(token), email, now, now + TOKEN_TTL_MS);
  return token;
}

/**
 * Consumes a magic-link token: returns the associated email exactly once,
 * for a token that hasn't expired and hasn't been used before. Every other
 * case (unknown, expired, already-used token) returns null.
 */
export function consumeMagicLinkToken(token: string): string | null {
  const tokenHash = hashToken(token);
  const row = db.prepare(
    'SELECT email, expires_at, used_at FROM magic_link_tokens WHERE token_hash = ?'
  ).get(tokenHash) as { email: string; expires_at: number; used_at: number | null } | undefined;

  if (!row || row.used_at !== null || row.expires_at < Date.now()) return null;

  db.prepare('UPDATE magic_link_tokens SET used_at = ? WHERE token_hash = ?').run(Date.now(), tokenHash);
  return row.email;
}
```

- [ ] **Step 4: Run the check script again**

Run: `npx tsx apps/server/src/auth/magicLink.check.ts`
Expected: `magicLink.check.ts passed.`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/magicLink.ts apps/server/src/auth/magicLink.check.ts
git commit -m "feat(server): add single-use, rate-limited magic-link tokens"
```

---

### Task 3: Resend email delivery

**Files:**
- Create: `apps/server/src/auth/email.ts`
- Create: `apps/server/src/auth/email.check.ts`

**Interfaces:**
- Produces: `sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void>` — throws on any non-2xx response or a missing `RESEND_API_KEY`.

- [ ] **Step 1: Write the failing check script**

```ts
// apps/server/src/auth/email.check.ts
/**
 * Run: npx tsx apps/server/src/auth/email.check.ts
 */
import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 'test-key';
process.env.MAGIC_LINK_FROM = 'Kinglier <auth@send.kingsler.ru>';

const originalFetch = globalThis.fetch;
let capturedRequest: { url: string; init: RequestInit } | null = null;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedRequest = { url: String(url), init: init! };
  return new Response('{}', { status: 200 });
}) as typeof fetch;

const { sendMagicLinkEmail } = await import('./email.ts');

await sendMagicLinkEmail('ivan@example.com', 'https://kingsler.ru/api/auth/verify?token=abc');

assert.ok(capturedRequest, 'sendMagicLinkEmail must call fetch');
assert.equal(capturedRequest!.url, 'https://api.resend.com/emails');
assert.equal(capturedRequest!.init.method, 'POST');
const headers = capturedRequest!.init.headers as Record<string, string>;
assert.equal(headers.Authorization, 'Bearer test-key');
const body = JSON.parse(capturedRequest!.init.body as string);
assert.equal(body.from, 'Kinglier <auth@send.kingsler.ru>');
assert.equal(body.to, 'ivan@example.com');
assert.match(body.html, /https:\/\/kingsler\.ru\/api\/auth\/verify\?token=abc/);

// Failure path: a non-OK response must throw, not swallow the error.
globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
await assert.rejects(() => sendMagicLinkEmail('ivan@example.com', 'https://x/y'));

globalThis.fetch = originalFetch;
console.log('email.check.ts passed.');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx apps/server/src/auth/email.check.ts`
Expected: fails with a module-not-found error for `./email.ts`.

- [ ] **Step 3: Write `email.ts`**

```ts
// apps/server/src/auth/email.ts
const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const from = process.env.MAGIC_LINK_FROM ?? 'Kinglier <auth@send.kingsler.ru>';

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Вход в Kinglier',
      html: `<p>Нажмите, чтобы войти в Kinglier:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Ссылка действует 15 минут. Если вы не запрашивали вход — просто игнорируйте письмо.</p>`
    })
  });

  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}
```

- [ ] **Step 4: Run the check script again**

Run: `npx tsx apps/server/src/auth/email.check.ts`
Expected: `email.check.ts passed.`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/email.ts apps/server/src/auth/email.check.ts
git commit -m "feat(server): send magic-link emails via Resend's REST API"
```

---

### Task 4: In-memory active-seat registry

**Files:**
- Create: `apps/server/src/activeSeats.ts`
- Create: `apps/server/src/activeSeats.check.ts`

**Interfaces:**
- Produces: `ActiveSeat { roomId: string; playerId: string }`, `setActiveSeat(userId, seat): void`, `getActiveSeat(userId): ActiveSeat | undefined`, `clearActiveSeat(userId): void`.

- [ ] **Step 1: Write the failing check script**

```ts
// apps/server/src/activeSeats.check.ts
/**
 * Run: npx tsx apps/server/src/activeSeats.check.ts
 */
import assert from 'node:assert/strict';
import { setActiveSeat, getActiveSeat, clearActiveSeat } from './activeSeats.ts';

assert.equal(getActiveSeat('u1'), undefined);

setActiveSeat('u1', { roomId: 'ABC123', playerId: 'p1' });
assert.deepEqual(getActiveSeat('u1'), { roomId: 'ABC123', playerId: 'p1' });

setActiveSeat('u1', { roomId: 'ABC123', playerId: 'p1' }); // re-setting must not throw
clearActiveSeat('u1');
assert.equal(getActiveSeat('u1'), undefined);

clearActiveSeat('never-set'); // clearing an absent entry must be a no-op, not an error

console.log('activeSeats.check.ts passed.');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx apps/server/src/activeSeats.check.ts`
Expected: fails with a module-not-found error for `./activeSeats.ts`.

- [ ] **Step 3: Write `activeSeats.ts`**

```ts
// apps/server/src/activeSeats.ts
/**
 * Which room (if any) each logged-in user currently occupies a seat in.
 * Deliberately in-memory, not the database — this is operational state
 * that shouldn't survive a server restart (a restart already drops every
 * active room today).
 */
export interface ActiveSeat {
  roomId: string;
  playerId: string;
}

const activeSeats = new Map<string, ActiveSeat>();

export function setActiveSeat(userId: string, seat: ActiveSeat): void {
  activeSeats.set(userId, seat);
}

export function getActiveSeat(userId: string): ActiveSeat | undefined {
  return activeSeats.get(userId);
}

export function clearActiveSeat(userId: string): void {
  activeSeats.delete(userId);
}
```

- [ ] **Step 4: Run the check script again**

Run: `npx tsx apps/server/src/activeSeats.check.ts`
Expected: `activeSeats.check.ts passed.`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/activeSeats.ts apps/server/src/activeSeats.check.ts
git commit -m "feat(server): track each account's active room seat in memory"
```

---

### Task 5: Auth REST routes (`request-link`, `verify`, `me`)

**Files:**
- Create: `apps/server/src/auth/routes.ts`
- Create: `apps/server/src/auth/routes.check.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `issueMagicLinkToken`/`consumeMagicLinkToken` (Task 2), `sendMagicLinkEmail` (Task 3), `findOrCreateUserByEmail`/`findUserById`/`updateNickname` (Task 1), `getActiveSeat` (Task 4), `JWT` from `colyseus`.
- Produces: `authRouter: Router`, mounted at `/api/auth` in `app.ts`; `GET /api/me` and `PATCH /api/me` mounted directly on the app (not under `/api/auth`, per the design doc's route list).

- [ ] **Step 1: Write the failing check script**

```ts
// apps/server/src/auth/routes.check.ts
/**
 * Run: npx tsx apps/server/src/auth/routes.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-routes-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.PUBLIC_URL = 'http://localhost:27900';
process.env.RESEND_API_KEY = 'test-key';

let capturedHtml = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === 'https://api.resend.com/emails') {
    capturedHtml = JSON.parse(init!.body as string).html;
    return new Response('{}', { status: 200 });
  }
  return originalFetch(url, init);
}) as typeof fetch;

const { createServer } = await import('../app.ts');
const PORT = 27900;
createServer().listen(PORT);

const requestResponse = await fetch(`http://localhost:${PORT}/api/auth/request-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'Ivan@Example.com' })
});
assert.equal(requestResponse.status, 200);

const linkMatch = capturedHtml.match(/token=([a-f0-9]+)/);
assert.ok(linkMatch, 'the emailed HTML must contain a verify link with a token');

const verifyResponse = await fetch(
  `http://localhost:${PORT}/api/auth/verify?token=${linkMatch![1]}`,
  { redirect: 'manual' }
);
assert.equal(verifyResponse.status, 302, 'a valid token must redirect back into the app');
const location = verifyResponse.headers.get('location')!;
const sessionToken = new URL(location).hash.replace('#token=', '');
assert.ok(sessionToken.length > 0);

const meResponse = await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${sessionToken}` }
});
assert.equal(meResponse.status, 200);
const me = await meResponse.json();
assert.equal(me.user.email, 'ivan@example.com', 'the email must be lowercased before lookup/storage');
assert.equal(me.activeRoom, null);

const patchResponse = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: 'Ваня' })
});
assert.equal(patchResponse.status, 200);
const meAfter = await (await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${sessionToken}` }
})).json();
assert.equal(meAfter.user.nickname, 'Ваня');

const unauthed = await fetch(`http://localhost:${PORT}/api/me`);
assert.equal(unauthed.status, 401);

const reusedVerify = await fetch(
  `http://localhost:${PORT}/api/auth/verify?token=${linkMatch![1]}`,
  { redirect: 'manual' }
);
assert.equal(reusedVerify.status, 400, 'a reused verify token must fail cleanly');

// A second request within the cooldown must not send a new email.
capturedHtml = '';
await fetch(`http://localhost:${PORT}/api/auth/request-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ivan@example.com' })
});
assert.equal(capturedHtml, '', 'a request within the cooldown must not trigger a new email');

globalThis.fetch = originalFetch;
console.log('routes.check.ts passed.');
process.exit(0);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx apps/server/src/auth/routes.check.ts`
Expected: fails — either a module-not-found for `./routes.ts` once referenced, or (right now) the `request-link` request returns 404 because `app.ts` doesn't mount it yet.

- [ ] **Step 3: Write `routes.ts`**

```ts
// apps/server/src/auth/routes.ts
import { Router } from 'express';
import { JWT } from 'colyseus';
import { issueMagicLinkToken, consumeMagicLinkToken } from './magicLink.ts';
import { sendMagicLinkEmail } from './email.ts';
import { findOrCreateUserByEmail, findUserById, updateNickname } from '../db.ts';
import { getActiveSeat } from '../activeSeats.ts';

const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:2567';

interface AuthedRequest {
  auth: { userId: string };
}

export const authRouter = Router();

authRouter.post('/request-link', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'invalid email' });
    return;
  }

  const token = issueMagicLinkToken(email);
  if (token) {
    const verifyUrl = `${PUBLIC_URL}/api/auth/verify?token=${token}`;
    try {
      await sendMagicLinkEmail(email, verifyUrl);
    } catch (err) {
      console.error('Failed to send magic link email:', err);
    }
  }

  // Always 200 regardless of outcome: avoids leaking whether an email is
  // registered, and avoids a buggy client retry loop treating a 4xx/5xx as
  // "keep retrying immediately".
  res.json({ ok: true });
});

authRouter.get('/verify', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const email = token ? consumeMagicLinkToken(token) : null;

  if (!email) {
    res.status(400).send('Ссылка недействительна или истекла. Запросите новую в приложении.');
    return;
  }

  const user = findOrCreateUserByEmail(email);
  JWT.sign({ userId: user.id }, { expiresIn: '30d' }).then(sessionToken => {
    res.redirect(`${PUBLIC_URL}/#token=${sessionToken}`);
  });
});

export const meRouter = Router();

meRouter.get('/api/me', JWT.middleware(), (req, res) => {
  const userId = (req as unknown as AuthedRequest).auth.userId;
  const user = findUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, nickname: user.nickname },
    activeRoom: getActiveSeat(userId) ?? null
  });
});

meRouter.patch('/api/me', JWT.middleware(), (req, res) => {
  const userId = (req as unknown as AuthedRequest).auth.userId;
  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : '';
  if (!nickname) {
    res.status(400).json({ error: 'invalid nickname' });
    return;
  }
  updateNickname(userId, nickname);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Mount the routers, JSON body parsing, and CORS in `app.ts`**

```ts
// apps/server/src/app.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineServer, defineRoom } from 'colyseus';
import { KinglierRoom } from './KinglierRoom.ts';
import { authRouter, meRouter } from './auth/routes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

export function createServer() {
  return defineServer({
    rooms: {
      kinglier: defineRoom(KinglierRoom)
    },
    express: app => {
      // The web app (Vite dev server) and the API run on different ports/
      // origins in development, so plain fetch() from the browser needs
      // CORS headers here. In production they're same-origin and this is a
      // harmless no-op. `credentials: true` is required because the SDK's
      // HTTP client always sends `credentials: "include"`.
      app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', req.headers.origin ?? '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        if (req.method === 'OPTIONS') {
          res.sendStatus(204);
          return;
        }
        next();
      });
      app.use(express.json());
      app.use('/api/auth', authRouter);
      app.use(meRouter);
      app.use(express.static(WEB_DIST));
    }
  });
}
```

- [ ] **Step 5: Require `JWT_SECRET` at startup in `index.ts`**

```ts
// apps/server/src/index.ts
import { createServer } from './app.ts';

const PORT = Number(process.env.PORT ?? 2567);

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

createServer().listen(PORT);
console.log(`Kinglier server listening on :${PORT}`);
```

- [ ] **Step 6: Run the check script again**

Run: `npx tsx apps/server/src/auth/routes.check.ts`
Expected: `routes.check.ts passed.`

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/auth/routes.ts apps/server/src/auth/routes.check.ts apps/server/src/app.ts apps/server/src/index.ts
git commit -m "feat(server): add magic-link auth routes and /api/me, require JWT_SECRET"
```

---

### Task 6: `KinglierRoom` — `userId`-based auth and reconnection

**Files:**
- Modify: `apps/server/src/KinglierRoom.ts`
- Modify: `apps/server/src/KinglierRoom.lobby.check.ts`
- Modify: `apps/server/src/KinglierRoom.actions.check.ts`
- Modify: `apps/server/src/KinglierRoom.reconnect.check.ts`

**Interfaces:**
- Consumes: `findUserById` (Task 1), `JWT` from `colyseus`, `setActiveSeat`/`getActiveSeat`/`clearActiveSeat` (Task 4).
- Produces: `Seat` gains `userId: string` and `graceTimer?: NodeJS.Timeout`; `onJoin` no longer takes a `nickname` option — nickname comes from the authenticated account.

This task changes existing, already-tested behavior, so the three check
scripts are updated *first* (to require real session tokens and add the
new reconnect scenario), confirmed to fail against the current
`KinglierRoom.ts`, then the room implementation is rewritten to make them
pass again.

- [ ] **Step 1: Update `KinglierRoom.lobby.check.ts` to use real accounts**

```ts
// apps/server/src/KinglierRoom.lobby.check.ts
/**
 * Run: npx tsx apps/server/src/KinglierRoom.lobby.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Static imports are hoisted and evaluate before any other top-level code in
// this file, so setting these env vars here would run too late — db.ts (and
// app.ts, which loads it) would already have opened its database. Dynamic
// imports defer loading until after the env vars are actually set.
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-lobby-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');
const { findOrCreateUserByEmail } = await import('./db.ts');
const { JWT } = await import('colyseus');

const PORT = 27891;
const server = createServer();
server.listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');

const client = new Client(`ws://localhost:${PORT}`);
client.auth.token = await JWT.sign({ userId: anya.id });
const host = await client.create('kinglier');
assert.match(host.roomId, /^[A-Z0-9]{6}$/, 'room code must be 6 uppercase Latin letters or digits');

let lastLobby: unknown = null;
host.onMessage('lobby', data => { lastLobby = data; });

type State = { players: { id: string; hand: (string | null)[]; isBot: boolean }[]; activePlayerId: string };
let hostState: State | null = null;
let guestState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });

client.auth.token = await JWT.sign({ userId: borya.id });
const guest = await client.joinById(host.roomId);
guest.onMessage('state', (data: State) => { guestState = data; });

await new Promise(resolve => setTimeout(resolve, 200));
assert.ok(lastLobby, 'host must receive a lobby update after the guest joins');

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

assert.ok(hostState, 'host must receive a state message once the game starts');
assert.ok(guestState, 'guest must receive a state message once the game starts');
assert.equal(hostState!.players.length, 4);
assert.equal(hostState!.players.filter(p => !p.isBot).length, 2, 'exactly the 2 joined humans, rest are bots');

guest.leave();
await new Promise(resolve => setTimeout(resolve, 300));
assert.equal(
  hostState!.players.find(p => p.id === 'p2')!.isBot,
  true,
  'consented leave mid-game must hand the seat to a bot immediately'
);

host.leave();
console.log('KinglierRoom.lobby.check.ts passed.');
process.exit(0);
```

- [ ] **Step 2: Update `KinglierRoom.actions.check.ts` to use real accounts**

```ts
// apps/server/src/KinglierRoom.actions.check.ts
/**
 * Run: npx tsx apps/server/src/KinglierRoom.actions.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-actions-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');
const { findOrCreateUserByEmail } = await import('./db.ts');
const { JWT } = await import('colyseus');

const PORT = 27892;
createServer().listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');

const client = new Client(`ws://localhost:${PORT}`);
client.auth.token = await JWT.sign({ userId: anya.id });
const host = await client.create('kinglier'); // becomes p1

type State = { players: { id: string; gold: number }[]; activePlayerId: string };
let hostState: State | null = null;
host.onMessage('state', (data: State) => { hostState = data; });

client.auth.token = await JWT.sign({ userId: borya.id });
const guest = await client.joinById(host.roomId); // becomes p2
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

// The host acting on p1's own turn must succeed. A normal action resolves
// its effect and then advances the turn after two back-to-back
// ACTION_HOLD_MS holds, so wait past both.
host.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 5000));
assert.equal(hostState!.players.find(p => p.id === 'p1')!.gold, goldBefore + 1, "p1's own-turn action must apply");

// Bug repro: a buggy client can embed the *wrong* actorId in the payload
// (this happened for real — a UI bug sent the other player's id here). The
// server must stamp the real seat id over it, not trust the payload, or
// the resulting gold/effects land on the wrong player.
host.send('action', { method: 'endTurnManually', args: [] });
await new Promise(resolve => setTimeout(resolve, 500));
assert.equal(hostState!.activePlayerId, 'p2', "p1 ending their turn must hand it to p2");

const goldBeforeSpoof = hostState!.players.find(p => p.id === 'p2')!.gold;
guest.send('action', {
  method: 'performAction',
  args: [{ type: 'normal', name: 'Просить содержание', actorId: 'p1', costGold: 0, costTokens: 1, description: 'x' }]
});
await new Promise(resolve => setTimeout(resolve, 3000));
assert.equal(
  hostState!.players.find(p => p.id === 'p2')!.gold,
  goldBeforeSpoof + 1,
  "p2's action must be credited to p2 (the real sender) even if the payload spoofs actorId: 'p1'"
);

host.leave();
guest.leave();
console.log('KinglierRoom.actions.check.ts passed.');
process.exit(0);
```

- [ ] **Step 3: Rewrite `KinglierRoom.reconnect.check.ts` for `userId`-based, cross-device reconnection**

```ts
// apps/server/src/KinglierRoom.reconnect.check.ts
/**
 * Run: npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Static imports are hoisted and evaluate before any other top-level code in
// this file, so setting these env vars here would run too late — app.ts,
// KinglierRoom.ts and db.ts all read them once at module scope. Dynamic
// imports defer loading until after the env vars are actually set.
process.env.KINGLIER_RECONNECT_GRACE_SECONDS = '1';
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-reconnect-')), 'test.db');
process.env.JWT_SECRET = 'test-secret';

const { Client } = await import('@colyseus/sdk');
const { createServer } = await import('./app.ts');
const { findOrCreateUserByEmail } = await import('./db.ts');
const { getActiveSeat } = await import('./activeSeats.ts');
const { JWT } = await import('colyseus');

const PORT = 27893;
createServer().listen(PORT);

const anya = findOrCreateUserByEmail('anya@example.com');
const borya = findOrCreateUserByEmail('borya@example.com');
const anyaToken = await JWT.sign({ userId: anya.id });
const boryaToken = await JWT.sign({ userId: borya.id });

const hostClient = new Client(`ws://localhost:${PORT}`);
hostClient.auth.token = anyaToken;
const host = await hostClient.create('kinglier'); // p1

const guestClient = new Client(`ws://localhost:${PORT}`);
guestClient.auth.token = boryaToken;
const guest = await guestClient.joinById(host.roomId); // p2

type State = { players: { id: string; isBot: boolean }[] };
let guestState: State | null = null;
guest.onMessage('state', (data: State) => { guestState = data; });

host.send('start');
await new Promise(resolve => setTimeout(resolve, 500));

// Host disconnects unexpectedly (not a consented leave).
host.connection.close();
await new Promise(resolve => setTimeout(resolve, 200));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, false, 'seat must stay human during the grace period');

// A *different* connection with the same account (simulating a different
// device/browser — this is the whole point of Phase 2's redesign) reconnects
// before the grace period expires.
const returningClient = new Client(`ws://localhost:${PORT}`);
returningClient.auth.token = anyaToken;
const returning = await returningClient.joinById(host.roomId);
let returningState: State | null = null;
returning.onMessage('state', (data: State) => { returningState = data; });

await new Promise(resolve => setTimeout(resolve, 1500)); // past the original 1s grace period
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, false, 'a reconnected human must not be handed to the bot');
assert.ok(returningState, 'the reconnecting client must receive a fresh state snapshot for its own seat');
assert.ok(getActiveSeat(anya.id), 'the active-seat registry must point at the reconnected seat');

// The reconnected player drops again and this time nobody comes back.
returning.connection.close();
await new Promise(resolve => setTimeout(resolve, 1500));
assert.equal(guestState!.players.find(p => p.id === 'p1')!.isBot, true, 'seat must become bot-controlled once the grace period truly expires');
assert.equal(getActiveSeat(anya.id), undefined, 'the active-seat registry must be cleared once the bot takes over');

// A further attempt to reconnect after the bot took over must be rejected.
const tooLateClient = new Client(`ws://localhost:${PORT}`);
tooLateClient.auth.token = anyaToken;
await assert.rejects(() => tooLateClient.joinById(host.roomId), 'joining after bot handoff must be rejected');

guest.leave();
console.log('KinglierRoom.reconnect.check.ts passed.');
process.exit(0);
```

- [ ] **Step 4: Run all three to confirm they fail against the current `KinglierRoom.ts`**

Run: `npx tsx apps/server/src/KinglierRoom.lobby.check.ts`
Expected: rejects — `client.create('kinglier')` with no `auth.token` set and no `onAuth` defined yet still succeeds today (no failure), but `findOrCreateUserByEmail`/`getActiveSeat` imports will resolve fine since those exist from earlier tasks; the actual failure is behavioral once Step 5 changes land — **run this check again after Step 5, not before**, since nothing here throws yet. Skip straight to Step 5.

- [ ] **Step 5: Rewrite `KinglierRoom.ts`**

```ts
// apps/server/src/KinglierRoom.ts
import { randomInt } from 'node:crypto';
import { Room, JWT } from 'colyseus';
import type { Client, AuthContext } from 'colyseus';
import { GameWorkerClient, type SeatInput } from './GameWorkerClient.ts';
import { redactStateForPlayer } from '@kinglier/engine/net/redaction';
import type { GameStateData } from '@kinglier/engine/net/gameStateData';
import { findUserById } from './db.ts';
import { setActiveSeat, clearActiveSeat } from './activeSeats.ts';

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

const RECONNECTION_GRACE_SECONDS = Number(process.env.KINGLIER_RECONNECT_GRACE_SECONDS ?? 60);
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// Sent when a second connection for the same account takes over a seat
// (e.g. the player opened the room in a new tab/device). Kept out of the
// 1000-4999 "consented leave" range so the client's drop-watcher treats it
// as a terminal state, not something to retry.
const CLOSE_CODE_ANOTHER_DEVICE = 4002;

function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)]).join('');
}

type Phase = 'WAITING' | 'PLAYING' | 'GAME_OVER';

interface Seat {
  playerId: string;
  userId: string;
  sessionId: string;
  nickname: string;
  connected: boolean;
  botControlled: boolean;
  graceTimer?: NodeJS.Timeout;
}

interface AuthPayload {
  userId: string;
  nickname: string;
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

  onCreate() {
    this.roomId = generateRoomCode();
  }

  messages = {
    start: (client: Client) => this.handleStart(client),
    action: (client: Client, payload: ActionMessage) => this.handleAction(client, payload),
    // The joining client's own onMessage handler isn't registered yet when its
    // join handshake completes, so it explicitly asks for a fresh snapshot
    // instead of relying on the broadcast sent below (which only reaches
    // clients that were already in the room).
    lobby: (client: Client) => client.send('lobby', this.lobbySnapshot())
  };

  async onAuth(_client: Client, _options: unknown, context: AuthContext): Promise<AuthPayload> {
    if (!context.token) throw new Error('unauthorized');

    const payload = await JWT.verify<{ userId: string }>(context.token);
    const user = payload?.userId ? findUserById(payload.userId) : undefined;
    if (!user) throw new Error('unauthorized');

    return { userId: user.id, nickname: user.nickname };
  }

  onJoin(client: Client) {
    const auth = client.auth as AuthPayload;
    const existing = this.seats.find(s => s.userId === auth.userId);

    if (existing) {
      if (existing.botControlled) {
        // Thrown (not `client.leave()`) so the join attempt itself is
        // rejected — the client's `joinById(...)` promise rejects instead
        // of resolving and then immediately being kicked.
        throw new Error('seat already handed to a bot for this match');
      }
      if (existing.connected) {
        this.clients.getById(existing.sessionId)?.leave(CLOSE_CODE_ANOTHER_DEVICE, 'Вы вошли с другого устройства.');
      }
      clearTimeout(existing.graceTimer);
      existing.graceTimer = undefined;
      existing.sessionId = client.sessionId;
      existing.connected = true;
      client.userData = { playerId: existing.playerId };
      setActiveSeat(auth.userId, { roomId: this.roomId, playerId: existing.playerId });
      this.broadcastLobby();
      if (this.latestState) this.sendState(client, existing.playerId);
      return;
    }

    if (this.phase !== 'WAITING') {
      throw new Error('game already in progress');
    }

    if (!this.hostSessionId) this.hostSessionId = client.sessionId;

    const playerId = `p${this.seats.length + 1}`;
    this.seats.push({
      playerId,
      userId: auth.userId,
      sessionId: client.sessionId,
      nickname: auth.nickname,
      connected: true,
      botControlled: false
    });
    client.userData = { playerId };
    setActiveSeat(auth.userId, { roomId: this.roomId, playerId });
    this.broadcast('lobby', this.lobbySnapshot(), { except: client });
  }

  onDrop(client: Client): void {
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    seat.connected = false;
    this.broadcastLobby();

    // `allowReconnection`/Colyseus's own reconnection-token mechanism is
    // deliberately not used — our own userId-matched `onJoin` above is what
    // lets a reconnecting client back in, from any device. This timer is
    // just the grace window before that becomes impossible.
    seat.graceTimer = setTimeout(() => {
      seat.graceTimer = undefined;
      if (seat.connected) return;
      if (this.phase === 'PLAYING') {
        seat.botControlled = true;
        clearActiveSeat(seat.userId);
        this.worker?.setSeatBotControlled(seat.playerId);
      }
      this.broadcastLobby();
    }, RECONNECTION_GRACE_SECONDS * 1000);
  }

  onLeave(client: Client): void {
    const seat = this.seats.find(s => s.sessionId === client.sessionId);
    if (!seat) return;

    clearTimeout(seat.graceTimer);
    clearActiveSeat(seat.userId);

    if (this.phase === 'PLAYING') {
      seat.connected = false;
      seat.botControlled = true;
      this.worker?.setSeatBotControlled(seat.playerId);
    } else {
      this.seats = this.seats.filter(s => s !== seat);
      if (this.hostSessionId === client.sessionId) {
        this.hostSessionId = this.seats[0]?.sessionId ?? null;
      }
    }
    this.broadcastLobby();
  }

  onDispose(): void {
    this.worker?.terminate();
    for (const seat of this.seats) {
      clearTimeout(seat.graceTimer);
      clearActiveSeat(seat.userId);
    }
  }

  protected lobbySnapshot(): LobbyMessage {
    return {
      seats: this.seats.map(s => ({ playerId: s.playerId, nickname: s.nickname, connected: s.connected })),
      hostSessionId: this.hostSessionId,
      phase: this.phase
    };
  }

  protected broadcastLobby(): void {
    this.broadcast('lobby', this.lobbySnapshot());
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

    // `performAction`'s single argument carries its own `actorId` field
    // (unlike the SELF_ONLY_ACTIONS above, which pass the id as a bare
    // `args[0]`). The active-player check above only proves *this seat* may
    // act right now — it never touches that embedded field, so a buggy or
    // malicious client could still claim to act as someone else. Stamp the
    // server-known seat id over whatever the client sent.
    if (method === 'performAction' && args[0] && typeof args[0] === 'object') {
      (args[0] as { actorId?: string }).actorId = seat.playerId;
    }

    this.worker.call(method, args);
  }
}
```

- [ ] **Step 6: Run all three checks**

Run:
```bash
npx tsx apps/server/src/KinglierRoom.lobby.check.ts
npx tsx apps/server/src/KinglierRoom.actions.check.ts
npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
```
Expected: each prints its own `... passed.` line.

- [ ] **Step 7: Typecheck the server package**

Run: `npx tsc --noEmit -p apps/server/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/KinglierRoom.ts apps/server/src/KinglierRoom.lobby.check.ts apps/server/src/KinglierRoom.actions.check.ts apps/server/src/KinglierRoom.reconnect.check.ts
git commit -m "feat(server): rebuild reconnection around userId instead of allowReconnection"
```

---

### Task 7: Client — shared authenticated Colyseus client + auth API wrapper

**Files:**
- Create: `apps/web/src/auth/AuthClient.ts`
- Modify: `apps/web/src/online/OnlineGameClient.ts` (only the `Client` construction — full rewrite happens in Task 9)

**Interfaces:**
- Produces: `colyseusClient: Client` (the one shared `@colyseus/sdk` instance the whole app uses — both for room joins and for `/api/*` calls, since a JWT set on `colyseusClient.auth.token` must be attached to *both*), `Account { id, email, nickname }`, `MeResponse { user: Account; activeRoom: { roomId, playerId } | null }`, `consumeTokenFromUrl(): void`, `requestMagicLink(email): Promise<void>`, `fetchMe(): Promise<MeResponse | null>`, `updateNickname(nickname): Promise<void>`, `logout(): void`.

- [ ] **Step 1: Write `AuthClient.ts`**

`Client.auth.token = '<jwt>'` only updates the in-memory value (confirmed by
reading `@colyseus/sdk`'s `Auth.mjs` — the setter is a bare assignment; only
its own `registerWithEmailAndPassword`/`signInWithEmailAndPassword`/`signOut`
helpers persist to storage, none of which fit a magic-link flow). Since this
app needs the token to survive a page reload, it manages `localStorage`
persistence itself.

```ts
// apps/web/src/auth/AuthClient.ts
import { Client } from '@colyseus/sdk';

const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

const TOKEN_STORAGE_KEY = 'kinglier:auth-token';

/**
 * The one Client (SDK) instance for the whole app. It must be shared between
 * account calls (this file) and room joins (OnlineGameClient) because
 * `auth.token` is attached automatically to *every* HTTP request this
 * instance makes — including the internal matchmake calls behind
 * `create`/`joinById` — so a token set here is what makes `KinglierRoom`'s
 * `onAuth` receive it as `context.token`.
 */
export const colyseusClient = new Client(SERVER_WS_URL);
colyseusClient.auth.token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';

export interface Account {
  id: string;
  email: string;
  nickname: string;
}

export interface MeResponse {
  user: Account;
  activeRoom: { roomId: string; playerId: string } | null;
}

function setToken(token: string): void {
  colyseusClient.auth.token = token;
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/** Reads a magic-link session token out of the URL fragment (set by the
 *  server's /api/auth/verify redirect) and persists it, if present. Must
 *  run once on boot, before the first `fetchMe()` call. */
export function consumeTokenFromUrl(): void {
  const match = location.hash.match(/token=([^&]+)/);
  if (!match) return;
  setToken(decodeURIComponent(match[1]));
  history.replaceState(null, '', location.pathname + location.search);
}

export function requestMagicLink(email: string): Promise<void> {
  return colyseusClient.http.post('/api/auth/request-link', { body: { email } }) as unknown as Promise<void>;
}

export async function fetchMe(): Promise<MeResponse | null> {
  if (!colyseusClient.auth.token) return null;
  try {
    const response = await colyseusClient.http.get('/api/me');
    return response.data as MeResponse;
  } catch {
    return null;
  }
}

export function updateNickname(nickname: string): Promise<void> {
  return colyseusClient.http.patch('/api/me', { body: { nickname } }) as unknown as Promise<void>;
}

export function logout(): void {
  setToken('');
}
```

- [ ] **Step 2: Point `OnlineGameClient.ts` at the shared client**

Only the `Client` construction changes in this step (the rest of the file is rewritten in Task 9):

```1:6:apps/web/src/online/OnlineGameClient.ts
import { Client, type Room } from '@colyseus/sdk';
import { bindOnlineStore } from './bindOnlineStore';
import { sanitizeRoomCode } from './roomCode';

const SERVER_URL = import.meta.env.VITE_SERVER_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
```

becomes:

```ts
import type { Room } from '@colyseus/sdk';
import { colyseusClient } from '../auth/AuthClient';
import { bindOnlineStore } from './bindOnlineStore';
import { sanitizeRoomCode } from './roomCode';
```

and the one usage of `new Client(SERVER_URL)` (`private client = new Client(SERVER_URL);`) becomes a reference to the shared `colyseusClient` — this is finished in Task 9 alongside the rest of the class rewrite, so it isn't a standalone compiling state; do not run the typecheck yet.

- [ ] **Step 3: Manual smoke check (no automated check for this task — Task 9's rewrite is what makes `OnlineGameClient` compile and exercises this file end-to-end)**

Since `OnlineGameClient.ts` is intentionally left mid-edit until Task 9, skip
running `tsc` here. Instead, sanity-check `AuthClient.ts` in isolation with a
throwaway browser console snippet is unnecessary busywork — Task 8's landing
screen and Task 9's `fetchMe()`/`joinRoom()` usage exercise every exported
function for real once the app runs, and Task 5's `routes.check.ts` already
proves the server side of every endpoint this file calls.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/auth/AuthClient.ts apps/web/src/online/OnlineGameClient.ts
git commit -m "feat(web): add shared authenticated Colyseus client and account API"
```

---

### Task 8: Client — landing/login screen and auth gating in `Root.tsx`

**Files:**
- Create: `apps/web/src/auth/LandingScreen.tsx`
- Modify: `apps/web/src/Root.tsx`
- Modify: `apps/web/src/styles/screen.css`

**Interfaces:**
- Consumes: `requestMagicLink`, `consumeTokenFromUrl`, `fetchMe`, `logout`, `Account`, `MeResponse` (Task 7).
- Produces: `Root` renders `LandingScreen` whenever there's no authenticated account; once authenticated, passes `nickname`/`onNicknameChange`/`autoJoinRoomId` down to `Lobby` (consumed starting Task 9).

- [ ] **Step 1: Write `LandingScreen.tsx`**

```tsx
// apps/web/src/auth/LandingScreen.tsx
import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { requestMagicLink } from './AuthClient';
import '../styles/screen.css';

export function LandingScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const submit = async () => {
    if (!email.includes('@') || status === 'sending') return;
    setStatus('sending');
    try {
      await requestMagicLink(email.trim().toLowerCase());
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="screen">
      <div className="screen__panel">
        <div className="brand brand--hero">
          <div className="brand__title">
            <span className="brand__rule" />
            <span className="gilded">КИНГСЛЕР</span>
            <span className="brand__rule brand__rule--r" />
          </div>
          <div className="brand__sub">Битва за престол</div>
        </div>

        <div className="dialog__panel lobbycard">
          {status === 'sent' ? (
            <p className="landing__sent">
              Письмо со ссылкой для входа отправлено на {email}. Проверьте почту (и папку «Спам»).
            </p>
          ) : (
            <>
              <input
                className="field"
                type="email"
                placeholder="Ваша почта"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoFocus
              />
              <Button
                tone="gold"
                size="lg"
                block
                disabled={!email.includes('@') || status === 'sending'}
                onClick={submit}
              >
                <Mail size={18} /> Получить ссылку для входа
              </Button>
              {status === 'error' && (
                <p className="landing__error">Не удалось отправить письмо. Попробуйте ещё раз.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add landing/account CSS to `screen.css`**

Append to `apps/web/src/styles/screen.css`:

```css
/* ==========================================================================
   LANDING (email login) & account controls
   ========================================================================== */
.landing__sent {
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-muted);
  text-align: center;
}

.landing__error {
  font-size: 0.78rem;
  color: var(--crimson-soft);
  text-align: center;
}

.landing__logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 0.72rem;
  color: var(--text-dim);
  cursor: pointer;
}

.landing__logout:hover {
  color: var(--text-muted);
}
```

- [ ] **Step 3: Rewrite `Root.tsx` to gate on the account and wire auto-rejoin**

```tsx
// apps/web/src/Root.tsx
import { useEffect, useState } from 'react';
import { Globe, Swords, LogOut } from 'lucide-react';
import App from './App';
import { Lobby } from './online/Lobby';
import { onlineClient } from './online/OnlineGameClient';
import { LandingScreen } from './auth/LandingScreen';
import { consumeTokenFromUrl, fetchMe, logout, updateNickname, type Account } from './auth/AuthClient';
import { Button } from './components/ui/Button';
import './styles/screen.css';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [account, setAccount] = useState<Account | null | 'loading'>('loading');
  const [autoJoinRoomId, setAutoJoinRoomId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

  useEffect(() => {
    consumeTokenFromUrl();
    fetchMe().then(me => {
      setAccount(me?.user ?? null);
      if (me?.activeRoom) {
        setAutoJoinRoomId(me.activeRoom.roomId);
        setMode('online-lobby');
      }
    });
  }, []);

  const exitToMenu = () => {
    onlineClient.leave();
    if (location.search) history.replaceState(null, '', location.pathname);
    setMode('menu');
  };

  if (account === 'loading') {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }

  if (!account) {
    return <LandingScreen />;
  }

  if (mode === 'menu') {
    return (
      <div className="screen">
        <div className="screen__panel">
          <div className="brand brand--hero">
            <div className="brand__title">
              <span className="brand__rule" />
              <span className="gilded">КИНГСЛЕР</span>
              <span className="brand__rule brand__rule--r" />
            </div>
            <div className="brand__sub">Битва за престол</div>
          </div>

          <div className="dialog__panel lobbycard">
            <Button
              tone="gold"
              size="lg"
              block
              sub="Быстрая партия против королевского двора ботов"
              onClick={() => setMode('offline')}
            >
              <Swords size={18} /> Играть с ботами
            </Button>
            <Button
              tone="calm"
              size="lg"
              block
              sub="Соберите комнату и позовите друзей"
              onClick={() => setMode('online-lobby')}
            >
              <Globe size={18} /> Играть онлайн
            </Button>
          </div>

          <button
            type="button"
            className="landing__logout"
            onClick={() => {
              logout();
              setAccount(null);
            }}
          >
            <LogOut size={13} /> Выйти из аккаунта ({account.nickname})
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'offline') {
    return <App mode="offline" onExit={exitToMenu} />;
  }

  if (mode === 'online-lobby') {
    return (
      <Lobby
        onGameStarted={() => setMode('online-game')}
        onExit={exitToMenu}
        nickname={account.nickname}
        onNicknameChange={async nickname => {
          await updateNickname(nickname);
          setAccount(a => (a && a !== 'loading' ? { ...a, nickname } : a));
        }}
        autoJoinRoomId={autoJoinRoomId}
      />
    );
  }

  return <App mode="online" onExit={exitToMenu} />;
}
```

- [ ] **Step 4: Manual smoke check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.app.json`
Expected: fails at this point — `Lobby` doesn't yet accept `nickname`/`onNicknameChange`/`autoJoinRoomId` props (that's Task 9). This is expected; do not fix it here.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth/LandingScreen.tsx apps/web/src/Root.tsx apps/web/src/styles/screen.css
git commit -m "feat(web): gate every mode behind a magic-link landing screen"
```

---

### Task 9: Client — `OnlineGameClient` rewrite (drop nickname/localStorage reconnect, add userId-based reconnect-with-backoff) and `Lobby.tsx` updates

**Files:**
- Modify: `apps/web/src/online/OnlineGameClient.ts`
- Modify: `apps/web/src/online/Lobby.tsx`

**Interfaces:**
- Consumes: `colyseusClient` (Task 7), `fetchMe`/`updateNickname` types already threaded through `Root.tsx` (Task 8).
- Produces: `OnlineGameClient.createRoom(): Promise<Room>`, `.joinRoom(roomId): Promise<Room>` (no `nickname` param on either — the server derives it from the account), `.onStatusChange(listener): () => void`, `ConnectionStatus = 'connected' | 'reconnecting' | 'lost'` (consumed by Task 10's overlay); `Lobby` gains `nickname`, `onNicknameChange`, `autoJoinRoomId` props and loses its nickname `<input>`.

- [ ] **Step 1: Rewrite `OnlineGameClient.ts`**

```ts
// apps/web/src/online/OnlineGameClient.ts
import type { Room } from '@colyseus/sdk';
import { colyseusClient } from '../auth/AuthClient';
import { bindOnlineStore } from './bindOnlineStore';
import { sanitizeRoomCode } from './roomCode';

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

export type ConnectionStatus = 'connected' | 'reconnecting' | 'lost';

// Matches KinglierRoom.ts's CLOSE_CODE_ANOTHER_DEVICE.
const CLOSE_CODE_ANOTHER_DEVICE = 4002;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 8000, 8000];

export class OnlineGameClient {
  room: Room | null = null;
  private unbindStore: (() => void) | null = null;
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private reconnecting = false;

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ConnectionStatus): void {
    for (const listener of this.statusListeners) listener(status);
  }

  private watch(room: Room): void {
    // Colyseus's own transport-level auto-reconnect (backed by
    // `room.reconnectionToken`) would race with the userId-based rejoin
    // below if both were active — disabling it here keeps exactly one
    // reconnection path.
    room.reconnection.enabled = false;
    room.onLeave(code => {
      if (this.room !== room) return; // superseded by a newer room already
      if (code === 1000) return; // consented leave (e.g. clicked "Выйти")
      if (code === CLOSE_CODE_ANOTHER_DEVICE) {
        this.setStatus('lost');
        return;
      }
      void this.reconnect(room.roomId);
    });
  }

  private async reconnect(roomId: string): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.setStatus('reconnecting');

    for (const delay of RECONNECT_DELAYS_MS) {
      await new Promise(resolve => setTimeout(resolve, delay));
      try {
        const room = await colyseusClient.joinById(roomId);
        this.room = room;
        this.watch(room);
        this.bindStore();
        this.setStatus('connected');
        this.reconnecting = false;
        return;
      } catch {
        // keep trying with the next delay
      }
    }

    this.reconnecting = false;
    this.setStatus('lost');
  }

  async createRoom(): Promise<Room> {
    this.room = await colyseusClient.create('kinglier');
    this.watch(this.room);
    return this.room;
  }

  async joinRoom(roomId: string): Promise<Room> {
    this.room = await colyseusClient.joinById(sanitizeRoomCode(roomId));
    this.watch(this.room);
    return this.room;
  }

  startGame(): void {
    this.room?.send('start');
  }

  bindStore(): void {
    if (!this.room) return;
    this.unbindStore?.();
    this.unbindStore = bindOnlineStore(this.room);
  }

  leave(): void {
    this.unbindStore?.();
    this.unbindStore = null;
    const room = this.room;
    this.room = null;
    room?.leave();
  }
}

export const onlineClient = new OnlineGameClient();
```

- [ ] **Step 2: Rewrite `Lobby.tsx`**

```tsx
// apps/web/src/online/Lobby.tsx
import { useEffect, useState, type ReactNode } from 'react';
import type { Room } from '@colyseus/sdk';
import { Check, Copy, Crown, LogIn, CirclePlus, Users, ArrowLeft, LogOut, Pencil } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { onlineClient, type LobbyMessage } from './OnlineGameClient';
import { ROOM_CODE_LENGTH, sanitizeRoomCode } from './roomCode';
import { useToast } from '../lib/toast';
import '../styles/screen.css';

interface LobbyProps {
  onGameStarted: () => void;
  onExit: () => void;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
  autoJoinRoomId: string | null;
}

const MAX_SEATS = 4;

function ScreenBack({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="iconbtn screen__back" onClick={onClick}>
      {children}
    </button>
  );
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="brand brand--hero">
      <div className="brand__title">
        <span className="brand__rule" />
        <span className="gilded">КИНГСЛЕР</span>
        <span className="brand__rule brand__rule--r" />
      </div>
      <div className="brand__sub">{subtitle}</div>
    </div>
  );
}

function NicknameEditor({ nickname, onChange }: { nickname: string; onChange: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname);

  if (!editing) {
    return (
      <button
        type="button"
        className="lobby__nickname"
        onClick={() => {
          setValue(nickname);
          setEditing(true);
        }}
      >
        Вы: <strong>{nickname}</strong> <Pencil size={12} />
      </button>
    );
  }

  const save = () => {
    const trimmed = value.trim().slice(0, 24);
    if (trimmed) onChange(trimmed);
    setEditing(false);
  };

  return (
    <div className="lobby__nickname-edit">
      <input
        className="field"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()}
        maxLength={24}
        autoFocus
      />
      <Button tone="gold" size="sm" onClick={save}>
        Сохранить
      </Button>
    </div>
  );
}

export function Lobby({ onGameStarted, onExit, nickname, onNicknameChange, autoJoinRoomId }: LobbyProps) {
  const [joinCode, setJoinCode] = useState(() =>
    sanitizeRoomCode(new URLSearchParams(location.search).get('room') ?? '')
  );
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [restoring, setRestoring] = useState(!!autoJoinRoomId);
  const showToast = useToast();

  const attachRoom = (newRoom: Room) => {
    newRoom.onMessage('lobby', (data: LobbyMessage) => {
      setLobby(data);
      if (data.phase === 'PLAYING') {
        onlineClient.bindStore();
        onGameStarted();
      }
    });
    setRoom(newRoom);
    newRoom.send('lobby');
  };

  useEffect(() => {
    if (!autoJoinRoomId) return;
    let cancelled = false;
    onlineClient
      .joinRoom(autoJoinRoomId)
      .then(joined => {
        if (!cancelled) attachRoom(joined);
      })
      .catch(() => {
        if (!cancelled) showToast('Не удалось восстановить прошлую партию.');
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    try {
      const created = await onlineClient.createRoom();
      history.replaceState(null, '', `?room=${created.roomId}`);
      attachRoom(created);
    } catch {
      showToast('Не удалось создать комнату. Проверьте соединение с сервером.');
    }
  };

  const handleJoin = async () => {
    const code = sanitizeRoomCode(joinCode);
    if (code.length !== ROOM_CODE_LENGTH) return;
    try {
      const joined = await onlineClient.joinRoom(code);
      attachRoom(joined);
    } catch {
      showToast('Комната не найдена или игра уже началась.');
    }
  };

  const copyInviteLink = () => {
    if (!room) return;
    const link = `${location.origin}${location.pathname}?room=${room.roomId}`;
    navigator.clipboard.writeText(link).then(
      () => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1600);
      },
      () => showToast('Не удалось скопировать ссылку')
    );
  };

  if (restoring) {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }

  if (!room || !lobby) {
    return (
      <div className="screen">
        <ScreenBack onClick={onExit}>
          <ArrowLeft size={15} /> Назад
        </ScreenBack>
        <div className="screen__panel">
          <Brand subtitle="Игра онлайн" />

          <NicknameEditor nickname={nickname} onChange={onNicknameChange} />

          <div className="dialog__panel lobbycard">
            <Button tone="gold" size="lg" block onClick={handleCreate}>
              <CirclePlus size={18} /> Создать комнату
            </Button>

            <div className="lobby__divider">
              <span>или</span>
            </div>

            <div className="lobby__joinrow">
              <input
                className="field field--roomcode"
                placeholder="Код комнаты"
                value={joinCode}
                onChange={e => setJoinCode(sanitizeRoomCode(e.target.value))}
                maxLength={ROOM_CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
              <Button tone="gold" size="lg" onClick={handleJoin} disabled={joinCode.length !== ROOM_CODE_LENGTH}>
                <LogIn size={18} /> Войти
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isHost = room.sessionId === lobby.hostSessionId;
  const hostPlayerId = lobby.seats[0]?.playerId;
  const emptySeatCount = Math.max(0, MAX_SEATS - lobby.seats.length);

  return (
    <div className="screen">
      <ScreenBack onClick={onExit}>
        <LogOut size={15} /> Выйти
      </ScreenBack>
      <div className="screen__panel">
        <Brand subtitle="Комната ожидания" />

        <div className="dialog__panel lobbycard">
          <div className="lobby__roomhead">
            <span className="eyebrow">Код комнаты</span>
            <button
              type="button"
              className="roomcode"
              onClick={copyInviteLink}
              title="Скопировать ссылку для друзей"
            >
              <span className="roomcode__code">{room.roomId}</span>
              {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <p className="lobby__hint">
              {linkCopied ? 'Ссылка скопирована!' : 'Отправьте ссылку друзьям, чтобы они присоединились'}
            </p>
          </div>

          <ul className="seatlist">
            {lobby.seats.map(seat => (
              <li key={seat.playerId} className="seatrow">
                <span className="seatrow__avatar">
                  <Users size={16} />
                </span>
                <span className="seatrow__name">{seat.nickname}</span>
                {seat.playerId === hostPlayerId && (
                  <Tag tone="gold">
                    <Crown size={11} /> Хост
                  </Tag>
                )}
                {!seat.connected && <Tag tone="danger">Отключился</Tag>}
              </li>
            ))}
            {Array.from({ length: emptySeatCount }).map((_, i) => (
              <li key={`empty-${i}`} className="seatrow seatrow--empty">
                <span className="seatrow__avatar seatrow__avatar--empty">?</span>
                <span className="seatrow__name">Свободно</span>
                <Tag>Займёт бот</Tag>
              </li>
            ))}
          </ul>

          {isHost ? (
            <Button tone="gold" size="lg" block onClick={() => onlineClient.startGame()}>
              Начать игру
            </Button>
          ) : (
            <div className="lobby__waiting">
              <span className="lobby__waiting-dot" />
              Ожидаем, пока хост начнёт игру…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add nickname-editor CSS to `screen.css`**

Append to `apps/web/src/styles/screen.css`:

```css
.lobby__nickname {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  background: none;
  border: none;
  padding: 2px 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  cursor: pointer;
}

.lobby__nickname strong {
  color: var(--gold-pale);
}

.lobby__nickname-edit {
  display: flex;
  gap: 8px;
}

.lobby__nickname-edit .field {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 4: Typecheck the web package**

Run: `npx tsc --noEmit -p apps/web/tsconfig.app.json`
Expected: no errors (this also confirms Task 8's `Root.tsx` now matches `Lobby`'s real props).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/online/OnlineGameClient.ts apps/web/src/online/Lobby.tsx apps/web/src/styles/screen.css
git commit -m "feat(web): rebuild online reconnection around the account, not localStorage"
```

---

### Task 10: Client — "Переподключение…" overlay during an active match

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles/screen.css`

**Interfaces:**
- Consumes: `onlineClient.onStatusChange`, `ConnectionStatus` (Task 9).

- [ ] **Step 1: Add the overlay to `App.tsx`**

```1:20:apps/web/src/App.tsx
import { useEffect, useState } from 'react';
import { pickViewer } from './lib/viewer';
import { useToast } from './lib/toast';
import { useGameStore } from '@kinglier/engine/GameStore';
import { startBotEngine, stopBotEngine } from '@kinglier/engine/Bot';
import { timerManager } from '@kinglier/engine/utils/timerManager';
import { TopBar } from './components/TopBar';
import { SeatsRow } from './components/SeatsRow';
import { Arena } from './components/Arena';
import { Hand } from './components/Hand';
import { PlayerCrest } from './components/PlayerCrest';
import { ActionControls } from './components/ActionControls';
import { Chronicle } from './components/Chronicle';
import { Codex } from './components/Codex';
import { Modals } from './components/Modals';
import { CardDetailModal } from './components/CardDetailModal';
import { RoleClaimPopup } from './components/RoleClaimPopup';
import { NormalActionsPopup } from './components/NormalActionsPopup';
import type { GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './components/targeting';
```

becomes:

```ts
import { useEffect, useState } from 'react';
import { pickViewer } from './lib/viewer';
import { useToast } from './lib/toast';
import { useGameStore } from '@kinglier/engine/GameStore';
import { startBotEngine, stopBotEngine } from '@kinglier/engine/Bot';
import { timerManager } from '@kinglier/engine/utils/timerManager';
import { TopBar } from './components/TopBar';
import { SeatsRow } from './components/SeatsRow';
import { Arena } from './components/Arena';
import { Hand } from './components/Hand';
import { PlayerCrest } from './components/PlayerCrest';
import { ActionControls } from './components/ActionControls';
import { Chronicle } from './components/Chronicle';
import { Codex } from './components/Codex';
import { Modals } from './components/Modals';
import { CardDetailModal } from './components/CardDetailModal';
import { RoleClaimPopup } from './components/RoleClaimPopup';
import { NormalActionsPopup } from './components/NormalActionsPopup';
import { Button } from './components/ui/Button';
import { onlineClient, type ConnectionStatus } from './online/OnlineGameClient';
import type { GameCard } from '@kinglier/engine/types';
import type { PendingTargetAction } from './components/targeting';
```

Then, inside the `App` component, add connection-status state and a subscription effect (placed right after the existing `showToast` line):

```62:75:apps/web/src/App.tsx
  const showToast = useToast();

  useEffect(() => {
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    if (mode !== 'offline') return;
    startBotEngine();
    startGame();
    return () => {
      stopBotEngine();
      timerManager.clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

becomes:

```tsx
  const showToast = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  useEffect(() => {
    (window as unknown as { __startTargeting: (a: PendingTargetAction) => void }).__startTargeting =
      setPendingTarget;
    if (mode !== 'offline') return;
    startBotEngine();
    startGame();
    return () => {
      stopBotEngine();
      timerManager.clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== 'online') return;
    return onlineClient.onStatusChange(setConnectionStatus);
  }, [mode]);
```

Finally, add the overlay to the render, right before the closing `</div>` of the top-level `return (<div className="app">...)` block (after the existing `<Modals ... />`):

```324:346:apps/web/src/App.tsx
      <Modals
        showRules={rulesOpen}
        onCloseRules={() => setRulesOpen(false)}
        redirectCardIndex={redirectCardIndex}
        onCloseRedirect={() => setRedirectCardIndex(null)}
        onRedirectAsInstant={cardIndex => {
          setRedirectCardIndex(null);
          setPendingTarget({
            type: 'instant',
            name: 'Перенаправление',
            instantType: 'Перенаправление',
            isInstantDirect: true,
            stakedCardIndex: cardIndex,
            cost: 0
          });
        }}
        onRedirectAsDuelBluff={cardIndex => {
          setRedirectCardIndex(null);
          targetDeclareDuel(human.id, cardIndex);
        }}
      />
    </div>
  );
}
```

becomes:

```tsx
      <Modals
        showRules={rulesOpen}
        onCloseRules={() => setRulesOpen(false)}
        redirectCardIndex={redirectCardIndex}
        onCloseRedirect={() => setRedirectCardIndex(null)}
        onRedirectAsInstant={cardIndex => {
          setRedirectCardIndex(null);
          setPendingTarget({
            type: 'instant',
            name: 'Перенаправление',
            instantType: 'Перенаправление',
            isInstantDirect: true,
            stakedCardIndex: cardIndex,
            cost: 0
          });
        }}
        onRedirectAsDuelBluff={cardIndex => {
          setRedirectCardIndex(null);
          targetDeclareDuel(human.id, cardIndex);
        }}
      />

      {mode === 'online' && connectionStatus !== 'connected' && (
        <div className="reconnect-overlay">
          <div className="reconnect-overlay__panel">
            {connectionStatus === 'reconnecting' ? (
              <div className="lobby__waiting">
                <span className="lobby__waiting-dot" />
                Переподключение…
              </div>
            ) : (
              <>
                <p>Соединение потеряно.</p>
                <Button tone="gold" onClick={onExit}>
                  В главное меню
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add overlay CSS to `screen.css`**

Append to `apps/web/src/styles/screen.css`:

```css
/* ==========================================================================
   RECONNECT overlay (unexpected drop during an online match)
   ========================================================================== */
.reconnect-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: grid;
  place-items: center;
  background: rgba(3, 5, 9, 0.78);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: fade-in 0.18s ease-out;
}

.reconnect-overlay__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 32px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line-mid);
  background: linear-gradient(180deg, rgba(16, 21, 32, 0.99) 0%, rgba(9, 12, 19, 1) 100%);
  box-shadow: var(--shadow-lg);
  text-align: center;
}
```

- [ ] **Step 3: Typecheck the web package**

Run: `npx tsc --noEmit -p apps/web/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Manual smoke test end-to-end**

This is the first point where the whole feature can be exercised together, so run it manually before moving on:

```bash
JWT_SECRET=dev-secret npx tsx watch apps/server/src/index.ts &
npm run dev --workspace=apps/web
```

- Open two different browsers (or one regular + one incognito window) at the web dev URL.
- In browser A: enter an email you control, click "Получить ссылку для входа", check the server's console log (email sending fails without `RESEND_API_KEY`, but `routes.check.ts` already proved the token/redirect plumbing — for this manual check, read the token straight out of the failed-send console error, or temporarily set a real `RESEND_API_KEY`/`MAGIC_LINK_FROM` and use a real inbox) and open the verify link.
- Confirm the main menu appears with your nickname.
- Create an online room, join it from browser B with a second account, start the game.
- Kill browser A's network (devtools "offline" throttling, or just close the tab and reopen the same room URL while logged in) and confirm: browser B sees "Отключился" during the grace period, then the seat's `isBot` state flips if you wait past `RECONNECTION_GRACE_SECONDS`; reconnecting in time (reopening the tab and logging back in with the same account) restores the seat instead.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/styles/screen.css
git commit -m "feat(web): show a reconnecting overlay on unexpected drops during a match"
```

---

### Task 11: Deployment — persist the database across rebuilds, document new env vars

**Files:**
- Modify: `Dockerfile`
- Modify: `.cursor/skills/deploy-to-vps/SKILL.md`

**Interfaces:**
- None (infrastructure only).

- [ ] **Step 1: Add a data volume to the `Dockerfile`**

```12:23:Dockerfile
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

becomes:

```dockerfile
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
# apps/server/src/db.ts opens data/kinglier.db here (resolved relative to
# the repo root) — a named/bind-mounted volume keeps accounts across image
# rebuilds; without it, every deploy silently resets every account.
VOLUME /repo/data
EXPOSE 2567
CMD ["npm", "run", "start", "--workspace=apps/server"]
```

- [ ] **Step 2: Update the deploy skill's `docker run` command and env var table**

```12:23:.cursor/skills/deploy-to-vps/SKILL.md
## Environment (fixed for this project)

| What | Value |
|---|---|
| GitHub remote | `https://github.com/KiraMurano/kingsler-web.git`, branch `main` |
| SSH alias | `ozero-ru` |
| Server repo path | `/var/www/admin/data/www/kingsler.ru` |
| Docker image | `kinglier-game` |
| Container name | `kinglier` |
| Port | `2567`, bound to `127.0.0.1` only (Nginx on the server reverse-proxies HTTPS + WebSocket to it — already configured, don't touch it for a routine deploy) |
| Public URL | `https://kiramurano.fvds.ru` |
```

becomes:

```markdown
## Environment (fixed for this project)

| What | Value |
|---|---|
| GitHub remote | `https://github.com/KiraMurano/kingsler-web.git`, branch `main` |
| SSH alias | `ozero-ru` |
| Server repo path | `/var/www/admin/data/www/kingsler.ru` |
| Docker image | `kinglier-game` |
| Container name | `kinglier` |
| Port | `2567`, bound to `127.0.0.1` only (Nginx on the server reverse-proxies HTTPS + WebSocket to it — already configured, don't touch it for a routine deploy) |
| Public URL | `https://kiramurano.fvds.ru` |
| Data volume | `/var/www/admin/data/www/kingsler.ru/data` on the host, mounted at `/repo/data` — holds `kinglier.db` (accounts). **Never omit `-v` below**, or a redeploy wipes every account. |
| Required env vars (Phase 2+) | `JWT_SECRET` (session signing — generate once, keep stable across deploys), `RESEND_API_KEY`, `MAGIC_LINK_FROM` (e.g. `Kinglier <auth@send.kingsler.ru>`), `PUBLIC_URL` (must match the public HTTPS URL exactly — it's embedded in magic-link emails) |
```

```49:53:.cursor/skills/deploy-to-vps/SKILL.md
4. **Restart the container on the new image:**

```bash
ssh ozero-ru "sudo docker stop kinglier && sudo docker rm kinglier && sudo docker run -d --name kinglier --restart unless-stopped -p 127.0.0.1:2567:2567 kinglier-game && sleep 2 && sudo docker ps --filter name=kinglier && sudo docker logs kinglier --tail 30"
```
```

becomes:

````markdown
4. **Restart the container on the new image:**

```bash
ssh ozero-ru "sudo docker stop kinglier && sudo docker rm kinglier && sudo docker run -d --name kinglier --restart unless-stopped -p 127.0.0.1:2567:2567 -v /var/www/admin/data/www/kingsler.ru/data:/repo/data -e JWT_SECRET=<value> -e RESEND_API_KEY=<value> -e MAGIC_LINK_FROM='Kinglier <auth@send.kingsler.ru>' -e PUBLIC_URL=https://kiramurano.fvds.ru kinglier-game && sleep 2 && sudo docker ps --filter name=kinglier && sudo docker logs kinglier --tail 30"
```

`JWT_SECRET` and `RESEND_API_KEY` are secrets — keep the real values out of
shell history/chat logs; store them once (e.g. in a root-only file on the
server) and reference that file instead of retyping them per deploy.
````

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .cursor/skills/deploy-to-vps/SKILL.md
git commit -m "chore(deploy): persist the accounts database volume, document Phase 2 env vars"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), magic-link issuance/rate-limit (Task 2), Resend delivery (Task 3), active-seat registry (Task 4), all three auth routes + CORS + `JWT_SECRET` guard (Task 5), `onAuth`/`onJoin`/`onDrop` userId redesign + updated/new check scripts (Task 6), shared authenticated client (Task 7), landing screen + app-wide gating + auto-rejoin (Task 8), dead-code removal (`tryReconnect`, `kinglier:reconnect:*`, nickname `useState`) + nickname edit control + reconnect-with-backoff (Task 9), reconnecting overlay (Task 10), volume + env var documentation (Task 11). Explicitly-out-of-scope items (password/OAuth login, public matchmaking, horizontal scaling, avatars) are untouched by every task above.
- **Placeholder scan:** every step has real, runnable code; no "TBD"/"similar to Task N" placeholders remain.
- **Type consistency:** `Seat.userId`/`ActiveSeat`/`AuthPayload` are defined once (Tasks 4 and 6) and reused with identical shapes everywhere they're consumed; `ConnectionStatus` is defined once in `OnlineGameClient.ts` (Task 9) and imported (never redefined) in `App.tsx` (Task 10); `MeResponse`/`Account` are defined once in `AuthClient.ts` (Task 7) and threaded through `Root.tsx`/`Lobby.tsx` by prop, never redeclared.
