# Zeiterfassung

Private Next.js-Anwendung für einen einzelnen freigegebenen Zugang. Die App prüft die Anmeldung beim Öffnen der Oberfläche und vor jedem Lese- und Schreibzugriff auf die Zeiterfassung. Für die Anmeldung genügen Benutzername und Passwort. Der Server speichert einen gesalzenen scrypt-Hash und begrenzt Anmeldeversuche über die gemeinsame Datenbank.

## Auf Vercel einrichten

1. Führe die SQL-Anweisung aus `database/auth.sql` einmal in der bestehenden Turso-Datenbank aus, etwa in der Turso SQL Shell. Die Anweisung legt ausschließlich die Tabelle für Anmeldeversuche an. Vorhandene Mandanten und Zeiten bleiben erhalten.
2. Erzeuge auf einem vertrauenswürdigen Rechner einen Passwort-Hash. Der folgende Befehl fragt das Passwort verdeckt ab. Verwende ein neues, zufällig erzeugtes Passwort mit mindestens 16 Zeichen.

   ```sh
   bash -c 'read -r -s -p "Passwort: " password && printf "\n" >&2 && printf "%s" "$password" | node scripts/hash-password.mjs'
   ```

   Erzeuge außerdem ein unabhängiges Sitzungsgeheimnis mit `openssl rand -base64 33`.
3. Hinterlege diese Variablen in **Vercel → Project Settings → Environment Variables** für **Production**. Lass die Produktionswerte aus Preview-Deployments und aus Git heraus.

   | Variable | Wert |
   | --- | --- |
   | `AUTH_URL` | `https://zeit.example.com` |
   | `ZEITBUCH_TITLE` | Optionaler Anzeigename der Anwendung |
   | `AUTH_SECRET` | Erzeugtes Sitzungsgeheimnis |
   | `ZEITBUCH_USERNAME` | Gewünschter Benutzername |
   | `ZEITBUCH_PASSWORD_HASH` | Vollständige Ausgabe des Hash-Skripts |
   | `TURSO_DATABASE_URL` | Vorhandene verschlüsselte Turso-Verbindungs-URL |
   | `TURSO_AUTH_TOKEN` | Vorhandener Turso-Zugriffstoken |

4. Veröffentliche den neuen Stand. Der Build verbindet sich nicht mit Turso. Ohne vollständige Anmeldungskonfiguration verweigert die Anwendung den Datenzugriff. In der Produktion ist Turso erforderlich.
5. Prüfe in einem privaten Browserfenster, dass die Startseite zur Anmeldung führt und `/api/zeitbuch` ohne Sitzung HTTP 401 liefert. Prüfe dann die Anmeldung und einen Zeiteintrag. Prüfe bei Vercel auch, ob frühere Deployment-URLs mit Zugriff auf dieselbe Datenbank durch Deployment Protection geschützt sind.

Nach zwölf Anmeldeversuchen innerhalb von zehn Minuten blockiert die App weitere Anmeldungen bis zum Ende des Zeitfensters. Das Limit gilt gemeinsam für den einen Zugang; laufende Sitzungen bleiben nutzbar. Die Datenbank speichert dabei nur den Zähler und den Ablaufzeitpunkt. Eine Änderung des Benutzernamens, Passwort-Hashes oder Sitzungsgeheimnisses macht bestehende Sitzungen im neuen Deployment ungültig.

## Lokal entwickeln

1. Führe `npm ci` und `npm run init-db` aus. Ohne Turso-Variablen erstellt das Skript die lokale SQLite-Datenbank unter `data/zeitbuch.sqlite`.
2. Kopiere `.env.example` nach `.env.local`. Verwende dort einen eigenen Benutzernamen, Passwort-Hash und ein separates `AUTH_SECRET`. Lass die Turso-Variablen für die lokale Entwicklung leer.
3. Starte `npm run dev` und öffne `http://127.0.0.1:3000`.

Lokale Umgebungsdateien, Schlüsseldateien, Datenbanken und Sicherungsverzeichnisse werden von Git ignoriert. Prüfe vor einem Commit den gestagten Inhalt. In der Beispielkonfiguration stehen keine Zugangsdaten.

[Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials) · [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
