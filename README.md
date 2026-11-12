# Zeiterfassung

Private Next.js-Anwendung für einen einzelnen freigegebenen Zugang. Die App prüft die Anmeldung beim Öffnen der Oberfläche und vor jedem Lese- und Schreibzugriff auf die Zeiterfassung. Für die Anmeldung genügen Benutzername und Passwort. Der Server speichert einen gesalzenen scrypt-Hash und begrenzt Anmeldeversuche über die gemeinsame PostgreSQL-Datenbank (via Prisma).

## Auf Vercel einrichten

1. Initialisiere die PostgreSQL-Datenbank mit `npx prisma db push`.
2. .env Variablen befüllen
   1. AUTH_SECRET befüllen mit
   2. ZEITBUCH_USERNAME eingeben
   3. ZEITBUCH_PASSWORT_HASH befüllen mit

   ```sh
   bash -c 'read -r -s -p "Passwort: " password && printf "\n" >&2 && printf "%s" "$password" | node scripts/hash-password.mjs'
   ```

   | Variable                 | Wert                                              |
   | ------------------------ | ------------------------------------------------- |
   | `AUTH_URL`               | `https://zeit.example.com`                        |
   | `ZEITBUCH_TITLE`         | Optionaler Anzeigename der Anwendung              |
   | `AUTH_SECRET`            | Erzeugtes Sitzungsgeheimnis                       |
   | `ZEITBUCH_USERNAME`      | Gewünschter Benutzername                          |
   | `ZEITBUCH_PASSWORD_HASH` | Vollständige Ausgabe des Hash-Skripts             |
   | `DATABASE_URL`           | PostgreSQL-Verbindungs-URL (z. B. Neon, Supabase) |
   | `DATABASE_URL_UNPOOLED`  | Optionale direkte Verbindungs-URL ohne Pooler     |

3. Veröffentliche den neuen Stand.
4. Prüfe in einem privaten Browserfenster, dass die Startseite zur Anmeldung führt und `/api/zeitbuch` ohne Sitzung HTTP 401 liefert. Prüfe dann die Anmeldung und einen Zeiteintrag.

Nach zwölf Anmeldeversuchen innerhalb von zehn Minuten blockiert die App weitere Anmeldungen bis zum Ende des Zeitfensters. Das Limit gilt gemeinsam für den einen Zugang; laufende Sitzungen bleiben nutzbar. Die Datenbank speichert dabei nur den Zähler und den Ablaufzeitpunkt. Eine Änderung des Benutzernamens, Passwort-Hashes oder Sitzungsgeheimnisses macht bestehende Sitzungen im neuen Deployment ungültig.

## Lokal entwickeln

1. Führe `npm install` und `npx prisma db push` aus.
2. Kopiere `.env.example` nach `.env.local` und trage deine `DATABASE_URL` sowie Anmeldedaten ein.
3. Starte `npm run dev` und öffne `http://127.0.0.1:3000`.
