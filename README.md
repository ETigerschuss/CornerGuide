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
