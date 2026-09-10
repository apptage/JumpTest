/* Public client dashboard (read-only, no login) — rendered from main.jsx via
   ?client=<token>. Moved verbatim out of ReleaseTracker.jsx (Phase 0). */
import { useState, useEffect } from 'react';
import * as api from '@/api.js';
import { card, inputStyle, Logo, CenteredMessage } from '@/ui.jsx';
import { formatVersion, WBS_STATUSES, WBS_STATUS_ORDER } from '@/constants.js';
import { sideHead } from '@shared/ui-kit.jsx';
import { WbsBadge, latestEst } from '@features/wbs';

// relative "updated Xm ago" — coarse, no external dep
function relTime(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Client-facing labels — accurate about the QA stage. Notably "Approved" means
// it PASSED QA (not that it's been delivered), so it isn't labelled "Completed".
const CLIENT_STATUS = {
  qa_pending: { label: 'Awaiting QA', color: '#d97706' },
  qa_in_progress: { label: 'In testing', color: '#6366F1' },
  qa_done: { label: 'In review', color: '#7c3aed' },
  approved: { label: 'QA approved', color: '#16a34a' },
  sent_back: { label: 'Resolving issues', color: '#dc2626' },
  closed: { label: 'Superseded', color: '#64748b' },
};

function publicWbsPct(items) {
  const work = items.filter((t) => t.type !== 'milestone');
  if (!work.length) return 0;
  return Math.round((work.filter((t) => t.status === 'completed').length / work.length) * 100);
}

// format an ISO date ('YYYY-MM-DD') without a TZ off-by-one
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function ClientWbsView({ wbs, platformTargets = [] }) {
  const [q, setQ] = useState('');
  const [sf, setSf] = useState('all');

  // platform milestones keyed the same way the groups are (empty → 'General')
  const targetMap = {};
  (platformTargets || []).forEach((t) => { targetMap[t.platform || 'General'] = t; });

  const allWork = wbs.filter((t) => t.type !== 'milestone');
  const milestones = wbs.filter((t) => t.type === 'milestone');
  const pct = publicWbsPct(allWork); // overall % is on the full scope, not the filtered subset

  // status stat strip (full scope)
  const byStatus = (s) => allWork.filter((t) => t.status === s).length;
  const stats = [
    { key: 'total', label: 'Total items', value: allWork.length },
    { key: 'not_started', label: 'Not started', value: byStatus('not_started') },
    { key: 'in_progress', label: 'In progress', value: byStatus('in_progress'), color: 'var(--brand)' },
    { key: 'in_qa', label: 'In QA', value: byStatus('in_qa'), color: 'var(--warning)' },
    { key: 'completed', label: 'Completed', value: byStatus('completed'), color: 'var(--success)' },
    ...(byStatus('blocked') ? [{ key: 'blocked', label: 'Blocked', value: byStatus('blocked'), color: 'var(--danger)' }] : []),
  ];

  const work = allWork.filter(
    (t) => (sf === 'all' || t.status === sf) && (!q.trim() || (t.name || '').toLowerCase().includes(q.trim().toLowerCase()))
  );
  const platforms = Array.from(new Set(work.map((t) => t.platform).filter(Boolean)));

  const groups = {};
  work.forEach((t) => {
    const pk = t.platform || 'General';
    const sk = t.section || 'General';
    (groups[pk] = groups[pk] || {});
    (groups[pk][sk] = groups[pk][sk] || []).push(t);
  });

  const taskRow = (t, i, arr) => (
    <div
      key={i}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, flex: 1, minWidth: 140 }}>{t.name}</span>
      <WbsBadge status={t.status} />
      {t.est && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t.est}</span>}
    </div>
  );

  return (
    <div>
      {/* status stat strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.key} style={{ ...card, padding: '12px 16px', flex: '1 1 110px', minWidth: 100 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: s.color || 'var(--color-text-primary)' }}>{s.value}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Overall project completion</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
        </div>
      </div>

      {/* search + status filter (read-only, viewer convenience) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, flex: '1 1 180px', width: 'auto', padding: '8px 12px', fontSize: 13 }}
          value={q}
          placeholder="Search items…"
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          style={{ ...inputStyle, width: 'auto', padding: '8px 12px', fontSize: 13 }}
          value={sf}
          onChange={(e) => setSf(e.target.value)}
        >
          <option value="all">All statuses</option>
          {WBS_STATUS_ORDER.map((s) => <option key={s} value={s}>{WBS_STATUSES[s].label}</option>)}
        </select>
      </div>

      {work.length === 0 && (
        <div style={{ ...card, padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 18 }}>
          No items match your filter.
        </div>
      )}

      {Object.entries(groups).map(([pk, sections]) => {
        const tgt = targetMap[pk];
        const comp = fmtDate(tgt?.completionDate);
        const dep = fmtDate(tgt?.deploymentDate);
        const showName = platforms.length > 1;
        const showDates = comp || dep;
        return (
        <div key={pk} style={{ marginBottom: 18 }}>
          {(showName || showDates) && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              {showName ? <div style={{ ...sideHead }}>{pk}</div> : <span />}
              {showDates && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {comp && <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>Completion: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{comp}</strong></span>}
                  {dep && <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>Deployment: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{dep}</strong></span>}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(sections).map(([sk, ts]) => (
              <div key={sk} style={{ ...card, padding: '4px 16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '11px 0 6px',
                    borderBottom: '1px solid var(--color-border-primary)',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{sk}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    {latestEst(ts) && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Target {latestEst(ts)}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{publicWbsPct(ts)}%</span>
                  </span>
                </div>
                {ts.map(taskRow)}
              </div>
            ))}
          </div>
        </div>
        );
      })}

      {milestones.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...sideHead, marginBottom: 8 }}>Milestones</div>
          <div style={{ ...card, padding: '4px 16px' }}>
            {milestones.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i === milestones.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                {m.est && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.est}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Client-safe severity + status labels for the public bug report. No internal
// wording, no reporter identities — just what a client/PM needs to read the QA log.
const BUG_SEV = {
  critical: { label: 'Critical', color: '#dc2626' },
  major: { label: 'Major', color: '#d97706' },
  minor: { label: 'Minor', color: '#64748b' },
};
const BUG_STATE = {
  open: { label: 'Open', color: '#dc2626' },
  in_progress: { label: 'In progress', color: '#d97706' },
  fixed: { label: 'Fixed — awaiting QA', color: '#6366F1' },
  disputed: { label: 'Needs clarification', color: '#7c3aed' },
  pending_tl: { label: 'Pending review', color: '#6366F1' },
  verified: { label: 'Resolved', color: '#16a34a' },
};
// format an ISO timestamp → short date (reported/resolved dates)
function fmtTs(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Split a bug list into the three states a client cares about:
//   open       — still needs dev work (open / in progress / needs clarification)
//   awaiting   — fixed by dev, waiting on QA verification (fixed / pending review)
//   resolved   — QA verified
function bugBucket(arr) {
  const resolved = arr.filter((x) => x.status === 'verified').length;
  const awaiting = arr.filter((x) => x.status === 'fixed' || x.status === 'pending_tl').length;
  return { total: arr.length, open: arr.length - resolved - awaiting, awaiting, resolved };
}

// The public QA bug report — every bug across every build, grouped by build.
function ClientBugReport({ report }) {
  const builds = (report.builds || []).filter((b) => (b.bugs || []).length > 0);
  const allBugs = builds.flatMap((b) => b.bugs || []);
  const sum = bugBucket(allBugs);
  const critical = allBugs.filter((b) => b.severity === 'critical').length;

  const pill = (label, color) => (
    <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}1a`, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{label}</span>
  );
  const stat = (label, value, color) => (
    <div style={{ ...card, padding: '12px 16px', flex: '1 1 120px', minWidth: 108 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <section style={{ marginTop: 8 }}>
      <div style={{ ...sideHead, marginBottom: 4 }}>QA bug report</div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', margin: '0 0 14px' }}>
        Every issue found by QA across all builds of this project.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {stat('Total bugs', sum.total)}
        {stat('Open', sum.open, sum.open ? 'var(--danger)' : undefined)}
        {stat('Awaiting QA', sum.awaiting, sum.awaiting ? 'var(--warning)' : undefined)}
        {stat('Resolved', sum.resolved, 'var(--success)')}
        {stat('Critical', critical, critical ? 'var(--danger)' : undefined)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {builds.map((b, bi) => {
          const bugs = b.bugs || [];
          const bb = bugBucket(bugs);
          const parts = [
            bb.open ? `${bb.open} open` : null,
            bb.awaiting ? `${bb.awaiting} awaiting QA` : null,
            bb.resolved ? `${bb.resolved} resolved` : null,
          ].filter(Boolean);
          return (
            <div key={bi} style={{ ...card, padding: '4px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '11px 0 6px', borderBottom: '1px solid var(--color-border-primary)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {formatVersion(b.version)}{' '}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
                    {b.platform}{b.component ? ` · ${b.component}` : ''}{b.environment ? ` · ${b.environment}` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                  {bugs.length} bug{bugs.length === 1 ? '' : 's'}{parts.length ? ` · ${parts.join(' · ')}` : ''}
                </span>
              </div>
              {bugs.map((bug, i) => {
                const sev = BUG_SEV[bug.severity] || { label: bug.severity, color: '#64748b' };
                const st = BUG_STATE[bug.status] || { label: bug.status, color: '#64748b' };
                return (
                  <div key={i} style={{ padding: '12px 0', borderBottom: i === bugs.length - 1 ? 'none' : '1px solid var(--color-border-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 160 }}>
                        {bug.title}
                        {bug.carriedForward && <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>· carried forward</span>}
                      </span>
                      {pill(sev.label, sev.color)}
                      {pill(st.label, st.color)}
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 92, textAlign: 'right' }}>
                        {bug.status === 'verified' && bug.resolvedAt
                          ? `Resolved ${fmtTs(bug.resolvedAt)}`
                          : `Reported ${fmtTs(bug.reportedAt)}`}
                      </span>
                    </div>
                    {bug.description && (
                      <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {bug.description}
                      </div>
                    )}
                    {(bug.feature || (bug.reportedAt && bug.status === 'verified' && bug.resolvedAt)) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 7 }}>
                        {bug.feature && (
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-tertiary)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: 6 }}>
                            {bug.feature}
                          </span>
                        )}
                        {bug.status === 'verified' && bug.resolvedAt && (
                          <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>Reported {fmtTs(bug.reportedAt)}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ClientDashboard({ token }) {
  const [data, setData] = useState(undefined); // undefined=loading, null=invalid
  const [bugReport, setBugReport] = useState(null); // null when not enabled / not deployed
  const [allReleases, setAllReleases] = useState([]); // every build, all statuses
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(null); // when this view last synced
  const [, forceTick] = useState(0); // re-render so the "ago" label stays fresh
  // Tab selection — a link may deep-link straight to a tab via
  // ?client=<token>&view=qa (or &view=releases), so one tabbed link doubles as a
  // "separate" QA / releases link off the same token.
  const [tab, setTab] = useState(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view');
      return ['qa', 'releases'].includes(v) ? v : 'status';
    } catch {
      return 'status';
    }
  });

  useEffect(() => {
    let cancelled = false;
    const pull = () =>
      Promise.all([
        api.fetchPublicStatus(token),
        api.fetchPublicBugReport(token).catch(() => null), // never let the report break the portal
        api.fetchPublicReleases(token).catch(() => []),
      ])
        .then(([d, br, rels]) => {
          if (cancelled) return;
          setData(d);
          setBugReport(br);
          setAllReleases(rels || []);
          setFetchedAt(Date.now());
        })
        .catch((e) => !cancelled && setError(e.message));
    pull();
    // lightweight live sync: re-pull every 60s; tick the clock every 30s
    const poll = setInterval(pull, 60000);
    const tick = setInterval(() => !cancelled && forceTick((n) => n + 1), 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [token]);

  if (data === undefined && !error) return <CenteredMessage>Loading project status…</CenteredMessage>;
  if (error || data === null)
    return (
      <CenteredMessage>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Link not found</div>
        <div>This client link is invalid or has been revoked.</div>
      </CenteredMessage>
    );

  const wbs = data.wbs || [];
  const showWbs = data.wbsEnabled && wbs.length > 0;
  // hide superseded (closed) iterations from the client
  const releases = (data.releases || []).filter((r) => r.status !== 'closed');
  const total = releases.length;
  const completed = releases.filter((r) => r.status === 'approved');
  const inProgress = releases.filter((r) => r.status !== 'approved');
  const pct = total ? Math.round((completed.length / total) * 100) : 0;
  const current = inProgress[0]; // most recent non-complete
  const cs = (s) => CLIENT_STATUS[s] || { label: s, color: '#64748b' };

  // QA report tab is only offered when the link opted in (RPC returned builds).
  const reportBuilds = (bugReport?.builds || []).filter((b) => (b.bugs || []).length > 0);
  const reportAvailable = reportBuilds.length > 0;
  const bugCount = reportBuilds.reduce((n, b) => n + (b.bugs || []).length, 0);
  // Tabs: Project status is always there; Releases whenever there are any builds;
  // QA report only when the link opted in.
  const tabList = [
    ['status', 'Project status'],
    ...(allReleases.length ? [['releases', `Releases (${allReleases.length})`]] : []),
    ...(reportAvailable ? [['qa', `QA report (${bugCount})`]] : []),
  ];
  const showTabs = tabList.length > 1;
  // fall back to status if a deep-link points at a tab that isn't available here
  const tabKeys = tabList.map(([k]) => k);
  const effectiveTab = tabKeys.includes(tab) ? tab : 'status';

  const statCard = (label, value, color) => (
    <div style={{ ...card, padding: 16, flex: '1 1 150px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );

  const relRow = (r, i, arr) => (
    <div
      key={i}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 0',
        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: cs(r.status).color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          {formatVersion(r.version)}{' '}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
            {r.platform}
            {r.component ? ` · ${r.component}` : ''} · {r.environment}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{r.date}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: cs(r.status).color,
          background: `${cs(r.status).color}1a`,
          padding: '3px 10px',
          borderRadius: 999,
        }}
      >
        {cs(r.status).label}
      </span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-app-bg)' }}>
      <header
        style={{
          background: 'var(--ink)',
          borderBottom: '1px solid var(--ink-border)',
          padding: '14px 0',
        }}
      >
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={28} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
            Jump<span style={{ color: 'var(--brand)' }}>Test</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>Client portal</span>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{data.project.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
              {showWbs ? 'Live work breakdown · read-only' : 'Project status overview'}
            </p>
          </div>
          {/* live sync indicator */}
          <div
            title="This page auto-refreshes"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
              color: 'var(--success)', background: '#16a34a1a', border: '1px solid #16a34a33',
              padding: '6px 12px', borderRadius: 999,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
            Live
            {(() => {
              const stamp = data.lastUpdated || (fetchedAt ? new Date(fetchedAt).toISOString() : null);
              const ago = relTime(stamp);
              return ago ? <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>· updated {ago}</span> : null;
            })()}
          </div>
        </div>
        <div style={{ height: 20 }} />

        {/* Tabs — shown when there's more than the status view (releases and/or the
            QA report). Otherwise the portal renders the project status directly. */}
        {showTabs && (
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-primary)', marginBottom: 22, flexWrap: 'wrap' }}>
            {tabList.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  padding: '10px 16px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  background: 'none', border: 'none', borderBottom: `2px solid ${effectiveTab === k ? 'var(--brand)' : 'transparent'}`,
                  color: effectiveTab === k ? 'var(--brand)' : 'var(--color-text-secondary)', marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {effectiveTab === 'status' && (
          <>
            {showWbs && <ClientWbsView wbs={wbs} platformTargets={data.platformTargets} />}

            {/* release-based progress + summary only when there is no WBS (the WBS view
                already shows completion, so we avoid a duplicate progress bar) */}
            {!showWbs && (
              <>
                <div style={{ ...card, padding: 18, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Overall progress</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
                  </div>
                  {current && (
                    <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 12 }}>
                      Current: <strong>v{current.version}</strong> — {cs(current.status).label}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                  {statCard('Completed', completed.length, 'var(--success)')}
                  {statCard('In progress', inProgress.length, 'var(--warning)')}
                  {statCard('Resolved bugs', data.bugs?.resolved ?? 0, 'var(--success)')}
                  {data.showOpenBugs && statCard('Open bugs', data.bugs?.open ?? 0, (data.bugs?.open ?? 0) ? 'var(--danger)' : undefined)}
                </div>
              </>
            )}

            {/* Releases are ALWAYS shown — a WBS-enabled project must NOT hide its
                release status / approvals / send-backs / history from the client. */}
            {showWbs && releases.length > 0 && <div style={{ ...sideHead, margin: '10px 0 12px' }}>Releases</div>}
            {inProgress.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <div style={{ ...sideHead, marginBottom: 10 }}>In progress</div>
                <div style={{ ...card, padding: '4px 16px' }}>{inProgress.map(relRow)}</div>
              </section>
            )}
            {completed.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <div style={{ ...sideHead, marginBottom: 10 }}>Completed</div>
                <div style={{ ...card, padding: '4px 16px' }}>{completed.map(relRow)}</div>
              </section>
            )}
            {releases.length > 0 && (
              <section>
                <div style={{ ...sideHead, marginBottom: 10 }}>Release history</div>
                <div style={{ ...card, padding: '4px 16px' }}>{releases.map(relRow)}</div>
              </section>
            )}
          </>
        )}

        {effectiveTab === 'releases' && (
          <section>
            <div style={{ ...sideHead, marginBottom: 4 }}>All releases</div>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', margin: '0 0 14px' }}>
              Every build submitted for this project — including superseded iterations.
            </p>
            {allReleases.length === 0 ? (
              <div style={{ ...card, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>No releases yet.</div>
            ) : (
              <div style={{ ...card, padding: '4px 16px' }}>
                {allReleases.map((r, i, arr) => (
                  <div key={i} style={{ padding: '12px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-border-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: cs(r.status).color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                          {formatVersion(r.version)}{' '}
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
                            {r.platform}{r.component ? ` · ${r.component}` : ''}{r.environment ? ` · ${r.environment}` : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{r.date}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: cs(r.status).color, background: `${cs(r.status).color}1a`, padding: '3px 10px', borderRadius: 999 }}>
                        {cs(r.status).label}
                      </span>
                    </div>
                    {r.notes && r.notes.trim() && (
                      <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 8, paddingLeft: 20 }}>
                        {r.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {effectiveTab === 'qa' && <ClientBugReport report={bugReport} />}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 32 }}>
          Read-only project status · powered by JumpTest
        </div>
      </div>
    </div>
  );
}
