/* Firebase Cloud Messaging — web client config.
   All values are PUBLIC (safe to ship in the bundle); the sensitive bit is the
   service-account key, which lives only in the Supabase Edge Function secret.

   Set these in your .env (see .env.example). When they're absent the whole push
   layer no-ops gracefully — the app runs exactly as before, no errors. */
import { publicEnv } from '../env.public.js';

export const firebaseConfig = {
  apiKey: publicEnv('FIREBASE_API_KEY'),
  authDomain: publicEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: publicEnv('FIREBASE_PROJECT_ID'),
  storageBucket: publicEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: publicEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: publicEnv('FIREBASE_APP_ID'),
};

// Web Push certificate key pair (Firebase console → Cloud Messaging → Web Push certificates)
export const vapidKey = publicEnv('FIREBASE_VAPID_KEY') || '';

// true only when the minimum config needed to init messaging is present
export const pushConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    vapidKey
);
