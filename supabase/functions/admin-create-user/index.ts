// Edge Function: admin-create-user
// Lets an Admin create a fully-provisioned account for ANY role
// (Developer / QA / Team Lead / Admin) without sending a confirmation
// email — which also avoids the "email rate limit exceeded" error.
//
// Deploy:  supabase functions deploy admin-create-user
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//  injected automatically by the Supabase Edge runtime.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_DOMAIN = 'jumppace.com';
const ROLES = ['Developer', 'QA', 'Team Lead', 'Admin'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1) identify the caller from their JWT
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: callerUser },
      error: callerErr,
    } = await caller.auth.getUser();
    if (callerErr || !callerUser) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(url, service);

    // 2) the caller must be an Admin
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();
    if (!callerProfile || callerProfile.role !== 'Admin') {
      return json({ error: 'Only admins can create users' }, 403);
    }

    // 3) validate input
    const { email, password, name, role, teamId } = await req.json();
    if (!email || !password || !name) {
      return json({ error: 'Name, email and password are required' }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400);
    }
    if (!String(email).toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      return json({ error: `Only @${ALLOWED_DOMAIN} email addresses are allowed` }, 400);
    }
    const safeRole = ROLES.includes(role) ? role : 'Developer';

    // 4) create a pre-confirmed user (no confirmation email is sent)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: safeRole },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    // 5) ensure the profile carries the exact role + team
    //    (the signup trigger may have created it with a clamped role)
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: created.user.id,
        email,
        name,
        role: safeRole,
        team_id: teamId || null,
      },
      { onConflict: 'id' }
    );
    if (profErr) return json({ error: profErr.message }, 400);

    return json({ ok: true, id: created.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
