/* Bugs feature — the standalone Bugs page (cross-project bug list + filters +
   aging). Moved verbatim out of ReleaseTracker.jsx (Phase 0). */
import { useState, useMemo } from 'react';
import { card, inputStyle, ghostButton, BugStatusBadge, SeverityBadge } from '@/ui.jsx';
import { Empty, PageHeader, SlaBadge, TagChip, sideHead } from '@shared/ui-kit.jsx';
import {
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  BUG_STATUS_ORDER,
  BUG_TAGS,
  BUG_FEATURES,
  bugSlaLevel,
  humanizeSince,
  RELEASE_PLATFORMS,
} from '@/constants.js';

export function BugsPage({ bugs, releases, projects, projectsById, profilesById, profiles, teams, isAdmin, onOpenRelease }) {
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

  const term = q.trim().toLowerCase();
  const filtered = bugs
    .filter((b) => {
      const rel = relById[b.releaseId];
      if (!rel) return false;
      const proj = projectsById[rel.projectId];
      if (status !== 'all' && b.status !== status) return false;
      if (sev !== 'all' && b.severity !== sev) return false;
      if (platform !== 'all' && rel.platform !== platform) return false;
      if (tag !== 'all' && !b.tags.includes(tag)) return false;
      if (feature !== 'all' && (b.feature || 'Unassigned') !== feature) return false;
      if (project !== 'all' && rel.projectId !== project) return false;
      if (team !== 'all' && (proj?.teamId || '') !== team) return false;
      if (developer !== 'all' && rel.submittedById !== developer) return false;
      if (qa !== 'all' && rel.assignedQa !== qa) return false;
      if (from && (b.createdAt || '').slice(0, 10) < from) return false;
      if (to && (b.createdAt || '').slice(0, 10) > to) return false;
      if (term) {
        const name = proj?.name || '';
        if (!b.title.toLowerCase().includes(term) && !name.toLowerCase().includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      sort === 'oldest'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  const pageBugs = filtered.slice(0, visible);

  // aging: open bugs sorted oldest-first, those at/over SLA highlighted
  const aging = bugs
    .filter((b) => {
      const rel = relById[b.releaseId];
      return rel && b.status !== 'verified' && bugSlaLevel(b.status, b.createdAt);
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 6);

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };
  const th = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    padding: '8px 10px',
    borderBottom: '1px solid var(--color-border-primary)',
  };
  const td = { fontSize: 12.5, padding: '10px', borderBottom: '1px solid var(--color-border-primary)' };

  return (
    <>
      <PageHeader title="Bugs" subtitle={`${filtered.length} bug${filtered.length === 1 ? '' : 's'} across your releases`} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }}
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
            <option key={s} value={s}>
              {BUG_STATUSES[s].label}
            </option>
          ))}
        </select>
        <select style={fSel} value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="all">All severities</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>
              {SEVERITIES[s].label}
            </option>
          ))}
        </select>
        <select style={fSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">All platforms</option>
          {RELEASE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select style={fSel} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">All tags</option>
          {BUG_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select style={fSel} value={feature} onChange={(e) => setFeature(e.target.value)}>
          <option value="all">All features</option>
          {BUG_FEATURES.map((ft) => (
            <option key={ft} value={ft}>
              {ft}
            </option>
          ))}
        </select>
        <select style={fSel} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="all">All projects</option>
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select style={fSel} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {(teams || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={developer} onChange={(e) => setDeveloper(e.target.value)}>
          <option value="all">All developers</option>
          {devs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={fSel} value={qa} onChange={(e) => setQa(e.target.value)}>
          <option value="all">All QA</option>
          {qas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input style={fSel} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input style={fSel} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <select style={fSel} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {aging.length > 0 && (
        <div style={{ ...card, padding: 14, marginBottom: 16 }}>
          <div style={{ ...sideHead, marginBottom: 10, color: 'var(--danger)' }}>
            Aging issues — needs immediate attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aging.map((b) => {
              const rel = relById[b.releaseId];
              return (
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
                  <SeverityBadge severity={b.severity} />
                  <BugStatusBadge status={b.status} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    open {humanizeSince(b.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty>No bugs match your filters.</Empty>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Bug</th>
                <th style={th}>Severity</th>
                <th style={th}>Status</th>
                <th style={th}>Feature · Tags</th>
                <th style={th}>Project · Platform</th>
                <th style={th}>Release</th>
                <th style={th}>Reported</th>
              </tr>
            </thead>
            <tbody>
              {pageBugs.map((b) => {
                const rel = relById[b.releaseId];
                const proj = projectsById[rel.projectId];
                return (
                  <tr
                    key={b.id}
                    onClick={() => onOpenRelease(b.releaseId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ ...td, fontWeight: 500 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <SlaBadge level={bugSlaLevel(b.status, b.createdAt)} />
                        {b.title}
                      </span>
                    </td>
                    <td style={td}>
                      <SeverityBadge severity={b.severity} />
                    </td>
                    <td style={td}>
                      <BugStatusBadge status={b.status} />
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        {b.feature && <TagChip label={b.feature} tone="brand" />}
                        {b.tags.slice(0, 2).map((t) => (
                          <TagChip key={t} label={t} />
                        ))}
                        {b.tags.length > 2 && (
                          <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
                            +{b.tags.length - 2}
                          </span>
                        )}
                        {!b.feature && b.tags.length === 0 && (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </span>
                    </td>
                    <td style={td}>
                      {proj?.name || '—'} · {rel.platform}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>v{rel.version}</td>
                    <td style={td}>{humanizeSince(b.createdAt)} ago</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible < filtered.length && (
            <div style={{ padding: 10 }}>
              <button style={{ ...ghostButton, width: '100%' }} onClick={() => setVisible((v) => v + 20)}>
                Load more ({filtered.length - visible} left)
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
