import { Router } from 'express';
import { JWT } from 'colyseus';
import {
  issueMagicLinkCredentials,
  consumeMagicLinkCode,
  consumeMagicLinkToken
} from './magicLink.ts';
import { sendMagicLinkEmail } from './email.ts';
import { isProfileAvatar, isProfileTitle } from '@kinglier/engine/profile';
import { findOrCreateUserByEmail, findUserById, updateProfile } from '../db.ts';
import { getActiveSeat } from '../activeSeats.ts';

const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:2567';

interface AuthedRequest {
  auth: { userId: string };
}

export const authRouter = Router();

async function createSession(email: string): Promise<string> {
  const user = findOrCreateUserByEmail(email);
  return JWT.sign({ userId: user.id }, { expiresIn: '30d' });
}

authRouter.post('/request-link', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'invalid email' });
    return;
  }

  // No RESEND_API_KEY means there's no way to deliver a real email — a
  // production deploy always has one configured. Treat that as "local dev"
  // and skip straight to a signed session, via the same JWT.sign() call
  // /verify uses, so the rest of the app can't tell the difference.
  if (!process.env.RESEND_API_KEY) {
    res.json({ ok: true, devToken: await createSession(email) });
    return;
  }

  const credentials = issueMagicLinkCredentials(email);
  if (credentials) {
    const verifyUrl = `${PUBLIC_URL}/api/auth/verify?token=${credentials.token}`;
    try {
      await sendMagicLinkEmail(email, verifyUrl, credentials.code);
    } catch (err) {
      console.error('Failed to send magic link email:', err);
    }
  }

  // Always 200 regardless of outcome: avoids leaking whether an email is
  // registered, and avoids a buggy client retry loop treating a 4xx/5xx as
  // "keep retrying immediately".
  res.json({ ok: true });
});

authRouter.get('/verify', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const email = token ? consumeMagicLinkToken(token) : null;

  if (!email) {
    res.status(400).send('Ссылка недействительна или истекла. Запросите новую в приложении.');
    return;
  }

  res.redirect(`${PUBLIC_URL}/#token=${await createSession(email)}`);
});

authRouter.post('/verify-code', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const verifiedEmail = /^\d{6}$/.test(code) ? consumeMagicLinkCode(email, code) : null;
  if (!verifiedEmail) {
    res.status(400).json({ error: 'invalid or expired code' });
    return;
  }
  res.json({ token: await createSession(verifiedEmail) });
});

export const meRouter = Router();

meRouter.get('/api/me', JWT.middleware(), (req, res) => {
  const userId = (req as unknown as AuthedRequest).auth.userId;
  const user = findUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      title: user.title
    },
    activeRoom: getActiveSeat(userId) ?? null
  });
});

meRouter.patch('/api/me', JWT.middleware(), (req, res) => {
  const userId = (req as unknown as AuthedRequest).auth.userId;
  const body = req.body as unknown as { nickname?: unknown; avatar?: unknown; title?: unknown };
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (
    !nickname ||
    nickname.length > 24 ||
    !isProfileAvatar(body.avatar) ||
    !isProfileTitle(body.title)
  ) {
    res.status(400).json({ error: 'invalid profile' });
    return;
  }
  updateProfile(userId, { nickname, avatar: body.avatar, title: body.title });
  res.json({ ok: true });
});
