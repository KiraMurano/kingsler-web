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

const { findOrCreateUserByEmail, findUserByEmail, findUserById, updateProfile } = await import('./db.ts');

const created = findOrCreateUserByEmail('ivan@example.com');
assert.equal(created.email, 'ivan@example.com');
assert.equal(created.nickname, 'ivan', 'nickname must default to the email local-part');
assert.equal(created.avatar, '/avatars/anton.webp');
assert.equal(created.title, 'Претендент');
assert.ok(created.id, 'a new user must get a generated id');

const again = findOrCreateUserByEmail('ivan@example.com');
assert.equal(again.id, created.id, 'the same email must resolve to the same user, not a duplicate');

updateProfile(created.id, {
  nickname: 'Ваня',
  avatar: '/avatars/dima.webp',
  title: 'Провокатор'
});
const updated = findUserById(created.id)!;
assert.deepEqual(
  { nickname: updated.nickname, avatar: updated.avatar, title: updated.title },
  { nickname: 'Ваня', avatar: '/avatars/dima.webp', title: 'Провокатор' }
);

assert.equal(findUserByEmail('nobody@example.com'), undefined);
assert.equal(findUserById('does-not-exist'), undefined);

console.log('db.check.ts passed.');
