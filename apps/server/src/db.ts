import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PROFILE_AVATAR,
  DEFAULT_PROFILE_TITLE,
  type ProfileAvatar,
  type ProfileTitle
} from '@kinglier/engine/profile';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/server/src -> apps/server -> apps -> <repo root>/data/kinglier.db.
// Resolved from this file's location (not process.cwd()) so it's correct
// whether the server is started from the repo root or from apps/server.
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../../data/kinglier.db');
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '/avatars/anton.webp',
    title TEXT NOT NULL DEFAULT 'Претендент',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS magic_link_tokens (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
`);

export interface UserRow {
  id: string;
  email: string;
  nickname: string;
  avatar: ProfileAvatar;
  title: ProfileTitle;
  created_at: number;
}

export interface ProfileUpdate {
  nickname: string;
  avatar: ProfileAvatar;
  title: ProfileTitle;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function findOrCreateUserByEmail(email: string): UserRow {
  const existing = findUserByEmail(email);
  if (existing) return existing;

  const id = randomUUID();
  const nickname = (email.split('@')[0] ?? 'Игрок').slice(0, 24);
  db.prepare(
    'INSERT INTO users (id, email, nickname, avatar, title, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, email, nickname, DEFAULT_PROFILE_AVATAR, DEFAULT_PROFILE_TITLE, Date.now());
  return findUserById(id)!;
}

export function updateProfile(id: string, profile: ProfileUpdate): void {
  db.prepare('UPDATE users SET nickname = ?, avatar = ?, title = ? WHERE id = ?')
    .run(profile.nickname, profile.avatar, profile.title, id);
}
