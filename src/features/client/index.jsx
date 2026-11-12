/* Public client dashboard (read-only, no login) — rendered at /?client=<token> via
   ?client=<token>. Moved verbatim out of ReleaseTracker.jsx (Phase 0). */
import { useState, useEffect } from 'react';
import * as api from '@/api.js';
import { card, inputStyle, ghostButton, Wordmark, CenteredMessage } from '@/ui.jsx';
import { formatVersion, WBS_STATUSES, WBS_STATUS_ORDER, WBS_TRACK_ORDER, wbsTrackLabel, tint } from '@/constants.js';
import { capPct, computeWorkCompletion } from '@shared/wbsMetrics.js';
import { sideHead } from '@shared/ui-kit.jsx';
import { WbsBadge, TrackBreakdown, ProjectProgress, latestEst } from '@features/wbs';
import { BrandLogo, MiaroLogo } from '@/brand.jsx';
import { Skeleton, SkeletonList } from '@shared/dashboard-kit.jsx';

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
  qa_pending: { label: 'Awaiting QA', color: 'var(--tone-warning-fg)' },
  qa_in_progress: { label: 'In testing', color: 'var(--c-indigo)' },
  qa_done: { label: 'In review', color: 'var(--c-violet)' },
  approved: { label: 'QA approved', color: 'var(--tone-success-fg)' },
  sent_back: { label: 'Resolving issues', color: 'var(--c-red)' },
  closed: { label: 'Superseded', color: 'var(--c-slate)' },
};

function publicWbsPct(items) {
  const work = items.filter((t) => t.type !== 'milestone');
  return capPct(work.filter((t) => t.status === 'completed').length, work.length);
}

// format an ISO date ('YYYY-MM-DD') without a TZ off-by-one
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Plain-language guide to the WBS view — client-facing, so no internal jargon.
const WBS_STATUS_HELP = {
  not_started: 'planned and in scope, but work hasn’t begun yet.',
  in_progress: 'our developers are building it right now.',
  in_qa: 'built and now being tested by our QA team before it counts as done.',
  completed: 'built and passed QA testing.',
  blocked: 'paused while waiting on something — often a decision or input from you.',
};
const WBS_READ_HELP = [
  ['Total items', 'every feature or task we’re tracking: the agreed scope plus improvements, your feedback, upsells, design, marketing and ongoing support. Milestones are listed separately and aren’t counted.'],
  ['Interface progress bars', 'how far each part of the product is, such as the Mobile App or Web App, counting completed items only.'],
  ['Overall project progress', 'the share of all work that’s finished, including reported bugs. New requests lower it until they’re done, and items still in progress or in QA aren’t counted yet, so it can trail behind visible activity.'],
  ['Work type filter', 'shows one type of work at a time, such as your feedback or upsell modules.'],
  ['Platform sections', 'work is grouped by platform (e.g. Mobile App), then by feature area. Completion is the target date to finish building that platform; Deployment is when it’s planned to go live.'],
  ['Feature-area % and Target', 'the % shows how many items in that group are completed; Target is the latest estimated finish date among them.'],
  ['Dates next to items', 'the estimated completion date for that item.'],
  ['Milestones', 'key checkpoints in the project timeline.'],
  ['Search and status filter', 'only narrow down the list below — the numbers at the top always cover the whole project.'],
  ['Live · updated', 'this page refreshes on its own; the time shows when our team last updated an item.'],
];

function WbsReadGuide() {
  const row = (term, text, badge) => (
    <div key={term}>
      {badge || <strong>{term}</strong>} <span style={{ color: 'var(--color-text-secondary)' }}>— {text}</span>
    </div>
  );
  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>How to read this page</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>What each number, status and date on this work breakdown means.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px 20px', fontSize: 13, lineHeight: 1.5 }}>
        {WBS_STATUS_ORDER.map((k) => row(k, WBS_STATUS_HELP[k], <WbsBadge status={k} />))}
        {WBS_READ_HELP.map(([term, text]) => row(term, text))}
      </div>
    </div>
  );
}

function ClientWbsView({ wbs, platformTargets = [], bugCounts, showBugCounts, ongoingSupport }) {
  const [q, setQ] = useState('');
  const [sf, setSf] = useState('all');
  const [tf, setTf] = useState('all'); // work type (track)
  const [guide, setGuide] = useState(false);

  // platform milestones keyed the same way the groups are (empty → 'General')
  const targetMap = {};
  (platformTargets || []).forEach((t) => { targetMap[t.platform || 'General'] = t; });

  const allWork = wbs.filter((t) => t.type !== 'milestone');
  const milestones = wbs.filter((t) => t.type === 'milestone');
  // overall % is on all work + reported bugs, not the filtered subset
  const resolvedBugs = bugCounts?.resolved ?? 0;
  const bugTotal = resolvedBugs + (bugCounts?.open ?? 0);
  const itemCompletion = computeWorkCompletion(allWork);
  const pct = capPct(itemCompletion.done + resolvedBugs, itemCompletion.total + bugTotal);
  const tracksPresent = WBS_TRACK_ORDER.filter((t) => allWork.some((i) => (i.track || 'scope') === t));

  // status stat strip (full scope)
  const byStatus = (s) => allWork.filter((t) => t.status === s).length;
  const stats = [
    { key: 'total', label: 'Total items', value: allWork.length },
    { key: 'not_started', label: 'Not started', value: byStatus('not_started') },
    { key: 'in_progress', label: 'In progress', value: byStatus('in_progress'), color: 'var(--brand)' },
    { key: 'in_qa', label: 'In QA', value: byStatus('in_qa'), color: 'var(--tone-warning-fg)' },
    { key: 'completed', label: 'Completed', value: byStatus('completed'), color: 'var(--tone-success-fg)' },
    ...(byStatus('blocked') ? [{ key: 'blocked', label: 'Blocked', value: byStatus('blocked'), color: 'var(--danger)' }] : []),
  ];

  const work = allWork.filter(
    (t) => (tf === 'all' || (t.track || 'scope') === tf) && (sf === 'all' || t.status === sf) && (!q.trim() || (t.name || '').toLowerCase().includes(q.trim().toLowerCase()))
  );

  const groups = {};
  work.forEach((t) => {
    // the original scope groups by platform; other work reads as its type first
    const tr = t.track || 'scope';
    const pk = tr === 'scope' ? t.platform || 'General' : [wbsTrackLabel(tr), t.platform].filter(Boolean).join(' · ');
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
        gap: 12,
        padding: '8px 0',
        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, flex: 1, minWidth: 140 }}>{t.name}</span>
      <WbsBadge status={t.status} />
      {t.est && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t.est}</span>}
    </div>
  );

  return (
    <div className="portal-stack">
      {/* status stat strip, then progress per interface and overall */}
      <div className="portal-stats">
        {stats.map((s) => (
          <div key={s.key} style={{ ...card, padding: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color || 'var(--color-text-primary)' }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: 16 }}>
        <ProjectProgress
          interfaces={itemCompletion.byInterface}
          bugs={showBugCounts ? { total: bugTotal, resolved: resolvedBugs } : null}
          overall={{ pct, done: itemCompletion.done + resolvedBugs, total: itemCompletion.total + bugTotal }}
        />
        {ongoingSupport && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 12 }}>Ongoing support is active: new requests are added here as they come in.</div>
        )}
        <TrackBreakdown byTrack={itemCompletion.byTrack} />
      </div>

      {/* search + status filter (read-only, viewer convenience) + reading guide */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        {tracksPresent.length > 1 && (
          <select
            style={{ ...inputStyle, width: 'auto', padding: '8px 12px', fontSize: 13 }}
            value={tf}
            aria-label="Work type"
            onChange={(e) => setTf(e.target.value)}
          >
            <option value="all">All work</option>
            {tracksPresent.map((t) => <option key={t} value={t}>{wbsTrackLabel(t)}</option>)}
          </select>
        )}
        <button style={ghostButton} onClick={() => setGuide((v) => !v)}>{guide ? 'Hide guide' : 'How to read this page'}</button>
      </div>
      {guide && <WbsReadGuide />}

      {work.length === 0 && (
        <div style={{ ...card, padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          No items match your filter.
        </div>
      )}

      {Object.entries(groups).map(([pk, sections]) => {
        const tgt = targetMap[pk];
        const comp = fmtDate(tgt?.completionDate);
        const dep = fmtDate(tgt?.deploymentDate);
        const showName = Object.keys(groups).length > 1 || pk !== 'General';
        const showDates = comp || dep;
        return (
        <div key={pk}>
          {(showName || showDates) && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              {showName ? <div style={{ ...sideHead }}>{pk}</div> : <span />}
              {showDates && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {comp && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Completion: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{comp}</strong></span>}
                  {dep && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Deployment: <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{dep}</strong></span>}
                </div>
              )}
            </div>
          )}
          <div className="portal-cols">
            {Object.entries(sections).map(([sk, ts]) => (
              <div key={sk} style={{ ...card, padding: '4px 16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '12px 0 8px',
                    borderBottom: '1px solid var(--color-border-primary)',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{sk}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    {latestEst(ts) && (
                      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Target {latestEst(ts)}</span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{publicWbsPct(ts)}%</span>
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
        <div>
          <div style={{ ...sideHead, marginBottom: 12 }}>Milestones</div>
          <div className="portal-rows" style={{ ...card, padding: '4px 16px' }}>
            {milestones.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 0',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                {m.est && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{m.est}</span>}
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
  critical: { label: 'Critical', color: 'var(--c-red)' },
  major: { label: 'Major', color: 'var(--tone-warning-fg)' },
  minor: { label: 'Minor', color: 'var(--c-slate)' },
};
const BUG_STATE = {
  open: { label: 'Open', color: 'var(--c-red)' },
  in_progress: { label: 'In progress', color: 'var(--tone-warning-fg)' },
  fixed: { label: 'Fixed — awaiting QA', color: 'var(--c-indigo)' },
  disputed: { label: 'Needs clarification', color: 'var(--c-violet)' },
  pending_tl: { label: 'Pending review', color: 'var(--c-indigo)' },
  verified: { label: 'Resolved', color: 'var(--tone-success-fg)' },
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
    <span style={{ fontSize: 12, fontWeight: 700, color, background: tint(color, 10), padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{label}</span>
  );
  const stat = (label, value, color) => (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <section className="portal-stack">
      <div>
        <div style={{ ...sideHead, marginBottom: 4 }}>QA bug report</div>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>
          Every issue found by QA across all builds of this project.
        </p>
      </div>
      <div className="portal-stats">
        {stat('Total bugs', sum.total)}
        {stat('Open', sum.open, sum.open ? 'var(--danger)' : undefined)}
        {stat('Awaiting QA', sum.awaiting, sum.awaiting ? 'var(--warning)' : undefined)}
        {stat('Resolved', sum.resolved, 'var(--success)')}
        {stat('Critical', critical, critical ? 'var(--danger)' : undefined)}
      </div>

      <div className="portal-cols wide">
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
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '12px 0 8px', borderBottom: '1px solid var(--color-border-primary)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {formatVersion(b.version)}{' '}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
                    {b.platform}{b.component ? ` · ${b.component}` : ''}{b.environment ? ` · ${b.environment}` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {bugs.length} bug{bugs.length === 1 ? '' : 's'}{parts.length ? ` · ${parts.join(' · ')}` : ''}
                </span>
              </div>
              {bugs.map((bug, i) => {
                const sev = BUG_SEV[bug.severity] || { label: bug.severity, color: 'var(--c-slate)' };
                const st = BUG_STATE[bug.status] || { label: bug.status, color: 'var(--c-slate)' };
                return (
                  <div key={i} style={{ padding: '12px 0', borderBottom: i === bugs.length - 1 ? 'none' : '1px solid var(--color-border-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 160 }}>
                        {bug.title}
                        {bug.carriedForward && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>· carried forward</span>}
                      </span>
                      {pill(sev.label, sev.color)}
                      {pill(st.label, st.color)}
                      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', minWidth: 92, textAlign: 'right' }}>
                        {bug.status === 'verified' && bug.resolvedAt
                          ? `Resolved ${fmtTs(bug.resolvedAt)}`
                          : `Reported ${fmtTs(bug.reportedAt)}`}
                      </span>
                    </div>
                    {bug.description && (
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {bug.description}
                      </div>
                    )}
                    {(bug.feature || (bug.reportedAt && bug.status === 'verified' && bug.resolvedAt)) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                        {bug.feature && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: 6 }}>
                            {bug.feature}
                          </span>
                        )}
                        {bug.status === 'verified' && bug.resolvedAt && (
                          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Reported {fmtTs(bug.reportedAt)}</span>
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
  const [brand, setBrand] = useState(null); // project's brand, else the default
  const [work, setWork] = useState(null); // items with their track + bug counts; null until deployed
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
        api.fetchPublicProjectBrand(token).catch(() => null),
        api.fetchPublicWork(token).catch(() => null),
      ])
        .then(([d, br, rels, b, w]) => {
          if (cancelled) return;
          setData(d);
          setBugReport(br);
          setAllReleases(rels || []);
          setBrand(b);
          setWork(w);
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

  if (data === undefined && !error) return (
    <div className="portal-wrap portal-body" role="status" aria-label="Loading project status">
      <Skeleton width="40%" height={28} />
      <div className="portal-stats">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={88} radius={14} />)}</div>
      <SkeletonList rows={4} height={64} card />
    </div>
  );
  if (error || data === null)
    return (
      <CenteredMessage>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Link not found</div>
        <div>This client link is invalid or has been revoked.</div>
      </CenteredMessage>
    );

  const wbs = work?.items || data.wbs || [];
  const showWbs = data.wbsEnabled && wbs.length > 0;
  // hide superseded (closed) iterations from the client
  const releases = (data.releases || []).filter((r) => r.status !== 'closed');
  const total = releases.length;
  const completed = releases.filter((r) => r.status === 'approved');
  const inProgress = releases.filter((r) => r.status !== 'approved');
  const pct = total ? Math.round((completed.length / total) * 100) : 0;
  const current = inProgress[0]; // most recent non-complete
  const cs = (s) => CLIENT_STATUS[s] || { label: s, color: 'var(--c-slate)' };

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
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>
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
        padding: '12px 0',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: cs(r.status).color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {formatVersion(r.version)}{' '}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
            {r.platform}
            {r.component ? ` · ${r.component}` : ''} · {r.environment}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{r.date}</div>
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: cs(r.status).color,
          background: tint(cs(r.status).color, 10),
          padding: '4px 12px',
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
          padding: '16px 0',
        }}
      >
        <div className="portal-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* the project's brand runs this portal; Miaro Verify is the platform underneath */}
          {brand ? <BrandLogo brand={brand} size={26} /> : <Wordmark size={26} />}
          <span style={{ width: 1, height: 20, background: 'var(--color-border-primary)', margin: '0 4px' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Client portal</span>
          <span className="portal-header-note" style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>Live project tracking</span>
        </div>
      </header>

      <div className="portal-wrap portal-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 700, margin: 0 }}>{data.project.name}</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
              {showWbs ? 'Live work breakdown · read-only' : 'Project status overview'}
            </p>
          </div>
          {/* live sync indicator */}
          <div
            title="This page auto-refreshes"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
              color: 'var(--tone-success-fg)', background: tint('var(--c-green)', 10), border: '1px solid color-mix(in srgb, var(--c-green) 20%, transparent)',
              padding: '8px 12px', borderRadius: 999,
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

        {/* Tabs — shown when there's more than the status view (releases and/or the
            QA report). Otherwise the portal renders the project status directly. */}
        {showTabs && (
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-primary)', flexWrap: 'wrap' }}>
            {tabList.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  padding: '12px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
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
          <div className="portal-stack">
            {showWbs && (
              <ClientWbsView
                wbs={wbs}
                platformTargets={data.platformTargets}
                bugCounts={work?.bugs}
                showBugCounts={data.showOpenBugs}
                ongoingSupport={work?.ongoingSupport}
              />
            )}

            {/* release-based progress + summary only when there is no WBS (the WBS view
                already shows completion, so we avoid a duplicate progress bar) */}
            {!showWbs && (
              <>
                <div style={{ ...card, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Overall progress</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
                  </div>
                  {current && (
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 12 }}>
                      Current: <strong>v{current.version}</strong> — {cs(current.status).label}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {statCard('Completed', completed.length, 'var(--success)')}
                  {statCard('In progress', inProgress.length, 'var(--warning)')}
                  {statCard('Resolved bugs', data.bugs?.resolved ?? 0, 'var(--success)')}
                  {data.showOpenBugs && statCard('Open bugs', data.bugs?.open ?? 0, (data.bugs?.open ?? 0) ? 'var(--danger)' : undefined)}
                </div>
              </>
            )}

            {/* Releases are ALWAYS shown — a WBS-enabled project must NOT hide its
                release status / approvals / send-backs / history from the client. */}
            {(inProgress.length > 0 || completed.length > 0) && (
              <div className="portal-duo">
                {inProgress.length > 0 && (
                  <section>
                    <div style={{ ...sideHead, marginBottom: 12 }}>{showWbs ? 'Releases in progress' : 'In progress'}</div>
                    <div className="portal-rows" style={{ ...card, padding: '4px 16px' }}>{inProgress.map(relRow)}</div>
                  </section>
                )}
                {completed.length > 0 && (
                  <section>
                    <div style={{ ...sideHead, marginBottom: 12 }}>{showWbs ? 'Completed releases' : 'Completed'}</div>
                    <div className="portal-rows" style={{ ...card, padding: '4px 16px' }}>{completed.map(relRow)}</div>
                  </section>
                )}
              </div>
            )}
            {releases.length > 0 && (
              <section>
                <div style={{ ...sideHead, marginBottom: 12 }}>Release history</div>
                <div className="portal-rows" style={{ ...card, padding: '4px 16px' }}>{releases.map(relRow)}</div>
              </section>
            )}
          </div>
        )}

        {effectiveTab === 'releases' && (
          <section>
            <div style={{ ...sideHead, marginBottom: 4 }}>All releases</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 16px' }}>
              Every build submitted for this project — including superseded iterations.
            </p>
            {allReleases.length === 0 ? (
              <div style={{ ...card, padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>No releases yet.</div>
            ) : (
              <div className="portal-rows" style={{ ...card, padding: '4px 16px' }}>
                {allReleases.map((r, i) => (
                  <div key={i} style={{ padding: '12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: cs(r.status).color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {formatVersion(r.version)}{' '}
                          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
                            {r.platform}{r.component ? ` · ${r.component}` : ''}{r.environment ? ` · ${r.environment}` : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{r.date}</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cs(r.status).color, background: tint(cs(r.status).color, 10), padding: '4px 12px', borderRadius: 999 }}>
                        {cs(r.status).label}
                      </span>
                    </div>
                    {r.notes && r.notes.trim() && (
                      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 8, paddingLeft: 24 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {brand ? `Live project tracking & client status reviews by ${brand.name}` : 'Read-only project status'} · powered by
          <MiaroLogo size={14} color="var(--color-text-secondary)" />
        </div>
      </div>
    </div>
  );
}
