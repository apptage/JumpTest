/* Project Hub — the member-facing planning layer ABOVE releases. One destination
   per project: Overview (health rollup) · Plan (WBS) · Builds · Team · Bugs.
   It plans and links work but never bypasses the QA gate — submit still picks WBS
   tasks into a release, and WBS-done ≠ release-approved, pass-rate ≠ WBS %.

   Reuses existing building blocks: computeProjectWbsHealth / computeCompositeHealth
   (wbsMetrics), computeReleaseMetrics, WbsPage (Plan), ReleaseHistory (Builds),
   ProjectMembersSection (Team) and filterBugs (Bugs). WBS isn't loaded globally, so
   the hub fetches it per-project the same way the Command Center does. */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import * as api from '@/api.js';
import { card, ghostButton, primaryButton, Avatar, StatusBadge, SeverityBadge, CountBadge, inputStyle } from '@/ui.jsx';
import { SubTabs, DataTable, Pill, StatCard, TONES } from '@shared/dashboard-kit.jsx';
import { relativeTime, StatusAge, PageHeader, Pager } from '@shared/ui-kit.jsx';
import { ProjectInfoTab } from '@features/project-info';
import { computeProjectWbsHealth, computeCompositeHealth, milestoneLabel, liveBugs } from '@shared/wbsMetrics.js';
import { computeReleaseMetrics } from '@shared/releaseMetrics.js';
import { filterBugs } from '@shared/filters.js';
import { isActiveBug, isActiveStatus, isClosedStatus, formatVersion, isCmsProject, cmsKindLabel, PROJECT_TYPES, projectTypeLabel } from '@/constants.js';
import { CmsOverview, CmsTasksTab, CmsJourneyTab, useCmsData } from '@features/cms';
import { IconPackage, IconBug, IconTree, IconFolder, IconGlobe, IconSmartphone, IconLayers, IconSearch } from '@/icons.jsx';
import { WbsPage } from '@features/wbs';
import { ReleaseHistory } from '@features/analytics/ReleaseHistory.jsx';
import { ProjectMembersSection } from '@features/admin';

function HealthDot({ tone = 'neutral', size = 10 }) {
  const t = TONES[tone] || TONES.neutral;
  return <span style={{ width: size, height: size, borderRadius: 999, background: t.fg, display: 'inline-block', flexShrink: 0 }} />;
}

const panelHead = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' };
const panelSub = { fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 2 };

/* ---- project picker (shown when no project is selected) ---- */
export const PICKER_DEFAULTS = { q: '', type: 'all', team: 'all', status: 'all', sort: 'name', page: 0 };
const PICKER_STATUS = [
  ['all', 'All'],
  ['bugs', 'Open bugs'],
  ['active', 'Active build'],
  ['idle', 'No active build'],
];
const PICKER_SORT = [
  ['name', 'Name (A–Z)'],
  ['bugs', 'Most open bugs'],
  ['recent', 'Latest build'],
  ['builds', 'Most builds'],
];
const TYPE_ICON = { web: IconGlobe, mobile: IconSmartphone, both: IconPackage, cms: IconLayers };

function ProjectTypeTag({ type }) {
  const Ico = TYPE_ICON[type] || IconPackage;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
      <Ico size={14} />
      {projectTypeLabel(type)}
    </span>
  );
}

// CMS cards count tasks instead of builds and bugs: open = anything not done
function CmsTaskCounts({ counts }) {
  if (counts === undefined) return <span style={{ color: 'var(--color-text-tertiary)' }}>Loading tasks…</span>;
  if (counts === null) return <span style={{ color: 'var(--color-text-tertiary)' }}>Tasks unavailable</span>;
  if (!counts.total) return <span style={{ color: 'var(--color-text-secondary)' }}>No tasks yet</span>;
  return (
    <>
      <span style={{ color: counts.open ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: counts.open ? 600 : 400 }}>{counts.open} open task{counts.open === 1 ? '' : 's'}</span>
      <span style={{ color: 'var(--color-text-secondary)' }}>{counts.done} task{counts.done === 1 ? '' : 's'} done</span>
    </>
  );
}

const PICKER_PAGE_SIZE = 24;

/* Shows one page of project cards at a time. Name, type and team filters run on
   the project list the app already has. Build / bug numbers come from
   project_summaries for just the cards on the page, unless a sort or the status
   filter needs every project's numbers: then one call covers the filtered set.
   CMS task totals are counted for the CMS cards on the page only.
   releases / bugs / releaseById: the loaded lists in legacy mode, used when
   project_summaries isn't deployed. */
export function ProjectPicker({ projects, releases = [], bugs = [], releaseById = {}, teams = [], filters, onFilters, onOpen }) {
  const f = filters;
  // any filter change goes back to page 1; the page lives in `filters` so it
  // survives opening a project and coming back
  const set = (k, v) => onFilters({ ...f, [k]: v, page: 0 });
  const wantedPage = f.page || 0;
  const setPage = (n) => onFilters({ ...f, page: n });
  const teamName = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);

  // 1. filters that only need the project list, sorted by name
  const term = f.q.trim().toLowerCase();
  const metaFiltered = useMemo(() => projects
    .filter((p) => !term || p.name.toLowerCase().includes(term) || (teamName[p.teamId] || '').toLowerCase().includes(term))
    .filter((p) => f.type === 'all' || p.type === f.type)
    .filter((p) => f.team === 'all' || (p.teamId || 'none') === f.team)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  [projects, term, teamName, f.type, f.team]);

  // 2. numbers: the page's projects, or the whole filtered set when ordering needs them
  const needsAll = f.sort !== 'name' || f.status !== 'all';
  const lastPage = (n) => Math.max(0, Math.ceil(n / PICKER_PAGE_SIZE) - 1);
  // without status/sort the total is known now; otherwise it's clamped below
  const page = needsAll ? wantedPage : Math.min(wantedPage, lastPage(metaFiltered.length));
  const countIds = useMemo(
    () => (needsAll ? metaFiltered : metaFiltered.slice(page * PICKER_PAGE_SIZE, (page + 1) * PICKER_PAGE_SIZE)).map((p) => p.id).sort(),
    [needsAll, metaFiltered, page]
  );
  const summariesQ = useQuery({
    queryKey: ['releases', 'projectSummaries', countIds.join(',')],
    queryFn: () => api.fetchProjectSummaries(countIds),
    enabled: countIds.length > 0,
    staleTime: 0, // counted again each time the list is shown
  });
  // undefined = loading, null = function not deployed (count from the loaded lists)
  const summaries = !countIds.length ? {} : summariesQ.isError ? null : summariesQ.data;

  const rowFor = (p) => {
    if (summaries !== null) {
      const s = summaries?.[p.id];
      return {
        p, loading: summaries === undefined,
        builds: s?.builds ?? 0, open: s?.openBugs ?? 0, latest: s?.latest || '',
        active: s?.active ? { version: s.active.version, platform: s.active.platform } : null,
      };
    }
    const rel = releases.filter((r) => r.projectId === p.id);
    const pbugs = bugs.filter((b) => releaseById[b.releaseId]?.projectId === p.id);
    const open = pbugs.filter(isActiveBug).length;
    const active = rel.find((r) => !isClosedStatus(r.status)) || null;
    const latest = rel.reduce((m, r) => ((r.date || '') > m ? r.date || '' : m), '');
    return { p, builds: rel.length, open, active, latest };
  };

  // 3. status filter + sort (needs every number), then the page
  const ordering = needsAll && summaries === undefined;
  let list = needsAll ? metaFiltered.map(rowFor) : null;
  if (list) {
    list = list
      .filter((r) => (f.status === 'bugs' ? r.open > 0 : f.status === 'active' ? !!r.active : f.status === 'idle' ? !r.active : true))
      .sort((a, b) => {
        const byName = a.p.name.localeCompare(b.p.name, undefined, { sensitivity: 'base' });
        if (f.sort === 'bugs') return b.open - a.open || byName;
        if (f.sort === 'builds') return b.builds - a.builds || byName;
        if (f.sort === 'recent') return b.latest.localeCompare(a.latest) || byName;
        return byName;
      });
  }
  const total = ordering ? 0 : list ? list.length : metaFiltered.length;
  const shownPage = list ? Math.min(page, lastPage(list.length)) : page;
  const pageRows = ordering ? [] : list
    ? list.slice(shownPage * PICKER_PAGE_SIZE, (shownPage + 1) * PICKER_PAGE_SIZE)
    : metaFiltered.slice(page * PICKER_PAGE_SIZE, (page + 1) * PICKER_PAGE_SIZE).map(rowFor);
  const shown = pageRows;

  // 4. CMS task totals for the CMS cards on this page
  const cmsIds = pageRows.filter((r) => isCmsProject(r.p)).map((r) => r.p.id).sort();
  const cmsQ = useQuery({
    queryKey: ['cmsTaskCounts', cmsIds.join(',')],
    queryFn: () => api.fetchCmsTaskCounts(cmsIds),
    enabled: cmsIds.length > 0,
    staleTime: 0,
  });
  const cmsCounts = cmsQ.isError ? null : cmsIds.length ? cmsQ.data : {};

  // only offer the filters that would actually split this list
  const typesPresent = PROJECT_TYPES.filter((t) => projects.some((p) => p.type === t));
  const teamIds = [...new Set(projects.map((p) => p.teamId || 'none'))];
  const showTeam = teamIds.length > 1;
  const rows = projects; // type / team option counts use the project list
  const filtered = f.q.trim() || f.type !== 'all' || f.team !== 'all' || f.status !== 'all';
  const count = (fn) => rows.filter(fn).length;
  // status option counts are only known when every project's numbers are loaded
  const statusCount = (k) => {
    if (!needsAll || summaries === undefined) return null;
    const all = metaFiltered.map(rowFor);
    return all.filter((r) => (k === 'bugs' ? r.open > 0 : k === 'active' ? !!r.active : !r.active)).length;
  };
  const fSel = { ...inputStyle, width: 'auto', minHeight: 0, padding: '7px 10px', fontSize: 12.5 };

  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      <PageHeader
        title="Projects"
        icon={<IconFolder size={18} />}
        subtitle="Open a project to plan work, track builds, and see its health in one place."
      />
      {rows.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', marginBottom: 10, color: 'var(--color-text-tertiary)' }}><IconFolder size={30} /></div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No projects yet</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>You're not a member of any project.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ position: 'relative', flex: '1 1 240px', maxWidth: 420, display: 'block' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', display: 'inline-flex', pointerEvents: 'none' }}><IconSearch size={15} /></span>
              <input
                style={{ ...inputStyle, paddingLeft: 34 }}
                value={f.q}
                aria-label="Search projects"
                placeholder={showTeam ? 'Search projects or teams…' : 'Search projects…'}
                onChange={(e) => set('q', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && total === 1 && shown[0]) onOpen(shown[0].p.id); if (e.key === 'Escape') set('q', ''); }}
              />
            </label>
            {typesPresent.length > 1 && (
              <select style={fSel} aria-label="Project type" value={f.type} onChange={(e) => set('type', e.target.value)}>
                <option value="all">All types</option>
                {typesPresent.map((t) => <option key={t} value={t}>{projectTypeLabel(t)} ({count((p) => p.type === t)})</option>)}
              </select>
            )}
            {showTeam && (
              <select style={fSel} aria-label="Team" value={f.team} onChange={(e) => set('team', e.target.value)}>
                <option value="all">All teams</option>
                {teamIds
                  .map((id) => [id, id === 'none' ? 'No team' : teamName[id] || 'Unknown team'])
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([id, name]) => <option key={id} value={id}>{name} ({count((p) => (p.teamId || 'none') === id)})</option>)}
              </select>
            )}
            <select style={fSel} aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>
              {PICKER_STATUS.map(([k, label]) => (
                <option key={k} value={k}>
                  {k === 'all' ? 'Any status' : statusCount(k) == null ? label : `${label} (${statusCount(k)})`}
                </option>
              ))}
            </select>
            <select style={fSel} aria-label="Sort" value={f.sort} onChange={(e) => set('sort', e.target.value)}>
              {PICKER_SORT.map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
            </select>
            {filtered && (
              <button style={{ ...ghostButton, padding: '6px 12px', minHeight: 0, fontSize: 12.5 }} onClick={() => onFilters({ ...PICKER_DEFAULTS, sort: f.sort })}>Clear</button>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
            {ordering ? 'Counting builds and bugs…' : filtered ? `${total} of ${rows.length} projects` : `${rows.length} project${rows.length === 1 ? '' : 's'}`}
          </div>

          {ordering ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : shown.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No projects match</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Try another search or clear the filters.</div>
              <button style={{ ...ghostButton, marginTop: 14 }} onClick={() => onFilters({ ...PICKER_DEFAULTS, sort: f.sort })}>Clear filters</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {shown.map(({ p, builds, open, active, loading: cardLoading }) => (
                <button
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  className="mgr-card clickable"
                  style={{ ...card, padding: 18, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-flex', color: 'var(--brand)' }}><IconPackage size={18} /></span>
                    <span style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</span>
                    {p.type && <ProjectTypeTag type={p.type} />}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    {isCmsProject(p) ? (
                      <CmsTaskCounts counts={cmsCounts === null ? null : cmsCounts && (cmsCounts[p.id] || { open: 0, done: 0, total: 0 })} />
                    ) : (
                      cardLoading ? <span style={{ color: 'var(--color-text-tertiary)' }}>Loading…</span> : <>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{builds} build{builds === 1 ? '' : 's'}</span>
                        <span style={{ color: open ? 'var(--danger)' : 'var(--color-text-secondary)', fontWeight: open ? 600 : 400 }}>{open} open bug{open === 1 ? '' : 's'}</span>
                      </>
                    )}
                    {showTeam && <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamName[p.teamId] || 'No team'}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                    {isCmsProject(p) ? <>CMS · {cmsKindLabel(p.cmsKind)}</>
                      : cardLoading ? '\u00a0' : active ? <>Active build {formatVersion(active.version)} · {active.platform}</> : 'No active build'}
                  </div>
                </button>
              ))}
            </div>
          )}
          {!ordering && <Pager page={shownPage} pageSize={PICKER_PAGE_SIZE} total={total} onPage={setPage} busy={summariesQ.isFetching} noun={total === 1 ? 'project' : 'projects'} />}
        </>
      )}
    </div>
  );
}

/* ---- Overview tab ---- */
function OverviewTab({ project, rel, pbugs, wh, wbsLoading, relLoading = false, openBugs, critical, active, passRate, health, profilesById, onOpenRelease, onTab }) {
  const ms = milestoneLabel(wh.milestoneRisk);
  return (
    <div>
      {/* health banner */}
      <div style={{ ...card, padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <HealthDot tone={health.tone} size={14} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{relLoading ? 'Loading…' : health.label}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Composite health — WBS progress, open bugs & QA pass rate combined</div>
        </div>
        <Pill label={ms.label} tone={ms.tone} />
      </div>

      {/* KPI row */}
      <div className="dash-kpis" style={{ marginBottom: 16 }}>
        <StatCard label="Project Completion" value={wbsLoading || relLoading ? '…' : wh.hasWbs ? `${wh.pct}%` : '—'} foot={wh.hasWbs ? `${wh.completion.done}/${wh.completion.total} INCL. BUGS` : 'NO WBS YET'} />
        <StatCard label="Open Bugs" value={relLoading ? '…' : openBugs.length.toLocaleString()} foot={`${critical} CRITICAL`} />
        <StatCard label="Builds" value={relLoading ? '…' : rel.length.toLocaleString()} foot="ALL TIME" />
        <StatCard label="Pass Rate" value={relLoading ? '…' : passRate != null ? `${passRate}%` : '—'} foot="QA DECISIONS" />
        <StatCard label="Blocked Tasks" value={wbsLoading ? '…' : (wh.blocked || 0).toLocaleString()} foot="WBS BLOCKED" />
      </div>

      <div className="dash-mid">
        {/* active build + WBS by platform */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={panelHead}>Active build</div>
            {relLoading ? (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading…</div>
            ) : active ? (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{formatVersion(active.version)}</span>
                <StatusBadge status={active.status} />
                <StatusAge release={active} />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{active.platform}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  QA: {active.assignedQa ? profilesById[active.assignedQa]?.name || '—' : 'Unassigned'}
                </span>
                <span style={{ flex: 1 }} />
                <button style={ghostButton} onClick={() => onOpenRelease(active.id)}>Open</button>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No active build — everything is closed or approved.</div>
            )}
          </div>

          <div style={{ ...card, padding: 18 }}>
            <div style={panelHead}>WBS by platform</div>
            <div style={panelSub}>Completion vs milestone target</div>
            {wbsLoading ? (
              <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading WBS…</div>
            ) : !wh.hasWbs ? (
              <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                No WBS for this project yet. <button style={{ ...ghostButton, padding: '4px 10px', marginLeft: 6 }} onClick={() => onTab('plan')}>Open Plan</button>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {wh.byPlatform.map((pl) => {
                  const risk = milestoneLabel(pl.risk);
                  return (
                    <div key={pl.platform}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{pl.platform}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {pl.risk && pl.risk !== 'none' && <Pill label={risk.label} tone={risk.tone} />}
                          <span className="tnum" style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{pl.pct}%</span>
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, pl.pct)}%`, borderRadius: 999, background: 'var(--brand)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* WBS by module */}
        <div style={{ ...card, padding: 18 }}>
          <div style={panelHead}>WBS by module</div>
          <div style={panelSub}>Progress per feature area</div>
          {wbsLoading ? (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : !wh.hasWbs || wh.byModule.length === 0 ? (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No modules yet.</div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360, overflowY: 'auto' }}>
              {wh.byModule.map((mod) => (
                <div key={mod.module}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.module}</span>
                    <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {mod.completed}/{mod.total}{mod.blocked ? ` · ${mod.blocked} blocked` : ''}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(3, mod.pct)}%`, borderRadius: 999, background: mod.blocked ? 'var(--danger)' : 'var(--brand)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Team tab: workload strip + full member manager ---- */
function TeamTab({ project, members, profiles, profilesById, wbsItems, rel, pbugs, hoursByUser = {}, canManage, currentUser, isSubmitting, onAddMember, onUpdateMember, onRemoveMember }) {
  const memberRows = members.map((mem) => {
    const prof = profilesById[mem.userId];
    const assigned = wbsItems.filter((i) => i.assignedTo === mem.userId).length;
    const activeBuilds = rel.filter((r) => r.submittedById === mem.userId && isActiveStatus(r.status)).length;
    const openBugs = pbugs.filter((b) => b.createdById === mem.userId && isActiveBug(b)).length;
    // completed time only — an open timer has no hours yet
    const logged = Math.round((hoursByUser[mem.userId] || 0) * 100) / 100;
    return { mem, prof, assigned, activeBuilds, openBugs, logged };
  });
  return (
    <div>
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={panelHead}>Workload on this project</div>
        <div style={panelSub}>{isCmsProject(project) ? 'CMS tasks' : 'WBS tasks'} assigned · active builds · open bugs raised</div>
        {memberRows.length === 0 ? (
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No members yet.</div>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {memberRows.map(({ mem, prof, assigned, activeBuilds, openBugs, logged }) => (
              <div key={mem.id} className="mgr-row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 8px', borderRadius: 8 }}>
                <Avatar name={prof?.name || '—'} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prof?.name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{prof?.role || mem.projectRole}{mem.accessType === 'support' ? ' · support' : ''}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }} title={isCmsProject(project) ? 'CMS tasks assigned' : 'WBS tasks assigned'}><IconTree size={13} /> {assigned}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }} title="Active builds"><IconPackage size={13} /> {activeBuilds}</span>
                <span style={{ fontSize: 11.5, color: openBugs ? 'var(--danger)' : 'var(--color-text-secondary)' }} title="Open bugs raised"><IconBug size={13} /> {openBugs}</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', minWidth: 40, textAlign: 'right' }} title="Hours logged">{logged ? `${logged}h` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <ProjectMembersSection
        project={project}
        profiles={profiles}
        members={members}
        canManage={canManage}
        currentUser={currentUser}
        isSubmitting={isSubmitting}
        onAddMember={onAddMember}
        onUpdateMember={onUpdateMember}
        onRemoveMember={onRemoveMember}
      />
    </div>
  );
}

/* ---- Bugs tab: project-scoped live bug list ---- */
const BUG_TONE = { open: 'danger', in_progress: 'warning', disputed: 'warning', fixed: 'info', pending_tl: 'info', verified: 'success' };
function BugsTab({ projectId, bugs, releaseById, projectsById, onOpenRelease }) {
  const rows = filterBugs(bugs, { project: projectId }, { releaseById, projectById: projectsById });
  const columns = [
    { label: 'Bug', render: (b) => <span style={{ fontWeight: 500 }}>{b.title}</span> },
    { label: 'Severity', render: (b) => <SeverityBadge severity={b.severity} /> },
    { label: 'Status', render: (b) => <Pill label={(b.status || '').replace(/_/g, ' ')} tone={BUG_TONE[b.status] || 'neutral'} /> },
    { label: 'Build', render: (b) => (releaseById[b.releaseId] ? `v${formatVersion(releaseById[b.releaseId].version)}` : '—') },
    { label: 'Reported', render: (b) => b.createdBy || '—', thStyle: { whiteSpace: 'nowrap' } },
    { label: 'Age', render: (b) => <span style={{ color: 'var(--color-text-tertiary)' }}>{relativeTime(new Date(b.createdAt).getTime())}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(b) => b.id}
      searchText={(b) => `${b.title} ${b.createdBy || ''}`}
      searchPlaceholder="Search bugs…"
      onRowClick={(b) => b.releaseId && onOpenRelease(b.releaseId)}
    />
  );
}

/* ---- Time tab: log hours + per-member rollup (requires fixes21.sql) ---- */
/* logs: the entries on this page. totals: { total, byUser } for the whole project
   (completed time only). pager: { page, pageSize, total, onPage, busy }. */
function TimeTab({ projectId, user, wbsItems, logs, totals, pager, loading, profilesById, canManage, onReload, showToast }) {
  const today = new Date().toISOString().slice(0, 10);
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(today);
  const [wbsItemId, setWbsItemId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const taskItems = wbsItems.filter((i) => i.type !== 'milestone');
  const itemLabel = (id) => {
    const it = wbsItems.find((i) => i.id === id);
    return it ? (it.title || it.module || 'Task') : null;
  };

  // Totals count COMPLETED rows only — a running/paused timer has hours = null
  // (the DB writes hours on Stop), so it must not enter the sums.
  const done = (l) => l.status === 'completed' && l.hours != null;
  const fmtClock = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
  const total = Math.round(Number(totals?.total || 0) * 100) / 100;
  const byUser = totals?.byUser || {};
  const memberRollup = Object.entries(byUser)
    .map(([uid, h]) => ({ uid, h, name: profilesById[uid]?.name || 'Unknown' }))
    .sort((a, b) => b.h - a.h);

  async function submit() {
    const h = Number(hours);
    if (!h || h <= 0) { showToast?.('Enter hours greater than 0.', 'error'); return; }
    if (h > 24) { showToast?.('A single entry can’t exceed 24 hours.', 'error'); return; }
    setBusy(true);
    try {
      await api.createTimeLog({ projectId, wbsItemId: wbsItemId || null, hours: h, logDate: date, note, userId: user.id });
      setHours(''); setNote(''); setWbsItemId('');
      showToast?.('Time logged');
      await onReload();
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    try { await api.deleteTimeLog(id); await onReload(); }
    catch (e) { showToast?.(e.message, 'error'); }
  }

  const fieldLabel = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 5, display: 'block' };

  return (
    <div className="dash-mid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={panelHead}>Log time</div>
          <div style={panelSub}>Record hours against this project{taskItems.length > 0 ? ' — optionally against a WBS task' : ''}</div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            <div>
              <label style={fieldLabel}>Hours</label>
              <input style={inputStyle} type="number" min="0" step="0.25" value={hours} placeholder="e.g. 2.5" onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <label style={fieldLabel}>Date</label>
              <input style={inputStyle} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {taskItems.length > 0 && <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>WBS task (optional)</label>
              <select style={inputStyle} value={wbsItemId} onChange={(e) => setWbsItemId(e.target.value)}>
                <option value="">— No specific task —</option>
                {taskItems.map((i) => <option key={i.id} value={i.id}>{(i.module ? i.module + ' · ' : '') + (i.title || 'Task')}</option>)}
              </select>
            </div>}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>Note (optional)</label>
              <input style={inputStyle} value={note} placeholder="What did you work on?" onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <button style={{ ...primaryButton(busy), marginTop: 14 }} disabled={busy} onClick={submit}>{busy ? 'Logging…' : 'Log time'}</button>
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={panelHead}>Entries</div>
          {loading ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>Loading…</div>
          ) : logs.length === 0 ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No time logged yet. Log your first entry above.</div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {logs.map((l) => {
                const mine = l.userId === user.id;
                const open = l.status === 'running' || l.status === 'paused';
                const timer = l.source === 'timer' && l.startedAt && l.endedAt;
                return (
                  <div key={l.id} className="mgr-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 8 }}>
                    {open ? (
                      <span style={{ minWidth: 44, display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: l.status === 'running' ? 'var(--success)' : 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {l.status === 'running' ? 'In progress' : 'Paused'}
                        </span>
                        <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{fmtClock(api.elapsedMs(l))}</span>
                      </span>
                    ) : (
                      <span className="tnum" style={{ fontSize: 13, fontWeight: 700, minWidth: 44 }}>{l.hours}h</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {itemLabel(l.wbsItemId) ? <span style={{ fontWeight: 500 }}>{itemLabel(l.wbsItemId)}</span> : <span style={{ color: 'var(--color-text-tertiary)' }}>General</span>}
                        {l.note ? <span style={{ color: 'var(--color-text-secondary)' }}> — {l.note}</span> : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {profilesById[l.userId]?.name || 'Unknown'} · {l.logDate}
                        {timer && <> · {fmtTime(l.startedAt)}–{fmtTime(l.endedAt)}</>}
                      </div>
                    </div>
                    {/* an open timer is discarded from the extension, never removed here */}
                    {!open && (mine || canManage) && (
                      <button onClick={() => remove(l.id)} style={{ ...ghostButton, padding: '4px 9px', fontSize: 11, color: 'var(--danger)', borderColor: 'transparent' }}>Remove</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!loading && pager && <Pager {...pager} noun={pager.total === 1 ? 'entry' : 'entries'} />}
        </div>
      </div>

      <div style={{ ...card, padding: 18 }}>
        <div style={panelHead}>Totals</div>
        <div style={panelSub}>Hours logged on this project</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, marginTop: 12 }}>{total}h</div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {memberRollup.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No contributors yet.</div>
          ) : memberRollup.map((r) => (
            <div key={r.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={r.name} size={26} />
              <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700 }}>{r.h}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* ProjectHub — picker + per-project tabbed workspace                  */
/* ================================================================== */
export function ProjectHub({
  user, projects, releases, bugs, profiles, projectMembers,
  projectsById, profilesById, releaseById, canManage, isSubmitting,
  showToast, onOpenRelease, onSubmit, onAddMember, onUpdateMember, onRemoveMember,
  projectId = null, onSelectProject, onProjectsChanged, teams = [],
}) {
  // kept here so the search and filters survive opening a project and coming back
  const [pickerFilters, setPickerFilters] = useState(PICKER_DEFAULTS);
  // Selection is controlled by the parent so other pages (e.g. Command Center)
  // can deep-link straight to a project. Falls back to local state if no
  // controller is wired.
  const [localSel, setLocalSel] = useState(null);
  const selId = onSelectProject ? projectId : localSel;
  // the open project's own releases and bugs, nothing else
  const projRelQ = useQuery({
    queryKey: ['releases', 'project', selId],
    queryFn: () => api.fetchProjectReleases(selId),
    enabled: !!selId,
  });
  const projBugsQ = useQuery({
    queryKey: ['bugs', 'project', selId],
    queryFn: () => api.fetchProjectBugs(selId),
    enabled: !!selId,
  });
  const setSel = onSelectProject || setLocalSel;
  const [tab, setTab] = useState('overview');
  const [wbs, setWbs] = useState({ items: [], targets: [], loading: false });
  const [timeLogs, setTimeLogs] = useState({ list: [], loading: false });

  const project = selId ? projectsById[selId] : null;
  const isCms = isCmsProject(project);
  const cms = useCmsData(isCms ? selId : null);

  useEffect(() => {
    if (!selId || isCms) { setWbs({ items: [], targets: [], loading: false }); return; }
    let cancelled = false;
    setWbs((w) => ({ ...w, loading: true }));
    Promise.all([
      api.fetchWbsItemsForProjects([selId]),
      api.fetchWbsPlatformTargetsForProjects([selId]),
    ])
      .then(([items, targets]) => { if (!cancelled) setWbs({ items, targets, loading: false }); })
      .catch(() => { if (!cancelled) setWbs({ items: [], targets: [], loading: false }); });
    return () => { cancelled = true; };
  }, [selId, isCms]);

  // time: totals from the database (project_time_totals) and one page of
  // entries; until that migration is applied, every entry is loaded as before
  const qc = useQueryClient();
  const TIME_PAGE = 20;
  const [timePage, setTimePage] = useState(0);
  useEffect(() => { setTimePage(0); }, [selId]);
  const wantsTime = !!selId && (tab === 'time' || tab === 'team');
  const timeTotalsQ = useQuery({ queryKey: ['timeTotals', selId], queryFn: () => api.fetchProjectTimeTotals(selId), enabled: wantsTime });
  const timeLegacy = timeTotalsQ.data === null;
  const timePageQ = useQuery({
    queryKey: ['timeLogs', selId, timePage],
    queryFn: () => api.fetchTimeLogsPage(selId, { offset: timePage * TIME_PAGE, limit: TIME_PAGE }),
    enabled: !!selId && tab === 'time' && !!timeTotalsQ.data,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (!selId || !timeLegacy) { setTimeLogs({ list: [], loading: false }); return; }
    let cancelled = false;
    setTimeLogs((t) => ({ ...t, loading: true }));
    api.fetchTimeLogsForProject(selId)
      .then((list) => { if (!cancelled) setTimeLogs({ list, loading: false }); })
      .catch(() => { if (!cancelled) setTimeLogs({ list: [], loading: false }); });
    return () => { cancelled = true; };
  }, [selId, timeLegacy]);
  const legacyTotals = useMemo(() => {
    const byUser = {};
    let total = 0;
    timeLogs.list.filter((l) => l.status === 'completed' && l.hours != null).forEach((l) => { total += l.hours; byUser[l.userId] = (byUser[l.userId] || 0) + l.hours; });
    return { total, byUser };
  }, [timeLogs.list]);
  const timeTotals = timeLegacy ? legacyTotals : timeTotalsQ.data || null;
  const timeRows = timeLegacy ? timeLogs.list.slice(timePage * TIME_PAGE, (timePage + 1) * TIME_PAGE) : timePageQ.data?.rows || [];
  const timeCount = timeLegacy ? timeLogs.list.length : timePageQ.data?.total || 0;
  const timeLoading = timeLegacy ? timeLogs.loading : timeTotalsQ.isPending || timePageQ.isPending;

  const reloadTime = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['timeTotals', selId] }),
      qc.invalidateQueries({ queryKey: ['timeLogs', selId] }),
    ]);
    if (timeLegacy) await api.fetchTimeLogsForProject(selId).then((list) => setTimeLogs({ list, loading: false })).catch(() => {});
  };

  if (!project) {
    return <ProjectPicker projects={projects} releases={releases} bugs={bugs} releaseById={releaseById} teams={teams} filters={pickerFilters} onFilters={setPickerFilters} onOpen={(id) => { setSel(id); setTab('overview'); }} />;
  }

  // ---- per-project rollup (mirrors Command Center projRows) ----
  const nowMs = Date.now();
  const relLoading = projRelQ.isPending || projBugsQ.isPending;
  const rel = projRelQ.data || [];
  const pbugs = projBugsQ.data || [];
  const projReleaseById = Object.fromEntries(rel.map((r) => [r.id, r]));
  const wh = computeProjectWbsHealth(wbs.items, wbs.targets, nowMs, liveBugs(pbugs, projReleaseById));
  const openBugs = pbugs.filter(isActiveBug);
  const critical = openBugs.filter((b) => b.severity === 'critical').length;
  const active = rel.find((r) => !isClosedStatus(r.status)) || null;
  const m = computeReleaseMetrics(rel, pbugs, { releaseById: projReleaseById });
  const passRate = m.decided ? m.passRate : null;
  const health = computeCompositeHealth({ wbsPct: wh.hasWbs ? wh.pct : null, openBugs: openBugs.length, critical, passRate, milestoneRisk: wh.milestoneRisk });
  const members = projectMembers.filter((mm) => mm.projectId === selId);

  const openCmsTasks = cms.tasks.filter((t) => t.status !== 'done').length;
  // CMS work is assigned to the project's members, or its team when it has none
  const memberIds = new Set(members.map((mm) => mm.userId));
  const assignees = profiles
    .filter((p) => (memberIds.size ? memberIds.has(p.id) : p.teamId && p.teamId === project.teamId))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const canEditCms = user.role !== 'Manager';

  const tabs = isCms ? [
    ['overview', 'Overview'],
    ['tasks', `Tasks${openCmsTasks ? ` (${openCmsTasks})` : ''}`],
    ['journey', 'Journey'],
    ['info', 'Project info'],
  ] : [
    ['overview', 'Overview'],
    ['info', 'Project info'],
    ['plan', 'Plan (WBS)'],
    ['builds', 'Builds'],
    ['time', 'Time'],
    ['team', `Team${members.length ? ` (${members.length})` : ''}`],
    ['bugs', `Bugs${openBugs.length ? ` (${openBugs.length})` : ''}`],
  ];

  return (
    <div className="anim-in" style={{ maxWidth: 1460, margin: '0 auto' }}>
      {/* breadcrumb + header */}
      <button style={{ ...ghostButton, padding: '5px 11px', marginBottom: 14 }} onClick={() => setSel(null)}>← All projects</button>
      <PageHeader
        icon={<IconPackage size={18} />}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {project.name}
          {isCms ? <Pill label={`CMS · ${cmsKindLabel(project.cmsKind)}`} tone="info" /> : project.type && <ProjectTypeTag type={project.type} />}
        </span>}
        subtitle={isCms ? 'Website work, tracked as tasks and a development journey (no WBS)' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {relLoading ? 'Loading…' : <><HealthDot tone={health.tone} />{health.label}</>}
        </span>}
        actions={<button style={{ ...primaryButton(false) }} onClick={onSubmit}>Submit release</button>}
      />

      <SubTabs tabs={tabs} active={tab} onChange={setTab} />

      {isCms && tab === 'overview' && (
        <CmsOverview project={project} tasks={cms.tasks} stages={cms.stages} loading={cms.loading} missing={cms.missing} profilesById={profilesById} onTab={setTab} />
      )}
      {isCms && tab === 'tasks' && (
        <CmsTasksTab
          project={project} user={user} tasks={cms.tasks} missing={cms.missing} assignees={assignees} profilesById={profilesById}
          canEdit={canEditCms} canManage={canManage} onReload={cms.reload} showToast={showToast}
        />
      )}
      {isCms && tab === 'journey' && (
        <CmsJourneyTab
          project={project} stages={cms.stages} missing={cms.missing} assignees={assignees} profilesById={profilesById}
          canEdit={canEditCms} onReload={cms.reload} showToast={showToast}
        />
      )}
      {!isCms && tab === 'overview' && (
        <OverviewTab
          project={project} rel={rel} pbugs={pbugs} wh={wh} wbsLoading={wbs.loading} relLoading={relLoading}
          openBugs={openBugs} critical={critical} active={active} passRate={passRate}
          health={health} profilesById={profilesById} onOpenRelease={onOpenRelease} onTab={setTab}
        />
      )}
      {tab === 'info' && (
        <ProjectInfoTab
          project={project}
          user={user}
          isMember={members.some((mm) => mm.userId === user.id)}
          showToast={showToast}
        />
      )}
      {!isCms && tab === 'plan' && (
        <WbsPage user={user} projects={[project]} releases={rel} bugs={pbugs} profiles={profiles} showToast={showToast} onProjectsChanged={onProjectsChanged} />
      )}
      {tab === 'builds' && (
        relLoading ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading builds…</div>
        ) : rel.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>No builds submitted for this project yet.</div>
        ) : (
          <ReleaseHistory releases={rel} projectsById={projectsById} profilesById={profilesById} onRowClick={(r) => onOpenRelease(r.id)} />
        )
      )}
      {tab === 'time' && (
        <TimeTab
          projectId={selId} user={user} wbsItems={wbs.items} logs={timeRows} totals={timeTotals} loading={timeLoading}
          pager={{ page: timePage, pageSize: TIME_PAGE, total: timeCount, onPage: setTimePage, busy: timePageQ.isFetching }}
          profilesById={profilesById} canManage={canManage} onReload={reloadTime} showToast={showToast}
        />
      )}
      {tab === 'team' && (
        <TeamTab
          project={project} members={members} profiles={profiles} profilesById={profilesById}
          wbsItems={isCms ? cms.tasks : wbs.items} rel={rel} pbugs={pbugs} hoursByUser={timeTotals?.byUser || {}} canManage={canManage} currentUser={user}
          isSubmitting={isSubmitting} onAddMember={onAddMember} onUpdateMember={onUpdateMember} onRemoveMember={onRemoveMember}
        />
      )}
      {tab === 'bugs' && (
        relLoading ? <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Loading bugs…</div>
          : <BugsTab projectId={selId} bugs={pbugs} releaseById={projReleaseById} projectsById={projectsById} onOpenRelease={onOpenRelease} />
      )}
    </div>
  );
}
