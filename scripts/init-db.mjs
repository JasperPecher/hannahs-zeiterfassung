import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

async function init() {
  const schema = ['schema.sql', 'auth.sql']
    .map(file => readFileSync(join(process.cwd(), 'database', file), 'utf8')).join('\n');

  if (url) {
    const protocol = new URL(url).protocol;
    if (!['libsql:', 'https:', 'wss:'].includes(protocol) || !authToken) {
      throw new Error('Die Turso-Verbindung ist nicht sicher konfiguriert.');
    }
    const client = createClient({ url, authToken });
    try {
      await client.executeMultiple(schema);
      console.log('Turso-Datenbank erfolgreich initialisiert.');
    } finally {
      client.close();
    }
  } else {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new Error('Für den Produktionsbetrieb muss Turso konfiguriert sein.');
    }
    const rawPath = process.env.DATABASE_PATH ?? './data/zeitbuch.sqlite';
    const filePath = rawPath.replace(/^file:/, '');
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const fileUrl = rawPath.startsWith('file:') ? rawPath : `file:${rawPath}`;
    const client = createClient({ url: fileUrl });
    try {
      await client.executeMultiple(schema);
      console.log('Lokale SQLite-Datenbank erfolgreich initialisiert.');
    } finally {
      client.close();
    }
  }
}

init().catch(() => {
  console.error('Datenbank konnte nicht initialisiert werden. Bitte prüfe die Konfiguration.');
  process.exitCode = 1;
});
