importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCIHeM2laZTAUF9BIJRjCAUb2ZGqlKjto8",
  authDomain: "cornerguide.firebaseapp.com",
  databaseURL: "https://cornerguide-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cornerguide",
  storageBucket: "cornerguide.firebasestorage.app",
  messagingSenderId: "728546442384",
  appId: "1:728546442384:web:79e7acd0b74cebed726c15"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Minga Corner Guide";
  const options = {
    body: payload?.notification?.body || "Neue Nachricht von deinen Corner-Friends.",
    icon: "https://etigerschuss.github.io/CornerGuide/icons/icon-192.png",
    data: { url: "https://etigerschuss.github.io/CornerGuide/" }
  };
  self.registration.showNotification(title, options);
});

// Focus an existing tab or open the app when a notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "https://etigerschuss.github.io/CornerGuide/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("CornerGuide") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
