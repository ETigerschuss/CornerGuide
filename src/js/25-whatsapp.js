/* ====================== WHATSAPP ======================
   A web app cannot post into a WhatsApp chat by itself: WhatsApp has no API
   for personal accounts or groups (the Business API only reaches single
   opted-in numbers, costs per conversation and needs a server). What works
   with zero setup: open WhatsApp with the message already written — pick the
   chat or group and tap send.                                              */
function whatsappUrl(text) { return "https://wa.me/?text=" + encodeURIComponent(text); }
function openWhatsApp(text) {
  if (!text) return;
  const url = whatsappUrl(text);
  const win = window.open(url, "_blank");
  if (win) { try { win.opener = null; } catch (e) { /* cross-origin */ } }
  else window.location.href = url;   // popup blocked (e.g. iOS home-screen app)
}
function autoWhatsAppOnCheckin() { return localStorage.getItem("cg.autoWhatsApp") === "1"; }
function cornerWhatsAppText(cornerId) {
  const corner = getAllCorners().find((c) => c.id === cornerId);
  if (!corner) return "";
  const link = buildShareUrl(cornerId, STATE.nickname || "", false, { [COME_PARAM]: "1" });
  const where = `${corner.name}${corner.area ? ` (${corner.area})` : ""}`;
  if (myPresenceCorner() !== cornerId) return `🍻 Lust auf ${where}? 👉 ${link}`;
  const others = freshFriends().filter((f) => f.atCorner === cornerId && !isMyKey(f.id)).map((f) => f.nickname || f.name).filter(Boolean);
  return T(`🍻 Bin gerade am ${where}!${others.length ? ` Schon da: ${others.join(", ")}.` : ""} Kommt vorbei 👉 ${link}`,
    `🍻 I'm at ${where} right now!${others.length ? ` Already here: ${others.join(", ")}.` : ""} Come over 👉 ${link}`,
    `🍻 ¡Estoy en ${where} ahora mismo!${others.length ? ` Ya están: ${others.join(", ")}.` : ""} Pásate 👉 ${link}`);
}

