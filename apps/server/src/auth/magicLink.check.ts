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
