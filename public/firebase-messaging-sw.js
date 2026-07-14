/* Firebase Cloud Messaging — background service worker.

   Handles pushes that arrive while the app tab is closed/backgrounded, shows
   the OS notification, and deep-links to the right screen when tapped.

   A service worker can't read import.meta.env, so the Firebase *public* config
   is inlined below. Paste the same values you put in your .env (VITE_FIREBASE_*).
   These are public identifiers — safe to commit. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyC43qnsUmDfShXJMBajodNjKoxlQhzVsZ0',
  authDomain: 'jumptest-98658.firebaseapp.com',
  projectId: 'jumptest-98658',
  storageBucket: 'jumptest-98658.firebasestorage.app',
  messagingSenderId: '592092533569',
  appId: '1:592092533569:web:e77077968ef6a47e1dc7c0',
});




const messaging = firebase.messaging();

// Build the in-app route to open from a notification's data payload.
function linkFor(data) {
  if (!data) return '/';
  if (data.link) return data.link;
  const p = new URLSearchParams();
  if (data.type) p.set('notif', data.type);
  if (data.releaseId) p.set('release', data.releaseId);
  if (data.bugId) p.set('bug', data.bugId);
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || 'JumpTest', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.bugId || data.releaseId || undefined, // collapse duplicates per entity
    data: { ...data, link: linkFor(data) },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = new URL(data.link || linkFor(data), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // focus an open tab and let the app route in-place, else open a new one
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
