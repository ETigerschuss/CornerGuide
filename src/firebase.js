  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import { getDatabase, ref, set, get, push, update, onValue, onChildAdded, onDisconnect, serverTimestamp, remove, runTransaction, query, orderByChild, startAt, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
  import { getAuth, signInAnonymously, onAuthStateChanged,
           GoogleAuthProvider, linkWithPopup, signInWithPopup,
           EmailAuthProvider, linkWithCredential,
           sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
  import { getStorage, ref as storageRef, uploadString, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

  const firebaseConfig = {
    apiKey: "AIzaSyCIHeM2laZTAUF9BIJRjCAUb2ZGqlKjto8",
    authDomain: "cornerguide.firebaseapp.com",
    databaseURL: "https://cornerguide-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "cornerguide",
    storageBucket: "cornerguide.firebasestorage.app",
    messagingSenderId: "728546442384",
    appId: "1:728546442384:web:79e7acd0b74cebed726c15",
    measurementId: "G-GL66DD71KM"
  };

  let db = null;
  let auth = null;
  let storage = null;
  let firebaseReady = false;
  let authUid = "";
  let messaging = null;
  let pushSupported = false;
  const authListeners = new Set();
  let resolveAuthReady = null;
  const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

  try {
    if (!firebaseConfig.apiKey.startsWith("YOUR_")) {
      const app = initializeApp(firebaseConfig);
      db = getDatabase(app);
      try { storage = getStorage(app); } catch (err) { console.warn("Storage init failed:", err); }
      auth = getAuth(app);
      firebaseReady = true;
      onAuthStateChanged(auth, (user) => {
        authUid = user?.uid || "";
        authListeners.forEach((listener) => {
          try { listener(authUid); } catch (err) { console.warn("Auth listener failed:", err); }
        });
        // Fires on every auth state change; the Promise only resolves once — with
        // a login. A brand-new visitor is first reported as "nobody" until the
        // anonymous sign-in is through; resolving then showed the code prompt
        // before an invite link could let them in. (Sign-in failing resolves "".)
        if (authUid && resolveAuthReady) resolveAuthReady(authUid);
      });
      let authRetryCount = 0;
      const trySignIn = async () => {
        // A login restored from this device stays: signInAnonymously replaces
        // anyone who is not anonymous — a Google-secured profile was back to a
        // fresh anonymous login after every reload.
        try { await auth.authStateReady(); } catch (err) { /* sign in below */ }
        if (auth.currentUser) return;
        signInAnonymously(auth).catch((err) => {
          authRetryCount++;
          console.warn(`Firebase anonymous auth failed (attempt ${authRetryCount}):`, err);
          if (authRetryCount < 3) {
            setTimeout(trySignIn, authRetryCount * 2000);
          } else {
            if (resolveAuthReady) resolveAuthReady("");
          }
        });
      };
      trySignIn();
      isMessagingSupported().then((supported) => {
        pushSupported = !!supported;
        if (pushSupported) {
          try { messaging = getMessaging(app); } catch (err) { console.warn("FCM init failed:", err); }
        }
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("Firebase not configured:", e);
    if (resolveAuthReady) resolveAuthReady("");
  }

  // Expose Firebase functions globally for use in the main script
  window.FB = {
    db, auth, ref, set, get, push, update, onValue, onChildAdded, onDisconnect, serverTimestamp, remove, runTransaction, query, orderByChild, startAt, limitToLast, firebaseReady, authReady,
    getAuthUid: () => authUid,
    onAuthChange: (listener) => {
      if (typeof listener !== "function") return () => {};
      authListeners.add(listener);
      try { listener(authUid); } catch (err) { console.warn("Initial auth listener failed:", err); }
      return () => authListeners.delete(listener);
    },
    enablePushNotifications: async (vapidKey = "", serviceWorkerRegistration = null) => {
      if (!pushSupported || !messaging) throw new Error("Push wird in diesem Browser nicht unterstützt.");
      if (!authUid) throw new Error("Kein Firebase-Login aktiv.");
      if (!vapidKey) throw new Error("VAPID-Key fehlt. Hinterlege ihn in der App, um FCM zu aktivieren.");
      if (!("Notification" in window)) throw new Error("Notifications werden nicht unterstützt.");
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification-Berechtigung wurde nicht erteilt.");
      }
      const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
      if (!token) throw new Error("FCM-Token konnte nicht erstellt werden.");
      return token;
    },
    bindForegroundPush: (listener) => {
      if (!pushSupported || !messaging || typeof listener !== "function") return () => {};
      return onMessage(messaging, listener);
    },
    // Upload a data-URL image to Storage and return its public download URL.
    uploadImage: async (path, dataUrl) => {
      if (!storage) throw new Error("Storage nicht verfügbar.");
      const r = storageRef(storage, path);
      await uploadString(r, dataUrl, "data_url");
      return await getDownloadURL(r);
    },
    // Upload a Blob (e.g. a voice recording) and return its download URL.
    uploadBlob: async (path, blob, contentType) => {
      if (!storage) throw new Error("Storage nicht verfügbar.");
      const r = storageRef(storage, path);
      await uploadBytes(r, blob, { contentType: contentType || blob.type || "application/octet-stream" });
      return await getDownloadURL(r);
    },
    deleteFile: async (path) => {
      if (!storage) return;
      await deleteObject(storageRef(storage, path));
    },
    // ---- Account portability (link the anonymous account to a permanent one) ----
    getAccountInfo: () => {
      const user = auth?.currentUser || null;
      if (!user) return { signedIn: false, anonymous: true, email: "", providers: [] };
      const providers = (user.providerData || []).map((p) => p.providerId);
      return {
        signedIn: true,
        anonymous: !!user.isAnonymous,
        email: user.email || "",
        providers
      };
    },
    linkGoogle: async () => {
      const user = auth?.currentUser;
      if (!user) throw new Error("Kein Login aktiv.");
      const provider = new GoogleAuthProvider();
      // Anonymous users get upgraded in place (UID stays). Already-permanent users
      // that hit a "credential-already-in-use" fall back to a normal sign-in.
      try {
        const result = user.isAnonymous ? await linkWithPopup(user, provider) : await signInWithPopup(auth, provider);
        return result.user?.email || "";
      } catch (err) {
        if (err?.code === "auth/credential-already-in-use" || err?.code === "auth/email-already-in-use") {
          const result = await signInWithPopup(auth, provider);
          return result.user?.email || "";
        }
        throw err;
      }
    },
    sendEmailLink: async (email) => {
      if (!email) throw new Error("Bitte eine E-Mail-Adresse eingeben.");
      const actionCodeSettings = { url: window.location.href.split("#")[0], handleCodeInApp: true };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem("cg.emailForSignIn", email);
    },
    // Called on every load; completes an email-link sign-in if the URL is one.
    completeEmailLinkSignIn: async () => {
      if (!auth || !isSignInWithEmailLink(auth, window.location.href)) return null;
      let email = window.localStorage.getItem("cg.emailForSignIn");
      if (!email) email = (window.appPrompt ? await window.appPrompt("E-Mail bestätigen", "", "deine@mail.de") : window.prompt("Bitte bestätige deine E-Mail für die Anmeldung:")) || "";
      if (!email) return null;
      const user = auth.currentUser;
      try {
        if (user && user.isAnonymous) {
          // Preserve the anonymous UID (and thus the profile) by linking.
          const cred = EmailAuthProvider.credentialWithLink(email, window.location.href);
          const result = await linkWithCredential(user, cred);
          window.localStorage.removeItem("cg.emailForSignIn");
          return result.user?.email || email;
        }
        const result = await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem("cg.emailForSignIn");
        return result.user?.email || email;
      } catch (err) {
        if (err?.code === "auth/credential-already-in-use" || err?.code === "auth/email-already-in-use") {
          const result = await signInWithEmailLink(auth, email, window.location.href);
          window.localStorage.removeItem("cg.emailForSignIn");
          return result.user?.email || email;
        }
        throw err;
      }
    }
  };
