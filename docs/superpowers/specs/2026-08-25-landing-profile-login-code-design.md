# Kinglier — Landing, Profile, and Login Code Design

Date: 2026-08-25
Status: Approved design, pending final written-spec review

## Goal

Give unauthenticated visitors a real game landing page, keep login in a modal,
add a persistent editable player profile, and let a player use either a magic
link or a six-digit code from the same email. The landing, main menu, and lobby
must share one card-scattered background inspired by the neighboring
`kingsler` project.

## Scope

- Public landing page with a concise game description and a primary login
  button.
- Login modal with email request and six-digit code entry.
- One email contains both the clickable magic link and the code.
- Persistent nickname, avatar, and title profile.
- Free selection from a fixed title catalog for now. Achievement-based title
  unlocking is deferred.
- Profile identity is used in offline games, online lobbies, and online games.
- One shared decorative background for the landing, main menu, and both lobby
  states.

No new npm dependencies are required.

## Public Landing and Login UX

Unauthenticated users see a full landing page rather than the current email
form. It contains the Kinglier wordmark, a short description of the bluffing
and court-intrigue gameplay, a small set of core features, and one primary
`Войти и играть` button.

The button opens the existing dialog primitive as a login modal:

1. The first state accepts an email and requests a login message.
2. The sent state shows the destination email and a six-digit code input.
3. The user can enter the code on the original computer or open the magic link
   on the device that received the email.
4. Invalid, expired, or exhausted codes show an inline error. Delivery errors
   retain the email and allow retrying.

The existing development behavior remains: without `RESEND_API_KEY`, the
request returns a session immediately and the client logs in without an email
round trip.

## Magic Link and Six-Digit Code

One login request creates one database record containing:

- the existing random magic-link token hash;
- a random six-digit code hash and random salt;
- email, creation time, expiry time, usage time, and failed-attempt count.

The plaintext token and code exist only long enough to build the email. The
code is generated with `node:crypto`, left-padded to six digits, and verified
with its email address against the newest active record.

Both credentials have the existing 15-minute lifetime and share one-use
semantics: consuming either the link or the code sets `used_at`, invalidating
the other. After five incorrect code attempts the record can no longer be used.

The current one-request-per-email-per-60-seconds cooldown remains and is a
strict server-side rule. The server queries its own `created_at` values and
decides whether a new credential may be issued; client state, timers, or
headers are never trusted to enforce it. `POST /api/auth/request-link` keeps
returning a non-enumerating success response during cooldown and does not send
a second email. The UI may show a countdown only as feedback, never as the
security boundary.

New endpoint:

- `POST /api/auth/verify-code { email, code }` consumes a valid code and
  returns the same 30-day session JWT produced by the link verification flow.

Session creation is kept in one shared server helper so link and code login
cannot diverge.

## Profile Data and Validation

The new `users` schema contains non-null `avatar` and `title` columns with
defaults. There is no compatibility migration because no user data exists;
an old local development database must be recreated. `/api/me` returns both
fields, and `PATCH /api/me` accepts a trimmed nickname plus avatar and title.

Server validation remains authoritative:

- nickname: non-empty, at most 24 characters;
- avatar: one of the existing eight `/avatars/*.webp` assets;
- title: one of `Претендент`, `Азартный игрок`, `Осторожный стратег`,
  `Прагматик`, `Провокатор`, or `Оппортунист`.

The fixed avatar and title arrays live in one small shared module used by the
web app and server. There is no entitlement model, achievements table, or
unlock API yet. When achievements are introduced, server validation can filter
the same catalog by earned title IDs.

## Profile UX

The authenticated main menu shows a compact account control with portrait,
title, and nickname. Activating it opens a profile dialog containing:

- nickname input;
- selectable avatar grid using the existing portrait assets;
- selectable title list;
- save button and logout action.

The dialog saves all fields in one `PATCH /api/me` request and updates the
current account only after success. Save failures preserve edits and show a
toast. Nickname editing is removed from the online lobby so profile editing has
one home.

## Identity in Lobby and Game

Room authentication reads fresh nickname, avatar, and title values from the
database. A room seat and lobby snapshot carry all three fields. When a match
starts, the same values are passed through `GameWorkerClient` into the engine
seat input.

The engine `Player` gains an optional `title`; human players receive the
profile title, while bots keep their existing archetype titles. Player UI shows
the title above the nickname and uses the selected avatar. The offline game is
started with the authenticated account as its human seat, so its identity
matches online play.

Profile changes affect newly joined rooms and newly started games. They do not
mutate a match already in progress.

## Shared Card Background

A single presentational `CardBackdrop` component is mounted by the public
landing, authenticated main menu, and lobby screens. It uses the current card
face/back assets and the existing dark-rock background. Card positions,
rotations, and asset choices are a fixed responsive layout rather than random
values generated during render, so the scene does not jump during state
changes.

The cards are decorative (`aria-hidden`, empty alt text), non-interactive,
dimmed behind content, and reduced in count/size on narrow screens. The layer
does not appear over the active game table.

## Error Handling and Security

- Email input and profile fields receive client feedback, but all important
  validation is repeated on the server.
- Magic links and codes are short-lived, single-use, and stored as hashes.
- The server owns request cooldown enforcement and code-attempt limits.
- Auth request responses do not reveal whether an account already exists.
- Profile updates reject unknown avatar paths and titles.
- Existing JWT payloads continue to contain only `userId`; display data is
  fetched from the database.

## Verification

Extend the existing runnable `*.check.ts` checks:

- `magicLink.check.ts`: issued code format, correct-code consumption,
  single-use across code/link, wrong-attempt ceiling, and server-side
  per-email cooldown.
- `email.check.ts`: email contains the same six-digit code and verify URL.
- `routes.check.ts`: code login returns a usable session; cooldown sends no
  second email; profile fields round-trip and invalid choices are rejected.
- `db.check.ts`: fresh users receive defaults and profile updates persist.
- room/worker checks: avatar and title reach lobby snapshots and game players.
- web lint and production build.

## Deferred

- Achievement storage, title grants, locked-title presentation, and historical
  backfills.
- Custom avatar uploads or arbitrary user-written titles.
- A router or separate profile page; the existing root state and dialog system
  cover the requested flow.
