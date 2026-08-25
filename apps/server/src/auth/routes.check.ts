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
