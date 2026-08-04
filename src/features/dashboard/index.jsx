/* Dashboard chrome — stat cards, filter bar, release card, left sidebar (project
   nav + at-a-glance), and the right panel. Moved verbatim from ReleaseTracker.jsx (Phase 0). */
import { useState } from 'react';
import { card, inputStyle, ghostButton, primaryButton, StatusBadge, TypeBadge, Avatar, CountBadge } from '@/ui.jsx';
import { Chevron, StatBig, StatCard, StageBars, TrendChart, Segmented, Pill } from '@shared/dashboard-kit.jsx';
import { sideHead, StatusAge, EnvBadge, statusSince, relativeTime, greeting } from '@shared/ui-kit.jsx';
import { computeReleaseMetrics, computeWorkload } from '@shared/releaseMetrics.js';
import { aggregateBugMetrics } from '@shared/bugMetrics.js';
import {
  STATUSES,
  STATUS_ORDER,
  RELEASE_TYPES,
  RELEASE_TYPE_ORDER,
  RELEASE_PLATFORMS,
  slaLevel,
  platformsForProjectType,
  formatVersion,
} from '@/constants.js';
import {
  IconBug, IconChart, IconCheck, IconClock, IconFolder,
  IconPackage, IconPlus, IconSearch, IconSliders, IconUpload,
} from '@/icons.jsx';

const STATUS_ICONS = {
  qa_pending: IconClock,
  qa_in_progress: IconSearch,
  qa_done: IconCheck,
  approved: IconCheck,
  sent_back: IconBug,
  closed: IconPackage,
};

/* Map each release status onto a house soft-pill tone (dashboard-kit TONES). */
const STATUS_TONE = {
  qa_pending: 'warning',
  qa_in_progress: 'info',
  qa_done: 'info',
  approved: 'success',
  sent_back: 'danger',
  closed: 'neutral',
};

/* Bug pipeline stages (ordered, with a colour each) for the Pipeline panel. */
const BUG_STAGES = [
  ['open', 'Open', 'var(--danger)'],
  ['in_progress', 'In Progress', 'var(--warning)'],
  ['disputed', 'Needs clarification', '#a855f7'],
  ['fixed', 'Fixed — awaiting QA', 'var(--brand)'],
  ['pending_tl', 'Pending Team Lead', 'var(--info)'],
  ['verified', 'Verified', 'var(--success)'],
];

/* Bucket releases into the last N calendar months (count submitted per month). */
function monthlyReleaseCounts(releases, n = 6) {
  const now = new Date();
  const months = [];
  for (let i = n - 1; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const labels = months.map((d) => d.toLocaleString('en-US', { month: 'short' }));
  const data = months.map((d) =>
    releases.filter((r) => {
      const c = new Date(r.createdAt);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).length
  );
  return { labels, data };
}

/* ================================================================== */
/* DashboardHome — the reports dashboard (matches the target layout):  */
/* title, two rows of 5 KPI cards, a trend chart + pipeline panel,     */
/* and a bottom row of leaderboard / activity / forecast.             */
/* ================================================================== */
export function DashboardHome({
  releases, bugs, projects, profiles, projectsById, profilesById,
  counts, openBugTotal, user, teamName, canSubmit, onSubmit, onOpenRelease, onNavigate,
}) {
  const [pipeMode, setPipeMode] = useState('releases');
  const firstName = (user?.name || '').split(/[\s_]+/)[0] || 'there';

  // ---- headline metrics (all from the shared metric layer) ----
  const m = computeReleaseMetrics(releases, bugs);
  const bm = aggregateBugMetrics(bugs);
  const totalReleases = releases.length;
  const approved = counts.approved || 0;
  const passRate = Math.round(m.passRate || 0);
  const cycle = m.cycleDays || 0;
  const awaiting = counts.qa_pending || 0;
  const inQa = (counts.qa_in_progress || 0) + (counts.qa_done || 0);
  const sentBack = counts.sent_back || 0;
  const blocking = bugs.filter(
    (b) => b.status !== 'verified' && (b.severity === 'critical' || b.severity === 'major')
  ).length;
  const verified = bm.byStatus.verified || 0;
  const passGap = passRate - 75; // vs the 75% target

  // ---- trend chart (releases submitted per month, vs a modest target line) ----
  const { labels, data } = monthlyReleaseCounts(releases, 6);
  const goal = Math.max(1, Math.round(totalReleases / 6) + 1);
  const target = data.map(() => goal);

  // ---- pipeline panel data ----
  const releaseStages = STATUS_ORDER.map((k) => ({
    label: STATUSES[k].label, count: counts[k] || 0, color: STATUSES[k].color,
  }));
  const bugStages = BUG_STAGES.map(([k, label, color]) => ({ label, count: bm.byStatus[k] || 0, color }));

  // ---- leaderboard (top workload) ----
  const workload = computeWorkload(profiles, releases, bugs, 'all').slice(0, 5);
  const maxLoad = Math.max(1, ...workload.map((w) => w.activeReleases + w.pendingReviews + w.openBugs));

  // ---- activity feed (recent releases + bugs merged) ----
  const activity = [
    ...releases.map((r) => ({
      t: new Date(r.createdAt).getTime(), kind: 'release', id: r.id,
      text: `${r.submittedBy || 'Someone'} submitted ${formatVersion(r.version)}`,
      sub: projectsById[r.projectId]?.name || r.platform,
    })),
    ...bugs.map((b) => ({
      t: new Date(b.createdAt).getTime(), kind: 'bug', id: b.releaseId,
      text: `${b.createdBy || 'Someone'} reported "${b.title}"`,
      sub: b.severity,
    })),
  ].sort((a, b) => b.t - a.t).slice(0, 8);

  const kpiFoot = { fontSize: 10.5 };
  const panelHead = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' };
  const panelSub = { fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2 };

  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>QA Reports</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '5px 0 0' }}>
            {greeting()}, {firstName} · all-time performance overview{teamName ? ' — ' : ''}
            {teamName && <strong style={{ color: 'var(--color-text-primary)' }}>{teamName}</strong>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...ghostButton, display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => onNavigate && onNavigate('releases')}>
            <IconPackage size={15} /> All releases
          </button>
          {canSubmit && (
            <button style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={onSubmit}>
              <IconUpload size={15} /> Submit release
            </button>
          )}
        </div>
      </div>

      {/* KPI row 1 */}
      <div className="dash-kpis" style={{ marginBottom: 14 }}>
        <StatCard label="Total Releases" value={totalReleases.toLocaleString()} foot="ALL TIME" />
        <StatCard label="QA Approved" value={approved.toLocaleString()} foot="SHIPPED CLEAN" />
        <StatCard label="Pass Rate" value={`${passRate}%`} delta={`${passGap >= 0 ? '+' : ''}${passGap}pp`} deltaDir={passGap >= 0 ? 'up' : 'down'} foot="VS 75% TARGET" />
        <StatCard label="Open Bugs" value={openBugTotal.toLocaleString()} foot="ACTIVE · UNVERIFIED" />
        <StatCard label="Avg Cycle Time" value={`${cycle}d`} foot="SUBMIT → APPROVE" />
      </div>

      {/* KPI row 2 */}
      <div className="dash-kpis" style={{ marginBottom: 22 }}>
        <StatCard label="Awaiting QA" value={awaiting.toLocaleString()} foot="IN THE QUEUE" />
        <StatCard label="In QA" value={inQa.toLocaleString()} foot="BEING REVIEWED" />
        <StatCard label="Returned for Rework" value={sentBack.toLocaleString()} foot={sentBack ? 'SENT BACK TO DEV' : 'NONE PENDING'} />
        <StatCard label="Blocking Bugs" value={blocking.toLocaleString()} foot="MAJOR · CRITICAL OPEN" />
        <StatCard label="Verified Bugs" value={verified.toLocaleString()} foot="RESOLVED · CLOSED" />
      </div>

      {/* chart + pipeline */}
      <div className="dash-mid" style={{ marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={panelHead}>Releases Over Time</div>
              <div style={panelSub}>Submitted per month · last 6 months</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--brand)' }} /> Actual
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--color-text-tertiary)' }} /> Target
              </span>
            </div>
          </div>
          <TrendChart data={data} target={target} xLabels={labels} height={300} />
        </div>

        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div>
              <div style={panelHead}>Pipeline</div>
              <div style={panelSub}>Count by stage · all time</div>
            </div>
            <Segmented
              options={[['releases', 'Releases'], ['bugs', 'Bugs']]}
              value={pipeMode}
              onChange={setPipeMode}
            />
          </div>
          {pipeMode === 'releases' ? (
            <StageBars stages={releaseStages} total={totalReleases} totalLabel="Total Releases" />
          ) : (
            <StageBars stages={bugStages} total={bm.total} totalLabel="Total Bugs" />
          )}
        </div>
      </div>

      {/* bottom row */}
      <div className="dash-bottom">
        {/* leaderboard */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={panelHead}>Team Leaderboard</div>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{workload.length} members</span>
          </div>
          <div style={{ ...panelSub, marginBottom: 14 }}>Active workload — releases, reviews & open bugs</div>
          {workload.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', padding: '10px 0' }}>No active workload.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {workload.map((w) => {
                const load = w.activeReleases + w.pendingReviews + w.openBugs;
                return (
                  <div key={w.m.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Avatar name={w.m.name} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.m.name}</span>
                        <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{load}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden', marginTop: 5 }}>
                        <div style={{ height: '100%', width: `${Math.max(6, (load / maxLoad) * 100)}%`, borderRadius: 999, background: 'var(--brand)' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* activity feed */}
        <div style={{ ...card, padding: 20 }}>
          <div style={panelHead}>Activity Feed</div>
          <div style={{ ...panelSub, marginBottom: 14 }}>Latest releases & bug reports</div>
          {activity.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', padding: '10px 0' }}>No recent activity.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {activity.map((a, i) => (
                <button
                  key={i}
                  onClick={() => a.id && onOpenRelease(a.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
                    padding: '8px 8px', borderRadius: 8, border: 'none', background: 'transparent', cursor: a.id ? 'pointer' : 'default', fontFamily: 'inherit',
                  }}
                  className="mgr-row"
                >
                  <span style={{ marginTop: 2, color: a.kind === 'bug' ? 'var(--danger)' : 'var(--brand)', display: 'inline-flex' }}>
                    {a.kind === 'bug' ? <IconBug size={15} /> : <IconUpload size={15} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{a.sub} · {relativeTime(a.t)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* forecast (placeholder, matches the target's "Deal Forecast — Coming Soon") */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={panelHead}>Release Forecast</div>
            <Pill label="Coming soon" tone="info" />
          </div>
          <div style={{ ...panelSub, marginBottom: 16 }}>Projected ship dates from WBS milestones</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '26px 0', textAlign: 'center' }}>
            <IconChart size={30} />
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', maxWidth: 220 }}>
              Milestone-based forecasting lands here next — track projected vs. actual delivery per platform.
            </div>
            <button style={{ ...ghostButton, marginTop: 4 }} onClick={() => onNavigate && onNavigate('wbs')}>Open WBS</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Clickable summary chip — doubles as a status quick-filter. */
function StatChip({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 12,
        cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)',
        background: active ? 'var(--brand)' : 'var(--color-background-primary)',
        color: active ? '#fff' : 'var(--color-text-primary)',
        border: `1px solid ${active ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? '#fff' : color, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#fff' : 'var(--color-text-secondary)' }}>{value}</span>
    </button>
  );
}

/* ================================================================== */
/* ReleasesPage — the dedicated "Releases" section (its own sidebar     */
/* item). Header + clickable status summary + search & filters + list.  */
/* ================================================================== */
export function ReleasesPage({
  releases, scopedCount, counts, openBugTotal, projects, projectsById, profilesById, openBugCountByRelease,
  projectFilter, platformFilter, typeFilter, statusFilter, onProject, onPlatform, onType, onStatus,
  loading, canSubmit, onSubmit, onOpen,
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = term
    ? releases.filter(
        (r) =>
          `v${r.version}`.toLowerCase().includes(term) ||
          (projectsById[r.projectId]?.name || '').toLowerCase().includes(term) ||
          (r.releaseNotes || '').toLowerCase().includes(term)
      )
    : releases;

  const chips = [
    ['all', 'All', 'var(--color-text-tertiary)'],
    ['qa_pending', STATUSES.qa_pending.label, STATUSES.qa_pending.color],
    ['qa_in_progress', STATUSES.qa_in_progress.label, STATUSES.qa_in_progress.color],
    ['qa_done', STATUSES.qa_done.label, STATUSES.qa_done.color],
    ['approved', STATUSES.approved.label, STATUSES.approved.color],
    ['sent_back', STATUSES.sent_back.label, STATUSES.sent_back.color],
  ];

  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Releases</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '5px 0 0' }}>
            Every build across your projects · <strong style={{ color: 'var(--color-text-primary)' }}>{scopedCount}</strong> total
            {openBugTotal > 0 && <> · <strong style={{ color: 'var(--danger)' }}>{openBugTotal}</strong> open bug{openBugTotal === 1 ? '' : 's'}</>}
          </p>
        </div>
        {canSubmit && (
          <button style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={onSubmit}>
            <IconUpload size={15} /> Submit release
          </button>
        )}
      </div>

      {/* status summary chips (click to filter by status) */}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 16 }}>
        {chips.map(([key, label, color]) => (
          <StatChip
            key={key}
            label={label}
            color={color}
            value={key === 'all' ? scopedCount : counts[key] || 0}
            active={statusFilter === key}
            onClick={() => onStatus(key)}
          />
        ))}
      </div>

      {/* toolbar: dropdown filters + text search */}
      <div style={{ ...card, padding: 12, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilterBar
          projects={projects}
          projectFilter={projectFilter}
          platformFilter={platformFilter}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          onProject={onProject}
          onPlatform={onPlatform}
          onType={onType}
          onStatus={onStatus}
          count={shown.length}
        />
        <span style={{ flex: 1 }} />
        <div style={{ position: 'relative', flex: '0 1 260px' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
            <IconSearch size={15} />
          </span>
          <input
            value={q}
            placeholder="Search version, project, notes…"
            onChange={(e) => setQ(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 34, height: 38, width: '100%' }}
          />
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading releases…</div>
      ) : shown.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', marginBottom: 10, color: 'var(--color-text-tertiary)' }}><IconPackage size={30} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            {scopedCount === 0 ? 'No releases yet' : 'No releases match your filters'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            {scopedCount === 0 ? 'Submit your first build to get started.' : 'Try clearing a filter or the search box.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((r) => (
            <ReleaseCard
              key={r.id}
              release={r}
              project={projectsById[r.projectId]}
              openBugs={openBugCountByRelease[r.id] || 0}
              assignedName={r.assignedQa ? profilesById[r.assignedQa]?.name : null}
              onClick={() => onOpen(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StatCards({ counts }) {
  const n = (k) => counts[k] || 0;
  // KPI hierarchy: a few big headline numbers, then the full lifecycle as a chevron pipeline.
  const awaiting = n('qa_pending');
  const inQa = n('qa_in_progress') + n('qa_done');
  const approved = n('approved');
  const rework = n('sent_back');
  // The happy-path pipeline (closed is off-board and shown as a headline instead).
  const stages = ['qa_pending', 'qa_in_progress', 'qa_done', 'approved'].map((key) => ({
    label: STATUSES[key].label,
    count: n(key),
    tone: STATUS_TONE[key],
  }));
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <StatBig label="Awaiting QA" value={awaiting} accent="var(--warning)" sub="releases in the queue" />
        <StatBig label="In QA" value={inQa} accent="var(--brand)" sub="releases being reviewed" />
        <StatBig label="QA Approved" value={approved} accent="var(--success)" sub="releases shipped clean" />
        <StatBig
          label="Returned for Rework"
          value={rework}
          accent="var(--danger)"
          sub={rework ? 'releases sent back to dev' : 'none pending'}
        />
      </div>
      <Chevron stages={stages} />
    </div>
  );
}

export function FilterBar({
  projects,
  projectFilter,
  platformFilter,
  typeFilter,
  statusFilter,
  onProject,
  onPlatform,
  onType,
  onStatus,
  count,
}) {
  const s = { ...inputStyle, width: 'auto', padding: '7px 10px' };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
        flexWrap: 'wrap',
      }}
    >
      <select style={s} value={projectFilter} onChange={(e) => onProject(e.target.value)}>
        <option value="all">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select style={s} value={platformFilter} onChange={(e) => onPlatform(e.target.value)}>
        <option value="all">All platforms</option>
        {RELEASE_PLATFORMS.map((pl) => (
          <option key={pl} value={pl}>
            {pl}
          </option>
        ))}
      </select>
      <select style={s} value={typeFilter} onChange={(e) => onType(e.target.value)}>
        <option value="all">All types</option>
        {RELEASE_TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {RELEASE_TYPES[t].label}
          </option>
        ))}
      </select>
      <select style={s} value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
        <option value="all">All statuses</option>
        {STATUS_ORDER.map((st) => (
          <option key={st} value={st}>
            {STATUSES[st].label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {count} release{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

/* ================================================================== */
/* Release card                                                       */
/* ================================================================== */

export function ReleaseCard({ release, project, openBugs, assignedName, onClick }) {
  const [hover, setHover] = useState(false);
  const notesPreview = (release.releaseNotes || '').split('\n')[0].trim();
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...card,
        padding: 15,
        cursor: 'pointer',
        borderColor: hover ? 'var(--brand)' : 'var(--color-border-tertiary)',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 6px 16px -6px rgba(15,23,42,0.18)' : 'none',
        transition: 'border-color .12s ease, transform .15s ease, box-shadow .15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TypeBadge type={release.releaseType} />
        <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600 }}>
          {formatVersion(release.version)}
        </span>
        <StatusBadge status={release.status} />
        <StatusAge release={release} />
        {project && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <IconFolder size={13} />
            {project.name}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            padding: '1px 7px',
            borderRadius: 999,
          }}
        >
          {release.platform}
        </span>
        <EnvBadge environment={release.environment} />
        {openBugs > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CountBadge count={openBugs} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)' }}>
              open bug{openBugs === 1 ? '' : 's'}
            </span>
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
          {assignedName ? `QA: ${assignedName}` : 'Unassigned'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={release.submittedBy} size={28} />
          <div style={{ lineHeight: 1.2, textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{release.submittedBy}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              {release.submittedByRole} · {release.date}
            </div>
          </div>
        </div>
      </div>

      {notesPreview && !release.qaNote ? (
        <div
          style={{
            marginTop: 9,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {notesPreview}
        </div>
      ) : null}

      {release.qaNote ? (
        <div
          style={{
            marginTop: 11,
            padding: '9px 11px',
            background: 'var(--color-background-secondary)',
            borderRadius: 9,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>QA note </span>
          {release.qaNote}
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================== */
/* Sidebar (left) + Right panel                                       */
/* ================================================================== */

const PLAT_COLORS = {
  Android: '#10b981',
  iOS: '#3b82f6',
  Web: '#f59e0b',
  Both: '#0c5cab',
};

function NavRow({ label, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 9,
        cursor: 'pointer',
        background: active ? 'var(--brand-soft)' : 'transparent',
        color: active ? 'var(--brand)' : 'var(--color-text-primary)',
        fontWeight: active ? 600 : 500,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: active ? 'var(--brand)' : 'var(--color-border-tertiary)',
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: active ? 'var(--brand)' : 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {count}
      </span>
    </div>
  );
}

export function Sidebar({
  projects,
  releases,
  teamName,
  openBugTotal,
  disputedTotal,
  projectFilter,
  platformFilter,
  onSelect,
}) {
  const [q, setQ] = useState('');
  const countFor = (id, plat) =>
    releases.filter(
      (r) => r.projectId === id && (!plat || r.platform === plat)
    ).length;
  const shown = projects.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase())
  );
  const atRisk = releases.filter((r) => slaLevel(r.status, statusSince(r))).length;
  const stat = (label, value, color) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 0',
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 700,
          color: color || 'var(--color-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, padding: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <span style={{ ...sideHead, marginBottom: 0 }}>Projects</span>
          {teamName && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--brand)',
                background: 'var(--brand-soft)',
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              {teamName}
            </span>
          )}
        </div>
        <input
          style={{ ...inputStyle, padding: '7px 10px', marginBottom: 8 }}
          value={q}
          placeholder="Search projects…"
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
          <NavRow
            label="All projects"
            count={releases.length}
            active={projectFilter === 'all'}
            onClick={() => onSelect('all', 'all')}
          />
          {shown.map((p) => {
            const plats = platformsForProjectType(p.type);
            const both = plats.length > 1;
            const projActive = projectFilter === p.id;
            return (
              <div key={p.id}>
                <NavRow
                  label={p.name}
                  count={countFor(p.id)}
                  active={projActive && platformFilter === 'all'}
                  onClick={() => onSelect(p.id, 'all')}
                />
                {both && (
                  <div style={{ marginLeft: 16 }}>
                    {plats.map((pl) => (
                      <NavRow
                        key={pl}
                        label={pl}
                        count={countFor(p.id, pl)}
                        active={projActive && platformFilter === pl}
                        onClick={() => onSelect(p.id, pl)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 10px' }}>
              {projects.length === 0 ? 'No projects yet.' : 'No matches.'}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>At a glance</div>
        {stat('Releases', releases.length)}
        {stat('Projects', projects.length)}
        {stat('Open bugs', openBugTotal, openBugTotal ? '#dc2626' : undefined)}
        {stat('Needs clarification', disputedTotal, disputedTotal ? '#7c3aed' : undefined)}
        {stat('Needs attention', atRisk, atRisk ? '#dc2626' : undefined)}
      </div>
    </div>
  );
}

export function RightPanel({
  releases,
  bugs,
  canSubmit,
  canManage,
  onSubmit,
  onAdmin,
  onAnalytics,
  onOpenRelease,
}) {
  const activity = [];
  releases.forEach((r) =>
    activity.push({
      id: 'r' + r.id,
      t: r.createdAt || r.date,
      kind: 'release',
      text: `${r.submittedBy} submitted ${RELEASE_TYPES[r.releaseType]?.label || ''} ${formatVersion(r.version)}`,
      releaseId: r.id,
    })
  );
  bugs.forEach((b) =>
    activity.push({
      id: 'b' + b.id,
      t: b.createdAt,
      kind: 'bug',
      text: `${b.createdBy} reported “${b.title}”`,
      releaseId: b.releaseId,
    })
  );
  activity.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime());
  const recent = activity.slice(0, 8);

  const plat = {};
  releases.forEach((r) => (plat[r.platform] = (plat[r.platform] || 0) + 1));
  const platRows = ['Android', 'iOS', 'Web', 'Both']
    .map((k) => [k, plat[k] || 0])
    .filter(([, v]) => v > 0);
  const maxPlat = Math.max(1, ...platRows.map(([, v]) => v));

  const quickBtn = {
    ...ghostButton,
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* quick actions */}
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Quick actions</div>
        {canSubmit && (
          <button
            style={{
              ...primaryButton(false),
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            onClick={onSubmit}
          >
            <IconPlus size={15} />
            Submit release
          </button>
        )}
        <button style={quickBtn} onClick={onAnalytics}>
          <IconChart size={15} />
          View analytics
        </button>
        {canManage && (
          <button style={quickBtn} onClick={onAdmin}>
            <IconSliders size={15} />
            Manage projects &amp; users
          </button>
        )}
      </div>

      {/* platform mix */}
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Platform mix</div>
        {platRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No releases yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {platRows.map(([k, v]) => (
              <div key={k}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{k}</span>
                  <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {v}
                  </span>
                </div>
                <div
                  style={{
                    height: 7,
                    borderRadius: 999,
                    background: 'var(--color-background-secondary)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(v / maxPlat) * 100}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'var(--brand)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* recent activity */}
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Recent activity</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nothing yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.map((a) => (
              <div
                key={a.id}
                onClick={() => a.releaseId && onOpenRelease(a.releaseId)}
                style={{ display: 'flex', gap: 9, cursor: a.releaseId ? 'pointer' : 'default' }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-background-secondary)',
                    border: '1px solid var(--color-border-tertiary)',
                  }}
                >
                  {a.kind === 'bug' ? <IconBug size={13} /> : <IconUpload size={13} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.4 }}>{a.text}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {relativeTime(a.t)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

