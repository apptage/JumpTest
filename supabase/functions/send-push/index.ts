// Edge Function: send-push
// Delivers a batch of notification messages to each recipient's registered FCM
// devices via the Firebase Cloud Messaging HTTP v1 API, and prunes tokens that
// FCM reports as stale.
//
// Secrets (set once):
//   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// the Edge runtime.
//
// Deploy:  supabase functions deploy send-push
//
// Request body:
//   { messages: [{ user_id, title, body, data: { ...string values } }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ---- Google OAuth2: service-account JWT → access token ----
let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const pk = String(sa.private_key || '').replace(/\\n/g, '\n');
  const key = await importPKCS8(pk, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('oauth token error: ' + JSON.stringify(data));
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

// ---- FCM v1 send ----
async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  msg: { title: string; body: string; data: Record<string, string> }
) {
  const link = (msg.data && msg.data.link) || '/';
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data || {},
          webpush: {
            notification: { icon: '/icon-192.png' },
            fcmOptions: { link },
          },
        },
      }),
    }
  );
  return res;
}

// FCM error codes that mean "this token is dead — stop using it"
function isDeadToken(status: number, errBody: any): boolean {
  if (status === 404) return true;
  const s = errBody?.error?.status;
  const code = errBody?.error?.details?.[0]?.errorCode;
  return s === 'NOT_FOUND' || s === 'UNREGISTERED' || code === 'UNREGISTERED';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!saRaw) return json({ error: 'FCM_SERVICE_ACCOUNT not configured' }, 500);
    const sa = JSON.parse(saRaw);
    const projectId = sa.project_id || Deno.env.get('FCM_PROJECT_ID');
    if (!projectId) return json({ error: 'no FCM project id' }, 500);

    // caller must be authenticated (any signed-in user may emit notifications)
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user: callerUser },
    } = await caller.auth.getUser();
    if (!callerUser) return json({ error: 'Not authenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const messages: any[] = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) return json({ ok: true, sent: 0, note: 'no messages' });

    const admin = createClient(url, service);

    // load all enabled devices for the recipients in one query
    const userIds = [...new Set(messages.map((m) => m.user_id).filter(Boolean))];
    const { data: devices, error: devErr } = await admin
      .from('user_devices')
      .select('id, user_id, fcm_token')
      .in('user_id', userIds)
      .eq('enabled', true);
    if (devErr) return json({ error: 'device lookup failed: ' + devErr.message }, 500);

    const byUser: Record<string, string[]> = {};
    for (const d of devices || []) (byUser[d.user_id] ||= []).push(d.fcm_token);

    const accessToken = await getAccessToken(sa);
    const deadTokens: string[] = [];
    let sent = 0;
    let failed = 0;

    for (const msg of messages) {
      const tokens = byUser[msg.user_id] || [];
      for (const token of tokens) {
        try {
          const res = await sendToToken(accessToken, projectId, token, {
            title: msg.title || 'JumpTest',
            body: msg.body || '',
            data: msg.data || {},
          });
          if (res.ok) {
            sent++;
          } else {
            failed++;
            const errBody = await res.json().catch(() => ({}));
            if (isDeadToken(res.status, errBody)) deadTokens.push(token);
            else console.error('[send-push] fcm error', res.status, JSON.stringify(errBody));
          }
        } catch (e) {
          failed++;
          console.error('[send-push] send threw', (e as Error).message);
        }
      }
    }

    // prune dead tokens so we stop paying for them
    if (deadTokens.length) {
      await admin
        .from('user_devices')
        .update({ enabled: false })
        .in('fcm_token', deadTokens);
    }

    return json({ ok: true, sent, failed, pruned: deadTokens.length });
  } catch (e) {
    console.error('[send-push] fatal', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
