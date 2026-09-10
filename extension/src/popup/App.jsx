/* Popup — UI only. It never owns elapsed time: the open time_logs row (via the
   worker / RPCs) is authoritative, and closing the popup never stops the clock.
   chrome.storage.local is only a cache for last project/WBS so the UI paints fast. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, timeLogs, fetchProjects, fetchWbsTasks, fetchMyRole, todayISO } from '../supabase.js';
import { elapsedMs } from '../../../src/api/timeLogs.js';

const send = (msg) =>
  new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (r) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!r?.ok) return reject(new Error(r?.error || 'Request failed'));
      resolve(r.data);
    })
  );

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const tm = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const prettyDate = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [role, setRole] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (text, kind = 'ok') => { setToast({ text, kind }); setTimeout(() => setToast(null), 2200); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session?.user?.id) fetchMyRole(session.user.id).then(setRole).catch(() => setRole(null));
  }, [session?.user?.id]);

  if (session === undefined) return <div className="app"><div className="center">Loading…</div></div>;
  if (!session) return <Login onError={(m) => say(m, 'error')} />;
  if (role === 'Manager') {
    return (
      <div className="app">
        <Header user={session.user} />
        <div className="center">Your role can’t log time.</div>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    );
  }
  return (
    <>
      <Home user={session.user} say={say} />
      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.text}</div>}
    </>
  );
}

function Header({ user, right }) {
  return (
    <div className="head">
      <div className="logo">J</div>
      <div className="brand">GammaQuality</div>
      {right}
      <button className="btn ghost faint" title={user.email} onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}

function Login({ onError }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) { setErr(error.message); onError(error.message); }
  }
  return (
    <form className="app" onSubmit={go}>
      <div className="head"><div className="logo">J</div><div className="brand">GammaQuality Time Log</div></div>
      <div className="card stack">
        <div><label className="f">Email</label><input type="email" autoFocus value={email} placeholder="you@jumppace.com" onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="f">Password</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !email || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="faint">Use your @jumppace.com account. No signup here — create accounts in the web app.</div>
      </div>
    </form>
  );
}

function Home({ user, say }) {
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [wbs, setWbs] = useState([]);
  const [wbsId, setWbsId] = useState('');
  const [open, setOpen] = useState(null);       // the user's running/paused log (DB wins)
  const [logs, setLogs] = useState([]);         // today's entries for the selected project
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [, tick] = useState(0);
  const today = useMemo(todayISO, []);

  // boot: projects + open timer + remembered selections, in parallel
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [ps, o, stored] = await Promise.all([
          fetchProjects(), timeLogs.fetchMyOpenTimeLog(user.id), chrome.storage.local.get(['gq-last-project', 'gq-last-wbs']),
        ]);
        if (dead) return;
        setProjects(ps);
        setOpen(o);
        // an open timer wins over the remembered project
        const pid = o?.projectId || stored['gq-last-project'] || '';
        setProjectId(pid);
        setWbsId(o ? (o.wbsItemId || '') : (stored['gq-last-wbs'] || ''));
      } catch (e) { if (!dead) say(e.message, 'error'); }
    })();
    return () => { dead = true; };
  }, [user.id]);

  // one WBS query + today's list per project change
  useEffect(() => {
    if (!projectId) { setWbs([]); setLogs([]); return; }
    let dead = false;
    Promise.all([fetchWbsTasks(projectId), timeLogs.fetchMyTimeLogsForProject(projectId, today, user.id)])
      .then(([w, l]) => { if (!dead) { setWbs(w); setLogs(l); } })
      .catch((e) => !dead && say(e.message, 'error'));
    chrome.storage.local.set({ 'gq-last-project': projectId });
    return () => { dead = true; };
  }, [projectId, today, user.id]);
  useEffect(() => { if (!open) chrome.storage.local.set({ 'gq-last-wbs': wbsId }); }, [wbsId, open]);

  // 1s tick while a timer is running (display only — the DB owns the math)
  useEffect(() => {
    if (open?.status !== 'running') return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open?.status]);

  const reloadLogs = () => projectId && timeLogs.fetchMyTimeLogsForProject(projectId, today, user.id).then(setLogs).catch(() => {});

  async function act(fn, okMsg) {
    setBusy(true);
    try { const r = await fn(); if (okMsg) say(okMsg); return r; }
    catch (e) { say(e.message, 'error'); }
    finally { setBusy(false); }
  }
  const play = () => act(async () => setOpen(await send({ type: 'start', payload: { projectId, wbsItemId: wbsId || null, logDate: today } })));
  const pause = () => act(async () => setOpen(await send({ type: 'pause', id: open.id })));
  const resume = () => act(async () => setOpen(await send({ type: 'resume', id: open.id })));
  const stop = () => act(async () => {
    const note = window.prompt('Note (optional):', open.note || '') ?? '';
    const r = await send({ type: 'stop', id: open.id, note });
    setOpen(null);
    if (r.discarded) say('Session too short — not saved.', 'error'); else say('Time logged');
    reloadLogs();
  });
  const discard = () => act(async () => {
    if (!window.confirm('Discard this session? Nothing will be saved.')) return;
    await send({ type: 'discard', id: open.id });
    setOpen(null); reloadLogs();
  });
  const remove = (id) => act(async () => { await timeLogs.deleteTimeLog(id); reloadLogs(); }, 'Removed');

  const projectName = (id) => projects?.find((p) => p.id === id)?.name || '—';
  const wbsName = (id) => { const w = wbs.find((x) => x.id === id); return w ? (w.module ? `${w.module} · ${w.title}` : w.title) : 'General'; };
  const total = logs.filter((l) => l.status === 'completed' && l.hours != null).reduce((s, l) => s + l.hours, 0);
  const items = open && open.projectId === projectId && !logs.some((l) => l.id === open.id) ? [open, ...logs] : logs;

  return (
    <div className="app">
      <Header user={user} />
      <div className="row">
        <div className="grow">
          <div style={{ fontWeight: 700 }}>{prettyDate()}</div>
          <div className="faint">Total today: <b className="tnum" style={{ color: 'var(--text)' }}>{Math.round(total * 100) / 100}h</b>{projectId ? ` · ${projectName(projectId)}` : ''}</div>
        </div>
        {!open && <button className="btn" disabled={!projectId || busy} title="Add manual entry" onClick={() => setSheet(true)}>＋</button>}
      </div>

      {open ? (
        <div className="card">
          <div className="timer">
            <div className={`state ${open.status}`}>{open.status === 'running' ? 'In progress' : 'Paused'}</div>
            <div className="clock tnum">{clock(elapsedMs(open))}</div>
            <div className="muted" style={{ fontSize: 12 }}>{projectName(open.projectId)} · {wbsName(open.wbsItemId)}</div>
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 6 }}>
            {open.status === 'running'
              ? <button className="btn big" disabled={busy} onClick={pause} title="Pause">❚❚</button>
              : <button className="btn big primary" disabled={busy} onClick={resume} title="Resume">▶</button>}
            <button className="btn big danger" disabled={busy} onClick={stop} title="Stop">■</button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="btn ghost faint" disabled={busy} onClick={discard}>Discard session</button>
          </div>
        </div>
      ) : (
        <div className="card stack">
          <div>
            <label className="f">Project</label>
            <select value={projectId} disabled={!projects} onChange={(e) => { setProjectId(e.target.value); setWbsId(''); }}>
              <option value="">{projects ? 'Select a project…' : 'Loading…'}</option>
              {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="f">WBS task (optional)</label>
            <select value={wbsId} disabled={!projectId} onChange={(e) => setWbsId(e.target.value)}>
              <option value="">No specific task</option>
              {wbs.map((w) => <option key={w.id} value={w.id}>{w.module ? `${w.module} · ` : ''}{w.title}</option>)}
            </select>
          </div>
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <button className="btn big primary" disabled={!projectId || busy} onClick={play} title="Start timer">▶</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="faint" style={{ marginBottom: 6, fontWeight: 600 }}>Today</div>
        {!projectId ? <div className="empty">Pick a project to see today’s entries.</div>
          : items.length === 0 ? <div className="empty">No time logs — hit Play or +.</div>
          : (
            <div className="list">
              {items.map((l) => {
                const isOpen = l.status !== 'completed';
                return (
                  <div key={l.id} className="entry">
                    <span className={`h tnum ${isOpen ? 'muted' : ''}`}>{isOpen ? (l.status === 'running' ? 'Live' : 'Paused') : `${l.hours}h`}</span>
                    <div className="t">
                      <div className="l1">{wbsName(l.wbsItemId)}{l.note ? <span className="muted"> — {l.note}</span> : null}</div>
                      <div className="faint">{l.startedAt ? `${tm(l.startedAt)}${l.endedAt ? `–${tm(l.endedAt)}` : ''}` : 'manual'}</div>
                    </div>
                    {!isOpen && <button className="btn ghost danger" style={{ padding: '4px 8px', fontSize: 11 }} disabled={busy} onClick={() => remove(l.id)}>Remove</button>}
                  </div>
                );
              })}
            </div>
          )}
      </div>

      {sheet && <ManualSheet projectId={projectId} wbs={wbs} today={today} userId={user.id} say={say} onClose={() => setSheet(false)} onSaved={() => { setSheet(false); reloadLogs(); }} />}
    </div>
  );
}

function ManualSheet({ projectId, wbs, today, userId, say, onClose, onSaved }) {
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(today);
  const [wbsId, setWbsId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const h = Number(hours);
    if (!h || h <= 0) return say('Enter hours greater than 0.', 'error');
    if (h > 24) return say('A single entry can’t exceed 24 hours.', 'error');
    setBusy(true);
    try {
      await timeLogs.createTimeLog({ projectId, wbsItemId: wbsId || null, hours: h, logDate: date, note, userId });
      say('Time logged'); onSaved();
    } catch (e) { say(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="sheet">
      <div className="head"><div className="brand">Add time</div><button className="btn ghost" onClick={onClose}>Cancel</button></div>
      <div className="card stack">
        <div className="row">
          <div className="grow"><label className="f">Hours</label><input type="number" min="0" step="0.25" autoFocus value={hours} placeholder="e.g. 2.5" onChange={(e) => setHours(e.target.value)} /></div>
          <div className="grow"><label className="f">Date</label><input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div>
          <label className="f">WBS task (optional)</label>
          <select value={wbsId} onChange={(e) => setWbsId(e.target.value)}>
            <option value="">No specific task</option>
            {wbs.map((w) => <option key={w.id} value={w.id}>{w.module ? `${w.module} · ` : ''}{w.title}</option>)}
          </select>
        </div>
        <div><label className="f">Note (optional)</label><input value={note} placeholder="What did you work on?" onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
