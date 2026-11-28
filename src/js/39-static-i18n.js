/* ====================== SPRACHE: SEITE, LOGO & FLAGGE ======================
   The page (src/body.html) is written in German. Its texts and a few
   attributes are swapped once at the start for English or Spanish (a
   language switch reloads the app, see setLang). Texts the app writes itself
   go through T().
   Title page: the Corner logo opens your own profile with your stats; the
   🏳️‍🌈 flag opens the language menu right below it — the same choice as in
   the profile settings.                                                     */
var STATIC_I18N = {
  "Monaco di Baviera · Munich · München": ["Monaco di Baviera · Munich · München", "Monaco di Baviera · Munich · München · Múnich"],
  "vom": ["by the", "de la tertulia"],
  "Stammtisch": ["regulars' table", ""],
  "Karte": ["Map", "Mapa"],
  "Liste": ["List", "Lista"],
  "👤 Profil": ["👤 Profile", "👤 Perfil"],
  "Verfügbarkeit ändern": ["Change availability", "Cambiar disponibilidad"],
  "Nachschub-Ruf an alle": ["Supply call to everyone", "Pedir provisiones a todos"],
  "🆘 Nachschub": ["🆘 Supplies", "🆘 Provisiones"],
  "Freunde einladen": ["Invite friends", "Invitar amigos"],
  "📨 Einladen": ["📨 Invite", "📨 Invitar"],
  "✏️ Ändern": ["✏️ Change", "✏️ Cambiar"],
  "🍻 Freunde unterwegs": ["🍻 Friends out there", "🍻 Amigos por ahí"],
  "Spots gesamt": ["spots in total", "spots en total"],
  "Stadtbezirk": ["District", "Distrito"],
  "📍 Standort an": ["📍 Turn location on", "📍 Activar ubicación"],
  "Standort aus": ["Location off", "Ubicación desactivada"],
  "Filter": ["Filter", "Filtro"],
  "🏙️ Bezirke an": ["🏙️ Districts on", "🏙️ Distritos sí"],
  "📖 So sammelst du Punkte": ["📖 How to earn points", "📖 Cómo ganar puntos"],
  "Basiert auf der Maps-Liste": ["Based on the Maps list", "Basado en la lista de Maps"],
  "von Florencia Porta": ["by Florencia Porta", "de Florencia Porta"],
  "Gegründet vom Gossips Stammtisch:": ["Founded by the Gossips regulars' table:", "Fundado por la tertulia Gossips:"],
  "Repo: CornerGuide · Alpha v0.7 · Echtzeit-Features powered by Firebase · 🏆 Gamification aktiv": ["Repo: CornerGuide · Alpha v0.7 · Real-time features powered by Firebase · 🏆 Gamification on", "Repo: CornerGuide · Alpha v0.7 · Funciones en tiempo real con Firebase · 🏆 Gamificación activa"],
  "Chats öffnen": ["Open chats", "Abrir chats"],
  "Spot hinzufügen": ["Add spot", "Añadir spot"],
  "Zurück": ["Back", "Atrás"],
  "Schließen": ["Close", "Cerrar"],
  "Nachricht schreiben…": ["Write a message…", "Escribe un mensaje…"],
  "Senden": ["Send", "Enviar"],
  "Neuer Spot": ["New spot", "Spot nuevo"],
  "Tippen genügt: Standort, Stadtteil und was es dort gibt, erkennt die App selbst — alle sehen ihn sofort auf Karte und Liste.": ["Just tap: the app works out the location, neighbourhood and what's there by itself — everyone sees it right away on the map and list.", "Basta con tocar: la app detecta sola la ubicación, el barrio y lo que hay — todos lo ven al instante en el mapa y la lista."],
  "Ort": ["Place", "Lugar"],
  "Name": ["Name", "Nombre"],
  "z.B. Au-Brücke": ["e.g. Au-Brücke", "p. ej. Au-Brücke"],
  "Was gibt's hier?": ["What's here?", "¿Qué hay aquí?"],
  "Wer sieht den Spot?": ["Who sees the spot?", "¿Quién ve el spot?"],
  "Mehr: Beschreibung, Stadtteil, Tags, Koordinaten": ["More: description, neighbourhood, tags, coordinates", "Más: descripción, barrio, etiquetas, coordenadas"],
  "Beschreibung": ["Description", "Descripción"],
  "Wie ist der Spot? Was macht ihn aus? (optional)": ["What's the spot like? What makes it special? (optional)", "¿Cómo es el spot? ¿Qué lo hace especial? (opcional)"],
  "Stadtteil": ["Neighbourhood", "Barrio"],
  "z.B. Au-Haidhausen": ["e.g. Au-Haidhausen", "p. ej. Au-Haidhausen"],
  "Tags (Komma-getrennt)": ["Tags (comma-separated)", "Etiquetas (separadas por comas)"],
  "Sunset, ruhig": ["Sunset, quiet", "Atardecer, tranquilo"],
  "Latitude": ["Latitude", "Latitud"],
  "Longitude": ["Longitude", "Longitud"],
  "📍 Aktuellen Standort verwenden": ["📍 Use current location", "📍 Usar ubicación actual"],
  "Abbrechen": ["Cancel", "Cancelar"],
  "Speichern": ["Save", "Guardar"],
  "🗣️ Gossip-Runde": ["🗣️ Gossip round", "🗣️ Ronda de gossip"],
  "Schlagzeile für eure Chronik (optional)": ["Headline for your chronicle (optional)", "Titular para la crónica (opcional)"],
  "z. B. Die Sache mit dem Hausboot": ["e.g. The houseboat thing", "p. ej. Lo del barco"],
  "Deine Story": ["Your story", "Tu historia"],
  "Was ist passiert? Wer, wo, wann … 👀": ["What happened? Who, where, when … 👀", "¿Qué pasó? Quién, dónde, cuándo … 👀"],
  "🎙️ Einsprechen": ["🎙️ Record", "🎙️ Grabar"],
  "Aufnahme löschen": ["Delete recording", "Borrar grabación"],
  "🚀 Raushauen": ["🚀 Spill it", "🚀 Suéltalo"],
  "Tag": ["Day", "Día"],
  "Uhrzeit": ["Time", "Hora"],
  "Dauer": ["Duration", "Duración"],
  "Notiz (optional)": ["Note (optional)", "Nota (opcional)"],
  "🤫 Geheim — nur deine engen Freunde sehen es (halbe Punkte)": ["🤫 Secret — only your close friends see it (half the points)", "🤫 Secreto — solo lo ven tus amigos cercanos (la mitad de puntos)"],
  "Alle in der App benachrichtigen": ["Notify everyone in the app", "Avisar a todos en la app"],
  "📅 Planen": ["📅 Plan it", "📅 Planear"],
  "Alles klar": ["Got it", "Entendido"],
  "⬇️ Herunterladen": ["⬇️ Download", "⬇️ Descargar"],
  "🎉 Erster Besuch!": ["🎉 First visit!", "🎉 ¡Primera visita!"],
  "Wie war deine Erfahrung? Bewerte den Corner und beschreib deine Highlights!": ["How was it? Rate the corner and describe your highlights!", "¿Qué tal? ¡Valora el corner y cuenta lo mejor!"],
  "🏪 Kiosk in der Nähe?": ["🏪 Kiosk nearby?", "🏪 ¿Quiosco cerca?"],
  "Ja": ["Yes", "Sí"],
  "Nein": ["No", "No"],
  "🚻 Toilette": ["🚻 Toilet", "🚻 Baño"],
  "Direkt am Corner": ["Right at the corner", "Justo en el corner"],
  "In der Nähe": ["Nearby", "Cerca"],
  "Weit weg": ["Far away", "Lejos"],
  "Keine": ["None", "Ninguno"],
  "🌿 Grün / Natur?": ["🌿 Green / nature?", "🌿 ¿Verde / naturaleza?"],
  "Sehr grün": ["Very green", "Muy verde"],
  "Etwas": ["Some", "Algo"],
  "Urban": ["Urban", "Urbano"],
  "🚶 Wie viel los?": ["🚶 How busy?", "🚶 ¿Cuánta gente?"],
  "Ruhig": ["Quiet", "Tranquilo"],
  "Viel los": ["Busy", "Mucha gente"],
  "Deine Highlights... Was macht diesen Corner aus?": ["Your highlights... What makes this corner special?", "Lo mejor... ¿Qué hace especial este corner?"],
  "Überspringen": ["Skip", "Saltar"],
  "✓ Speichern": ["✓ Save", "✓ Guardar"],
  "🔒 Zugang": ["🔒 Access", "🔒 Acceso"],
  "Gib den Einladungscode ein, um Zugang zu erhalten.": ["Enter the invite code to get access.", "Introduce el código de invitación para entrar."],
  "Bestätigen": ["Confirm", "Confirmar"],
  "Schon mal dabei gewesen? Übernimm dein Profil ohne neuen Code:": ["Been here before? Take over your profile without a new code:", "¿Ya estuviste antes? Recupera tu perfil sin código nuevo:"],
  "📥 Recovery-Code eingeben": ["📥 Enter recovery code", "📥 Introducir código de recuperación"],
  "🔗 Mit Google anmelden": ["🔗 Sign in with Google", "🔗 Entrar con Google"],
  "👥 Profil wählen": ["👥 Pick your profile", "👥 Elige tu perfil"],
  "Tipp auf deinen Namen — Punkte, Level, Team und Corners sind sofort wieder da.": ["Tap your name — points, level, team and corners are back right away.", "Toca tu nombre — puntos, nivel, equipo y corners vuelven al instante."],
  "✨ Neu hier?": ["✨ New here?", "✨ ¿Nuevo aquí?"],
  "Dein Name": ["Your name", "Tu nombre"],
  "Los geht's 🍻": ["Let's go 🍻", "¡Vamos! 🍻"],
  "👋 Schon dabei? Tipp auf deinen Namen": ["👋 Already in? Tap your name", "👋 ¿Ya estás dentro? Toca tu nombre"],
  "💬 Foto-Kommentare": ["💬 Photo comments", "💬 Comentarios de la foto"],
  "Kommentar schreiben…": ["Write a comment…", "Escribe un comentario…"],
  "💐 Kompliment": ["💐 Compliment", "💐 Cumplido"],
  "💐 Senden": ["💐 Send", "💐 Enviar"],
  "🧾 QR-Codes": ["🧾 QR codes", "🧾 Códigos QR"],
  "🧬 Für welches Team?": ["🧬 Which team?", "🧬 ¿Para qué equipo?"],
  "Dein Team färbt deinen Check-in, die Karte und das Team-Ranking.": ["Your team colours your check-in, the map and the team ranking.", "Tu equipo da color a tu check-in, al mapa y al ranking de equipos."],
  "Schon hier — gleiches Team wählen?": ["Already here — pick the same team?", "Ya están aquí — ¿elegir el mismo equipo?"],
  "📲 WhatsApp-Gruppe Bescheid geben": ["📲 Tell the WhatsApp group", "📲 Avisar al grupo de WhatsApp"],
  "Fertig": ["Done", "Listo"],
  "👯 Enge Freunde": ["👯 Close friends", "👯 Amigos cercanos"],
  "Tipp an, wer deine privaten Corners und geheimen Cornerdates sehen darf. Nur du siehst diese Liste.": ["Tap who may see your private corners and secret cornerdates. Only you see this list.", "Toca quién puede ver tus corners privados y cornerdates secretos. Solo tú ves esta lista."],
  "Namen suchen…": ["Search name…", "Buscar nombre…"],
  "✏️ Spot bearbeiten": ["✏️ Edit spot", "✏️ Editar spot"],
  "Kiosk, Sunset, ruhig": ["Kiosk, sunset, quiet", "Quiosco, atardecer, tranquilo"],
  "🗑️ Löschen": ["🗑️ Delete", "🗑️ Borrar"],
  "🚩 Melden": ["🚩 Report", "🚩 Reportar"],
  "Was ist passiert? (freiwillig)": ["What happened? (optional)", "¿Qué pasó? (opcional)"],
  "Auch blockieren": ["Block too", "Bloquear también"],
  "Geht nur an die Admins — die Person erfährt nicht, wer gemeldet hat.": ["Only goes to the admins — the person isn't told who reported.", "Solo llega a los admins — la persona no sabe quién reportó."],
  "Dein Status": ["Your status", "Tu estado"],
  "Deine Freunde sehen diesen Status in der Freunde-Leiste.": ["Your friends see this status in the friends bar.", "Tus amigos ven este estado en la barra de amigos."],
  "➕ Eigenes Team": ["➕ Your own team", "➕ Equipo propio"],
  "Team-Name": ["Team name", "Nombre del equipo"],
  "Emoji (z.B. 🦊)": ["Emoji (e.g. 🦊)", "Emoji (p. ej. 🦊)"],
  "Farbe wählen": ["Pick a colour", "Elige un color"],
  "Erstellen": ["Create", "Crear"],
  "Wer bist du?": ["Who are you?", "¿Quién eres?"],
  "Gib deinen Namen ein, damit deine Freunde dich sehen.": ["Enter your name so your friends can see you.", "Escribe tu nombre para que tus amigos te vean."],
  "heißt: Drinks holen und draußen genießen (explizit nicht in der Bar), mentale Gesundheit stärken und soziale Kontakte pflegen sowie neue Leute kennenlernen.": ["means: grabbing drinks and enjoying the outdoors (explicitly not in a bar), boosting mental health, keeping in touch and meeting new people.", "significa: comprar algo de beber y disfrutar al aire libre (explícitamente no en un bar), cuidar la salud mental, mantener el contacto y conocer gente nueva."]
};
const STATIC_I18N_ATTRS = ["placeholder", "title", "aria-label"];
var _staticTexts = null;     // [{ node, text, lead, trail }] and [{ el, attr, text }] from the start

function applyStaticTexts() {
  const idx = STATE.lang === "en" ? 0 : STATE.lang === "es" ? 1 : -1;
  document.documentElement.lang = STATE.lang;
  if (!_staticTexts) {
    _staticTexts = { nodes: [], attrs: [] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest("script,style,svg")) continue;
      const raw = n.nodeValue;
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text || !STATIC_I18N[text]) continue;
      _staticTexts.nodes.push({ node: n, text, lead: raw.match(/^\s*/)[0], trail: raw.match(/\s*$/)[0] });
    }
    document.body.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
      STATIC_I18N_ATTRS.forEach((attr) => {
        const text = el.getAttribute(attr);
        if (text && STATIC_I18N[text]) _staticTexts.attrs.push({ el, attr, text });
      });
    });
  }
  _staticTexts.nodes.forEach(({ node, text, lead, trail }) => {
    node.nodeValue = lead + (idx < 0 ? text : STATIC_I18N[text][idx]) + trail;
  });
  _staticTexts.attrs.forEach(({ el, attr, text }) => {
    el.setAttribute(attr, idx < 0 ? text : STATIC_I18N[text][idx]);
  });
  renderHeroLangButton();
}

// After a language switch the app reopens the view it came from.
function reopenViewAfterLangSwitch() {
  let view = "";
  try { view = sessionStorage.getItem("cg.reopenView") || ""; sessionStorage.removeItem("cg.reopenView"); } catch (e) { return; }
  if (view && view !== "map") $(`.tab[data-view="${view}"]`)?.click();
}

/* ---------- title page: logo → my profile, flag → language ---------- */
function openOwnProfile() {
  closeHeroLangMenu();
  $('.tab[data-view="profile"]')?.click();
  // The profile (name, level, aura/karma streams) right below the tabs.
  requestAnimationFrame(() => {
    const view = $("#view-profile");
    const tabs = $(".tabs-bar");
    if (!view) return;
    const top = view.getBoundingClientRect().top + window.scrollY - (tabs ? tabs.offsetHeight : 0) - 6;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });
}

function renderHeroLangButton() {
  const btn = $("#hero-flag-btn");
  if (!btn) return;
  const code = $("#hero-lang-code");
  if (code) code.textContent = `${STATE.lang.toUpperCase()} ▾`;
  btn.setAttribute("aria-label", T("Sprache wählen", "Choose language", "Elegir idioma"));
  btn.title = `${T("Alle willkommen – offen für alle", "Everyone welcome – open to all", "Todos bienvenidos – abierto a todos")} · ${T("Sprache wählen", "Choose language", "Elegir idioma")}`;
  const logo = $("#hero-logo-btn");
  if (logo) logo.setAttribute("aria-label", T("Dein Profil", "Your profile", "Tu perfil"));
}

function openHeroLangMenu() {
  const btn = $("#hero-flag-btn");
  const menu = $("#hero-lang-menu");
  if (!btn || !menu) return;
  menu.innerHTML = `<div class="lang-head">🌐 ${T("Sprache", "Language", "Idioma")}</div>` +
    Object.entries(APP_LANGS).map(([code, l]) => `<button type="button" role="menuitemradio" aria-checked="${code === STATE.lang}" class="${code === STATE.lang ? "active" : ""}" data-set-lang="${code}">${l.flag} ${l.name}${code === STATE.lang ? '<span class="lang-check">✓</span>' : ""}</button>`).join("");
  menu.hidden = false;
  placeHeroLangMenu();
  btn.setAttribute("aria-expanded", "true");
  menu.querySelector("button.active, button")?.focus({ preventScroll: true });
}
// The hero clips what sticks out, so the menu lives on the page itself,
// right below the flag — also while the page scrolls.
function placeHeroLangMenu() {
  const btn = $("#hero-flag-btn");
  const menu = $("#hero-lang-menu");
  if (!btn || !menu || menu.hidden) return;
  const r = btn.getBoundingClientRect();
  if (r.bottom < 0) { closeHeroLangMenu(); return; }
  menu.style.top = `${Math.round(r.bottom + 6)}px`;
  menu.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - r.right))}px`;
}
function closeHeroLangMenu() {
  const menu = $("#hero-lang-menu");
  if (menu && !menu.hidden) {
    menu.hidden = true;
    $("#hero-flag-btn")?.setAttribute("aria-expanded", "false");
  }
}

document.addEventListener("click", (e) => {
  const t = e.target;
  const set = t.closest?.("[data-set-lang]");
  if (set) { e.preventDefault(); closeHeroLangMenu(); setLang(set.dataset.setLang); return; }
  if (t.closest?.("#hero-flag-btn")) { e.preventDefault(); if ($("#hero-lang-menu")?.hidden === false) closeHeroLangMenu(); else openHeroLangMenu(); return; }
  if (t.closest?.("#hero-logo-btn")) { e.preventDefault(); openOwnProfile(); return; }
  if (!t.closest?.("#hero-lang-menu")) closeHeroLangMenu();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHeroLangMenu(); });
window.addEventListener("resize", placeHeroLangMenu);
window.addEventListener("scroll", placeHeroLangMenu, { passive: true });
