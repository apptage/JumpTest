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

const CLIENT_STATUS = {
  qa_pending: { label: 'In development', color: '#d97706' },
  qa_in_progress: { label: 'In testing', color: '#2563eb' },
  qa_done: { label: 'In review', color: '#7c3aed' },
  approved: { label: 'Completed', color: '#16a34a' },
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

export function ClientDashboard({ token }) {
  const [data, setData] = useState(undefined); // undefined=loading, null=invalid
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(null); // when this view last synced
  const [, forceTick] = useState(0); // re-render so the "ago" label stays fresh

  useEffect(() => {
    let cancelled = false;
    const pull = () =>
      api
        .fetchPublicStatus(token)
        .then((d) => {
          if (cancelled) return;
          setData(d);
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

        {showWbs && <ClientWbsView wbs={wbs} platformTargets={data.platformTargets} />}

        {!showWbs && (
        <>
        {/* progress */}
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

        {/* summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {statCard('Completed', completed.length, 'var(--success)')}
          {statCard('In progress', inProgress.length, 'var(--warning)')}
          {statCard('Resolved bugs', data.bugs?.resolved ?? 0, 'var(--success)')}
          {data.showOpenBugs && statCard('Open bugs', data.bugs?.open ?? 0, (data.bugs?.open ?? 0) ? 'var(--danger)' : undefined)}
        </div>

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

        <section>
          <div style={{ ...sideHead, marginBottom: 10 }}>Release history</div>
          {releases.length === 0 ? (
            <div style={{ ...card, padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              No releases yet.
            </div>
          ) : (
            <div style={{ ...card, padding: '4px 16px' }}>{releases.map(relRow)}</div>
          )}
        </section>
        </>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 32 }}>
          Read-only project status · powered by JumpTest
        </div>
      </div>
    </div>
  );
}
