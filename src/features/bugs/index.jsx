/* Bugs feature — the standalone Bugs page: cross-project bug list with filters,
   an aging-issues panel, and readable per-bug cards (full detail: description,
   project, platform, release version, reporter). Filtering is the shared layer. */
import { useState, useMemo } from 'react';
import { card, inputStyle, ghostButton, BugStatusBadge, SeverityBadge } from '@/ui.jsx';
import { Empty, PageHeader, SlaBadge, TagChip, sideHead } from '@shared/ui-kit.jsx';
import { StatSmall } from '@shared/dashboard-kit.jsx';
import { filterBugs } from '@shared/filters.js';
import { agingBugs, aggregateBugMetrics } from '@shared/bugMetrics.js';
import { BugActions, ProposedCloseBanner } from '@shared/bug-actions.jsx';
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
} from '@/constants.js';

export function BugsPage({
  bugs,
  releases,
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
  const relById = useMemo(() => {
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
  const [visible, setVisible] = useState(20);

  const devs = (profiles || []).filter((p) => p.role !== 'QA');
  const qas = (profiles || []).filter((p) => p.role === 'QA');

  // single shared filter pipeline (same functions Analytics uses)
  const bugFilter = { search: q, status, severity: sev, platform, tag, feature, project, team, developer, qa, from, to };
  const filtered = filterBugs(bugs, bugFilter, { releaseById: relById, projectById: projectsById }).sort((a, b) =>
    sort === 'oldest'
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const pageBugs = filtered.slice(0, visible);
  const metrics = aggregateBugMetrics(filtered);

  // aging = active bugs from the SAME filtered dataset, at/over SLA, oldest first
  const aging = agingBugs(filtered, 6);

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  return (
    <>
      <PageHeader title="Bugs" subtitle="Track and triage every bug across your releases" />

      {/* summary — house KPI hierarchy */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <StatSmall label="Total (filtered)" value={metrics.total} />
        <StatSmall label="Active" value={metrics.active} color={metrics.active ? 'var(--danger)' : undefined} />
        <StatSmall label="Closed" value={metrics.closed} color="var(--success)" />
        <StatSmall label="Aging" value={aging.length} color={aging.length ? 'var(--warning)' : undefined} />
      </div>

      {/* filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }}
          value={q}
          placeholder="Search bugs or projects…"
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(20);
          }}
        />
        <select style={fSel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {BUG_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{BUG_STATUSES[s].label}</option>
          ))}
        </select>
        <select style={fSel} value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="all">All severities</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>{SEVERITIES[s].label}</option>
          ))}
        </select>
        <select style={fSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">All platforms</option>
          {RELEASE_PLATFORMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select style={fSel} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">All tags</option>
          {BUG_TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select style={fSel} value={feature} onChange={(e) => setFeature(e.target.value)}>
          <option value="all">All features</option>
          {BUG_FEATURES.map((ft) => (
            <option key={ft} value={ft}>{ft}</option>
          ))}
        </select>
        <select style={fSel} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="all">All projects</option>
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {isAdmin && (
          <select style={fSel} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {(teams || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <select style={fSel} value={developer} onChange={(e) => setDeveloper(e.target.value)}>
          <option value="all">All developers</option>
          {devs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select style={fSel} value={qa} onChange={(e) => setQa(e.target.value)}>
          <option value="all">All QA</option>
          {qas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input style={fSel} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input style={fSel} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <select style={fSel} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* aging */}
      {aging.length > 0 && (
        <div style={{ ...card, padding: 14, marginBottom: 16 }}>
          <div style={{ ...sideHead, marginBottom: 10, color: 'var(--danger)' }}>
            Aging issues — needs immediate attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aging.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenRelease(b.releaseId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 11px',
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-tertiary)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <SlaBadge level={bugSlaLevel(b.status, b.createdAt)} />
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{b.title}</span>
                {relById[b.releaseId] && (
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    v{relById[b.releaseId].version}
                  </span>
                )}
                <SeverityBadge severity={b.severity} />
                <BugStatusBadge status={b.status} />
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>open {humanizeSince(b.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* list */}
      {filtered.length === 0 ? (
        <Empty>No bugs match your filters.</Empty>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pageBugs.map((b) => (
              <BugCard
                key={b.id}
                bug={b}
                rel={relById[b.releaseId]}
                proj={projectsById[relById[b.releaseId]?.projectId]}
                reporter={b.createdBy || profilesById[b.createdById]?.name || ''}
                proposerName={b.resolutionById ? profilesById[b.resolutionById]?.name || '' : ''}
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
          {visible < filtered.length && (
            <button style={{ ...ghostButton, width: '100%', marginTop: 12 }} onClick={() => setVisible((v) => v + 20)}>
              Load more ({filtered.length - visible} left)
            </button>
          )}
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
  const isManagerRole = user?.role === 'Team Lead' || user?.role === 'Admin';
  const isDev = canAct && (user?.role === 'Developer' || user?.role === 'Admin');
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
