# Push Notifications (Firebase Cloud Messaging)

In-app notification history already exists (the bell). This adds **real push
delivery** via FCM so users are notified even when the tab is closed, plus a
`user_devices` registry and a Supabase Edge Function that fans messages out to
every registered device.

## Architecture

```
event handler (ReleaseTracker)
   └─ api.notify(recipients, {...})
        ├─ insert rows into `notifications`      → history (the bell)
        └─ api.sendPush(messages)                → invoke Edge Function
                                                      └─ send-push (Deno)
                                                           ├─ look up user_devices (service role)
                                                           ├─ FCM HTTP v1 send (per token)
                                                           └─ prune dead tokens
browser:
   src/push/pushClient.js   → register token → user_devices (upsert)
   public/firebase-messaging-sw.js → background messages + tap-to-open
   src/push/usePush.js      → foreground toast + deep-link routing
```

**Scope:** this repo is a **web app**, so this implements FCM **Web**. The
schema (`user_devices.platform`), the notification service, and the Edge
Function are platform-agnostic — a future Capacitor/React-Native wrapper only
needs to register its native FCM token into `user_devices` and everything else
works unchanged.

**Fail-safe:** with no `VITE_FIREBASE_*` env set, the entire push layer no-ops.
The app builds and runs exactly as before.

## Events wired

| Event | Recipients |
|---|---|
| Release submitted | team QA + Team Leads |
| Tester assigned | the assigned QA |
| QA started / completed | the release submitter |
| Release approved / sent back | the release submitter |
| Bug fixed / needs clarification | the other party |
| Dev proposed close / approved / rejected | Team Lead / the developer |
| New comment | release participants |
| @mention | the mentioned user |

Add more by calling `api.notify([userIds], { type, title, message, releaseId, bugId, data })`.

## One-time setup

### 1. Run the migration
Run [`fixes13.sql`](fixes13.sql) in the Supabase SQL editor (adds `user_devices`
and enriches `notifications`).

### 2. Create a Firebase project + Web app
Firebase console → add project → add a **Web app**. Copy the config into `.env`
(see [`.env.example`](.env.example) — `VITE_FIREBASE_*`). Then Cloud Messaging →
**Web Push certificates** → generate a key pair → `VITE_FIREBASE_VAPID_KEY`.

### 3. Fill the service worker config
Edit [`public/firebase-messaging-sw.js`](public/firebase-messaging-sw.js) and
replace the `REPLACE_WITH_*` placeholders with the same public values (a service
worker can't read env). Optionally add `public/icon-192.png` for the notification icon.

### 4. Deploy the Edge Function + secret
Download a **service account** JSON (Firebase console → Project settings →
Service accounts → Generate new private key), then:

```bash
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
supabase functions deploy send-push
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the Edge runtime.

### 5. Opt in
Sign in → **Settings → Notifications → Enable push on this device**. Push
requires HTTPS (or `localhost`).

## Notes & limits
- Tokens rotate silently; we re-`getToken()` and upsert on every load, so
  `user_devices` self-heals. FCM-reported dead tokens are auto-disabled by the
  Edge Function.
- All delivery is **best-effort** — a push failure never blocks the action that
  produced it (logged with `[push]` / `[notify]` prefixes).
- iOS Safari web push requires the site to be installed to the Home Screen
  (PWA) and iOS 16.4+.
