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
    icon: "/icons/icon.svg"
  };
  self.registration.showNotification(title, options);
});
