import { createClient, type Client } from '@libsql/client';

let connection: Client | undefined;

export function database(): Client {
  if (connection) return connection;

  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    const protocol = new URL(url).protocol;
    if (!['libsql:', 'https:', 'wss:'].includes(protocol) || !authToken) {
      throw new Error('Die Turso-Verbindung ist nicht sicher konfiguriert.');
    }
    connection = createClient({
      url,
      authToken,
    });
  } else {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new Error('Für den Produktionsbetrieb muss Turso konfiguriert sein.');
    }
    const path = process.env.DATABASE_PATH ?? './data/zeitbuch.sqlite';
    const fileUrl = path.startsWith('file:') ? path : `file:${path}`;
    connection = createClient({
      url: fileUrl,
    });
  }

  return connection;
}
