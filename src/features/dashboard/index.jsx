/* Dashboard chrome — stat cards, filter bar, release card, left sidebar (project
   nav + at-a-glance), and the right panel. The home dashboard lives in ./home. */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as api from '@/api.js';
export { DashboardHome } from './home/index.jsx';
import { card, inputStyle, ghostButton, primaryButton, StatusBadge, TypeBadge, Avatar, CountBadge } from '@/ui.jsx';
import { Chevron, StatBig, SkeletonList } from '@shared/dashboard-kit.jsx';
import { sideHead, StatusAge, EnvBadge, statusSince, relativeTime, PageHeader, Pager, useDebounced, filterInput, filterSelect, pressable } from '@shared/ui-kit.jsx';
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
  IconBug, IconChart, IconFolder,
  IconPackage, IconPlus, IconSearch, IconSliders, IconUpload,
} from '@/icons.jsx';

/* Map each release status onto a house soft-pill tone (dashboard-kit TONES). */
const STATUS_TONE = {
  qa_pending: 'warning',
  qa_in_progress: 'info',
  qa_done: 'info',
  approved: 'success',
  sent_back: 'danger',
  closed: 'neutral',
};

/* Clickable summary chip — doubles as a status quick-filter. */
function StatChip({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
        cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)',
        background: active ? 'var(--brand)' : 'var(--color-background-primary)',
        color: active ? '#fff' : 'var(--color-text-primary)',
        border: `1px solid ${active ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? '#fff' : color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: active ? '#fff' : 'var(--color-text-secondary)' }}>{value}</span>
    </button>
  );
}

/* ================================================================== */
/* ReleasesPage — the dedicated "Releases" section (its own sidebar     */
/* item). Header + clickable status summary + search & filters + list.  */
/* ================================================================== */
const RELEASES_PAGE_SIZE = 20;
const CHIP_STATUSES = ['qa_pending', 'qa_in_progress', 'qa_done', 'approved', 'sent_back'];

/* Loads one page of releases from the database, filtered and counted there.
   scopeProjectIds: the caller's projects, or null for Admins (every project).
   Query keys start with 'releases' / 'bugs' so the app's refetchReleases() and
   refetchBugs() after a change also refresh this page. */
export function ReleasesPage({
  scopeProjectIds, projects, projectsById, profilesById, openBugTotal,
  projectFilter, platformFilter, typeFilter, statusFilter, onProject, onPlatform, onType, onStatus,
  canSubmit, onSubmit, onOpen,
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const search = useDebounced(q.trim(), 300);
  const scopeKey = scopeProjectIds ? [...scopeProjectIds].sort().join(',') : 'all';
  const ctx = { projectIds: scopeProjectIds, project: projectFilter, platform: platformFilter, type: typeFilter };

  // back to page 1 whenever what's being listed changes
  useEffect(() => { setPage(0); }, [projectFilter, platformFilter, typeFilter, statusFilter, search, scopeKey]);

  // project names are matched here, from the list the app already has
  const searchProjectIds = useMemo(() => {
    const t = search.toLowerCase();
    return t ? projects.filter((p) => p.name.toLowerCase().includes(t)).map((p) => p.id) : [];
  }, [search, projects]);

  const listQ = useQuery({
    queryKey: ['releases', 'page', scopeKey, projectFilter, platformFilter, typeFilter, statusFilter, search, page],
    queryFn: () => api.fetchReleasesPage({ ...ctx, status: statusFilter, search, searchProjectIds, offset: page * RELEASES_PAGE_SIZE, limit: RELEASES_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const countsQ = useQuery({
    queryKey: ['releases', 'statusCounts', scopeKey, projectFilter, platformFilter, typeFilter],
    queryFn: () => api.fetchReleaseStatusCounts({ ...ctx, statuses: CHIP_STATUSES }),
    placeholderData: keepPreviousData,
  });
  const rows = listQ.data?.rows || [];
  const total = listQ.data?.total || 0;
  const pageIds = rows.map((r) => r.id);
  const bugCountsQ = useQuery({
    queryKey: ['bugs', 'openByRelease', pageIds.join(',')],
    queryFn: () => api.fetchOpenBugCountsByRelease(pageIds),
    enabled: pageIds.length > 0,
    placeholderData: keepPreviousData,
  });
  const openBugCountByRelease = bugCountsQ.data || {};
  const counts = countsQ.data?.byStatus || {};
  const scopedCount = countsQ.data?.scopeTotal;

  // a page past the end (e.g. after the last release on it was closed): step back
  useEffect(() => {
    if (listQ.data && !listQ.isPlaceholderData && page > 0 && rows.length === 0) setPage(Math.max(0, Math.ceil(total / RELEASES_PAGE_SIZE) - 1));
  }, [listQ.data, listQ.isPlaceholderData, page, rows.length, total]);

  const chips = [
    ['all', 'All', 'var(--color-text-tertiary)'],
    ...CHIP_STATUSES.map((k) => [k, STATUSES[k].label, STATUSES[k].color]),
  ];
  const fmt = (n) => (n == null ? '…' : n.toLocaleString());
  const loadingFirst = listQ.isPending;

  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      {/* PageHeaderBar (glass) */}
      <PageHeader
        title="Releases"
        icon={<IconPackage size={18} />}
        subtitle={<>
          Every build across your projects · <strong style={{ color: 'var(--color-text-primary)' }}>{fmt(scopedCount)}</strong> total
          {openBugTotal > 0 && <> · <strong style={{ color: 'var(--danger)' }}>{openBugTotal}</strong> open bug{openBugTotal === 1 ? '' : 's'}</>}
        </>}
        actions={canSubmit && (
          <button style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={onSubmit}>
            <IconUpload size={15} /> Submit release
          </button>
        )}
      />

      {/* status summary chips (click to filter by status) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {chips.map(([key, label, color]) => (
          <StatChip
            key={key}
            label={label}
            color={color}
            value={fmt(key === 'all' ? scopedCount : counts[key])}
            active={statusFilter === key}
            onClick={() => onStatus(key)}
          />
        ))}
      </div>

      {/* toolbar (the shared .filter-bar): search, dropdown filters, count */}
      <div className="filter-bar">
        <div className="filter-search" style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none', display: 'inline-flex' }}>
            <IconSearch size={15} />
          </span>
          <input
            type="search"
            value={q}
            placeholder="Search version, project, notes…"
            aria-label="Search releases"
            onChange={(e) => setQ(e.target.value)}
            style={{ ...filterInput, paddingLeft: 34 }}
          />
        </div>
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
          count={loadingFirst ? null : total}
        />
      </div>

      {/* list */}
      {listQ.isError ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Couldn’t load releases</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{listQ.error?.message}</div>
          <button style={ghostButton} onClick={() => listQ.refetch()}>Try again</button>
        </div>
      ) : loadingFirst ? (
        <SkeletonList rows={5} height={72} card label="Loading releases" />
      ) : rows.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', marginBottom: 12, color: 'var(--color-text-tertiary)' }}><IconPackage size={30} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            {scopedCount === 0 ? 'No releases yet' : 'No releases match your filters'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            {scopedCount === 0 ? 'Submit your first build to get started.' : 'Try clearing a filter or the search box.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: listQ.isPlaceholderData ? 0.6 : 1, transition: 'opacity .15s' }}>
            {rows.map((r) => (
              <ReleaseCard
                key={r.id}
                release={r}
                project={projectsById[r.projectId]}
                openBugs={openBugCountByRelease[r.id] || 0}
                assignedName={r.assignedQa ? profilesById[r.assignedQa]?.name : null}
                onClick={() => onOpen(r.id, r)}
              />
            ))}
          </div>
          <Pager page={page} pageSize={RELEASES_PAGE_SIZE} total={total} onPage={setPage} busy={listQ.isFetching} noun={total === 1 ? 'release' : 'releases'} />
        </>
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
    <div style={{ marginBottom: 16 }}>
      <div className="stat-row big" style={{ marginBottom: 12 }}>
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
  const s = filterSelect;
  // children join the parent .filter-bar row
  return (
    <div style={{ display: 'contents' }}>
      <select aria-label="Project" style={s} value={projectFilter} onChange={(e) => onProject(e.target.value)}>
        <option value="all">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select aria-label="Platform" style={s} value={platformFilter} onChange={(e) => onPlatform(e.target.value)}>
        <option value="all">All platforms</option>
        {RELEASE_PLATFORMS.map((pl) => (
          <option key={pl} value={pl}>
            {pl}
          </option>
        ))}
      </select>
      <select aria-label="Release type" style={s} value={typeFilter} onChange={(e) => onType(e.target.value)}>
        <option value="all">All types</option>
        {RELEASE_TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {RELEASE_TYPES[t].label}
          </option>
        ))}
      </select>
      <select aria-label="Status" style={s} value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
        <option value="all">All statuses</option>
        {STATUS_ORDER.map((st) => (
          <option key={st} value={st}>
            {STATUSES[st].label}
          </option>
        ))}
      </select>
      {count != null && (
        <span className="filter-count">
          {count.toLocaleString()} release{count === 1 ? '' : 's'}
        </span>
      )}
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
      {...pressable(onClick, `Open build ${formatVersion(release.version)}${project ? ` · ${project.name}` : ''}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        ...card,
        padding: 16,
        cursor: 'pointer',
        borderColor: hover ? 'var(--brand)' : 'var(--color-border-tertiary)',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 6px 16px -6px rgba(15,23,42,0.18)' : 'none',
        transition: 'border-color .12s ease, transform .15s ease, box-shadow .15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TypeBadge type={release.releaseType} />
        <span className="tnum" style={{ fontSize: 14, fontWeight: 600 }}>
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
              gap: 4,
            }}
          >
            <IconFolder size={13} />
            {project.name}
          </span>
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            padding: '1px 8px',
            borderRadius: 999,
          }}
        >
          {release.platform}
        </span>
        <EnvBadge environment={release.environment} />
        {openBugs > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CountBadge count={openBugs} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>
              open bug{openBugs === 1 ? '' : 's'}
            </span>
          </span>
        )}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
          {assignedName ? `QA: ${assignedName}` : 'Unassigned'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={release.submittedBy} size={28} />
          <div style={{ lineHeight: 1.2, textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{release.submittedBy}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {release.submittedByRole} · {release.date}
            </div>
          </div>
        </div>
      </div>

      {/* always exactly one line under the header (QA note, else the release
          notes, else a placeholder) so every build card is the same height */}
      <div
        className="clamp-1"
        title={release.qaNote || notesPreview || undefined}
        style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: notesPreview || release.qaNote ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}
      >
        {release.qaNote ? (
          <><span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>QA note: </span>{release.qaNote}</>
        ) : notesPreview || 'No release notes'}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Sidebar (left) + Right panel                                       */
/* ================================================================== */

const PLAT_COLORS = {
  Android: 'var(--c-green)',
  iOS: 'var(--c-blue)',
  Web: 'var(--c-amber)',
  Both: 'var(--c-blue)',
};

function NavRow({ label, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
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
          fontSize: 12,
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
        padding: '8px 0',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, padding: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <span style={{ ...sideHead, marginBottom: 0 }}>Projects</span>
          {teamName && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--brand)',
                background: 'var(--brand-soft)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {teamName}
            </span>
          )}
        </div>
        <input
          style={{ ...inputStyle, padding: '8px 12px', marginBottom: 8 }}
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
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 12px' }}>
              {projects.length === 0 ? 'No projects yet.' : 'No matches.'}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <div style={sideHead}>At a glance</div>
        {stat('Releases', releases.length)}
        {stat('Projects', projects.length)}
        {stat('Open bugs', openBugTotal, openBugTotal ? 'var(--c-red)' : undefined)}
        {stat('Needs clarification', disputedTotal, disputedTotal ? 'var(--c-violet)' : undefined)}
        {stat('Needs attention', atRisk, atRisk ? 'var(--c-red)' : undefined)}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* quick actions */}
      <div style={{ ...card, padding: 16 }}>
        <div style={sideHead}>Quick actions</div>
        {canSubmit && (
          <button
            style={{
              ...primaryButton(false),
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
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
      <div style={{ ...card, padding: 16 }}>
        <div style={sideHead}>Platform mix</div>
        {platRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No releases yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      <div style={{ ...card, padding: 16 }}>
        <div style={sideHead}>Recent activity</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nothing yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.map((a) => (
              <div
                key={a.id}
                onClick={() => a.releaseId && onOpenRelease(a.releaseId)}
                style={{ display: 'flex', gap: 8, cursor: a.releaseId ? 'pointer' : 'default' }}
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
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
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

