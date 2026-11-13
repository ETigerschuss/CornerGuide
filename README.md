# Minga Corner Guide 🍻

Applikation um sich mit Freunden im realen Leben zu treffen.

**Gegründet vom Gossips Stammtisch: F · G · A · ÉT**

## 🌐 Live Website

Die Seite wird automatisch über **GitHub Pages** deployed. Nach dem Merge geht sie unter:

```
https://ETigerschuss.github.io/CornerGuide/
```

## ⚡ Features

- 📍 **Corner Guide** — Liste aller Spots in München mit Karte
- 💬 **Kommentare** — Jeder kann pro Spot kommentieren
- 👥 **Freunde-Präsenz** — Sieh in Echtzeit, wer an welchem Corner ist
- 🚨 **Alarm** — Werde benachrichtigt wenn ein Freund an einem Corner ankommt
- 📷 **Fotos** — Lade Bilder zu jedem Spot hoch
- ➕ **Eigene Spots** — Füge neue Corners hinzu
- 🔗 **Share Links** — Teile direkte Corner-Links (`?corner=...`) und Einladungen (`?invite=...`)
- 🧾 **QR-Links** — Erzeuge QR-Codes für Corner-Spots
  - Hinweis: QR-Bilder werden aktuell über `api.qrserver.com` generiert (externer Dienst)
- 🗣️ **Gossip-Runden** — Ab zwei Leuten am selben Corner erzählt eine Person eine Story (aufschreiben und/oder per Mikro einsprechen), die anderen vergeben Punkte → Karma für die Person, die erzählt
- 💤 **Bleibt eingecheckt bei gesperrtem Handy** — wer eingecheckt ist, bleibt für die anderen am Corner sichtbar (mit 💤), auch wenn das Display aus ist
- 📖 **„So sammelst du Punkte"** — vollständige Punkte-Übersicht + 3×3-Reward-Matrix (Level oben antippen oder im Ranking-Tab)
- 📅 **Cornerdate** — Treffen an einem Corner planen: alle bekommen eine Push, können zusagen und es mit Uhrzeit, Ort und Karten-Pin in den Kalender übernehmen (`.ics` für iPhone/Android/Outlook, Link für Google Kalender) oder per WhatsApp teilen
- 🌤️ **Corner-Check** — pro Corner: Sonne heute von–bis (Wettervorhersage + Sonnenstand, Sonnenuntergang, Golden Hour), nächster Kiosk/Späti/Tankstelle mit „offen/zu" und Fußweg-Route, Regen-Plan (überdacht? Unterstände in der Nähe, regenfeste Corners zum Ausweichen) — plus Wetter-Zeile oben in der Liste
- 📲 **WhatsApp** — nach dem Check-in mit einem Tipp die Gruppe informieren (fertige Nachricht), optional automatisch nach jedem Check-in öffnen

## 🌤️ Corner-Check: woher kommen die Daten?

- **Wetter** von [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel): Sonnenstunden, Regenwahrscheinlichkeit, Temperatur — 30 Minuten zwischengespeichert.
- **Sonnenstand** wird lokal berechnet: Sonnenauf-/-untergang, Golden Hour und wann die Sonne hoch genug (über 15°) steht, um zwischen Häusern anzukommen.
- **Kiosk, Späti, Tankstelle, Unterstände** aus [OpenStreetMap](https://www.openstreetmap.org) über die Overpass-API — 3 Tage pro Corner zwischengespeichert. Fehlt ein Kiosk, kann man ihn direkt in OpenStreetMap eintragen.
- **Regenfest?** schätzt die Community ein (☂️ überdacht / 💧 wird nass); markierte Corners schlägt die App bei Regen als Ausweichspot vor.
- Beide Dienste sehen nur die öffentlichen Koordinaten des Corners, keine Nutzerdaten.

## 📲 WhatsApp automatisch?

Ganz automatisch (ohne Tippen) geht es nicht: WhatsApp bietet für private Konten und Gruppen keine Schnittstelle. Die WhatsApp-Business-API erreicht nur
einzelne Nummern mit Einwilligung, kostet pro Unterhaltung und braucht einen Server — für eine Freundesgruppe unpassend. Die App öffnet deshalb WhatsApp mit fertig
geschriebener Nachricht; man wählt Chat oder Gruppe und tippt auf Senden. Für Benachrichtigungen ohne Zutun gibt es die Push-Nachrichten der App.

## 🗣️ Gossip-Runden

1. Mindestens **zwei Personen** sind am selben Corner eingecheckt (Corner-Detail → Abschnitt „Gossip-Runde").
2. Eine Person tippt **„Gossip-Runde starten"**, schreibt die Story auf und/oder spricht sie ein (max. 90 Sek.) und haut sie raus.
   Alle anderen am Corner bekommen einen Hinweis bzw. eine Push-Nachricht.
3. Jede andere Person am Corner vergibt Punkte: 🥱 +2 · 🙂 +5 · 😮 +10 · 🤯 +15 · 💣 +20.
   Die Punkte bleiben geheim, bis **alle bewertet haben** oder die **10 Minuten** um sind (oder die erzählende Person auflöst) — dann wird auf allen Handys gleichzeitig aufgelöst.
4. Die vergebenen Punkte landen als **Karma** bei der Person, die erzählt hat (bis zu 5 Storys pro Tag zählen); wer bewertet, bekommt +2 Aura.

**Privatsphäre:** Story-Text und Aufnahme liegen unter `gossipContent/` und sind laut Datenbank-Regeln nur für die
erzählende Person und Leute lesbar, die **an diesem Corner eingecheckt** sind. Bewerten geht nur von dort, nicht für die
eigene Story und nur, solange die Runde läuft. Runden, Storys, Bewertungen und Aufnahmen werden nach **24 Stunden** gelöscht.

**Deployen** (einmalig — bis dahin blendet die App den Gossip-Bereich einfach aus; er erscheint
automatisch, sobald die Regeln live sind):
```bash
firebase deploy --only database,storage,functions
```
- `database` — Regeln für `gossipRounds`, `gossipContent`, `gossipVotes`, `notifyTargeted`, `cornerDates`
- `storage` — Regel für Sprachaufnahmen unter `gossipAudio/`
- `functions` — `pushOnTargetedNotify` schickt die Gossip-Pushes nur an die Leute am Corner

Ohne Kommandozeile geht der wichtigste Teil auch in der [Firebase Console](https://console.firebase.google.com):
**Realtime Database → Regeln** → Inhalt von `firebase.database.rules.json` einfügen → *Veröffentlichen*, und
**Storage → Rules** → Inhalt von `storage.rules` einfügen → *Publish*. Ohne die Function läuft alles, nur die
Gossip-Pushes an gesperrte Handys fehlen.

## 🤖 Automatisches Firebase-Deployment

Der Workflow `.github/workflows/firebase-deploy.yml` deployt Datenbank-Regeln, Storage-Regeln und Cloud Functions,
sobald sie sich auf `main` ändern — oder per Hand unter **Actions → „Deploy Firebase (Regeln & Functions)" → Run workflow**.
Dafür braucht GitHub **einmalig** einen Zugang zu Firebase (ohne ihn überspringt sich der Workflow nur mit einem Hinweis):

**Variante A — nur im Browser (Service-Account-Schlüssel):**
1. [Firebase Console](https://console.firebase.google.com) → Projekt `cornerguide` → ⚙️ **Projekteinstellungen** → **Dienstkonten** →
   **„Neuen privaten Schlüssel generieren"** → eine JSON-Datei wird heruntergeladen.
2. GitHub → dieses Repository → **Settings → Secrets and variables → Actions → New repository secret**:
   Name `FIREBASE_SERVICE_ACCOUNT`, Wert = kompletter Inhalt der JSON-Datei.
3. Die JSON-Datei danach löschen — sie gibt vollen Admin-Zugriff auf das Projekt.

Datenbank- und Storage-Regeln gehen mit diesem Schlüssel direkt über das Firebase Admin SDK raus (`.github/scripts/deploy-rules.cjs`).
Für die **Cloud Functions** braucht das Konto zusätzlich Google-Cloud-Rechte: [Google Cloud Console → IAM](https://console.cloud.google.com/iam-admin/iam?project=cornerguide)
→ beim Konto `firebase-adminsdk-…@cornerguide.iam.gserviceaccount.com` auf ✏️ → Rollen **Bearbeiter** (Editor) und **Dienstkontonutzer**
(Service Account User) hinzufügen. Fehlen sie, schlägt nur der Functions-Schritt fehl — die Regeln sind trotzdem live.

**Variante B — mit deinem eigenen Login (alle Rechte, inkl. Functions):** auf deinem Rechner `npx firebase-tools login:ci`
ausführen und den angezeigten Token als Secret `FIREBASE_TOKEN` speichern.

## 💤 Handy gesperrt — bin ich noch online?

Eine Web-App kann bei gesperrtem Display nicht weiterlaufen (iOS friert sie komplett ein). Deshalb:
- Wer **eingecheckt** ist, bleibt bis zu **3 Stunden** nach dem letzten Lebenszeichen am Corner sichtbar — mit 💤, solange das Display aus ist.
  (Vorher wurde der Eintrag beim Verbindungsabbruch gelöscht, man verschwand also sofort.)
- Der Check-in übersteht auch einen App-Neustart (iOS beendet gesperrte PWAs oft); ab dem nächsten Tag bzw. nach 10 h wird automatisch ausgecheckt.
- **Push-Nachrichten** (Nachschub, Gossip-Runden) kommen trotzdem an — Push im Profil verbinden, auf dem iPhone als App zum Home-Bildschirm hinzufügen.
- Optional im Profil: **„Display wach halten, solange ich eingecheckt bin"**. Während Gossip-Runden bleibt das Display automatisch an.
- Live-GPS (Auto-Check-in) pausiert bei gesperrtem Handy — dafür bräuchte es eine native App (z. B. Capacitor + Background-Geolocation).

## 🏆 Punkte: Aura, Karma & Reward-Matrix

- ✨ **Aura** = was du tust (einchecken, Leute treffen, Fotos, Kommentare, Gossip erzählen …) — bestimmt dein Level.
- 🎁 **Karma** = was andere dir geben (bestätigter Nachschub: +40 pro Bestätigung, Gossip-Punkte: +2 … +20 pro Bewertung).
- Die **Reward-Matrix** ist ein 3×3-Raster aus Aura-Stufe (Lv. <5 · 5–14 · 15+) und Karma-Stufe (Lv. <2 · 2–5 · 6+),
  von 🌱 Rookie bis 🪩 Matrix Legend. Die App zeigt, wo du stehst und wie viel Aura/Karma bis zum nächsten Feld fehlt.
- Die komplette Liste aller Punkte-Quellen steht in der App unter **„📖 So sammelst du Punkte"**.

## 🔧 Firebase Setup (für Echtzeit-Features)

Damit Kommentare und Freunde-Standorte zwischen allen Nutzern synchronisiert werden, brauchst du ein Firebase-Projekt:

1. Geh zu [Firebase Console](https://console.firebase.google.com)
2. Öffne das Projekt `cornerguide` (oder erstelle ein neues)
3. Prüfe **Realtime Database** (Region: `europe-west1`) und aktiviere sie
4. Aktiviere unter **Authentication → Sign-in method** mindestens **Anonymous**
5. Veröffentliche die Regeln aus `firebase.database.rules.json`. **Wichtig:** Diese Regeln
   sperren den früher offenen `".read": true`-Zugriff. Jetzt können nur Nutzer mit gültigem
   Access-Code die geteilten Daten lesen; Direktnachrichten, Push-Tokens und Profile sind
   pro Owner privat. Deployen mit:
   ```bash
   firebase deploy --only database
   ```
6. Geh zu Projekteinstellungen → Web-App und übernimm die Config in `index.html`

### Firebase reaktivieren (wenn „down“)

1. Firebase Console öffnen → `cornerguide` → **Realtime Database**
2. Prüfen, ob die DB pausiert/deaktiviert ist, dann wieder aktivieren
3. Rules veröffentlichen (`auth != null` für Writes)
4. Danach alle bitten, ihre während des Ausfalls erstellten Corner erneut einzutragen (lokal gespeicherte Einträge werden nicht automatisch synchronisiert)

### Ohne Firebase

Die App funktioniert auch ohne Firebase — dann werden Kommentare und Spots lokal im Browser gespeichert (nur du siehst sie). Die Freunde-Funktion ist dann deaktiviert.

## 📱 GitHub Pages aktivieren

1. Geh zu **Settings** → **Pages** in deinem Repository
2. Unter "Build and deployment" wähle **GitHub Actions**
3. Der Workflow deployed automatisch bei jedem Push auf `main`

## 🛠 Entwicklung

Das Projekt ist eine einzelne `index.html` — kein Build-Tool nötig. Einfach öffnen oder mit einem lokalen Server starten:

```bash
npx serve .
```

## 🔔 Push-Nachrichten (komplett aktivieren)

Push braucht **zwei** Dinge, die beide vorhanden sein müssen — sonst passiert nichts:

1. **VAPID Web-Push-Key** (damit der Browser ein Token bekommt)
   - Firebase Console → Project Settings → **Cloud Messaging → Web Push certificates → „Generate key pair"**
   - Den *öffentlichen* Key in der Datenbank unter `config/vapidKey` als String eintragen.
     Die App lädt ihn beim Start automatisch von dort.

2. **Ein Sender** (ein Browser darf aus Sicherheitsgründen keine Pushes verschicken).
   Die Cloud Function in `functions/index.js` übernimmt das: sie lauscht auf neue
   Direktnachrichten unter `messages/{uid}` und schickt eine Push an das gespeicherte
   Token des Empfängers.
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
   > Cloud Functions brauchen den **Blaze-Plan** (kostenlos bis zu großzügigen Limits,
   > aber eine Kreditkarte muss hinterlegt sein).

Ohne (2) landen Nachrichten nur in der DB und werden erst sichtbar, wenn die App offen ist.

## 🔐 Konto & Profil-Portabilität

Nutzer starten weiterhin **anonym**. Im Profil-Tab (und direkt im Zugangs-Screen) können sie ihr
Profil jetzt sichern und auf jedem Browser/Gerät übernehmen — ohne Neu-Registrierung:

- **Recovery-Code** — einen Code erzeugen, auf dem neuen Gerät eingeben. Der Code stellt Profil
  *und* Zugang in einem Schritt wieder her (anonym, kein Konto nötig).
- **Mit Google / E-Mail sichern** — verknüpft den anonymen Account mit einem festen Login
  (Firebase `linkWithPopup` / E-Mail-Link). Die UID und damit das Profil bleiben erhalten;
  auf neuen Geräten reicht der gleiche Login.

Voraussetzung: unter **Authentication → Sign-in method** zusätzlich **Google** und
**E-Mail-Link (passwortlos)** aktivieren, und die Domain (`ETigerschuss.github.io`) unter den
autorisierten Domains eintragen. Profile werden in der DB unter `userProfiles/{uid}` gespiegelt.

### Empfohlener Weg für bestehende Nutzer (neues Gerät / neue Version)

1. **Einladungscode eingeben** — direkt danach fragt die App: „Warst du schon mal dabei?"
2. **Dein altes Profil antippen** („Das war ich") — Punkte, Level, Achievements und besuchte
   Corners werden übernommen
3. **„🔗 Mit Google sichern"** — ab jetzt ist das Profil an den Login gebunden und auf
   jedem Gerät verfügbar. Das ist der sicherste Weg.

## 📷 Corner-Fotos (Firebase Storage)

Fotos werden als Dateien in **Firebase Storage** abgelegt (nur die URL landet in der
Datenbank, das hält die Realtime DB schlank). Einmalig einrichten:

1. Firebase Console → **Storage** → aktivieren (Region passend wählen)
2. Storage-Regeln deployen (Datei `storage.rules`):
   ```bash
   firebase deploy --only storage
   ```
   Regel: jeder darf Fotos ansehen, nur eingeloggte Nutzer dürfen Bilder < 5 MB hochladen.

Fällt Storage aus, speichert die App das Bild als Fallback inline (Base64) in der DB.

## 📲 PWA / App Stores

- **PWA** ist integriert über `manifest.webmanifest` + `service-worker.js`
- **App Store / Play Store**: Das Webprojekt kann mit Capacitor als Native Shell verpackt werden

Beispiel-Start:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "Minga Corner Guide" "com.cornerguide.app"
```

Danach Web-Assets einbinden und iOS/Android Projekte per `npx cap add ios` / `npx cap add android` erzeugen.
