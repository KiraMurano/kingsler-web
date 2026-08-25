import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { db } from '../db.ts';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export interface MagicLinkCredentials {
  token: string;
  code: string;
}

interface CredentialRow {
  token_hash: string;
  email: string;
  code_hash: string;
  code_salt: string;
  expires_at: number;
  used_at: number | null;
  failed_attempts: number;
}

export function issueMagicLinkCredentials(email: string): MagicLinkCredentials | null {
  const recent = db.prepare(
    'SELECT created_at FROM magic_link_tokens WHERE email = ? ORDER BY created_at DESC LIMIT 1'
  ).get(email) as { created_at: number } | undefined;

  const now = Date.now();
  if (recent && now - recent.created_at < REQUEST_COOLDOWN_MS) {
    return null;
  }

  const token = randomBytes(32).toString('hex');
  const code = randomInt(1_000_000).toString().padStart(6, '0');
  const codeSalt = randomBytes(16).toString('hex');
  db.prepare(
    `INSERT INTO magic_link_tokens
      (token_hash, code_hash, code_salt, email, created_at, expires_at, used_at, failed_attempts)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`
  ).run(hashToken(token), hashCode(code, codeSalt), codeSalt, email, now, now + TOKEN_TTL_MS);
  return { token, code };
}

/**
 * Consumes a magic-link token: returns the associated email exactly once,
 * for a token that hasn't expired and hasn't been used before. Every other
 * case (unknown, expired, already-used token) returns null.
 */
export function consumeMagicLinkToken(token: string): string | null {
  const tokenHash = hashToken(token);
  const row = db.prepare(
    'SELECT email, expires_at, used_at, failed_attempts FROM magic_link_tokens WHERE token_hash = ?'
  ).get(tokenHash) as Pick<CredentialRow, 'email' | 'expires_at' | 'used_at' | 'failed_attempts'> | undefined;

  if (
    !row ||
    row.used_at !== null ||
    row.expires_at < Date.now() ||
    row.failed_attempts >= 5
  ) return null;

  const result = db.prepare(
    'UPDATE magic_link_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL'
  ).run(Date.now(), tokenHash);
  return result.changes === 1 ? row.email : null;
}

export function consumeMagicLinkCode(email: string, code: string): string | null {
  const row = db.prepare(
    `SELECT token_hash, email, code_hash, code_salt, expires_at, used_at, failed_attempts
     FROM magic_link_tokens
     WHERE email = ? AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  ).get(email) as CredentialRow | undefined;

  if (!row || row.expires_at < Date.now() || row.failed_attempts >= 5) return null;

  const actualHash = Buffer.from(hashCode(code, row.code_salt), 'hex');
  const storedHash = Buffer.from(row.code_hash, 'hex');
  if (actualHash.length !== storedHash.length || !timingSafeEqual(actualHash, storedHash)) {
    const attempts = row.failed_attempts + 1;
    if (attempts >= 5) {
      db.prepare(
        'UPDATE magic_link_tokens SET failed_attempts = ?, used_at = ? WHERE token_hash = ? AND used_at IS NULL'
      ).run(attempts, Date.now(), row.token_hash);
    } else {
      db.prepare(
        'UPDATE magic_link_tokens SET failed_attempts = ? WHERE token_hash = ? AND used_at IS NULL'
      ).run(attempts, row.token_hash);
    }
    return null;
  }

  const result = db.prepare(
    'UPDATE magic_link_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL'
  ).run(Date.now(), row.token_hash);
  return result.changes === 1 ? row.email : null;
}
