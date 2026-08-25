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
