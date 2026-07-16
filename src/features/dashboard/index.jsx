/* Dashboard chrome — stat cards, filter bar, release card, left sidebar (project
   nav + at-a-glance), and the right panel. Moved verbatim from ReleaseTracker.jsx (Phase 0). */
import { useState } from 'react';
import { card, inputStyle, ghostButton, primaryButton, StatusBadge, TypeBadge, Avatar, CountBadge } from '@/ui.jsx';
import { Chevron, StatBig } from '@shared/dashboard-kit.jsx';
import { sideHead, StatusAge, EnvBadge, statusSince, relativeTime } from '@shared/ui-kit.jsx';
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

