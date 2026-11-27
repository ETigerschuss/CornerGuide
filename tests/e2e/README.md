# Ende-zu-Ende-Tests

Die echte App (`index.html`) läuft in Chromium (Playwright) gegen die **Firebase-Emulatoren** — Datenbank, Anmeldung,
Storage und die **Cloud Functions** (sie pflegen die schlanken Kopien, die die App beim Start liest). Mehrere Personen
gleichzeitig, jede mit eigenem Browser-Kontext. Nichts davon berührt die echte Datenbank.

## Einmal einrichten

Voraussetzungen: Node 20+, Java 11+ (für die Emulatoren).

```bash
cd tests/e2e
npm install
npm ci --prefix ../../functions   # Pakete der Cloud Functions
npx playwright install chromium
```

`npm install` holt auch eine lokale Kopie des Firebase-SDKs und von Leaflet: Der Test-Server liefert sie statt der CDNs
aus und verbindet die App mit den Emulatoren (siehe `lib.js`).

## Laufen lassen

```bash
npm run emulators          # in einem eigenen Terminal, läuft weiter
npm test                   # alle Testreihen nacheinander (~7 Minuten)
node run-all.mjs circles   # nur eine Testreihe
```

`npm run emulators` kopiert vorher die aktuellen Regeln (`firebase.database.rules.json`, `storage.rules`) und die Cloud
Functions (nach `.functions/`) aus dem Hauptordner hierher — die Firebase-CLI liest nur Dateien im eigenen Ordner. In der
Kopie laufen die Functions in `us-central1` (nur dort feuert der Emulator Datenbank-Trigger) und mit ausdrücklich
genannter Datenbank. Nach einer Änderung an Regeln oder Functions die Emulatoren neu starten.

Fehlersuche: `E2E_STACKS=1 node identity.js` zeigt bei Seitenfehlern den ganzen Stacktrace, `E2E_ECHO=Text` gibt
Konsolenzeilen der Seiten aus, die `Text` enthalten.

Screenshots landen in `shots/`.

In GitHub laufen dieselben Tests unter **Actions → E2E-Tests → Run workflow** (Screenshots und Emulator-Log als
Artefakt). Bei jedem Pull Request laufen außerdem die schnellen Prüfungen (`tools/check.mjs`).

## Die Testreihen

| Datei | Prüft |
|---|---|
| `identity.js` | „Wer bist du?“, ein Profil auf mehreren Geräten, Neu-Öffnen ohne Fragen, Zugang reparieren, Google-Login bleibt nach dem Neuladen |
| `invites.js` | Einladungslinks: in allen geteilten Links (nicht auf Stickern), ein Tipp rein ohne Code-Abfrage, Karma (3× am Tag, Function), Push öffnet Profil + Kompliment, Mitglieder behalten ihren Zugang, „Neuer Link“ sperrt den alten, Admin-Liste und Sperren, Regeln gegen gefälschte Einladungen, Zähler und Beitritte |
| `links.js` | Links aus WhatsApp: Corner-Check-in, Cornerdate-Zusage, neue Geräte, Punkte |
| `spot.js` | Neuer Corner nur durch Tippen, Emojis aus OpenStreetMap, Regeln (KCanG, München, Ausland) |
| `facts.js` | Emojis, Filter und geteilte Fakten für bestehende Corners |
| `circles.js` | Enge Freunde, private Corners, geheime Cornerdates — serverseitig geschützt |
| `slim.js` | Phase 1: Start nur mit schlanken Kopien, Fotos/Check-ins erst in der Ansicht, Uploads mit und ohne Storage, Presence-Fenster, Rückfall auf die alten Knoten, einmalige Übernahme (`phase1-backfill`) |
| `compliments.js` | Komplimente: Vorlagen und eigene Worte, Karma/Aura, einmal pro Person und Tag (Server), Danke, Push, Profile |
| `update.js` | Auto-Update installierter Apps, Service Worker |
| `districts.js` | Stadtbezirke, Pin setzen |
| `social.js`, `join.js`, `pmap.js`, `cimap.js`, `quickwins.js`, `e2e.js`, `features.js`, `regress.js`, `guide.js` | Präsenz, Folge-mir-Links, Profilkarte, Corner-Info-Karte, Gossip, Cornerdates, Punkte und vieles mehr |

Neue Funktionen bekommen eine eigene Testreihe oder erweitern eine bestehende.
