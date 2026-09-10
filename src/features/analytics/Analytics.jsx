/* Analytics — ONE page for every stakeholder (client, PM, exec, Team Lead, Admin).
   Replaces the Team-Lead AnalyticsModal + Admin ManagerDashboard with a single
   layout, scoped by role (Admin: whole org + per-team; Team Lead: their team).

   Design rule — progressive disclosure:
     • Overview = a plain-English health verdict + 6 headline numbers, each with a
       one-line "what this means". Anyone gets the picture in ten seconds.
     • Tabs (Delivery · Quality · Speed · People · Projects) carry EVERY detail the
       old pages had — nothing was dropped, only organised and re-labelled.
   Every number comes from the shared metric layer (releaseMetrics / bugMetrics /
   filters), so this page always agrees with the Dashboard and Command Center. */
import { useState } from 'react';
import { card, ghostButton, inputStyle, Avatar, StatusBadge, SeverityBadge, ModalShell } from '@/ui.jsx';
import { PageHeader, sideHead, avgDaysBetween, statusSince } from '@shared/ui-kit.jsx';
import {
  StatCard, PassRing, TrendChart, Donut, StackedBar, SegmentedTimeline, StageBars,
  DataTable, SubTabs, Segmented, Pill, AlertCard, Chevron, passTone,
} from '@shared/dashboard-kit.jsx';
import { filterReleases, filterBugs, historicalBugs } from '@shared/filters.js';
import { computeReleaseMetrics, computeBottlenecks, computeWorkload } from '@shared/releaseMetrics.js';
import { aggregateBugMetrics, bugWorkflow, agingBugs } from '@shared/bugMetrics.js';
import {
  STATUSES, STATUS_ORDER, SEVERITIES, SEVERITY_ORDER, BUG_STATUSES, BUG_STATUS_ORDER, BUG_RESOLUTIONS,
  RELEASE_PLATFORMS, ENVIRONMENTS, isActiveBug, isActiveStatus, isClosedStatus, slaLevel, formatVersion,
} from '@/constants.js';
import { IconChart } from '@/icons.jsx';
import { ReleaseHistory } from './ReleaseHistory.jsx';

/* ---------- plain-English vocabulary (one place, used everywhere on the page) ---------- */
const WORDS = {
  submitted: ['Builds submitted', 'Every build developers handed to QA'],
  approved: ['Builds approved by QA', 'Passed testing with no serious problems open'],
  rejected: ['Builds sent back', 'QA found serious problems; a new build is needed'],
  passRate: ['QA approval rate', 'Share of judged builds that passed'],
  cycle: ['Days from submit to QA done', 'Calendar days a build waits for a verdict'],
  active: ['Open problems', 'Bugs not yet confirmed fixed'],
  critical: ['Critical problems', 'Open bugs that block a release'],
  awaitingQa: ['Fixed, waiting for QA to confirm', 'Developer says fixed; QA must re-check'],
  needsDev: ['With the developer', 'Reported and not yet fixed'],
  verified: ['Confirmed fixed', 'QA re-tested and closed'],
  prod: ['Problems on live builds', 'Found on builds that reached real users'],
  carried: ['Left over from a previous build', 'Not fixed last time, so it moved to the next build'],
  invalid: ['Closed without a code change', 'Not a bug / out of scope / duplicate / could not reproduce'],
  overdue: ['Overdue builds', 'Waiting on QA longer than the agreed time'],
  waitTime: ['Waiting before testing started', 'Days between submit and QA picking it up'],
  testTime: ['Time spent testing', 'Days between QA starting and finishing'],
  rounds: ['Rounds to confirm a fix', 'Average build-and-retest cycles a bug needed'],
};
const L = (k) => WORDS[k][0];
const HELP = (k) => WORDS[k][1];

const STATUS_TONE = { qa_pending: 'warning', qa_in_progress: 'info', qa_done: 'info', approved: 'success', sent_back: 'danger', closed: 'neutral' };
// client-safe, jargon-free release stage names
const STAGE_LABEL = { qa_pending: 'Waiting for QA', qa_in_progress: 'Being tested', qa_done: 'Tested, awaiting verdict', approved: 'Approved', sent_back: 'Sent back', closed: 'Superseded' };
const BUG_WORD = { open: 'Open', in_progress: 'Being fixed', fixed: 'Fixed, awaiting QA', disputed: 'Needs clarification', pending_tl: 'Close requested', verified: 'Confirmed fixed' };

/* health verdict — same thresholds as the old project-health scoring, now explained */
function verdict({ passRate, active, critical, overdue }) {
  if (critical >= 5 || active >= 30 || (passRate != null && passRate < 55))
    return { tone: 'danger', label: 'At risk', why: 'Serious problems are piling up or most builds are failing QA.' };
  if (critical >= 1 || overdue > 0 || active >= 10 || (passRate != null && passRate < 75))
    return { tone: 'warning', label: 'Needs attention', why: 'A few things need a decision — see the attention list below.' };
  return { tone: 'success', label: 'Healthy', why: 'Builds are passing QA and problems are being closed.' };
}

/* last-N-month buckets keyed YYYY-MM (oldest → newest) */
function monthKeys(n = 6) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-US', { month: 'short' }) };
  });
}
const ym = (iso) => (iso || '').slice(0, 7);

const fSel = { ...inputStyle, width: 'auto', minHeight: 36, padding: '0 10px', fontSize: 12 };
const explain = { fontSize: 12.5, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.55 };
const sectionTitle = (t, sub) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>{t}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
  </div>
);
const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));

/* ================================================================== */
export function Analytics({ projects, releases, bugs, profiles, teams, projectsById, profilesById, isAdmin, onOpenRelease, onOpenHistory }) {
  const [tab, setTab] = useState('overview');
  const [mode, setMode] = useState('historical'); // 'historical' = all builds · 'current' = active only
  const [f, setF] = useState({ team: 'all', project: 'all', platform: 'all', environment: 'all', developer: 'all', qa: 'all', version: '', from: '', to: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const reset = () => setF({ team: 'all', project: 'all', platform: 'all', environment: 'all', developer: 'all', qa: 'all', version: '', from: '', to: '' });
  const [member, setMember] = useState(null);
  const [glossary, setGlossary] = useState(false);
  const [peopleTab, setPeopleTab] = useState('developers'); // one list at a time, never four stacked

  const releaseById = Object.fromEntries(releases.map((r) => [r.id, r]));
  const name = (id) => profilesById[id]?.name || '—';

  // ---- datasets (shared filter layer; the scope toggle decides all-history vs active) ----
  const relRaw = filterReleases(releases, f, { projectById: projectsById });
  const relF = mode === 'current' ? relRaw.filter((r) => !isClosedStatus(r.status)) : relRaw;
  const bugsF = (mode === 'current' ? filterBugs : historicalBugs)(bugs, f, { releaseById, projectById: projectsById });

  // ---- shared metrics ----
  const m = computeReleaseMetrics(relF, bugsF, { releaseById });
  const bm = aggregateBugMetrics(bugsF);
  const wf = bugWorkflow(bm);
  const activeBugs = bugsF.filter(isActiveBug);
  const critical = activeBugs.filter((b) => b.severity === 'critical').length;
  const overdue = relF.filter((r) => slaLevel(r.status, statusSince(r)) === 'over').length;
  const passRate = m.decided ? m.passRate : null;
  const health = verdict({ passRate, active: activeBugs.length, critical, overdue });
  const attention = computeBottlenecks(relF, bugsF, { projectsById, profilesById, profiles, teams, teamFilter: f.team });
  const workload = computeWorkload(profiles, relF, bugsF, f.team);
  const aging = agingBugs(bugsF, 8);

  // ---- monthly trends (6 months) ----
  const months = monthKeys(6);
  const perMonth = months.map(({ key }) => ({
    submitted: relF.filter((r) => ym(r.date) === key).length,
    approved: relF.filter((r) => r.status === 'approved' && ym(r.qaCompletedAt || r.date) === key).length,
    bugs: bugsF.filter((b) => ym(b.createdAt) === key).length,
  }));

  // ---- quality insight: reports closed without a code change ----
  const resCounts = {};
  BUG_RESOLUTIONS.forEach((r) => (resCounts[r] = bugsF.filter((b) => b.resolution === r).length));
  const invalidTotal = Object.values(resCounts).reduce((s, n) => s + n, 0);
  const invalidPct = bugsF.length ? Math.round((invalidTotal / bugsF.length) * 100) : 0;

  // ---- people ----
  const inTeam = (p) => f.team === 'all' || p.teamId === f.team;
  const devPerf = profiles.filter((p) => p.role === 'Developer' && inTeam(p)).map((d) => {
    const mine = relF.filter((r) => r.submittedById === d.id);
    const ids = new Set(mine.map((r) => r.id));
    const onMine = bugsF.filter((b) => ids.has(b.releaseId));
    const pm = computeReleaseMetrics(mine, onMine, { releaseById });
    return { p: d, submitted: mine.length, active: mine.filter((r) => isActiveStatus(r.status)).length, needsDev: onMine.filter((b) => ['open', 'in_progress', 'disputed'].includes(b.status)).length, openBugs: onMine.filter(isActiveBug).length, pass: pm.decided ? pm.passRate : null };
  }).filter((d) => d.submitted || d.openBugs).sort((a, b) => b.needsDev - a.needsDev || b.submitted - a.submitted);
  const qaPerf = profiles.filter((p) => p.role === 'QA' && inTeam(p)).map((q) => {
    const assigned = relF.filter((r) => r.assignedQa === q.id);
    const appr = assigned.filter((r) => r.status === 'approved' && !m.blocked.has(r.id)).length;
    const rej = assigned.filter((r) => r.status === 'sent_back' || (r.status === 'approved' && m.blocked.has(r.id))).length;
    const dec = appr + rej;
    const reported = bugsF.filter((b) => b.createdById === q.id);
    return { p: q, tested: assigned.length, reported: reported.length, approveRate: dec ? Math.round((appr / dec) * 100) : null, pending: assigned.filter((r) => r.status === 'qa_pending').length, inQa: assigned.filter((r) => r.status === 'qa_in_progress').length, toVerify: reported.filter((b) => b.status === 'fixed').length };
  }).filter((q) => q.tested || q.reported || q.toVerify).sort((a, b) => b.inQa + b.pending - (a.inQa + a.pending));

  // ---- teams (Admin) + projects ----
  const teamRows = (isAdmin ? teams : []).map((t) => {
    const pids = new Set(projects.filter((p) => p.teamId === t.id).map((p) => p.id));
    const rel = relF.filter((r) => pids.has(r.projectId));
    const ids = new Set(rel.map((r) => r.id));
    const tb = bugsF.filter((b) => ids.has(b.releaseId));
    const tm = computeReleaseMetrics(rel, tb, { releaseById });
    const open = tb.filter(isActiveBug);
    return { t, projects: pids.size, releases: rel.length, pass: tm.decided ? tm.passRate : null, open: open.length, critical: open.filter((b) => b.severity === 'critical').length, cycle: tm.cycleDays };
  });
  const projectRows = projects.filter((p) => f.team === 'all' || p.teamId === f.team).map((p) => {
    const rel = relF.filter((r) => r.projectId === p.id);
    const ids = new Set(rel.map((r) => r.id));
    const pb = bugsF.filter((b) => ids.has(b.releaseId));
    const pm = computeReleaseMetrics(rel, pb, { releaseById });
    const open = pb.filter(isActiveBug);
    const crit = open.filter((b) => b.severity === 'critical').length;
    const pass = pm.decided ? pm.passRate : null;
    const active = rel.filter((r) => !isClosedStatus(r.status)).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
    return { p, n: rel.length, bugs: pb.length, open: open.length, crit, pass, cycle: avgDaysBetween(rel.filter((r) => r.status === 'approved' && r.qaCompletedAt), 'createdAt', 'qaCompletedAt'), active, health: verdict({ passRate: pass, active: open.length, critical: crit, overdue: rel.filter((r) => slaLevel(r.status, statusSince(r)) === 'over').length }) };
  }).filter((r) => r.n > 0).sort((a, b) => b.open - a.open);

  const pipeline = STATUS_ORDER.map((k) => ({ label: STAGE_LABEL[k], count: relF.filter((r) => r.status === k).length, tone: STATUS_TONE[k], color: STATUSES[k].color }));
  const devs = profiles.filter((p) => p.role === 'Developer' && inTeam(p));
  const qas = profiles.filter((p) => p.role === 'QA' && inTeam(p));
  const memberValue = f.developer !== 'all' ? `dev:${f.developer}` : f.qa !== 'all' ? `qa:${f.qa}` : 'all';
  const onMember = (v) => { const [kind, id] = v.split(':'); setF((s) => ({ ...s, developer: kind === 'dev' ? id : 'all', qa: kind === 'qa' ? id : 'all' })); };
  const scopeWords = [f.team !== 'all' && teams.find((t) => t.id === f.team)?.name, f.project !== 'all' && projectsById[f.project]?.name, f.platform !== 'all' && f.platform, f.environment !== 'all' && f.environment, f.developer !== 'all' && name(f.developer), f.qa !== 'all' && name(f.qa), f.version && `v${f.version}`, (f.from || f.to) && `${f.from || '…'} → ${f.to || '…'}`].filter(Boolean);

  const tabs = [['overview', 'Overview'], ['delivery', 'Delivery'], ['quality', 'Quality'], ['speed', 'Speed'], ['people', 'People'], ['projects', 'Projects']];

  return (
    <div className="anim-in">
      <PageHeader
        title="Analytics"
        icon={<IconChart size={18} />}
        subtitle={isAdmin ? 'How delivery and quality are going across every team — in plain language.' : 'How your team’s delivery and quality are going — in plain language.'}
        actions={<button style={ghostButton} onClick={() => setGlossary((v) => !v)}>{glossary ? 'Hide' : 'How to read this page'}</button>}
        toolbar={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Segmented options={[['historical', 'All history'], ['current', 'Active only']]} value={mode} onChange={setMode} />
            {isAdmin && (
              <select style={fSel} value={f.team} onChange={(e) => set('team', e.target.value)}>
                <option value="all">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <select style={fSel} value={f.project} onChange={(e) => set('project', e.target.value)}>
              <option value="all">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select style={fSel} value={f.platform} onChange={(e) => set('platform', e.target.value)}>
              <option value="all">All platforms</option>{RELEASE_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={fSel} value={f.environment} onChange={(e) => set('environment', e.target.value)}>
              <option value="all">All environments</option>{ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select style={fSel} value={memberValue} onChange={(e) => onMember(e.target.value)}>
              <option value="all">Everyone</option>
              <optgroup label="Developers">{devs.map((p) => <option key={p.id} value={`dev:${p.id}`}>{p.name}</option>)}</optgroup>
              <optgroup label="QA">{qas.map((p) => <option key={p.id} value={`qa:${p.id}`}>{p.name}</option>)}</optgroup>
            </select>
            <input style={{ ...fSel, width: 110 }} value={f.version} placeholder="Version…" onChange={(e) => set('version', e.target.value)} />
            <input style={fSel} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} title="From" />
            <input style={fSel} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} title="To" />
            {(scopeWords.length > 0 || mode === 'current') && <button style={{ ...ghostButton, minHeight: 36, padding: '0 12px' }} onClick={() => { reset(); setMode('historical'); }}>Reset</button>}
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
              Showing {mode === 'current' ? 'active builds' : 'all builds'}{scopeWords.length ? ` · ${scopeWords.join(' · ')}` : ''} · {relF.length} builds · {bugsF.length} bugs
            </span>
          </div>
        }
      />

      {glossary && (
        <div style={{ ...card, padding: 18, marginBottom: 18 }}>
          {sectionTitle('How to read this page', 'Every number is defined the same way everywhere in the app.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px 20px', fontSize: 12.5 }}>
            {Object.keys(WORDS).map((k) => (
              <div key={k}><strong>{L(k)}</strong> <span style={{ color: 'var(--color-text-secondary)' }}>— {HELP(k)}</span></div>
            ))}
            <div><strong>All history vs Active only</strong> <span style={{ color: 'var(--color-text-secondary)' }}>— everything ever shipped, or just builds still in flight.</span></div>
            <div><strong>Judged builds</strong> <span style={{ color: 'var(--color-text-secondary)' }}>— approved or sent back; builds still in testing aren’t counted in rates. A build approved with a serious bug still open counts as sent back.</span></div>
          </div>
        </div>
      )}

      <SubTabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ======================= OVERVIEW ======================= */}
      {tab === 'overview' && (
        <>
          <div style={{ ...card, padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderLeft: `4px solid var(--${health.tone === 'success' ? 'success' : health.tone === 'warning' ? 'warning' : 'danger'})` }}>
            <Pill label={health.label} tone={health.tone} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Overall: {health.label.toLowerCase()}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{health.why}</div>
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
              <span><b className="tnum" style={{ color: 'var(--text)' }}>{passRate == null ? '—' : `${passRate}%`}</b> approval</span>
              <span><b className="tnum" style={{ color: activeBugs.length ? 'var(--danger)' : 'var(--text)' }}>{activeBugs.length}</b> open problems</span>
              <span><b className="tnum" style={{ color: critical ? 'var(--danger)' : 'var(--text)' }}>{critical}</b> critical</span>
              <span><b className="tnum" style={{ color: overdue ? 'var(--warning)' : 'var(--text)' }}>{overdue}</b> overdue</span>
            </div>
          </div>

          <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', marginBottom: 16 }}>
            <StatCard accent="slate" label={L('submitted')} value={num(m.submitted)} foot={HELP('submitted')} />
            <StatCard accent="teal" label={L('approved')} value={num(m.approved)} foot={HELP('approved')} />
            <StatCard accent="indigo" label={L('passRate')} value={passRate == null ? '—' : `${passRate}%`} foot={m.decided ? `of ${m.decided} judged builds` : 'no builds judged yet'} />
            <StatCard accent="rose" label={L('active')} value={num(activeBugs.length)} foot={`${critical} critical · ${wf.awaitingQa} awaiting QA`} />
            <StatCard accent="amber" label={L('cycle')} value={m.cycleDays ? `${num(m.cycleDays, 1)}d` : '—'} foot={HELP('cycle')} />
            <StatCard accent="rose" label={L('prod')} value={num(m.prodBugs)} foot={HELP('prod')} />
          </div>

          <div className="dash-mid">
            <div style={{ ...card, padding: 18 }}>
              {sectionTitle('Needs a decision', 'The things slowing delivery down right now, in order of urgency.')}
              {attention.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Nothing is blocked. Everything is moving.</div>
                : <div style={{ display: 'grid', gap: 8 }}>{attention.map((a, i) => <AlertCard key={i} level={a.level}>{a.text}</AlertCard>)}</div>}
            </div>
            <div style={{ ...card, padding: 18 }}>
              {sectionTitle('Where builds are right now', `${relF.length} builds, by stage`)}
              <Chevron stages={pipeline.filter((s) => s.label !== 'Superseded').map((s) => ({ label: s.label, count: s.count, tone: s.tone }))} />
              <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 10 }}>{pipeline.find((s) => s.label === 'Superseded')?.count || 0} older builds were replaced by a newer one.</div>
            </div>
          </div>
        </>
      )}

      {/* ======================= DELIVERY ======================= */}
      {tab === 'delivery' && (
        <>
          <p style={explain}>How many builds went to QA, how many passed, and how that is trending.</p>
          <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: 16 }}>
            <StatCard accent="slate" label={L('submitted')} value={num(m.submitted)} foot={HELP('submitted')} />
            <StatCard accent="teal" label={L('approved')} value={num(m.approved)} foot={HELP('approved')} />
            <StatCard accent="rose" label={L('rejected')} value={num(m.rejected)} foot={m.decided ? `${m.rejRate}% of judged builds` : HELP('rejected')} />
            <StatCard accent="indigo" label={L('passRate')} value={passRate == null ? '—' : `${passRate}%`} foot={HELP('passRate')} />
          </div>
          <div className="dash-mid" style={{ marginBottom: 16 }}>
            <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
              {sectionTitle('Builds per month', 'Solid = approved by QA · dashed = submitted')}
              <TrendChart data={perMonth.map((x) => x.approved)} target={perMonth.map((x) => x.submitted)} xLabels={months.map((x) => x.label)} height={240} />
              {/* the numbers behind the chart — real detail in the space under the plot */}
              <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--color-border-primary)', display: 'grid', gridTemplateColumns: `96px repeat(${months.length}, minmax(0, 1fr))`, gap: '7px 8px', fontSize: 12, alignItems: 'center' }}>
                <span />
                {months.map((mo) => <b key={mo.key} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{mo.label}</b>)}
                <span style={{ color: 'var(--color-text-secondary)' }}>Submitted</span>
                {perMonth.map((x, i) => <span key={i} className="tnum" style={{ textAlign: 'center' }}>{x.submitted}</span>)}
                <span style={{ color: 'var(--color-text-secondary)' }}>Approved</span>
                {perMonth.map((x, i) => <span key={i} className="tnum" style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>{x.approved}</span>)}
                <span style={{ color: 'var(--color-text-secondary)' }}>Problems found</span>
                {perMonth.map((x, i) => <span key={i} className="tnum" style={{ textAlign: 'center', color: x.bugs ? 'var(--danger)' : 'var(--color-text-tertiary)' }}>{x.bugs}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <PassRing pct={passRate ?? 0} label={L('passRate')} sub={m.decided ? `${m.approved} approved of ${m.decided} judged` : 'No builds judged yet'} />
              <div style={{ ...card, padding: 18, flex: 1 }}>
                {sectionTitle('Builds by stage')}
                <StageBars stages={pipeline.map((s) => ({ label: s.label, count: s.count, color: s.color }))} totalLabel="All builds" />
              </div>
            </div>
          </div>
          <div style={{ ...card, padding: 18 }}>
            {sectionTitle('Every build', 'Click a row to open it. “Left over” = problems inherited from the previous build.')}
            <ReleaseHistory releases={relF} projectsById={projectsById} profilesById={profilesById} pageSize={12} onRowClick={(r) => (onOpenRelease ? onOpenRelease(r.id) : onOpenHistory && onOpenHistory(projectsById[r.projectId]))} />
          </div>
        </>
      )}

      {/* ======================= QUALITY ======================= */}
      {tab === 'quality' && (
        <>
          <p style={explain}>Every problem QA reported, where each one stands, and how serious they are. One problem is one record — it moves between builds, it is never counted twice.</p>
          <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', marginBottom: 16 }}>
            <StatCard accent="slate" label="Problems reported" value={num(bm.total)} foot="in the current scope" />
            <StatCard accent="rose" label={L('needsDev')} value={num(wf.needsDev)} foot={HELP('needsDev')} />
            <StatCard accent="amber" label={L('awaitingQa')} value={num(wf.awaitingQa)} foot={HELP('awaitingQa')} />
            <StatCard accent="teal" label={L('verified')} value={num(wf.verified)} foot={HELP('verified')} />
            <StatCard accent="amber" label={L('carried')} value={num(m.carriedBugs)} foot={`${m.carryRate}% of problems${m.avgIterations ? ` · ~${m.avgIterations} ${L('rounds').toLowerCase()}` : ''}`} />
            <StatCard accent="rose" label={L('prod')} value={num(m.prodBugs)} foot={HELP('prod')} />
          </div>
          <div className="dash-mid" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...card, padding: 18 }}>
                {sectionTitle('Problems reported per month')}
                <TrendChart data={perMonth.map((x) => x.bugs)} xLabels={months.map((x) => x.label)} height={220} />
              </div>
              <div style={{ ...card, padding: 18 }}>
                {sectionTitle('Where each problem stands')}
                <StackedBar segments={BUG_STATUS_ORDER.map((s) => ({ label: BUG_WORD[s] || BUG_STATUSES[s]?.label || s, value: bm.byStatus[s] || 0, color: BUG_STATUSES[s]?.color || 'var(--color-text-tertiary)' }))} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...card, padding: 18 }}>
                {sectionTitle('How serious', 'Critical and major block a release; minor does not.')}
                <Donut segments={SEVERITY_ORDER.map((s) => ({ label: SEVERITIES[s].label, value: bm.bySeverity[s] || 0, color: SEVERITIES[s].color }))} centerValue={bm.total} centerLabel="problems" />
              </div>
              <div style={{ ...card, padding: 18 }}>
                {sectionTitle(L('invalid'), HELP('invalid'))}
                {BUG_RESOLUTIONS.map((r) => (
                  <div key={r} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--color-border-primary)', fontSize: 13 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{r}</span>
                    <span className="tnum"><b>{resCounts[r]}</b> <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{bm.total ? Math.round((resCounts[r] / bm.total) * 100) : 0}%</span></span>
                  </div>
                ))}
                <div style={{ fontSize: 12.5, marginTop: 10, color: invalidPct >= 30 ? 'var(--tone-warning-fg)' : 'var(--color-text-secondary)' }}>
                  <b>{invalidPct}%</b> of reports were closed without a code change.{invalidPct >= 30 ? ' That is high — it usually means requirements were unclear when the work started.' : ''}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ======================= SPEED ======================= */}
      {tab === 'speed' && (
        <>
          <p style={explain}>How long a build waits for a verdict, where that time goes, and what is overdue. Averages only include builds with complete timestamps.</p>
          <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', marginBottom: 16 }}>
            <StatCard accent="amber" label={L('cycle')} value={m.cycleDays ? `${num(m.cycleDays, 1)}d` : '—'} foot={HELP('cycle')} />
            <StatCard accent="slate" label={L('waitTime')} value={m.assignTime ? `${num(m.assignTime, 1)}d` : '—'} foot={HELP('waitTime')} />
            <StatCard accent="teal" label={L('testTime')} value={m.qaTime ? `${num(m.qaTime, 1)}d` : '—'} foot={HELP('testTime')} />
            <StatCard accent="rose" label={L('overdue')} value={num(overdue)} foot={HELP('overdue')} />
            <StatCard accent="indigo" label={L('rounds')} value={m.avgIterations ?? '—'} foot={HELP('rounds')} />
          </div>
          <div className="dash-mid" style={{ marginBottom: 16 }}>
            {/* left: time split + per-project speed table (fills the column) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...card, padding: 18 }}>
                {sectionTitle('Where the time goes', `${m.cycleDays ? `${num(m.cycleDays, 1)} days` : '—'} from submit to QA done`)}
                <SegmentedTimeline segments={[{ label: L('waitTime'), value: m.assignTime, color: '#94A3B8' }, { label: L('testTime'), value: m.qaTime, color: '#14B8A6' }]} />
              </div>
              <div style={{ ...card, padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '14px 14px 0' }}>{sectionTitle('Speed by project', 'Where builds wait longest and what is overdue.')}</div>
                <DataTable columns={[
                  { label: 'Project', render: (r) => <b>{r.p.name}</b> },
                  { label: 'Builds', render: (r) => r.n },
                  { label: L('cycle'), render: (r) => (r.cycle ? `${num(r.cycle, 1)}d` : '—') },
                  { label: 'Sent back', render: (r) => `${r.n ? Math.round((relF.filter((x) => x.projectId === r.p.id && x.status === 'sent_back').length / r.n) * 100) : 0}%` },
                  { label: 'Overdue', render: (r) => { const o = relF.filter((x) => x.projectId === r.p.id && slaLevel(x.status, statusSince(x)) === 'over').length; return o ? <Pill label={o} tone="danger" /> : '0'; } },
                ]} rows={projectRows} rowKey={(r) => r.p.id} searchText={(r) => r.p.name} searchPlaceholder="Search projects…" pageSize={8} />
              </div>
            </div>
            {/* right: the overdue list */}
            <div style={{ ...card, padding: 18 }}>
              {sectionTitle('Oldest open problems', 'Open longer than the agreed limit, oldest first.')}
              {aging.length === 0 ? <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No problems are overdue.</div> : aging.map((b) => (
                <div key={b.id} className="mgr-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, cursor: onOpenRelease ? 'pointer' : 'default' }} onClick={() => onOpenRelease && onOpenRelease(b.releaseId)}>
                  <SeverityBadge severity={b.severity} />
                  <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{Math.round((Date.now() - new Date(b.createdAt)) / 86400000)}d</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ======================= PEOPLE ======================= */}
      {tab === 'people' && (
        <>
          <p style={explain}>Who is carrying what. Click a person for their full record. Developers are measured on the builds they submit; QA on the builds they test.</p>
          <SubTabs
            tabs={[
              ['developers', `Developers (${devPerf.length})`],
              ['qa', `QA (${qaPerf.length})`],
              ['workload', `Workload (${workload.length})`],
              ...(isAdmin && teamRows.length > 0 ? [['teams', `Teams (${teamRows.length})`]] : []),
            ]}
            active={peopleTab}
            onChange={setPeopleTab}
          />
          {peopleTab === 'teams' && isAdmin && teamRows.length > 0 && (
            <div style={{ ...card, padding: 0, marginBottom: 16 }}>
              <div style={{ padding: '14px 14px 0' }}>{sectionTitle('By team')}</div>
              <DataTable columns={[
                { label: 'Team', render: (r) => <b>{r.t.name}</b> },
                { label: 'Projects', render: (r) => r.projects },
                { label: 'Builds', render: (r) => r.releases },
                { label: L('passRate'), render: (r) => (r.pass == null ? '—' : <Pill label={`${r.pass}%`} tone={passTone(r.pass)} />) },
                { label: L('active'), render: (r) => (r.open ? <Pill label={r.open} tone="danger" /> : '0') },
                { label: 'Critical', render: (r) => (r.critical ? <Pill label={r.critical} tone="danger" /> : '0') },
                { label: L('cycle'), render: (r) => (r.cycle ? `${num(r.cycle, 1)}d` : '—') },
              ]} rows={teamRows} rowKey={(r) => r.t.id} />
            </div>
          )}
          {peopleTab === 'developers' && (
          <div style={{ ...card, padding: 0, marginBottom: 16 }}>
            <div style={{ padding: '14px 14px 0' }}>{sectionTitle('Developers', 'Sorted by who has the most problems waiting on them.')}</div>
            <DataTable columns={[
              { label: 'Developer', render: (r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r.p.name} size={24} />{r.p.name}</span> },
              { label: 'Builds submitted', render: (r) => r.submitted },
              { label: 'Builds in QA now', render: (r) => r.active },
              { label: 'Problems to fix', render: (r) => (r.needsDev ? <Pill label={r.needsDev} tone={r.needsDev > 5 ? 'danger' : 'warning'} /> : '0') },
              { label: L('active'), render: (r) => (r.openBugs ? <Pill label={r.openBugs} tone={r.openBugs > 20 ? 'danger' : 'neutral'} /> : '0') },
              { label: L('passRate'), render: (r) => (r.pass == null ? '—' : <Pill label={`${r.pass}%`} tone={passTone(r.pass)} />) },
            ]} rows={devPerf} rowKey={(r) => r.p.id} searchText={(r) => r.p.name} searchPlaceholder="Search developers…" onRowClick={(r) => setMember(r.p)} />
          </div>
          )}
          {peopleTab === 'qa' && (
          <div style={{ ...card, padding: 0, marginBottom: 16 }}>
            <div style={{ padding: '14px 14px 0' }}>{sectionTitle('QA engineers', 'Sorted by who has the most builds waiting.')}</div>
            <DataTable columns={[
              { label: 'QA engineer', render: (r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r.p.name} size={24} />{r.p.name}</span> },
              { label: 'Builds tested', render: (r) => r.tested },
              { label: 'Problems reported', render: (r) => r.reported },
              { label: 'Approved', render: (r) => (r.approveRate == null ? '—' : <Pill label={`${r.approveRate}%`} tone={passTone(r.approveRate)} />) },
              { label: 'Waiting to start', render: (r) => r.pending },
              { label: 'Testing now', render: (r) => (r.inQa > 3 ? <Pill label={r.inQa} tone="danger" /> : r.inQa) },
              { label: 'Fixes to re-check', render: (r) => (r.toVerify ? <Pill label={r.toVerify} tone="warning" /> : '0') },
            ]} rows={qaPerf} rowKey={(r) => r.p.id} searchText={(r) => r.p.name} searchPlaceholder="Search QA…" onRowClick={(r) => setMember(r.p)} />
          </div>
          )}
          {peopleTab === 'workload' && (
          <div style={{ ...card, padding: 0 }}>
            <div style={{ padding: '14px 14px 0' }}>{sectionTitle('Workload right now', 'Everyone with something on their plate.')}</div>
            <DataTable columns={[
              { label: 'Person', render: (r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r.m.name} size={24} />{r.m.name}</span> },
              { label: 'Role', render: (r) => <Pill label={r.m.role} tone={r.m.role === 'QA' ? 'info' : 'neutral'} /> },
              { label: 'Builds in QA', render: (r) => r.activeReleases },
              { label: 'Builds to review', render: (r) => (r.pendingReviews > 3 ? <Pill label={r.pendingReviews} tone="danger" /> : r.pendingReviews) },
              { label: 'Problems on their plate', render: (r) => (r.openBugs > 8 ? <Pill label={r.openBugs} tone="danger" /> : r.openBugs) },
            ]} rows={workload} rowKey={(r) => r.m.id} searchText={(r) => r.m.name} searchPlaceholder="Search people…" onRowClick={(r) => setMember(r.m)} />
          </div>
          )}
        </>
      )}

      {/* ======================= PROJECTS ======================= */}
      {tab === 'projects' && (
        <>
          <p style={explain}>One line per project: what is live, what is open, and an overall health call. Sorted by open problems.</p>
          <div style={{ ...card, padding: 0 }}>
            <DataTable columns={[
              { label: 'Project', render: (r) => <b>{r.p.name}</b> },
              ...(isAdmin ? [{ label: 'Team', render: (r) => teams.find((t) => t.id === r.p.teamId)?.name || '—' }] : []),
              { label: 'Current build', render: (r) => (r.active ? <span className="tnum">v{formatVersion(r.active.version)} <StatusBadge status={r.active.status} /></span> : '—') },
              { label: 'Builds', render: (r) => r.n },
              { label: 'Problems', render: (r) => r.bugs },
              { label: L('active'), render: (r) => (r.open ? <Pill label={r.open} tone="danger" /> : '0') },
              { label: 'Critical', render: (r) => (r.crit ? <Pill label={r.crit} tone="danger" /> : '0') },
              { label: L('passRate'), render: (r) => (r.pass == null ? '—' : <Pill label={`${r.pass}%`} tone={passTone(r.pass)} />) },
              { label: L('cycle'), render: (r) => (r.cycle ? `${num(r.cycle, 1)}d` : '—') },
              { label: 'Health', render: (r) => <Pill label={r.health.label} tone={r.health.tone} /> },
              { label: '', render: (r) => (onOpenHistory ? <button style={{ ...ghostButton, padding: '3px 9px', minHeight: 0, fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onOpenHistory(r.p); }}>History</button> : null) },
            ]} rows={projectRows} rowKey={(r) => r.p.id} searchText={(r) => r.p.name} searchPlaceholder="Search projects…" pageSize={15} />
          </div>
        </>
      )}

      {member && <MemberDetail p={member} releases={relF} bugs={bugsF} projectsById={projectsById} releaseById={releaseById} onOpenRelease={onOpenRelease} onClose={() => setMember(null)} />}
    </div>
  );
}

/* ---- person drill-down: their builds and their problems, plainly ---- */
function MemberDetail({ p, releases, bugs, projectsById, releaseById, onOpenRelease, onClose }) {
  const isQa = p.role === 'QA';
  const mine = isQa ? releases.filter((r) => r.assignedQa === p.id) : releases.filter((r) => r.submittedById === p.id);
  const ids = new Set(mine.map((r) => r.id));
  const theirBugs = isQa ? bugs.filter((b) => b.createdById === p.id) : bugs.filter((b) => ids.has(b.releaseId));
  const pm = computeReleaseMetrics(mine, isQa ? bugs.filter((b) => ids.has(b.releaseId)) : theirBugs, { releaseById });
  const stat = (l, v, c) => (
    <div style={{ ...card, padding: '10px 14px', flex: '1 1 120px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: c || 'var(--text)' }}>{v}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{l}</div>
    </div>
  );
  return (
    <ModalShell onClose={onClose} title={p.name} subtitle={`${p.role}${p.email ? ` · ${p.email}` : ''}`} maxWidth={680}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {stat(isQa ? 'Builds tested' : 'Builds submitted', mine.length)}
        {stat('Approved', pm.approved, 'var(--success)')}
        {stat('Sent back', pm.rejected, pm.rejected ? 'var(--danger)' : undefined)}
        {stat(isQa ? 'Problems reported' : 'Open problems on their builds', isQa ? theirBugs.length : theirBugs.filter(isActiveBug).length)}
      </div>
      <div style={{ ...sideHead }}>{isQa ? 'Builds they tested' : 'Builds they submitted'}</div>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
        {mine.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>None in this scope.</div> : mine.slice(0, 40).map((r) => (
          <div key={r.id} className="mgr-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderRadius: 8, cursor: onOpenRelease ? 'pointer' : 'default', fontSize: 12.5 }} onClick={() => onOpenRelease && onOpenRelease(r.id)}>
            <span className="tnum" style={{ fontWeight: 600 }}>v{formatVersion(r.version)}</span>
            <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{projectsById[r.projectId]?.name || '—'}</span>
            <StatusBadge status={r.status} />
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.date}</span>
          </div>
        ))}
      </div>
      <div style={{ ...sideHead }}>{isQa ? 'Problems they reported' : 'Problems on their builds'}</div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {theirBugs.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>None in this scope.</div> : theirBugs.slice(0, 40).map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', fontSize: 12.5 }}>
            <SeverityBadge severity={b.severity} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{BUG_WORD[b.status] || b.status}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
