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
