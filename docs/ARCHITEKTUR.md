# Architektur & Weg zu tausenden Nutzern

Stand: November 2026. Kurz: Für eine Freundesgruppe ist die App gut aufgestellt. Für **tausende** Leute braucht es vor
allem einen anderen Umgang mit den **Daten** und der **Identität**; die Aufteilung des Codes war nur der erste Schritt.

## Wie die App heute gebaut ist

| Teil | Heute |
|---|---|
| Frontend | Eine ausgelieferte `index.html` (~720 KB, gzip ein Bruchteil davon), Quellcode nach Bereichen in `src/` (14 CSS-, 34 JS-Dateien), Vanilla JS + Leaflet, PWA mit einem Service Worker (Cache + Push), Auto-Update beim Zurückkehren in die App |
| Backend | Firebase: Realtime Database, anonyme Anmeldung, Storage (Fotos), Cloud Functions (Push-Verteilung) |
| Deploy | GitHub Actions: Pages (Build-Prüfung → Build-Nummer → Upload → Deploy), Firebase-Regeln & Functions bei Änderung |
| Zugang | Ein gemeinsamer Einladungscode |
| Identität | Anonymer Login pro Browser; „Wer bist du?“ verknüpft Logins mit einem Profil (`points/<login>.aliasOf`) — ohne Nachweis |
| Sichtbarkeit | Alle sehen alles (Standort, Check-ins, Corners); neu: enge Freunde, private Corners und geheime Dates, serverseitig geschützt |
| Externe Daten | OpenStreetMap/Overpass (Spot-Check, Kiosk & Co.), Open-Meteo (Wetter) — Ergebnisse werden zwischengespeichert bzw. geteilt (`cornerFacts`) |
| Tests | Playwright gegen Firebase-Emulatoren, 16 Testreihen in `tests/e2e/` |

## Was bei tausenden Nutzern bricht

1. **Jedes Handy lädt ganze Datenbank-Knoten.** `points` (mit bis zu 200 Verlaufseinträgen pro Person), `presence`,
   `visits` (alle Check-ins aller Zeiten), `comments`, `photos`, `emojiVotes`, `captured`, `encounters` … werden beim Start
   komplett geladen. Bei 5.000 Leuten wären das allein für `points` grob 5.000 × 200 × 80 Byte ≈ 80 MB pro App-Start.
   Das ist langsam, frisst Akku und kostet Geld (die Realtime Database rechnet Downloads pro GB ab).
2. **Ranking und Level rechnet das Handy** aus allen Punkten aller Leute.
3. **Punkte schreibt jedes Handy selbst.** Die Regeln erlauben Mitgliedern, Punkte zu schreiben — unter Freunden okay, bei
   Fremden ist Schummeln trivial.
4. **Push an alle:** Pro Ereignis liest die Cloud Function alle Push-Tokens und Einstellungen. Bei tausenden Tokens ist
   das teuer und langsam, und „alle“ ist bei Fremden auch inhaltlich falsch.
5. **Ein Code für alle:** Wer den Code hat, ist drin — weitergeben lässt sich nicht kontrollieren, sperren auch nicht.
6. **Identität ohne Nachweis:** Wer bei „Wer bist du?“ einen Namen antippt, *ist* diese Person — inklusive deren privater
   Corners. Unter Freunden bewusst so gewählt („vorerst so lassen“), mit Fremden nicht haltbar.
7. **Alle sehen alle Standorte:** Bei Fremden ein Datenschutzproblem (DSGVO): Einwilligung, Speicherdauer, Export,
   Löschen, Datenschutzerklärung.
8. **Moderation fehlt:** Fotos, Kommentare, Gossip und Spots von Fremden brauchen Melden, Sperren, Admin-Werkzeuge.
9. **Öffentliche Overpass-Server** haben Nutzungsgrenzen. Geteilte Ergebnisse (`cornerFacts`) helfen; bei vielen Nutzern
   braucht es einen eigenen Cache/Proxy oder vorberechnete Daten.

## Fahrplan

### Phase 0 — erledigt
- Quellcode nach Bereichen in `src/`, Build ohne Abhängigkeiten (`tools/build.mjs`), Prüfung in CI und vor jedem Deploy
- Auto-Update installierter Apps, ein gemeinsamer Service Worker für Cache und Push
- Geteilte Corner-Fakten, enge Freunde, private Corners, geheime Dates (serverseitig geschützt)
- Ende-zu-Ende-Tests im Repo (`tests/e2e/`), in GitHub per Knopfdruck (Workflow „E2E-Tests“)

### Phase 1 — Daten schlank machen (ab ~100 aktiven Nutzern nötig)
- `points` nur noch Summe + Name; Verlauf nach `pointsHistory/<login>` (lädt nur das eigene Profil)
- Ranking als `leaderboard/` (Top 100 + eigener Rang), gepflegt von einer Cloud Function
- `visits` pro Corner begrenzen (z. B. die letzten 50) und `visitsByUser/<login>` für den eigenen Verlauf
- Presence abfragen statt komplett laden (`orderByChild("lastSeen")` ab „vor 2 Stunden“), Aufräumen per `onDisconnect`
- Profile anderer erst beim Öffnen laden, Kommentare/Fotos pro Corner erst in der Detailansicht

### Phase 2 — Vertrauen & Sicherheit (bevor Fremde dazukommen)
- Echte Anmeldung (Google/Apple/E-Mail-Link) oder Bestätigung neuer Geräte auf einem eigenen Gerät
- Persönliche Einladungslinks statt eines Codes (mit Limit, nachvollziehbar, sperrbar)
- Punkte nur noch serverseitig (Cloud Functions prüfen Check-in-Abstand, Cooldown, Tageslimits)
- Kontakte (gegenseitig) und Sichtbarkeit des Standorts: alle / Kontakte / enge Freunde / niemand
- Blockieren & Melden, Moderations-Ansicht für Admins
- DSGVO: Datenschutzerklärung, Konto exportieren und löschen, Standortverlauf mit Ablaufdatum

### Phase 3 — Wachstum
- Daten nach Stadt/Region aufteilen (`corners/<stadt>/…`), Karte lädt nur den sichtbaren Ausschnitt (Geohash-Abfragen)
- Push über FCM-Themen bzw. an Kontakte statt an alle
- Code: ES-Module + Bundler (z. B. Vite), Chat/Gossip/Karten erst bei Bedarf laden, schrittweise TypeScript
- E2E-Tests automatisch in CI, Fehler-Logging, Firebase-Budgetalarm, Nutzungsstatistik
- Wo komplexe Abfragen nötig werden, Firestore ergänzen; die Realtime Database bleibt für Live-Präsenz

## Leitlinien für neue Features schon jetzt
- Nichts Neues, das jedes Handy komplett lädt: Daten pro Corner, pro Person oder pro Stadt ablegen.
- Was andere nicht sehen sollen, gehört in einen eigenen Knoten mit Leserechten — nie nur in der App ausblenden.
- Punkte, die anderen gutgeschrieben werden, perspektivisch über Cloud Functions.
- Neue Funktionen mit einer Testreihe in `tests/e2e/` absichern.
