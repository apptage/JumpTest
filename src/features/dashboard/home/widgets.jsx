/* Dashboard building blocks: each one answers a single question in plain words. */
import { useState } from 'react';
import { card, ghostButton, Avatar } from '@/ui.jsx';
import { Pill, TONES, AlertIcon, Segmented } from '@shared/dashboard-kit.jsx';
import { ageText } from './metrics.js';

export const panel = { ...card, padding: 20, minWidth: 0 };
const head = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: 'var(--tracking-tight)', margin: 0 };
const sub = { fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 3, lineHeight: 1.45 };
const muted = { fontSize: 12, color: 'var(--color-text-tertiary)' };
const TONE_COLOR = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)', info: '#6366F1', neutral: 'var(--color-text-tertiary)' };

export function PanelHead({ title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={head}>{title}</h2>
        {subtitle && <div style={sub}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function LinkButton({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
      {children}
    </button>
  );
}

/* ---- KPI tile: number, what it means, and whether that's good ---- */
export function Kpi({ label, value, caption, tone = 'neutral', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className="mgr-card"
      style={{
        ...card, padding: '16px 18px', textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default',
        borderTop: `3px solid ${TONE_COLOR[tone]}`, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, color: 'inherit',
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: 'var(--tracking-tight)', color: tone === 'danger' ? 'var(--danger)' : 'var(--color-text-primary)', lineHeight: 1.1 }}>
        {value}
      </span>
      {caption && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{caption}</span>}
    </Tag>
  );
}
export function KpiRow({ children }) {
  return <div className="home-kpis">{children}</div>;
}

/* ---- Needs attention: a to-do list, most urgent first ---- */
export function AttentionList({ items, onAction, emptyText = 'Nothing needs your attention right now.' }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <section style={panel} aria-label="Needs attention">
      <PanelHead
        title="Needs your attention"
        subtitle={items.length ? 'Most urgent first. Each item says what to do next.' : null}
        right={items.length ? <Pill label={`${items.length} item${items.length === 1 ? '' : 's'}`} tone={items[0].level === 'over' ? 'danger' : 'warning'} /> : null}
      />
      {items.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0' }}>
          <AlertIcon level="ok" size={20} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{emptyText}</span>
        </div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((it) => {
            const c = it.level === 'over' ? 'var(--danger)' : it.level === 'warn' ? 'var(--warning)' : '#6366F1';
            return (
              <li key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--color-background-secondary)', borderLeft: `3px solid ${c}` }}>
                <span className="tnum" style={{ minWidth: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: c, background: 'var(--color-background-primary)', flexShrink: 0 }}>
                  {it.count}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{it.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{it.detail}</span>
                </span>
                {it.action && (
                  <button style={{ ...ghostButton, padding: '6px 11px', minHeight: 0, fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => onAction(it.action)}>
                    {it.action.label}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {items.length > 6 && (
        <div style={{ marginTop: 10 }}>
          <LinkButton onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</LinkButton>
        </div>
      )}
    </section>
  );
}

/* ---- Where work is waiting: stage → who must act → how long ---- */
function FlowStage({ s, last }) {
  const c = TONE_COLOR[s.tone];
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--color-background-secondary)', borderTop: `3px solid ${s.count ? c : 'var(--color-border-tertiary)'}` }}>
        <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: s.count ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{s.count}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
        <div style={{ ...muted, fontSize: 11, marginTop: 4 }}>Next: {s.owner}</div>
        {s.count > 0 && (
          <div style={{ fontSize: 11, marginTop: 4, color: s.overdue ? 'var(--danger)' : 'var(--color-text-tertiary)', fontWeight: s.overdue ? 600 : 400 }}>
            {s.overdue ? `${s.overdue} overdue · ` : ''}oldest {ageText(s.oldestDays)}
          </div>
        )}
      </div>
      {!last && <span aria-hidden style={{ alignSelf: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>›</span>}
    </div>
  );
}
export function FlowRow({ title, flow, onOpen }) {
  const waiting = flow.stages.reduce((n, s) => n + s.count, 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title} <span style={{ ...muted, fontWeight: 400 }}>· {waiting} waiting</span></span>
        {onOpen && <LinkButton onClick={onOpen}>View all</LinkButton>}
      </div>
      <div className="home-flow">
        {flow.stages.map((s, i) => <FlowStage key={s.key} s={s} last={i === flow.stages.length - 1} />)}
      </div>
      <div style={{ ...muted, marginTop: 8 }}>
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {flow.done.count}</span> {flow.done.label.toLowerCase()}
      </div>
    </div>
  );
}
export function WhereWorkWaits({ releaseFlow, bugFlow, onNavigate, subtitle }) {
  return (
    <section style={panel}>
      <PanelHead title="Where work is waiting" subtitle={subtitle || 'How many items sit at each step, who has to act next, and how long the oldest has waited.'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {releaseFlow && <FlowRow title="Builds" flow={releaseFlow} onOpen={() => onNavigate('releases')} />}
        {bugFlow && <FlowRow title="Bugs" flow={bugFlow} onOpen={() => onNavigate('bugs')} />}
      </div>
    </section>
  );
}

/* ---- Weekly paired bars with a one-line verdict ---- */
export function WeeklyBars({ trend, mode, onMode }) {
  const [a, b] = trend.series;
  const max = Math.max(1, ...a.data, ...b.data);
  const W = 640; const H = 170; const top = 18; const bottom = 22; const gap = W / a.data.length;
  const bw = Math.min(18, gap / 3.2);
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const colors = mode === 'bugs' ? ['var(--danger)', 'var(--success)'] : ['#6366F1', 'var(--success)'];
  const t = TONES[trend.sentence.tone] || TONES.neutral;
  return (
    <section style={panel}>
      <PanelHead
        title={mode === 'bugs' ? 'Are we keeping up with bugs?' : 'Are builds getting through QA?'}
        subtitle="Per week, last 8 weeks"
        right={onMode && <Segmented options={[['bugs', 'Bugs'], ['builds', 'Builds']]} value={mode} onChange={onMode} />}
      />
      <div style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 12px', borderRadius: 8, background: t.bg, color: t.fg, marginBottom: 12, lineHeight: 1.45 }}>
        {trend.sentence.text}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        {[a, b].map((s, i) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i] }} /> {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${a.name} and ${b.name} per week`} style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--color-border-primary)" />
        {a.data.map((_, i) => {
          const cx = gap * i + gap / 2;
          return (
            <g key={i}>
              {[a.data[i], b.data[i]].map((v, k) => {
                const x = cx + (k === 0 ? -bw - 1 : 1);
                return (
                  <g key={k}>
                    <rect x={x} y={y(v)} width={bw} height={Math.max(0, H - bottom - y(v))} rx="3" fill={colors[k]} opacity={k === 0 && mode === 'bugs' ? 0.75 : 1}>
                      <title>{`${trend.labels[i]}: ${v} ${[a, b][k].name.toLowerCase()}`}</title>
                    </rect>
                    {v > 0 && <text x={x + bw / 2} y={y(v) - 4} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">{v}</text>}
                  </g>
                );
              })}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--color-text-tertiary)">{trend.labels[i]}</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

/* ---- Project health: worst first, with the reason ---- */
const HEALTH_ORDER = [['At risk', 'danger'], ['Needs fixes', 'warning'], ['In QA', 'info'], ['On track', 'success'], ['Idle', 'neutral'], ['No builds', 'neutral']];
export function ProjectHealth({ health, onOpenProject, onNavigate, limit = 8, title = 'Project health' }) {
  const [all, setAll] = useState(false);
  const total = health.rows.length;
  const rows = all ? health.rows : health.rows.slice(0, limit);
  return (
    <section style={panel}>
      <PanelHead title={title} subtitle="Projects that need help are listed first, with the reason." right={<LinkButton onClick={() => onNavigate('projecthub')}>Open projects</LinkButton>} />
      {total > 0 && (
        <>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--color-background-secondary)', marginBottom: 8 }}>
            {HEALTH_ORDER.map(([label, tone]) => health.tally[label] ? (
              <span key={label} title={`${label}: ${health.tally[label]}`} style={{ width: `${(health.tally[label] / total) * 100}%`, background: TONE_COLOR[tone], opacity: label === 'No builds' ? 0.4 : 1 }} />
            ) : null)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 14 }}>
            {HEALTH_ORDER.map(([label, tone]) => health.tally[label] ? (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: TONE_COLOR[tone], opacity: label === 'No builds' ? 0.4 : 1 }} />
                <b className="tnum" style={{ color: 'var(--color-text-primary)' }}>{health.tally[label]}</b> {label.toLowerCase()}
              </span>
            ) : null)}
          </div>
        </>
      )}
      {total === 0 ? <div style={muted}>No projects yet.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r) => (
            <button key={r.project.id} className="mgr-row" onClick={() => onOpenProject(r.project.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', border: 'none', borderBottom: '1px solid var(--color-border-tertiary)', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', borderRadius: 0 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.project.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{r.reason}</span>
              </span>
              <Pill label={r.status.label} tone={r.status.tone} />
            </button>
          ))}
        </div>
      )}
      {total > limit && <div style={{ marginTop: 10 }}><LinkButton onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${total} projects`}</LinkButton></div>}
    </section>
  );
}

/* ---- People and workload ---- */
export function PeopleWorkload({ rows, title = 'Team workload', subtitle, teamsById, limit = 8, onNavigate }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  const th = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textAlign: 'right', padding: '0 0 8px 10px', whiteSpace: 'nowrap' };
  const td = { fontSize: 12.5, textAlign: 'right', padding: '8px 0 8px 10px', borderTop: '1px solid var(--color-border-tertiary)' };
  const n = (v, bad) => <span className="tnum" style={{ color: v ? (bad ? 'var(--danger)' : 'var(--color-text-primary)') : 'var(--color-text-tertiary)', fontWeight: v && bad ? 600 : 400 }}>{v || '–'}</span>;
  return (
    <section style={panel}>
      <PanelHead
        title={title}
        subtitle={subtitle || 'Busiest first. Workload counts builds in QA, bugs to fix, reviews and active tasks, compared with the typical person here.'}
        right={onNavigate && <LinkButton onClick={() => onNavigate('users')}>All users</LinkButton>}
      />
      {rows.length === 0 ? <div style={muted}>No team members with work yet.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Person</th>
                <th style={th} title="Their builds waiting for or in QA">Builds in QA</th>
                <th style={th} title="Open bugs on their builds">Bugs to fix</th>
                <th style={th} title="Builds they must test">Reviews</th>
                <th style={th} title="WBS / CMS tasks in progress">Tasks</th>
                <th style={th} title="Tasks past their due date">Overdue</th>
                <th style={th}>Workload</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.person.id}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <Avatar name={w.person.name} size={26} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>{w.person.name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                          {w.person.role}{teamsById && w.person.teamId && teamsById[w.person.teamId] ? ` · ${teamsById[w.person.teamId].name}` : ''}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td style={td}>{n(w.inQa)}{w.sentBack ? <span style={{ fontSize: 11, color: 'var(--danger)' }}> +{w.sentBack} back</span> : null}</td>
                  <td style={td}>{n(w.bugsToFix, w.blocking > 0)}</td>
                  <td style={td}>{n(w.reviews + w.retests)}</td>
                  <td style={td}>{n(w.tasksActive)}</td>
                  <td style={td}>{n(w.overdue, true)}</td>
                  <td style={td}><Pill label={w.level.label} tone={w.level.tone} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && <div style={{ marginTop: 10 }}><LinkButton onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rows.length} people`}</LinkButton></div>}
    </section>
  );
}

/* ---- Simple item list (tasks, bugs, builds) ---- */
export function ItemList({ title, subtitle, items, empty, onMore, moreLabel, limit = 7 }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <section style={panel}>
      <PanelHead title={title} subtitle={subtitle} right={onMore && <LinkButton onClick={onMore}>{moreLabel || 'View all'}</LinkButton>} />
      {items.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <AlertIcon level="ok" size={18} /><span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{empty}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((it) => (
            <button key={it.key} className="mgr-row" onClick={it.onClick} disabled={!it.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', border: 'none', borderBottom: '1px solid var(--color-border-tertiary)', background: 'transparent', textAlign: 'left', cursor: it.onClick ? 'pointer' : 'default', fontFamily: 'inherit', color: 'inherit', borderRadius: 0 }}>
              {it.dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: it.dot, flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.meta}</span>
              </span>
              {it.flag && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--danger)', whiteSpace: 'nowrap' }}>{it.flag}</span>}
              {it.pill && <Pill label={it.pill.label} tone={it.pill.tone} />}
            </button>
          ))}
        </div>
      )}
      {items.length > limit && <div style={{ marginTop: 10 }}><LinkButton onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</LinkButton></div>}
    </section>
  );
}
