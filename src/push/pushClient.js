/* Push client — the single entry point the app uses to turn a browser into a
   registered FCM device and to receive foreground messages.

   Design goals:
   - No-op safe: if push isn't configured, or the browser/permission doesn't
     support it, every function resolves quietly (never throws into the app).
   - Lazy: the firebase SDK is dynamically imported only when we actually
     register, so an unconfigured app never pays the bundle/runtime cost.
   - Token refresh: FCM web has no onTokenRefresh event — the current token is
     whatever getToken() returns. So we call registerDevice() on every app load
     (and after permission grant); the upsert keeps the row fresh and rotates
     the token transparently when the browser issues a new one. */
import { firebaseConfig, vapidKey, pushConfigured } from './config.js';
import * as api from '@/api.js';

let messagingPromise = null;
let onMessageUnsub = null;

function log(...args) {
  // lightweight, greppable logging; swap for a real logger later
  console.info('[push]', ...args);
}
function warn(...args) {
  console.warn('[push]', ...args);
}

/* Resolve a Messaging instance, or null if unavailable. Memoized. */
async function getMessaging() {
  if (!pushConfigured) return null;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (messagingPromise) return messagingPromise;
  messagingPromise = (async () => {
    try {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getMessaging, isSupported } = await import('firebase/messaging');
      if (!(await isSupported())) {
        warn('firebase messaging not supported in this browser');
        return null;
      }
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      return getMessaging(app);
    } catch (e) {
      warn('failed to init messaging', e?.message || e);
      return null;
    }
  })();
  return messagingPromise;
}

/* Register (or refresh) this browser as an FCM device for `user`.
   Returns the token on success, or null. Only proceeds if permission is
   already granted — call requestPushPermission() to prompt. */
export async function registerDevice(user) {
  if (!user?.id) return null;
  const messaging = await getMessaging();
  if (!messaging) return null;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;

  try {
    const { getToken } = await import('firebase/messaging');
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    });
    if (!token) {
      warn('getToken returned empty');
      return null;
    }
    await api.upsertUserDevice({
      token,
      platform: 'web',
      userAgent: navigator.userAgent,
    });
    log('device registered', token.slice(0, 12) + '…');
    return token;
  } catch (e) {
    warn('registerDevice failed', e?.message || e);
    return null;
  }
}

/* Prompt the OS/browser for notification permission, then register.
   Returns { permission, token }. Safe to call from a user gesture. */
export async function requestPushPermission(user) {
  if (typeof Notification === 'undefined') return { permission: 'unsupported', token: null };
  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = 'denied';
    }
  }
  if (permission !== 'granted') return { permission, token: null };
  const token = await registerDevice(user);
  return { permission, token };
}

/* Subscribe to foreground messages (app tab focused). Returns an unsubscribe
   fn. `handler` receives { title, body, data }. */
export async function onForegroundMessage(handler) {
  const messaging = await getMessaging();
  if (!messaging) return () => {};
  try {
    const { onMessage } = await import('firebase/messaging');
    onMessageUnsub = onMessage(messaging, (payload) => {
      const n = payload?.notification || {};
      handler?.({ title: n.title, body: n.body, data: payload?.data || {} });
    });
    return onMessageUnsub;
  } catch (e) {
    warn('onForegroundMessage failed', e?.message || e);
    return () => {};
  }
}

/* On sign-out: disable this browser's token so it stops receiving pushes for
   the previous user. Best-effort. */
export async function unregisterDevice() {
  try {
    if (onMessageUnsub) {
      onMessageUnsub();
      onMessageUnsub = null;
    }
    const messaging = await getMessaging();
    if (!messaging) return;
    const { getToken, deleteToken } = await import('firebase/messaging');
    const token = await getToken(messaging, { vapidKey }).catch(() => null);
    if (token) await api.disableUserDevice(token);
    await deleteToken(messaging).catch(() => {});
  } catch (e) {
    warn('unregisterDevice failed', e?.message || e);
  }
}

export { pushConfigured };
