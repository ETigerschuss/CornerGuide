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
    // Deep link (e.g. ?chat=<uid>) is provided by the Cloud Function in data.url
    data: { url: payload?.data?.url || payload?.fcmOptions?.link || "https://etigerschuss.github.io/CornerGuide/" }
  };
  self.registration.showNotification(title, options);
});

// Open the deep link (or focus + navigate an existing tab) when tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "https://etigerschuss.github.io/CornerGuide/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("CornerGuide") && "focus" in client) {
          return client.focus().then((c) => (c && c.navigate ? c.navigate(target) : c));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
