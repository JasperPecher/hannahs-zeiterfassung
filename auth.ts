import { createHmac } from 'node:crypto';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { database } from './lib/database';
import { isPasswordHash, verifyPassword } from './lib/password.mjs';

const windowMs = 10 * 60 * 1000;
const attemptLimit = 12;

class RateLimited extends CredentialsSignin {
  code = 'rate_limited';
}

export function authOrigin(): string | null {
  const value = process.env.AUTH_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) && !process.env.VERCEL;
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function ownerCredentials() {
  const secret = process.env.AUTH_SECRET?.trim();
  const username = process.env.ZEITBUCH_USERNAME?.trim();
  const hash = process.env.ZEITBUCH_PASSWORD_HASH;
  if (!secret || secret.length < 32 || !username || username.length > 80 || !isPasswordHash(hash)) return null;

  // Bind every session to the current credentials, so rotating either one revokes old sessions.
  const id = createHmac('sha256', secret).update(JSON.stringify([username, hash])).digest('hex');
  return { id, username, hash };
}

export function isAuthConfigured(): boolean {
  return Boolean(authOrigin() && ownerCredentials());
}

export function isAllowedUser(name?: string | null): boolean {
  return Boolean(name && name === ownerCredentials()?.username);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Credentials({
    credentials: {
      username: { label: 'Benutzername', type: 'text' },
      password: { label: 'Passwort', type: 'password' },
    },
    async authorize(credentials) {
      const owner = ownerCredentials();
      if (!owner || !authOrigin() || typeof credentials.username !== 'string' ||
          typeof credentials.password !== 'string' || credentials.username.length > 80 ||
          !credentials.password || Buffer.byteLength(credentials.password) > 1024) return null;

      const now = Date.now();
      const reserved = await database().execute({
        sql: `INSERT INTO auth_attempts (id, expires_at, attempts) VALUES (1, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END,
            attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END
          WHERE expires_at <= ? OR attempts < ?
          RETURNING id`,
        args: [now + windowMs, now, now, now, attemptLimit],
      });
      if (!reserved.rows.length) throw new RateLimited();

      const correctPassword = await verifyPassword(credentials.password, owner.hash);
      if (!correctPassword || credentials.username.trim() !== owner.username) return null;
      return { id: owner.id, name: owner.username };
    },
  })],
  pages: { signIn: '/anmelden', error: '/anmelden' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    jwt({ token }) {
      const owner = ownerCredentials();
      return owner && token.sub === owner.id ? token : null;
    },
  },
  logger: {
    error(error) {
      console.error('[auth]', error.name);
    },
    warn(code) {
      console.warn('[auth]', code);
    },
  },
});
