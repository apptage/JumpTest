// Edge Function: admin-update-user
// Edits a user's name and login email. The email lives in auth.users, which
// only the service role can change, so the app comes here instead of updating
// profiles directly. Who may edit whom (same as canEditUserDetails() in the
// app and enforce_profile_details() in the database):
//   Admin            anyone
//   Project Manager  anyone except an Admin
//   Team Lead        Developers and QA on their own team
//   anyone           themselves
//
// Deploy:  supabase functions deploy admin-update-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_DOMAIN = 'jumppace.com';

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

type Profile = { id: string; role: string; team_id: string | null; name: string; email: string | null };

function mayEdit(caller: Profile, target: Profile) {
  if (caller.id === target.id) return true;
  if (caller.role === 'Admin') return true;
  if (caller.role === 'Project Manager') return target.role !== 'Admin';
  if (caller.role === 'Team Lead') {
    return ['Developer', 'QA'].includes(target.role) && !!caller.team_id && target.team_id === caller.team_id;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) identify the caller from their JWT
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerUser) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(url, service);

    // 2) validate input
    const { id, name, email } = await req.json();
    const cleanName = String(name ?? '').trim();
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!id) return json({ error: 'Missing user' }, 400);
    if (!cleanName) return json({ error: 'Name is required' }, 400);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+$/.test(cleanEmail)) return json({ error: 'Enter a valid email address' }, 400);
    if (!cleanEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return json({ error: `Only @${ALLOWED_DOMAIN} email addresses are allowed` }, 400);
    }

    // 3) the caller must be allowed to edit this person
    const { data: rows, error: profErr } = await admin
      .from('profiles')
      .select('id, role, team_id, name, email')
      .in('id', [callerUser.id, id]);
    if (profErr) return json({ error: profErr.message }, 400);
    const callerProfile = rows?.find((r: Profile) => r.id === callerUser.id);
    const target = rows?.find((r: Profile) => r.id === id);
    if (!callerProfile) return json({ error: 'Not authenticated' }, 401);
    if (!target) return json({ error: 'User not found' }, 404);
    if (!mayEdit(callerProfile, target)) return json({ error: "You can't edit this person's details" }, 403);

    // 4) the login email first (fails on a duplicate), then the profile
    const emailChanged = cleanEmail !== String(target.email ?? '').toLowerCase();
    if (emailChanged) {
      const { error: authErr } = await admin.auth.admin.updateUserById(id, {
        email: cleanEmail,
        email_confirm: true,
        user_metadata: { name: cleanName },
      });
      if (authErr) return json({ error: authErr.message }, 400);
    }
    const { error: updErr } = await admin.from('profiles').update({ name: cleanName, email: cleanEmail }).eq('id', id);
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ ok: true, emailChanged });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
