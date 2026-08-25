# Landing, Profile, and Login Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public Kinglier landing page, modal magic-link/code login, persistent editable player identity, and one card-scattered background across landing/menu/lobby.

**Architecture:** Extend the existing SQLite user and magic-link records in place, keep JWT sessions unchanged, and pass profile fields through the existing room/worker/engine seat flow. Reuse the current React root state, dialog primitive, card assets, and CSS files; add only a shared profile catalog, one decorative background component, and one profile dialog.

**Tech Stack:** React 19, TypeScript, Vite, Express 5, Colyseus 0.17, Node `node:sqlite` and `node:crypto`, Resend REST API, existing `*.check.ts` self-check convention.

**Spec:** `docs/superpowers/specs/2026-08-25-landing-profile-login-code-design.md`

## Global Constraints

- Add no npm dependencies.
- The fixed title catalog is `Претендент`, `Азартный игрок`, `Осторожный стратег`, `Прагматик`, `Провокатор`, `Оппортунист`.
- The fixed avatar catalog is the eight existing files under `apps/web/public/avatars`.
- Magic links and codes expire after 15 minutes and share one-use semantics.
- Five incorrect code attempts invalidate the credential record.
- Login request cooldown is one request per email per 60 seconds and is enforced from server-owned database timestamps only.
- JWT payloads continue to contain only `userId`.
- Old local databases may be recreated; no compatibility migration is required because no user data exists.
- Achievement entitlements, custom avatar uploads, arbitrary titles, and a client router remain out of scope.

---

## File Map

- `packages/engine/src/profile.ts`: fixed profile catalogs, defaults, and membership guards shared by server and web.
- `apps/server/src/db.ts`: current SQLite schema and profile persistence.
- `apps/server/src/auth/magicLink.ts`: paired link/code issuance, server cooldown, attempt limit, and shared consumption state.
- `apps/server/src/auth/email.ts`: one email containing the link and six-digit code.
- `apps/server/src/auth/routes.ts`: code verification, session creation, and profile API validation.
- `packages/engine/src/types.ts`, `packages/engine/src/GameStore.ts`: carry human title/avatar into game players and restarts.
- `apps/server/src/KinglierRoom.ts`, `apps/server/src/GameWorkerClient.ts`, `apps/server/src/gameWorker.ts`: carry profile identity from authenticated user to lobby and game worker.
- `apps/web/src/components/CardBackdrop.tsx`: fixed decorative card layout.
- `apps/web/src/auth/LandingScreen.tsx`: public landing and login modal state machine.
- `apps/web/src/components/ProfileDialog.tsx`: nickname/avatar/title editor.
- `apps/web/src/Root.tsx`: account state, menu account control, offline identity, and dialog wiring.
- `apps/web/src/online/Lobby.tsx`: remove nickname editing and render lobby identity.
- `apps/web/src/components/PlayerCrest.tsx`, `apps/web/src/components/OpponentSeat.tsx`: title above nickname in the game UI.
- `apps/web/src/styles/screen.css`, `apps/web/src/styles/layout.css`: landing, background, profile, lobby identity, and title/name layout.

---

### Task 1: Persistent Profile Catalog and API

**Files:**
- Create: `packages/engine/src/profile.ts`
- Modify: `apps/server/src/db.ts:1-63`
- Modify: `apps/server/src/db.check.ts:1-31`
- Modify: `apps/server/src/auth/routes.ts:1-90`
- Modify: `apps/server/src/auth/routes.check.ts:49-77`

**Interfaces:**
- Produces: `PROFILE_AVATARS`, `PROFILE_TITLES`, `DEFAULT_PROFILE_AVATAR`, `DEFAULT_PROFILE_TITLE`, `isProfileAvatar(value)`, and `isProfileTitle(value)`.
- Produces: `UserRow.avatar`, `UserRow.title`, and `updateProfile(id, { nickname, avatar, title })`.
- Produces: `GET /api/me` and `PATCH /api/me` account payload `{ id, email, nickname, avatar, title }`.

- [ ] **Step 1: Add failing profile default and persistence assertions**

Create a user in the fresh throwaway database, then assert defaults and a full profile update:

```ts
const { findOrCreateUserByEmail, findUserById, updateProfile } = await import('./db.ts');
const created = findOrCreateUserByEmail('anna@example.com');
assert.equal(created.avatar, '/avatars/anton.webp');
assert.equal(created.title, 'Претендент');

updateProfile(created.id, {
  nickname: 'Анна',
  avatar: '/avatars/yulia.webp',
  title: 'Прагматик'
});
assert.deepEqual(
  (({ nickname, avatar, title }) => ({ nickname, avatar, title }))(findUserById(created.id)!),
  { nickname: 'Анна', avatar: '/avatars/yulia.webp', title: 'Прагматик' }
);
```

- [ ] **Step 2: Run the database check and confirm failure**

Run: `npx tsx apps/server/src/db.check.ts`

Expected: FAIL because new users have no `avatar`/`title` fields and `updateProfile` is not exported.

- [ ] **Step 3: Add the shared fixed catalog**

Implement `packages/engine/src/profile.ts`:

```ts
export const PROFILE_AVATARS = [
  '/avatars/anton.webp',
  '/avatars/yulia.webp',
  '/avatars/sasha.webp',
  '/avatars/masha.webp',
  '/avatars/dima.webp',
  '/avatars/bot1.webp',
  '/avatars/bot2.webp',
  '/avatars/bot3.webp'
] as const;

export const PROFILE_TITLES = [
  'Претендент',
  'Азартный игрок',
  'Осторожный стратег',
  'Прагматик',
  'Провокатор',
  'Оппортунист'
] as const;

export type ProfileAvatar = (typeof PROFILE_AVATARS)[number];
export type ProfileTitle = (typeof PROFILE_TITLES)[number];
export const DEFAULT_PROFILE_AVATAR: ProfileAvatar = PROFILE_AVATARS[0];
export const DEFAULT_PROFILE_TITLE: ProfileTitle = PROFILE_TITLES[0];

export const isProfileAvatar = (value: unknown): value is ProfileAvatar =>
  typeof value === 'string' && PROFILE_AVATARS.includes(value as ProfileAvatar);

export const isProfileTitle = (value: unknown): value is ProfileTitle =>
  typeof value === 'string' && PROFILE_TITLES.includes(value as ProfileTitle);
```

- [ ] **Step 4: Add profile columns and the persistence function**

Add both columns directly to the fresh `users` table definition:

```ts
avatar TEXT NOT NULL DEFAULT '/avatars/anton.webp',
title TEXT NOT NULL DEFAULT 'Претендент',
```

Extend `UserRow`, include the two defaults when inserting a user, replace `updateNickname` with:

```ts
export interface ProfileUpdate {
  nickname: string;
  avatar: ProfileAvatar;
  title: ProfileTitle;
}

export function updateProfile(id: string, profile: ProfileUpdate): void {
  db.prepare('UPDATE users SET nickname = ?, avatar = ?, title = ? WHERE id = ?')
    .run(profile.nickname, profile.avatar, profile.title, id);
}
```

- [ ] **Step 5: Run the database check and confirm success**

Run: `npx tsx apps/server/src/db.check.ts`

Expected: `db.check.ts passed.`

- [ ] **Step 6: Add failing profile route assertions**

Extend `routes.check.ts` so `GET /api/me` includes defaults, a valid full profile patch round-trips, and unknown catalog values return 400:

```ts
assert.equal(me.user.avatar, '/avatars/anton.webp');
assert.equal(me.user.title, 'Претендент');

const profile = {
  nickname: 'Ваня',
  avatar: '/avatars/dima.webp',
  title: 'Провокатор'
};
assert.equal((await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(profile)
})).status, 200);

const meAfter = await (await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${sessionToken}` }
})).json();
assert.equal(meAfter.user.avatar, profile.avatar);
assert.equal(meAfter.user.title, profile.title);

assert.equal((await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, title: 'Король сервера' })
})).status, 400);
```

- [ ] **Step 7: Run the route check and confirm failure**

Run: `npx tsx apps/server/src/auth/routes.check.ts`

Expected: FAIL because `/api/me` does not return or validate avatar/title.

- [ ] **Step 8: Validate and persist the complete profile in the route**

Import `isProfileAvatar`, `isProfileTitle`, and `updateProfile`. Return all fields from `GET /api/me`; in `PATCH /api/me`, require the full valid profile:

```ts
const body = req.body as { nickname?: unknown; avatar?: unknown; title?: unknown };
const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
if (
  !nickname || nickname.length > 24 ||
  !isProfileAvatar(body.avatar) ||
  !isProfileTitle(body.title)
) {
  res.status(400).json({ error: 'invalid profile' });
  return;
}
updateProfile(userId, { nickname, avatar: body.avatar, title: body.title });
res.json({ ok: true });
```

- [ ] **Step 9: Run focused checks**

Run: `npx tsx apps/server/src/db.check.ts && npx tsx apps/server/src/auth/routes.check.ts`

Expected: both checks print `passed.`

- [ ] **Step 10: Commit the profile backend**

```bash
git add packages/engine/src/profile.ts apps/server/src/db.ts apps/server/src/db.check.ts apps/server/src/auth/routes.ts apps/server/src/auth/routes.check.ts
git commit -m "feat: persist player profiles"
```

---

### Task 2: Server-Enforced Six-Digit Login Code

**Files:**
- Modify: `apps/server/src/db.ts:18-33`
- Modify: `apps/server/src/auth/magicLink.ts:1-48`
- Modify: `apps/server/src/auth/magicLink.check.ts:1-36`
- Modify: `apps/server/src/auth/email.ts:1-26`
- Modify: `apps/server/src/auth/email.check.ts:1-38`
- Modify: `apps/server/src/auth/routes.ts:1-63`
- Modify: `apps/server/src/auth/routes.check.ts:1-104`
- Modify: `apps/web/src/auth/AuthClient.ts:46-52`

**Interfaces:**
- Produces: `issueMagicLinkCredentials(email): { token: string; code: string } | null`.
- Produces: `consumeMagicLinkCode(email, code): string | null`.
- Changes: `sendMagicLinkEmail(email, verifyUrl, code): Promise<void>`.
- Produces: `POST /api/auth/verify-code { email, code } -> { token }`.
- Produces: `verifyMagicCode(email, code): Promise<string>` in the web auth client.

- [ ] **Step 1: Write failing credential-level checks**

Replace token-only setup in `magicLink.check.ts` with assertions for code format, cross-consumption, attempts, and server cooldown:

```ts
const first = issueMagicLinkCredentials('ivan@example.com');
assert.ok(first);
assert.match(first.code, /^\d{6}$/);
assert.equal(issueMagicLinkCredentials('ivan@example.com'), null, 'server cooldown must reject retry');
assert.equal(consumeMagicLinkCode('ivan@example.com', first.code), 'ivan@example.com');
assert.equal(consumeMagicLinkToken(first.token), null, 'code use must invalidate link');

db.prepare('UPDATE magic_link_tokens SET created_at = created_at - 61000').run();
const second = issueMagicLinkCredentials('ivan@example.com')!;
assert.equal(consumeMagicLinkToken(second.token), 'ivan@example.com');
assert.equal(consumeMagicLinkCode('ivan@example.com', second.code), null, 'link use must invalidate code');

db.prepare('UPDATE magic_link_tokens SET created_at = created_at - 61000').run();
const limited = issueMagicLinkCredentials('ivan@example.com')!;
const wrongCode = limited.code === '999999' ? '000000' : '999999';
for (let attempt = 0; attempt < 5; attempt += 1) {
  assert.equal(consumeMagicLinkCode('ivan@example.com', wrongCode), null);
}
assert.equal(consumeMagicLinkCode('ivan@example.com', limited.code), null);
assert.equal(consumeMagicLinkToken(limited.token), null);
```

- [ ] **Step 2: Run the credential check and confirm failure**

Run: `npx tsx apps/server/src/auth/magicLink.check.ts`

Expected: FAIL because paired credentials and code consumption do not exist.

- [ ] **Step 3: Add code fields to the current magic-link schema**

Add required code fields directly to the fresh `magic_link_tokens` table:

```sql
code_hash TEXT NOT NULL,
code_salt TEXT NOT NULL,
failed_attempts INTEGER NOT NULL DEFAULT 0,
```

- [ ] **Step 4: Implement paired issuance with the existing database cooldown**

Keep `TOKEN_TTL_MS = 15 * 60 * 1000` and `REQUEST_COOLDOWN_MS = 60 * 1000`. Generate the code and salt with Node crypto and return plaintext only to the caller:

```ts
export interface MagicLinkCredentials { token: string; code: string }

export function issueMagicLinkCredentials(email: string): MagicLinkCredentials | null {
  const recent = db.prepare(
    'SELECT created_at FROM magic_link_tokens WHERE email = ? ORDER BY created_at DESC LIMIT 1'
  ).get(email) as { created_at: number } | undefined;
  const now = Date.now();
  if (recent && now - recent.created_at < REQUEST_COOLDOWN_MS) return null;

  const token = randomBytes(32).toString('hex');
  const code = randomInt(1_000_000).toString().padStart(6, '0');
  const codeSalt = randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO magic_link_tokens
      (token_hash, code_hash, code_salt, email, created_at, expires_at, used_at, failed_attempts)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 0)
  `).run(hashToken(token), hashCode(code, codeSalt), codeSalt, email, now, now + TOKEN_TTL_MS);
  return { token, code };
}
```

`hashCode` is SHA-256 over `${salt}:${code}`. `consumeMagicLinkCode` selects the newest unused row for the supplied email, rejects expired records, compares equal-length hex hashes with `timingSafeEqual`, increments `failed_attempts` on mismatch, and sets `used_at` on the fifth mismatch or on success. Keep `consumeMagicLinkToken` checking the shared `used_at` field.

- [ ] **Step 5: Run the credential check and confirm success**

Run: `npx tsx apps/server/src/auth/magicLink.check.ts`

Expected: `magicLink.check.ts passed.`

- [ ] **Step 6: Add failing email assertions**

Call the new signature and assert the generated request contains both credentials:

```ts
await sendMagicLinkEmail(
  'ivan@example.com',
  'https://kingsler.ru/api/auth/verify?token=abc',
  '042731'
);
assert.match(body.html, />042731</);
assert.match(body.html, /https:\/\/kingsler\.ru\/api\/auth\/verify\?token=abc/);
```

- [ ] **Step 7: Run the email check and confirm failure**

Run: `npx tsx apps/server/src/auth/email.check.ts`

Expected: FAIL because `sendMagicLinkEmail` does not accept or render a code.

- [ ] **Step 8: Render the link and prominent code in one email**

Change the function signature and keep the existing Resend request. The HTML must include a heading, the six digits in a large letter-spaced block, the clickable verify URL, the 15-minute lifetime, and ignore-if-unrequested text. Do not add an email-template dependency.

- [ ] **Step 9: Run the email check and confirm success**

Run: `npx tsx apps/server/src/auth/email.check.ts`

Expected: `email.check.ts passed.`

- [ ] **Step 10: Add failing route checks for code login and cooldown**

Request a separate `code@example.com` credential, capture its six digits from
the mocked Resend HTML, verify them without first opening that record's link,
and assert the returned JWT reaches `/api/me`:

```ts
capturedHtml = '';
await fetch(`http://localhost:${PORT}/api/auth/request-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'code@example.com' })
});
const code = capturedHtml.match(/>(\d{6})</)?.[1];
assert.ok(code, 'email must contain a six-digit code');

const codeResponse = await fetch(`http://localhost:${PORT}/api/auth/verify-code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'code@example.com', code })
});
assert.equal(codeResponse.status, 200);
const { token: codeSession } = await codeResponse.json();
assert.equal((await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${codeSession}` }
})).status, 200);
```

For cooldown, count mocked Resend calls, request `cooldown@example.com` twice,
and assert the count increases only once. Do not wait or rely on a browser
timer.

- [ ] **Step 11: Run the route check and confirm failure**

Run: `npx tsx apps/server/src/auth/routes.check.ts`

Expected: FAIL with 404 for `/api/auth/verify-code`.

- [ ] **Step 12: Share session creation between link and code routes**

Use one helper:

```ts
async function createSession(email: string): Promise<string> {
  const user = findOrCreateUserByEmail(email);
  return JWT.sign({ userId: user.id }, { expiresIn: '30d' });
}
```

`POST /request-link` calls `issueMagicLinkCredentials`, sends `credentials.token` and `credentials.code`, and keeps returning 200 without sending during server cooldown. `GET /verify` redirects with `await createSession(email)`. Add:

```ts
authRouter.post('/verify-code', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const verifiedEmail = /^\d{6}$/.test(code) ? consumeMagicLinkCode(email, code) : null;
  if (!verifiedEmail) {
    res.status(400).json({ error: 'invalid or expired code' });
    return;
  }
  res.json({ token: await createSession(verifiedEmail) });
});
```

- [ ] **Step 13: Add the web auth-client code call**

```ts
export async function verifyMagicCode(email: string, code: string): Promise<string> {
  const response = await colyseusClient.http.post('/api/auth/verify-code', {
    body: { email, code }
  });
  return (response.data as { token: string }).token;
}
```

- [ ] **Step 14: Run focused auth checks**

Run: `npx tsx apps/server/src/auth/magicLink.check.ts && npx tsx apps/server/src/auth/email.check.ts && npx tsx apps/server/src/auth/routes.check.ts`

Expected: all three checks print `passed.`

- [ ] **Step 15: Commit code login**

```bash
git add apps/server/src/db.ts apps/server/src/auth/magicLink.ts apps/server/src/auth/magicLink.check.ts apps/server/src/auth/email.ts apps/server/src/auth/email.check.ts apps/server/src/auth/routes.ts apps/server/src/auth/routes.check.ts apps/web/src/auth/AuthClient.ts
git commit -m "feat: add six-digit email login codes"
```

---

### Task 3: Carry Profile Identity Through Rooms and Games

**Files:**
- Modify: `packages/engine/src/types.ts:13-27,199`
- Modify: `packages/engine/src/GameStore.ts:100-145,174-176`
- Modify: `packages/engine/src/GameStore.seats.check.ts:9-27`
- Modify: `apps/server/src/GameWorkerClient.ts:8-13`
- Modify: `apps/server/src/gameWorker.ts:23-27`
- Modify: `apps/server/src/GameWorkerClient.check.ts:10-30`
- Modify: `apps/server/src/KinglierRoom.ts:30-238`
- Modify: `apps/server/src/KinglierRoom.lobby.check.ts:20-60`
- Modify: `apps/web/src/online/OnlineGameClient.ts:4-10`

**Interfaces:**
- Changes engine seat input to `{ id: string; name: string; avatar?: string; title?: string }`.
- Adds `Player.title?: string`.
- Adds lobby seat fields `avatar: string` and `title: string`.

- [ ] **Step 1: Add failing engine seat identity assertions**

Pass a complete first seat and assert identity survives both initial start and restart:

```ts
useGameStore.getState().startGame([
  { id: 'p1', name: 'Аня', avatar: '/avatars/yulia.webp', title: 'Прагматик' },
  { id: 'p2', name: 'Боря' }
]);
assert.equal(seat1.avatar, '/avatars/yulia.webp');
assert.equal(seat1.title, 'Прагматик');

useGameStore.getState().restartGame();
assert.equal(useGameStore.getState().players[0].name, 'Аня');
assert.equal(useGameStore.getState().players[0].title, 'Прагматик');
```

- [ ] **Step 2: Run the engine seat check and confirm failure**

Run: `npx tsx packages/engine/src/GameStore.seats.check.ts`

Expected: FAIL because seat titles are not accepted or persisted across restart.

- [ ] **Step 3: Extend the engine player and seat input**

Add `title?: string` to `Player` and the `startGame` seat type. Map human `title` into `Player`. Preserve current human identities on restart:

```ts
restartGame: () => {
  const seats = get().players
    .filter(player => !player.isBot)
    .map(player => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      title: player.title
    }));
  get().startGame(seats);
}
```

- [ ] **Step 4: Run the engine seat check and confirm success**

Run: `npx tsx packages/engine/src/GameStore.seats.check.ts`

Expected: `GameStore.seats.check.ts passed.`

- [ ] **Step 5: Add failing worker identity assertions**

Start the worker with avatar/title and assert the emitted player contains both:

```ts
worker.startGame([
  { id: 'p1', name: 'Аня', avatar: '/avatars/yulia.webp', title: 'Провокатор' },
  { id: 'p2', name: 'Боря' }
]);
assert.equal(afterStart.players[0].avatar, '/avatars/yulia.webp');
assert.equal(afterStart.players[0].title, 'Провокатор');
```

- [ ] **Step 6: Run the worker check and confirm failure**

Run: `npx tsx apps/server/src/GameWorkerClient.check.ts`

Expected: FAIL because `SeatInput` and the worker message omit `title`.

- [ ] **Step 7: Extend both worker seat types**

Add `title?: string` alongside `avatar?: string` in `GameWorkerClient.SeatInput` and `gameWorker.WorkerMessage.seats`; no new worker messages or transforms are needed.

- [ ] **Step 8: Run the worker check and confirm success**

Run: `npx tsx apps/server/src/GameWorkerClient.check.ts`

Expected: `GameWorkerClient.check.ts passed.`

- [ ] **Step 9: Add failing room/lobby identity assertions**

Update Anya's persisted profile before joining, type the lobby payload, and assert both lobby and game state:

```ts
updateProfile(anya.id, {
  nickname: 'Аня',
  avatar: '/avatars/yulia.webp',
  title: 'Оппортунист'
});

type Lobby = {
  seats: { playerId: string; nickname: string; avatar: string; title: string }[];
};
assert.equal((lastLobby as Lobby).seats[0].avatar, '/avatars/yulia.webp');
assert.equal((lastLobby as Lobby).seats[0].title, 'Оппортунист');
assert.equal(hostState!.players[0].title, 'Оппортунист');
```

- [ ] **Step 10: Run the room check and confirm failure**

Run: `npx tsx apps/server/src/KinglierRoom.lobby.check.ts`

Expected: FAIL because room auth and snapshots only carry nickname.

- [ ] **Step 11: Extend room auth, seats, snapshots, and worker input**

Add avatar/title to `AuthPayload` and `Seat`, return them from `onAuth`, store them in `onJoin`, expose them in `lobbySnapshot`, and start the worker with:

```ts
const seatInputs: SeatInput[] = this.seats.map(seat => ({
  id: seat.playerId,
  name: seat.nickname,
  avatar: seat.avatar,
  title: seat.title
}));
```

Extend the web `LobbySeat` type with the same required fields. Do not add avatar/title to JWTs; `onAuth` reads the fresh database row.

- [ ] **Step 12: Run identity propagation checks**

Run: `npx tsx packages/engine/src/GameStore.seats.check.ts && npx tsx apps/server/src/GameWorkerClient.check.ts && npx tsx apps/server/src/KinglierRoom.lobby.check.ts`

Expected: all three checks print `passed.`

- [ ] **Step 13: Commit identity propagation**

```bash
git add packages/engine/src/types.ts packages/engine/src/GameStore.ts packages/engine/src/GameStore.seats.check.ts apps/server/src/GameWorkerClient.ts apps/server/src/gameWorker.ts apps/server/src/GameWorkerClient.check.ts apps/server/src/KinglierRoom.ts apps/server/src/KinglierRoom.lobby.check.ts apps/web/src/online/OnlineGameClient.ts
git commit -m "feat: carry profiles into rooms and games"
```

---

### Task 4: Shared Card Backdrop and Public Login Landing

**Files:**
- Create: `apps/web/src/components/CardBackdrop.tsx`
- Create: `apps/web/src/components/CardBackdrop.check.ts`
- Modify: `apps/web/src/auth/LandingScreen.tsx:1-74`
- Modify: `apps/web/src/styles/screen.css:1-50,240-292`

**Interfaces:**
- Produces: `CardBackdrop(): JSX.Element` with a fixed decorative layout.
- Keeps: `LandingScreen({ onLoggedIn })` public API.
- Consumes: `requestMagicLink`, `verifyMagicCode`, `setToken`, `fetchMe`, and existing `Dialog`/`Button` primitives.

- [ ] **Step 1: Write a failing backdrop source check**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CardBackdrop.tsx', import.meta.url), 'utf8');
assert.match(source, /aria-hidden="true"/);
assert.equal((source.match(/^  \['/gm) ?? []).length, 9);
assert.match(source, /back-dual-face\.webp/);
assert.match(source, /intrigue-plot\.webp/);
console.log('CardBackdrop.check.ts passed.');
```

- [ ] **Step 2: Run the backdrop check and confirm failure**

Run: `node --import tsx apps/web/src/components/CardBackdrop.check.ts`

Expected: FAIL because `CardBackdrop.tsx` does not exist.

- [ ] **Step 3: Implement the fixed decorative card layout**

Use a module-level nine-item array with existing card URLs and fixed percentages/rotations:

```tsx
const CARDS = [
  ['/assets/cards/back-dual-face.webp', '5%', '8%', '-24deg'],
  ['/assets/cards/intrigue-plot.webp', '22%', '72%', '17deg'],
  ['/assets/cards/knight.webp', '39%', '-9%', '-8deg'],
  ['/assets/cards/instant-veto.webp', '55%', '78%', '23deg'],
  ['/assets/cards/treasurer.webp', '73%', '5%', '12deg'],
  ['/assets/cards/back-dual-face.webp', '88%', '62%', '-18deg'],
  ['/assets/cards/joker.webp', '-3%', '58%', '29deg'],
  ['/assets/cards/intrigue-blackbook.webp', '67%', '51%', '-31deg'],
  ['/assets/cards/back-dual-face.webp', '93%', '-5%', '20deg']
] as const;

export function CardBackdrop() {
  return (
    <div className="card-backdrop" aria-hidden="true">
      {CARDS.map(([src, left, top, rotate], index) => (
        <img
          key={`${src}-${index}`}
          className="card-backdrop__card"
          src={src}
          alt=""
          style={{ left, top, transform: `rotate(${rotate})` }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the backdrop check and confirm success**

Run: `node --import tsx apps/web/src/components/CardBackdrop.check.ts`

Expected: `CardBackdrop.check.ts passed.`

- [ ] **Step 5: Replace the auth form screen with landing plus closed dialog**

Keep login state local to `LandingScreen`. The visible page contains the brand, the copy `Интриги, блеф и борьба за корону`, three concise feature lines, and a `Войти и играть` button. Mount `CardBackdrop` directly under `.screen`.

The `Dialog` body has two states:

```ts
type LoginStatus = 'idle' | 'sending' | 'sent' | 'verifying';
```

Email submit normalizes with `trim().toLowerCase()`, calls `requestMagicLink`, preserves the current dev-token fast path, and otherwise moves to `sent`. The sent state renders a numeric six-character input using:

```tsx
onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
inputMode="numeric"
autoComplete="one-time-code"
maxLength={6}
```

Code submit calls `verifyMagicCode(email, code)`, stores the returned token, fetches `/api/me`, and calls `onLoggedIn`. A 400 response sets inline text `Неверный или истёкший код.`; request delivery failures continue using the existing toast.

- [ ] **Step 6: Add the landing/backdrop/login CSS**

In `screen.css`:

- keep the dark-rock/radial background on `.screen`;
- give `.screen__panel`, `.screen__back`, and landing content `z-index: 1`;
- make `.card-backdrop` absolute/inset/overflow-hidden/pointer-events-none;
- size cards with `width: clamp(70px, 9vw, 138px)`, `aspect-ratio: 2 / 3`, `object-fit: cover`, low opacity, and the existing heavy shadow language;
- hide three cards below 720px and lower opacity behind modal content;
- give `.landing` a wider content column, responsive hero type, readable copy width, and a compact three-column feature grid that stacks on mobile;
- style `.login-form` and `.login-code` without adding a new panel primitive.

- [ ] **Step 7: Run the component check and production build**

Run: `node --import tsx apps/web/src/components/CardBackdrop.check.ts && npm run build:web`

Expected: backdrop check passes; TypeScript and Vite complete successfully.

- [ ] **Step 8: Commit landing and backdrop**

```bash
git add apps/web/src/components/CardBackdrop.tsx apps/web/src/components/CardBackdrop.check.ts apps/web/src/auth/LandingScreen.tsx apps/web/src/styles/screen.css
git commit -m "feat: add public game landing"
```

---

### Task 5: Profile Dialog, Menu/Lobby Identity, and In-Game Titles

**Files:**
- Create: `apps/web/src/components/ProfileDialog.tsx`
- Create: `apps/web/src/components/ProfileDialog.check.ts`
- Modify: `apps/web/src/auth/AuthClient.ts:19-70`
- Modify: `apps/web/src/Root.tsx:1-114`
- Modify: `apps/web/src/App.tsx:28-72`
- Modify: `apps/web/src/online/Lobby.tsx:1-273`
- Modify: `apps/web/src/components/PlayerCrest.tsx:54-68`
- Modify: `apps/web/src/components/OpponentSeat.tsx:101-115`
- Modify: `apps/web/src/styles/screen.css:52-292`
- Modify: `apps/web/src/styles/layout.css:408-440,1149-1175`

**Interfaces:**
- Extends web `Account` with `avatar: ProfileAvatar` and `title: ProfileTitle`.
- Replaces `updateNickname` with `updateProfile(profile): Promise<void>`.
- Produces: `ProfileDialog({ open, account, onClose, onSaved, onLogout })`.
- Changes `Lobby` props to `{ onGameStarted, onExit, autoJoinRoomId }`.
- Changes `App` props to include `account: Account` for offline seat creation.

- [ ] **Step 1: Extend the client account and profile update call**

Use shared catalog types in `AuthClient.ts`:

```ts
export interface Account {
  id: string;
  email: string;
  nickname: string;
  avatar: ProfileAvatar;
  title: ProfileTitle;
}

export function updateProfile(profile: Pick<Account, 'nickname' | 'avatar' | 'title'>): Promise<void> {
  return colyseusClient.http.patch('/api/me', { body: profile }) as unknown as Promise<void>;
}
```

- [ ] **Step 2: Implement the focused profile dialog**

Use the existing `Dialog`, `Button`, `PROFILE_AVATARS`, and `PROFILE_TITLES`. Local state resets from `account` whenever the dialog opens. The save path trims nickname, refuses an empty value, calls `updateProfile`, then calls:

```ts
onSaved({ ...account, nickname: nickname.trim(), avatar, title });
onClose();
```

Render avatar choices as buttons with real `<img alt="">` portraits and `aria-label="Выбрать аватар"`; render title choices as buttons with `aria-pressed={title === option}`. Disable save while the request runs. On rejection, retain local edits and toast `Не удалось сохранить профиль.`. Logout is a separate subdued button that calls `onLogout`.

- [ ] **Step 3: Wire the account control and profile dialog into the main menu**

In `Root.tsx`:

- replace `updateNickname` import with `ProfileDialog` and `CardBackdrop`;
- hold `profileOpen` boolean;
- mount `CardBackdrop` on the authenticated menu screen;
- render an account button with selected portrait, title, and nickname;
- on logout, call `onlineClient.leave()`, `logout()`, set account to null, and close the dialog;
- pass only `autoJoinRoomId`, `onExit`, and `onGameStarted` to `Lobby`.

Pass `account` to both `App` modes. In `App`, the offline startup becomes:

```ts
startGame([{
  id: 'p1',
  name: account.nickname,
  avatar: account.avatar,
  title: account.title
}]);
```

Online mode still consumes the server state and does not seed it from the client account.

- [ ] **Step 4: Remove lobby nickname editing and render real lobby profiles**

Delete `NicknameEditor`, `Pencil`, and the two nickname props. Mount `CardBackdrop` in both non-restoring `.screen` branches. Replace the generic user icon for occupied seats with:

```tsx
<span className="seatrow__avatar">
  <img src={seat.avatar} alt="" />
</span>
<span className="seatrow__identity">
  <span className="seatrow__title">{seat.title}</span>
  <span className="seatrow__name">{seat.nickname}</span>
</span>
```

Keep host/disconnected tags and empty-seat rendering unchanged.

- [ ] **Step 5: Put title above nickname in both game seat variants**

For opponents, render `player.title ?? player.archetype?.title ?? 'Придворный'` before the existing nickname row. For the current player crest, replace hard-coded `Претендент` with two elements:

```tsx
<div className="crest__title">{player.title ?? 'Претендент'}</div>
<div className="crest__namerow">
  <div className="crest__name">{player.name}</div>
  {/* existing action-token anchor */}
</div>
```

Adjust only the adjacent selectors in `layout.css`: titles use the existing muted small uppercase treatment; names retain display prominence and active-state color.

- [ ] **Step 6: Add compact profile/menu/lobby styling**

In `screen.css`, add:

- `.account-button`, portrait, title, and name styles;
- `.profile-form`, `.profile-avatars`, `.profile-avatar`, `.profile-titles`, and selected-state styles using existing gold/line tokens;
- `.seatrow__identity` and `.seatrow__title`, with the existing ellipsis on `.seatrow__name`;
- mobile rules reducing avatar grid columns and keeping the menu/lobby panel within the viewport.

Delete obsolete `.landing__logout`, `.lobby__nickname`, and `.lobby__nickname-edit` blocks after their markup is gone.

- [ ] **Step 7: Run TypeScript, lint, and focused identity checks**

Run: `node --import tsx apps/web/src/components/ProfileDialog.check.ts && npm run build:web && npm run lint && node --import tsx packages/engine/src/GameStore.seats.check.ts && node --import tsx apps/server/src/KinglierRoom.lobby.check.ts`

Expected: Vite build completes, oxlint reports no errors, and both checks print `passed.`

- [ ] **Step 8: Commit the complete profile UX**

```bash
git add apps/web/src/components/ProfileDialog.tsx apps/web/src/components/ProfileDialog.check.ts apps/web/src/auth/AuthClient.ts apps/web/src/Root.tsx apps/web/src/App.tsx apps/web/src/online/Lobby.tsx apps/web/src/components/PlayerCrest.tsx apps/web/src/components/OpponentSeat.tsx apps/web/src/styles/screen.css apps/web/src/styles/layout.css
git commit -m "feat: add editable player profiles"
```

---

### Task 6: Full Regression Verification

**Files:**
- Verify only; modify a file only if a failing check identifies a regression in the feature implementation.

**Interfaces:**
- Consumes all outputs from Tasks 1-5.
- Produces one verified feature branch with no uncommitted implementation changes.

- [ ] **Step 1: Run every affected server and engine check**

```bash
npx tsx apps/server/src/db.check.ts
npx tsx apps/server/src/auth/magicLink.check.ts
npx tsx apps/server/src/auth/email.check.ts
npx tsx apps/server/src/auth/routes.check.ts
npx tsx packages/engine/src/GameStore.seats.check.ts
npx tsx apps/server/src/GameWorkerClient.check.ts
npx tsx apps/server/src/KinglierRoom.lobby.check.ts
npx tsx apps/server/src/KinglierRoom.reconnect.check.ts
npx tsx apps/server/src/KinglierRoom.actions.check.ts
```

Expected: every command prints its matching `passed.` line and exits 0.

- [ ] **Step 2: Run the web component check, lint, and production build**

```bash
node --import tsx apps/web/src/components/CardBackdrop.check.ts
node --import tsx apps/web/src/components/ProfileDialog.check.ts
npm run lint
npm run build:web
```

Expected: component check prints `passed.`, oxlint exits 0, and Vite completes a production build.

- [ ] **Step 3: Inspect the final diff for accidental scope**

Run: `git diff --check HEAD~5..HEAD && git status --short`

Expected: no whitespace errors; only the plan file may remain outside the five implementation commits if it was committed separately.

- [ ] **Step 4: Record any deliberately deferred ceiling**

No new abstraction is needed. The handoff must state: achievement-gated titles and custom uploads were skipped; add them only when achievements or uploads are actually introduced.
