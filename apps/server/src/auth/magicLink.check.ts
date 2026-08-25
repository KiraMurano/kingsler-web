/**
 * Run: npx tsx apps/server/src/auth/magicLink.check.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'kinglier-magiclink-')), 'test.db');

const { db } = await import('../db.ts');
const { issueMagicLinkCredentials, consumeMagicLinkCode, consumeMagicLinkToken } =
  await import('./magicLink.ts');

const first = issueMagicLinkCredentials('ivan@example.com');
assert.ok(first, 'a first request must issue credentials');
assert.match(first.code, /^\d{6}$/);
assert.equal(
  issueMagicLinkCredentials('ivan@example.com'),
  null,
  'server cooldown must reject an immediate retry'
);
assert.ok(issueMagicLinkCredentials('other@example.com'), 'cooldown must be per-email');

assert.equal(consumeMagicLinkCode('ivan@example.com', first.code), 'ivan@example.com');
assert.equal(consumeMagicLinkToken(first.token), null, 'code use must invalidate the link');

db.prepare('UPDATE magic_link_tokens SET created_at = created_at - 61000 WHERE email = ?')
  .run('ivan@example.com');
const second = issueMagicLinkCredentials('ivan@example.com')!;
assert.equal(consumeMagicLinkToken(second.token), 'ivan@example.com');
assert.equal(
  consumeMagicLinkCode('ivan@example.com', second.code),
  null,
  'link use must invalidate the code'
);

db.prepare('UPDATE magic_link_tokens SET created_at = created_at - 61000 WHERE email = ?')
  .run('ivan@example.com');
const limited = issueMagicLinkCredentials('ivan@example.com')!;
const wrongCode = limited.code === '999999' ? '000000' : '999999';
for (let attempt = 0; attempt < 5; attempt += 1) {
  assert.equal(consumeMagicLinkCode('ivan@example.com', wrongCode), null);
}
assert.equal(consumeMagicLinkCode('ivan@example.com', limited.code), null);
assert.equal(consumeMagicLinkToken(limited.token), null, 'attempt limit must invalidate the link too');

db.prepare('UPDATE magic_link_tokens SET created_at = created_at - 61000 WHERE email = ?')
  .run('ivan@example.com');
const expired = issueMagicLinkCredentials('ivan@example.com')!;
db.prepare('UPDATE magic_link_tokens SET expires_at = 0 WHERE email = ?').run('ivan@example.com');
assert.equal(consumeMagicLinkCode('ivan@example.com', expired.code), null);
assert.equal(consumeMagicLinkToken(expired.token), null);

assert.equal(consumeMagicLinkToken('does-not-exist'), null);
assert.equal(consumeMagicLinkCode('nobody@example.com', '123456'), null);

console.log('magicLink.check.ts passed.');
