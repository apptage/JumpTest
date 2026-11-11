/* Bugs feature — the standalone Bugs page: cross-project bug list with filters,
   an aging-issues panel, and readable per-bug cards (full detail: description,
   project, platform, release version, reporter). Filtering is the shared layer. */
import { useState, useMemo, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as api from '@/api.js';
import { card, inputStyle, ghostButton, BugStatusBadge, SeverityBadge } from '@/ui.jsx';
import { Empty, PageHeader, SlaBadge, TagChip, sideHead, Pager, useDebounced } from '@shared/ui-kit.jsx';
import { useMetricsData } from '@shared/useMetricsData.js';
import { StatSmall } from '@shared/dashboard-kit.jsx';
import { filterBugs, filterReleases } from '@shared/filters.js';
import { computeBottlenecks } from '@shared/releaseMetrics.js';
import { agingBugs, aggregateBugMetrics, bugWorkflow } from '@shared/bugMetrics.js';
import { ScopeSummary } from '@shared/scope-summary.jsx';
import { BugActions, ProposedCloseBanner, BugTimeline } from '@shared/bug-actions.jsx';
import {
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  BUG_STATUS_ORDER,
  BUG_TAGS,
  BUG_FEATURES,
  bugSlaLevel,
  humanizeSince,
  isReadOnly,
  RELEASE_PLATFORMS,
  SLA_COLORS,
} from '@/constants.js';
import { managesProject } from '@shared/permissions.js';

/* Clickable status chip — same look as the Releases page so the platform reads
   the same everywhere: dot · label · count; accent fill when active. */
function QuickChip({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 12,
        cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)',
        background: active ? 'var(--accent)' : 'var(--card)',
        color: active ? 'var(--accent-foreground)' : 'var(--color-text-primary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? 'var(--accent-foreground)' : color, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: active ? 'var(--accent-foreground)' : 'var(--color-text-secondary)' }}>{value}</span>
    </button>
  );
}
/* Shared section heading (matches Analytics / Hub): Lexend title + muted line. */
const sectionTitle = (t, sub, dot) => (
  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
    {dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, marginTop: 6, flexShrink: 0 }} />}
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>{t}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

const BUGS_PAGE_SIZE = 20;
const NONE = [];

/* The list, chip counts and overdue panel come from the database one page at a
   time (list_bugs). Until that migration is applied, fetchBugsPage returns null
   and the page filters the bugs the app already loaded, as before.
   scopeProjectIds: the caller's projects, or null for Admins. */
export function BugsPage({
  scopeProjectIds = null,
  bugs: bugsProp,       // the loaded lists in legacy mode; undefined otherwise
  releases: releasesProp,
  projects,
  projectsById,
  profilesById,
  profiles,
  teams,
  isAdmin,
  user,
  isSubmitting,
  onOpenRelease,
  onBugStatus,
  onBugResolve,
  onBugCloseReview,
  onDeleteBug,
}) {
  const bugs = bugsProp || NONE;
  const releases = releasesProp || NONE;
  const globalRelById = useMemo(() => {
    const m = {};
    releases.forEach((r) => (m[r.id] = r));
    return m;
  }, [releases]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sev, setSev] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [tag, setTag] = useState('all');
  const [feature, setFeature] = useState('all');
  const [project, setProject] = useState('all');
  const [team, setTeam] = useState('all');
  const [developer, setDeveloper] = useState('all');
  const [qa, setQa] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const [quick, setQuick] = useState('all'); // status chip: all | needsDev | awaitingQa | verified | carried | aging
  const [more, setMore] = useState(false);   // secondary filters row
  const [showAging, setShowAging] = useState(false);       // attention panels are capped at 4 rows
  const [showDecisions, setShowDecisions] = useState(false);

  // Developer filter = actual Developers only (not Team Leads / Admins / the
  // read-only Manager, which the old `role !== 'QA'` test wrongly included).
  const devs = (profiles || []).filter((p) => p.role === 'Developer');
  const qas = (profiles || []).filter((p) => p.role === 'QA');

  // single shared filter pipeline (same functions Analytics uses)
  const search = useDebounced(q, 300);
  const bugFilter = { search, status, severity: sev, platform, tag, feature, project, team, developer, qa, from, to };
  const filterKey = JSON.stringify(bugFilter);
  const scopeKey = scopeProjectIds ? [...scopeProjectIds].sort().join(',') : 'all';
  useEffect(() => { setPage(0); }, [filterKey, quick, sort, scopeKey]);

  const serverQ = useQuery({
    queryKey: ['bugs', 'page', scopeKey, filterKey, quick, sort, page],
    queryFn: () => api.fetchBugsPage({ filters: bugFilter, projectIds: scopeProjectIds, quick, sort, offset: page * BUGS_PAGE_SIZE, limit: BUGS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const server = serverQ.data || null;          // null = list_bugs not deployed, or still loading
  const local = serverQ.data === null;          // fall back to filtering the loaded bugs
  const relById = useMemo(() => {
    if (!server) return globalRelById;
    const m = { ...globalRelById };
    server.releases.forEach((r) => (m[r.id] = r));
    return m;
  }, [globalRelById, server]);

  const filtered = filterBugs(bugs, bugFilter, { releaseById: globalRelById, projectById: projectsById }).sort((a, b) =>
    sort === 'oldest'
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const metrics = aggregateBugMetrics(filtered);
  // aging = active bugs from the SAME filtered dataset, at/over SLA, oldest first
  const localAging = agingBugs(filtered);
  const agingIds = new Set(localAging.map((b) => b.id));
  const localWf = bugWorkflow(metrics);
  // server mode: the database's counts; the overdue panel lists its 50 oldest
  const wf = server ? { total: server.total, ...server.counts } : localWf;
  // Each bug is a single row now — carried is a plain per-bug flag.
  const carried = server ? server.counts.carried : filtered.filter((b) => b.carriedForward).length;
  const agingAll = server ? server.aging : localAging;
  const agingCount = server ? server.agingTotal : localAging.length;
  // The status chips narrow the list ON TOP of the dropdown filters; chip counts
  // stay on `filtered` so they don't change while you click between them.
  const QUICK = {
    needsDev: (b) => ['open', 'in_progress', 'disputed'].includes(b.status),
    awaitingQa: (b) => ['fixed', 'pending_tl'].includes(b.status),
    verified: (b) => b.status === 'verified',
    carried: (b) => !!b.carriedForward,
    aging: (b) => agingIds.has(b.id),
  };
  const localListed = quick === 'all' ? filtered : filtered.filter(QUICK[quick] || (() => true));
  const listedCount = server ? server.listed : localListed.length;
  const pageBugs = server ? server.rows : local ? localListed.slice(page * BUGS_PAGE_SIZE, (page + 1) * BUGS_PAGE_SIZE) : [];
  const loadingFirst = serverQ.isPending;
  // a page past the end (e.g. after the last bug on it was verified): step back
  useEffect(() => {
    if (!loadingFirst && !serverQ.isPlaceholderData && page > 0 && pageBugs.length === 0 && listedCount > 0) {
      setPage(Math.ceil(listedCount / BUGS_PAGE_SIZE) - 1);
    }
  }, [loadingFirst, serverQ.isPlaceholderData, page, pageBugs.length, listedCount]);

  // Delays & Attention Needed — operational bottlenecks (over-SLA releases,
  // developer/reviewer overload). Lives here on the live board, not Analytics.
  // Uses the live releases in the same scope + the current filtered live bugs.
  // live work only (releases not closed + their bugs), loaded for this panel;
  // the lists loaded at sign-in until it's back or if the migration isn't applied
  const liveFallback = useMemo(() => (releasesProp ? { releases: releasesProp, bugs: bugsProp || NONE } : null), [releasesProp, bugsProp]);
  const live = useMetricsData({ scopeProjectIds, liveOnly: true, fallback: liveFallback });
  const liveRelById = useMemo(() => Object.fromEntries(live.releases.map((r) => [r.id, r])), [live.releases]);
  const liveFiltered = live.source === 'db' ? filterBugs(live.bugs, bugFilter, { releaseById: liveRelById, projectById: projectsById }) : filtered;
  const relScoped = filterReleases(live.releases, bugFilter, { projectById: projectsById });
  const bottlenecks = computeBottlenecks(relScoped, liveFiltered, {
    projectsById,
    profilesById,
    profiles,
    teams,
    teamFilter: team,
  });

  // whole-scope denominator (this page's data, no filters) for "X of Y"
  const scopeOpen = server
    ? server.scopeActive
    : aggregateBugMetrics(filterBugs(bugs, {}, { releaseById: globalRelById, projectById: projectsById })).active;

  // human-readable active-filter breadcrumb
  const pName = (id) => profiles.find((p) => p.id === id)?.name || id;
  const crumbs = [];
  if (team !== 'all') crumbs.push((teams || []).find((t) => t.id === team)?.name || 'Team');
  if (project !== 'all') crumbs.push(projectsById[project]?.name || 'Project');
  if (platform !== 'all') crumbs.push(platform);
  if (status !== 'all') crumbs.push(BUG_STATUSES[status]?.label || status);
  if (sev !== 'all') crumbs.push(SEVERITIES[sev]?.label || sev);
  if (tag !== 'all') crumbs.push(tag);
  if (feature !== 'all') crumbs.push(feature);
  if (developer !== 'all') crumbs.push(pName(developer));
  if (qa !== 'all') crumbs.push(pName(qa));
  if (from || to) crumbs.push(`${from || '…'} → ${to || '…'}`);
  if (q.trim()) crumbs.push(`"${q.trim()}"`);

  const fSel = { ...inputStyle, width: 'auto', minHeight: 36, padding: '0 10px', fontSize: 12 };
  const tbBtn = {
    minHeight: 36, padding: '0 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 12, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)',
  };
  // secondary filters live behind "More filters"; auto-shown while any of them is active
  const secondaryCount = [platform, tag, feature, team, developer, qa].filter((v) => v !== 'all').length + (from ? 1 : 0) + (to ? 1 : 0);
  const showMore = more || secondaryCount > 0;
  const anyFilter = crumbs.length > 0 || quick !== 'all';
  const resetAll = () => {
    setQ(''); setStatus('all'); setSev('all'); setPlatform('all'); setTag('all'); setFeature('all'); setProject('all');
    setTeam('all'); setDeveloper('all'); setQa('all'); setFrom(''); setTo(''); setSort('newest'); setQuick('all'); setMore(false); setPage(0);
  };

  return (
    <>
      <PageHeader title="Bugs" subtitle="Track and triage every bug across your releases" />

      {/* status chips — click to narrow the list (counts follow the toolbar filters) */}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          ['all', 'All bugs', wf.total, 'var(--color-text-tertiary)'],
          ['needsDev', 'With the developer', wf.needsDev, 'var(--danger)'],
          ['awaitingQa', 'Fixed, awaiting QA', wf.awaitingQa, 'var(--warning)'],
          ['verified', 'Confirmed fixed', wf.verified, 'var(--success)'],
          ['carried', 'Left over from a previous build', carried, 'var(--warning)'],
          ['aging', 'Overdue', agingCount, 'var(--danger)'],
        ].map(([k, label, value, color]) => (
          <QuickChip key={k} label={label} value={loadingFirst ? '…' : value} color={color} active={quick === k} onClick={() => setQuick(k)} />
        ))}
      </div>

      {/* one toolbar — the primary filters visible, everything else behind "More filters" */}
      <div style={{ ...card, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: '1 1 220px', width: 'auto', minHeight: 36 }}
            value={q}
            placeholder="Search bugs or projects…"
            aria-label="Search bugs"
            onChange={(e) => setQ(e.target.value)}
          />
          <select style={fSel} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {BUG_STATUS_ORDER.map((s) => <option key={s} value={s}>{BUG_STATUSES[s].label}</option>)}
          </select>
          <select style={fSel} value={sev} onChange={(e) => setSev(e.target.value)}>
            <option value="all">All severities</option>
            {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{SEVERITIES[s].label}</option>)}
          </select>
          <select style={fSel} value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="all">All projects</option>
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select style={fSel} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button style={tbBtn} onClick={() => setMore((v) => !v)}>
            {showMore ? 'Fewer filters' : `More filters${secondaryCount ? ` (${secondaryCount})` : ''}`}
          </button>
          {anyFilter && <button style={tbBtn} onClick={resetAll}>Reset</button>}
        </div>
        {showMore && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--color-border-primary)' }}>
            <select style={fSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="all">All platforms</option>
              {RELEASE_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={fSel} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="all">All tags</option>
              {BUG_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select style={fSel} value={feature} onChange={(e) => setFeature(e.target.value)}>
              <option value="all">All features</option>
              {BUG_FEATURES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
            </select>
            {isAdmin && (
              <select style={fSel} value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="all">All teams</option>
                {(teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <select style={fSel} value={developer} onChange={(e) => setDeveloper(e.target.value)}>
              <option value="all">All developers</option>
              {devs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select style={fSel} value={qa} onChange={(e) => setQa(e.target.value)}>
              <option value="all">All QA</option>
              {qas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input style={fSel} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
            <input style={fSel} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Showing <b style={{ color: 'var(--color-text-secondary)' }}>{loadingFirst ? '…' : listedCount.toLocaleString()}</b> of {loadingFirst ? '…' : scopeOpen.toLocaleString()} active bugs
          {crumbs.length ? ` · ${crumbs.join(' · ')}` : ''} · active releases only — full history lives in Analytics
        </div>
      </div>

      {/* attention — two compact side-by-side panels, capped at 4 rows each so the
          bug list (the actual work) stays near the top */}
      {(agingCount > 0 || bottlenecks.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
          {agingCount > 0 && (
            <div style={{ ...card, padding: 16 }}>
              {sectionTitle('Oldest open problems', `${agingCount} open longer than the agreed limit · click one to open its build`, 'var(--danger)')}
              {(showAging ? agingAll : agingAll.slice(0, 4)).map((b) => (
                <div
                  key={b.id}
                  className="mgr-row"
                  onClick={() => onOpenRelease(b.releaseId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: SLA_COLORS[bugSlaLevel(b.status, b.createdAt)] || 'var(--danger)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{b.title}</span>
                  {relById[b.releaseId] && (
                    <span className="tnum" style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      v{String(relById[b.releaseId].version).replace(/^v+/i, '')}
                    </span>
                  )}
                  <SeverityBadge severity={b.severity} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{humanizeSince(b.createdAt)}</span>
                </div>
              ))}
              {agingAll.length > 4 && (
                <button onClick={() => setShowAging((v) => !v)} style={{ ...tbBtn, minHeight: 30, fontSize: 12, marginTop: 8 }}>
                  {showAging ? 'Show fewer' : agingAll.length < agingCount ? `Show the ${agingAll.length} oldest` : `Show all ${agingAll.length}`}
                </button>
              )}
            </div>
          )}
          {bottlenecks.length > 0 && (
            <div style={{ ...card, padding: 16 }}>
              {sectionTitle('Needs a decision', `${bottlenecks.length} thing${bottlenecks.length === 1 ? '' : 's'} slowing this work down right now`)}
              {(showDecisions ? bottlenecks : bottlenecks.slice(0, 4)).map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 6px', fontSize: 12.5, lineHeight: 1.45 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: SLA_COLORS[b.level], flexShrink: 0, marginTop: 5 }} />
                  <span>{b.text}</span>
                </div>
              ))}
              {bottlenecks.length > 4 && (
                <button onClick={() => setShowDecisions((v) => !v)} style={{ ...tbBtn, minHeight: 30, fontSize: 12, marginTop: 8 }}>
                  {showDecisions ? 'Show fewer' : `Show all ${bottlenecks.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* list */}
      {serverQ.isError ? (
        <div style={{ ...card, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Couldn’t load bugs</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{serverQ.error?.message}</div>
          <button style={ghostButton} onClick={() => serverQ.refetch()}>Try again</button>
        </div>
      ) : loadingFirst ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading bugs…</div>
      ) : listedCount === 0 ? (
        <Empty>No bugs match your filters.</Empty>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: serverQ.isPlaceholderData ? 0.6 : 1, transition: 'opacity .15s' }}>
            {pageBugs.map((b) => (
              <BugCard
                key={b.id}
                bug={b}
                rel={relById[b.releaseId]}
                proj={projectsById[relById[b.releaseId]?.projectId]}
                reporter={b.createdBy || profilesById[b.createdById]?.name || ''}
                proposerName={b.resolutionById ? profilesById[b.resolutionById]?.name || '' : ''}
                releasesById={relById}
                user={user}
                isSubmitting={isSubmitting}
                onOpen={onOpenRelease}
                onBugStatus={onBugStatus}
                onBugResolve={onBugResolve}
                onBugCloseReview={onBugCloseReview}
                onDeleteBug={onDeleteBug}
              />
            ))}
          </div>
          <Pager page={page} pageSize={BUGS_PAGE_SIZE} total={listedCount} onPage={setPage} busy={serverQ.isFetching} noun={listedCount === 1 ? 'bug' : 'bugs'} />
        </>
      )}
    </>
  );
}

function BugCard({
  bug,
  rel,
  proj,
  reporter,
  proposerName,
  releasesById,
  user,
  isSubmitting,
  onOpen,
  onBugStatus,
  onBugResolve,
  onBugCloseReview,
  onDeleteBug,
}) {
  const [open, setOpen] = useState(false);
  const sev = SEVERITIES[bug.severity] || {};
  // same role gating as the release Bugs tab; actions need an editable release
  const canAct = !!rel && !isReadOnly(rel) && !!user;
  // Admin, the project's Team Lead, or its Project Manager
  const isManagerRole = managesProject(user, proj);
  // Team Leads also develop and submit builds → they get Start / Mark fixed too.
  const isDev = canAct && (user?.role === 'Developer' || user?.role === 'Team Lead' || user?.role === 'Admin');
  const isQA = canAct && (user?.role === 'QA' || isManagerRole);
  const isManager = canAct && isManagerRole;
  const canDelete = canAct && (user?.role === 'Admin' || bug.createdById === user?.id);
  const desc = bug.description || '';
  const long = desc.length > 240;
  const shown = open || !long ? desc : desc.slice(0, 240).trimEnd() + '…';
  const dot = <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>;

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: 4, flexShrink: 0, background: sev.color || 'var(--color-border-tertiary)' }} />
      <div style={{ flex: 1, minWidth: 0, padding: 14 }}>
        {/* title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SlaBadge level={bugSlaLevel(bug.status, bug.createdAt)} title="Aging — needs attention" />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 160 }}>{bug.title}</span>
          <SeverityBadge severity={bug.severity} />
          <BugStatusBadge status={bug.status} />
        </div>

        {/* meta: project · platform · version · reporter/time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 7, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{proj?.name || 'Unknown project'}</span>
          {rel && (
            <>
              {dot}
              <span>{rel.platform}</span>
              {dot}
              <span
                title="Release version"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-tertiary)',
                  padding: '1px 8px',
                  borderRadius: 6,
                  color: 'var(--color-text-primary)',
                }}
              >
                v{rel.version}
              </span>
              {rel.environment && (
                <>
                  {dot}
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{rel.environment}</span>
                </>
              )}
            </>
          )}
          {dot}
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            reported {humanizeSince(bug.createdAt)} ago{reporter ? ` by ${reporter}` : ''}
          </span>
        </div>

        {/* description */}
        {desc ? (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)', margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>
            {shown}
            {long && (
              <button
                onClick={() => setOpen((o) => !o)}
                style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '0 0 0 6px' }}
              >
                {open ? 'show less' : 'show more'}
              </button>
            )}
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', margin: '10px 0 0', fontStyle: 'italic' }}>
            No description provided.
          </p>
        )}

        {/* developer's proposed close — resolution, reason, who + when */}
        <ProposedCloseBanner bug={bug} proposerName={proposerName} />

        {/* full lifecycle timeline (from bug_history) */}
        <BugTimeline bugId={bug.id} releasesById={releasesById} />

        {/* role-aware actions (same as the release Bugs tab) */}
        {canAct && (
          <BugActions
            bug={bug}
            isDev={isDev}
            isQA={isQA}
            isManager={isManager}
            canDelete={canDelete}
            isSubmitting={isSubmitting}
            onStatus={(st) => onBugStatus(rel, bug, st)}
            onResolve={(res) => onBugResolve(rel, bug, res)}
            onCloseReview={(dec) => onBugCloseReview(rel, bug, dec)}
            onDelete={() => onDeleteBug(bug)}
          />
        )}

        {/* tags + action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {bug.feature && <TagChip label={bug.feature} tone="brand" />}
          {bug.tags.map((t) => (
            <TagChip key={t} label={t} />
          ))}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => onOpen(bug.releaseId)}
            style={{ ...ghostButton, padding: '5px 12px', fontSize: 12 }}
          >
            Open release →
          </button>
        </div>
      </div>
    </div>
  );
}
