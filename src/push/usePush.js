/* usePush — wires the push client into the React lifecycle.

   - Registers/refreshes this browser's FCM token whenever a user is present
     (so the token stays current across logins and browser rotations).
   - Streams foreground messages to `onForeground` (e.g. toast + bell refresh).
   - Relays service-worker deep-link clicks (background notification tapped) to
     `onOpen` so the app can route to the bug/release/screen.
   - Tears the token down on sign-out.

   Fully inert when push isn't configured — the client functions no-op. */
import { useEffect, useRef } from 'react';
import { registerDevice, onForegroundMessage, unregisterDevice, pushConfigured } from './pushClient.js';

export function usePush(user, { onForeground, onOpen } = {}) {
  const userId = user?.id || null;
  const fgRef = useRef(onForeground);
  const openRef = useRef(onOpen);
  fgRef.current = onForeground;
  openRef.current = onOpen;

  // register + subscribe while a user is logged in; unregister on logout
  useEffect(() => {
    if (!pushConfigured || !userId) return undefined;
    let unsub = () => {};
    let cancelled = false;
    registerDevice(user);
    onForegroundMessage((msg) => fgRef.current?.(msg)).then((u) => {
      if (cancelled) u?.();
      else unsub = u;
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // relay background-notification clicks (service worker → page)
  useEffect(() => {
    if (!pushConfigured || typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined;
    const handler = (event) => {
      const d = event.data;
      if (d && d.type === 'notification-click') openRef.current?.(d.data || {});
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return { unregisterDevice };
}
