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
let resendCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === 'https://api.resend.com/emails') {
    resendCallCount += 1;
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
assert.equal(me.user.avatar, '/avatars/anton.webp');
assert.equal(me.user.title, 'Азартный игрок');
assert.equal(me.activeRoom, null);

const profile = {
  nickname: 'Vanya',
  avatar: '/avatars/dima.webp',
  title: 'Провокатор'
};
const patchResponse = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(profile)
});
assert.equal(patchResponse.status, 200);
const meAfter = await (await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${sessionToken}` }
})).json();
assert.equal(meAfter.user.nickname, 'Vanya');
assert.equal(meAfter.user.avatar, profile.avatar);
assert.equal(meAfter.user.title, profile.title);

const invalidProfile = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, title: 'Король сервера' })
});
assert.equal(invalidProfile.status, 400);

const cyrillicProfile = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, nickname: 'Ваня' })
});
assert.equal(cyrillicProfile.status, 400, 'must reject non-latin characters');

const multiSpaceProfile = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, nickname: 'John  Doe' })
});
assert.equal(multiSpaceProfile.status, 400, 'must reject multiple spaces');

const tooLongProfile = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, nickname: 'VeryLongNick123' })
});
assert.equal(tooLongProfile.status, 400, 'must reject nicknames longer than 12 characters');

const tooShortProfile = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, nickname: 'ab' })
});
assert.equal(tooShortProfile.status, 400, 'must reject nicknames shorter than 3 characters');

const validSpacedProfile = await fetch(`http://localhost:${PORT}/api/me`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...profile, nickname: 'John Doe' })
});
assert.equal(validSpacedProfile.status, 200, 'must accept valid latin name with single space');

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

const callsBeforeCooldownCheck = resendCallCount;
for (let attempt = 0; attempt < 2; attempt += 1) {
  await fetch(`http://localhost:${PORT}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cooldown@example.com' })
  });
}
assert.equal(
  resendCallCount,
  callsBeforeCooldownCheck + 1,
  'server cooldown must prevent the second email'
);

capturedHtml = '';
await fetch(`http://localhost:${PORT}/api/auth/request-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'code@example.com' })
});
const code = capturedHtml.match(/>(\d{6})</)?.[1];
assert.ok(code, 'the email must contain a six-digit code');

const wrongCodeResponse = await fetch(`http://localhost:${PORT}/api/auth/verify-code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'code@example.com', code: code === '999999' ? '000000' : '999999' })
});
assert.equal(wrongCodeResponse.status, 400);

const codeResponse = await fetch(`http://localhost:${PORT}/api/auth/verify-code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'code@example.com', code })
});
assert.equal(codeResponse.status, 200);
const { token: codeSession } = await codeResponse.json();
const codeMe = await (await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${codeSession}` }
})).json();
assert.equal(codeMe.user.email, 'code@example.com');

const reusedCode = await fetch(`http://localhost:${PORT}/api/auth/verify-code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'code@example.com', code })
});
assert.equal(reusedCode.status, 400);

globalThis.fetch = originalFetch;

// Dev mode: no RESEND_API_KEY configured must skip the email round-trip and
// return an already-valid session token directly.
delete process.env.RESEND_API_KEY;
const devRequestResponse = await fetch(`http://localhost:${PORT}/api/auth/request-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'anya@example.com' })
});
assert.equal(devRequestResponse.status, 200);
const { devToken } = await devRequestResponse.json();
assert.ok(devToken, 'no RESEND_API_KEY must produce a usable devToken');

const devMeResponse = await fetch(`http://localhost:${PORT}/api/me`, {
  headers: { Authorization: `Bearer ${devToken}` }
});
assert.equal(devMeResponse.status, 200);
const devMe = await devMeResponse.json();
assert.equal(devMe.user.email, 'anya@example.com');

console.log('routes.check.ts passed.');
process.exit(0);
