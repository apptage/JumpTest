/* DashboardHome — one page per role, built to answer in seconds:
   what is happening, what needs attention, and what to do next.
     Admin      → organisation health, bottlenecks, risks, team workload
     Team Lead  → the team's progress, each member's load, decisions waiting on them
     Developer  → my bugs, my tasks, my builds
     QA         → my test queue and re-tests */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/api.js';
import { ghostButton, primaryButton, Avatar } from '@/ui.jsx';
import { greeting, statusSince } from '@shared/ui-kit.jsx';
import { SEVERITIES, BUG_STATUSES, slaLevel, isBlockingSeverity } from '@/constants.js';
import { IconPackage, IconUpload } from '@/icons.jsx';
import {
  buildContext, normaliseTasks, sortTasks, isOverdue, dueSoon, releaseFlow, bugFlow, weeklyTrend,
  passRate30, turnaround30, projectHealth, peopleWorkload, bugOwnerId, releaseLabel, ageDays, ageText,
  attentionForAdmin, attentionForLead, attentionForDeveloper, attentionForQa, STATUS_LABEL,
} from './metrics.js';
import { Kpi, KpiRow, AttentionList, WhereWorkWaits, WeeklyBars, ProjectHealth, PeopleWorkload, ItemList } from './widgets.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const RELEASE_TONE = { qa_pending: 'warning', qa_in_progress: 'info', qa_done: 'info', approved: 'success', sent_back: 'danger', closed: 'neutral' };
const BUG_TONE = { open: 'danger', in_progress: 'info', disputed: 'warning', fixed: 'info', pending_tl: 'info', verified: 'success' };
const ROLE_LABEL = { Admin: 'Admin', Manager: 'Manager', 'Team Lead': 'Team Lead', Developer: 'Developer', QA: 'QA' };

function passCaption(p) {
  if (p.pct == null) return 'No builds decided in the last 30 days';
  const vs = p.change == null ? '' : ` · ${p.change >= 0 ? '▲' : '▼'} ${Math.abs(p.change)} pts vs previous 30 days`;
  return `Builds approved first time, last 30 days. Target 75%${vs}`;
}
const passTone = (p) => (p.pct == null ? 'neutral' : p.pct >= 75 ? 'success' : p.pct >= 55 ? 'warning' : 'danger');

/* ---------- list item builders ---------- */
function bugItems(ctx, bugs, onOpenRelease) {
  const rank = { critical: 0, major: 1, minor: 2 };
  return bugs
    .slice()
    .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || new Date(a.createdAt) - new Date(b.createdAt))
    .map((b) => {
      const r = ctx.releaseById[b.releaseId];
      const age = ageDays(b.createdAt, ctx.now);
      return {
        key: b.id,
        title: b.title,
        meta: `${r ? releaseLabel(ctx, r) : 'Release'} · ${SEVERITIES[b.severity]?.label || b.severity} · reported ${ageText(age)} ago`,
        dot: SEVERITIES[b.severity]?.color,
        pill: { label: BUG_STATUSES[b.status]?.label || b.status, tone: BUG_TONE[b.status] || 'neutral' },
        flag: age >= 5 ? 'Overdue' : null,
        onClick: () => onOpenRelease(b.releaseId),
      };
    });
}
function taskItems(ctx, tasks, onNavigate) {
  return sortTasks(tasks, ctx.now).map((t) => {
    const project = ctx.projectById[t.projectId]?.name || 'Project';
    const dueTxt = t.due ? `due ${t.due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'no due date';
    const late = isOverdue(t, ctx.now);
    const days = t.due ? Math.ceil((t.due.getTime() - ctx.now) / 86_400_000) : null;
    return {
      key: t.id,
      title: t.title,
      meta: [project, t.kind === 'cms' ? 'CMS task' : 'WBS', t.priority && `${t.priority} priority`, dueTxt].filter(Boolean).join(' · '),
      dot: t.priority === 'High' ? 'var(--danger)' : t.priority === 'Medium' ? 'var(--warning)' : 'var(--color-border-primary)',
      pill: { label: t.statusLabel, tone: t.state === 'blocked' ? 'danger' : t.state === 'doing' ? 'warning' : t.state === 'review' ? 'info' : 'neutral' },
      flag: late ? 'Overdue' : dueSoon(t, ctx.now) ? (days <= 1 ? 'Due tomorrow' : `Due in ${days} days`) : null,
      onClick: () => onNavigate(t.kind === 'cms' ? 'projecthub' : 'wbs'),
    };
  });
}
function releaseItems(ctx, releases, onOpenRelease, { showQa = true } = {}) {
  const rank = { sent_back: 0, qa_pending: 1, qa_in_progress: 2, qa_done: 3, approved: 4 };
  return releases
    .slice()
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || new Date(statusSince(a)) - new Date(statusSince(b)))
    .map((r) => {
      const qa = r.assignedQa ? ctx.profileById[r.assignedQa]?.name : null;
      const since = ageText(ageDays(statusSince(r), ctx.now));
      return {
        key: r.id,
        title: releaseLabel(ctx, r),
        meta: [`${STATUS_LABEL(r.status)} for ${since}`, showQa && (qa ? `tester: ${qa}` : r.status === 'qa_pending' ? 'no tester yet' : null), r.platform].filter(Boolean).join(' · '),
        pill: { label: STATUS_LABEL(r.status), tone: RELEASE_TONE[r.status] || 'neutral' },
        flag: slaLevel(r.status, statusSince(r)) === 'over' ? 'Overdue' : null,
        onClick: () => onOpenRelease(r.id),
      };
    });
}

/* ---------- role views ---------- */
function AdminView({ header, ctx, teams, go, onOpenRelease, onOpenProject, onNavigate }) {
  const health = useMemo(() => projectHealth(ctx), [ctx]);
  const people = useMemo(() => peopleWorkload(ctx, ctx.profiles), [ctx]);
  const attention = useMemo(() => attentionForAdmin(ctx, { teams, health, people }), [ctx, teams, health, people]);
  const rf = useMemo(() => releaseFlow(ctx), [ctx]);
  const bf = useMemo(() => bugFlow(ctx), [ctx]);
  const trend = useMemo(() => weeklyTrend(ctx, 'bugs'), [ctx]);
  const trendBuilds = useMemo(() => weeklyTrend(ctx, 'builds'), [ctx]);
  const pass = passRate30(ctx);
  const turn = turnaround30(ctx);
  const atRisk = health.tally['At risk'] || 0;
  const waiting = rf.stages[0].count + rf.stages[1].count + rf.stages[2].count;
  const overdueQa = rf.stages.reduce((n, s) => n + s.overdue, 0);
  const blocking = ctx.activeBugs.filter((b) => isBlockingSeverity(b.severity)).length;
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  return (
    <>
      {header(attention)}
      <>
        <KpiRow>
          <Kpi label="Projects at risk" value={`${atRisk} of ${ctx.projects.length}`} caption={atRisk ? 'Have critical or major bugs open' : 'No project has blocking bugs'} tone={atRisk ? 'danger' : 'success'} onClick={() => onNavigate('projecthub')} />
          <Kpi label="Builds in QA" value={waiting} caption={overdueQa ? `${overdueQa} waiting longer than they should` : 'All within the QA time limit'} tone={overdueQa ? 'warning' : 'success'} onClick={() => onNavigate('releases')} />
          <Kpi label="Open bugs" value={ctx.activeBugs.length} caption={blocking ? `${blocking} blocking (critical or major)` : 'None blocking'} tone={blocking ? 'danger' : 'success'} onClick={() => onNavigate('bugs')} />
          <Kpi label="First-time pass rate" value={pass.pct == null ? '–' : `${pass.pct}%`} caption={passCaption(pass)} tone={passTone(pass)} onClick={() => onNavigate('analytics')} />
          <Kpi label="QA turnaround" value={turn == null ? '–' : `${turn} days`} caption="Average from submit to QA decision, last 30 days" tone={turn == null ? 'neutral' : turn <= 3 ? 'success' : turn <= 5 ? 'warning' : 'danger'} />
        </KpiRow>
        <div className="home-2col">
          <AttentionList items={attention} onAction={go} />
          <WhereWorkWaits releaseFlow={rf} bugFlow={bf} onNavigate={onNavigate} />
        </div>
        <div className="home-2col">
          <ProjectHealth health={health} onOpenProject={onOpenProject} onNavigate={onNavigate} />
          <PeopleWorkload rows={people} teamsById={teamsById} onNavigate={onNavigate} title="Who is busy" />
        </div>
        <div className="home-2col">
          <WeeklyBars trend={trend} mode="bugs" />
          <WeeklyBars trend={trendBuilds} mode="builds" />
        </div>
      </>
    </>
  );
}

function LeadView({ header, ctx, me, go, onOpenRelease, onOpenProject, onNavigate }) {
  const team = useMemo(() => ctx.profiles.filter((p) => p.teamId && p.teamId === me.teamId), [ctx, me.teamId]);
  const people = useMemo(() => peopleWorkload(ctx, team), [ctx, team]);
  const attention = useMemo(() => attentionForLead(ctx, { me, people }), [ctx, me, people]);
  const health = useMemo(() => projectHealth(ctx), [ctx]);
  const rf = useMemo(() => releaseFlow(ctx), [ctx]);
  const bf = useMemo(() => bugFlow(ctx), [ctx]);
  const trend = useMemo(() => weeklyTrend(ctx, 'bugs'), [ctx]);
  const trendBuilds = useMemo(() => weeklyTrend(ctx, 'builds'), [ctx]);
  const pass = passRate30(ctx);
  const decisions = ctx.activeBugs.filter((b) => b.status === 'pending_tl');
  const waiting = rf.stages[0].count + rf.stages[1].count + rf.stages[2].count;
  const overdueQa = rf.stages.reduce((n, s) => n + s.overdue, 0);
  const blocking = ctx.activeBugs.filter((b) => isBlockingSeverity(b.severity)).length;
  const overdueTasks = ctx.tasks.filter((t) => isOverdue(t, ctx.now)).length;
  return (
    <>
      {header(attention)}
      <>
        <KpiRow>
          <Kpi label="Decisions waiting for you" value={decisions.length} caption={decisions.length ? 'Bug closures to approve or reject' : 'You are all caught up'} tone={decisions.length ? 'danger' : 'success'} onClick={() => onNavigate('bugs')} />
          <Kpi label="Team builds in QA" value={waiting} caption={overdueQa ? `${overdueQa} past the QA time limit` : 'All within the QA time limit'} tone={overdueQa ? 'warning' : 'success'} onClick={() => onNavigate('releases')} />
          <Kpi label="Open bugs" value={ctx.activeBugs.length} caption={blocking ? `${blocking} blocking approval` : 'None blocking'} tone={blocking ? 'danger' : 'success'} onClick={() => onNavigate('bugs')} />
          <Kpi label="Overdue tasks" value={overdueTasks} caption={overdueTasks ? 'Past their estimated date' : 'Everything on schedule'} tone={overdueTasks ? 'warning' : 'success'} onClick={() => onNavigate('wbs')} />
          <Kpi label="First-time pass rate" value={pass.pct == null ? '–' : `${pass.pct}%`} caption={passCaption(pass)} tone={passTone(pass)} onClick={() => onNavigate('analytics')} />
        </KpiRow>
        <div className="home-2col">
          <AttentionList items={attention} onAction={go} />
          <PeopleWorkload rows={people} title="Your team" subtitle="Who is busy and who has room, compared with the typical load on your team." />
        </div>
        <div className="home-2col">
          <WhereWorkWaits releaseFlow={rf} bugFlow={bf} onNavigate={onNavigate} />
          <ProjectHealth health={health} onOpenProject={onOpenProject} onNavigate={onNavigate} title="Your projects" />
        </div>
        <div className="home-2col">
          <WeeklyBars trend={trend} mode="bugs" />
          <WeeklyBars trend={trendBuilds} mode="builds" />
        </div>
      </>
    </>
  );
}

function DeveloperView({ header, ctx, me, go, onOpenRelease, onNavigate }) {
  const attention = useMemo(() => attentionForDeveloper(ctx, { me }), [ctx, me]);
  const myBugs = ctx.activeBugs.filter((b) => bugOwnerId(ctx, b) === me.id && ['open', 'in_progress', 'disputed'].includes(b.status));
  const blocking = myBugs.filter((b) => isBlockingSeverity(b.severity)).length;
  const myTasks = ctx.tasks.filter((t) => t.assignedTo === me.id);
  const overdue = myTasks.filter((t) => isOverdue(t, ctx.now)).length;
  const myBuilds = ctx.activeReleases.filter((r) => r.submittedById === me.id && r.status !== 'approved');
  const recentApproved = ctx.activeReleases.filter((r) => r.submittedById === me.id && r.status === 'approved' && ageDays(r.qaCompletedAt || r.statusChangedAt, ctx.now) <= 14);
  const inQa = myBuilds.filter((r) => ['qa_pending', 'qa_in_progress', 'qa_done'].includes(r.status));
  const sentBack = myBuilds.filter((r) => r.status === 'sent_back').length;
  const pass = passRate30(ctx, ctx.releases.filter((r) => r.submittedById === me.id));
  return (
    <>
      {header(attention)}
      <>
        <KpiRow>
          <Kpi label="Bugs to fix" value={myBugs.length} caption={blocking ? `${blocking} blocking your builds` : myBugs.length ? 'None blocking approval' : 'No bugs on your builds'} tone={blocking ? 'danger' : myBugs.length ? 'warning' : 'success'} onClick={() => onNavigate('bugs')} />
          <Kpi label="My open tasks" value={myTasks.length} caption={overdue ? `${overdue} overdue` : myTasks.length ? 'None overdue' : 'Nothing assigned to you'} tone={overdue ? 'danger' : 'neutral'} onClick={() => onNavigate('wbs')} />
          <Kpi label="My builds in QA" value={inQa.length} caption={sentBack ? `${sentBack} sent back to you` : inQa.length ? 'Waiting on QA, nothing for you to do' : 'Nothing in QA'} tone={sentBack ? 'danger' : 'neutral'} onClick={() => onNavigate('releases')} />
          <Kpi label="My first-time pass rate" value={pass.pct == null ? '–' : `${pass.pct}%`} caption={passCaption(pass)} tone={passTone(pass)} />
        </KpiRow>
        <AttentionList items={attention} onAction={go} emptyText="You have no urgent work. Pick up your next task below." />
        <div className="home-2col">
          <ItemList title="My tasks" subtitle="Overdue and high priority first." items={taskItems(ctx, myTasks, onNavigate)} empty="No tasks assigned to you." onMore={() => onNavigate('wbs')} moreLabel="Open WBS" />
          <ItemList title="Bugs to fix" subtitle="On builds you submitted. Most severe first." items={bugItems(ctx, myBugs, onOpenRelease)} empty="No open bugs on your builds." onMore={() => onNavigate('bugs')} moreLabel="All bugs" />
        </div>
        <ItemList
          title="My builds"
          subtitle={recentApproved.length ? `${plural(recentApproved.length, 'build')} approved in the last 2 weeks.` : 'Builds you submitted that are not approved yet.'}
          items={releaseItems(ctx, myBuilds, onOpenRelease)}
          empty="All your builds are approved."
          onMore={() => onNavigate('releases')}
          moreLabel="All releases"
        />
      </>
    </>
  );
}

function QaView({ header, ctx, me, go, onOpenRelease, onNavigate }) {
  const attention = useMemo(() => attentionForQa(ctx, { me }), [ctx, me]);
  const mine = ctx.activeReleases.filter((r) => r.assignedQa === me.id && ['qa_pending', 'qa_in_progress', 'qa_done'].includes(r.status));
  const unassigned = ctx.activeReleases.filter((r) => r.status === 'qa_pending' && !r.assignedQa);
  const retest = ctx.activeBugs.filter((b) => b.status === 'fixed' && (ctx.releaseById[b.releaseId]?.assignedQa === me.id || b.createdById === me.id));
  // same rule as the attention list: sign-off waits are listed separately
  const overdue = mine.filter((r) => r.status !== 'qa_done' && slaLevel(r.status, statusSince(r)) === 'over').length;
  const tested7 = ctx.releases.filter((r) => r.assignedQa === me.id && r.qaCompletedAt && ageDays(r.qaCompletedAt, ctx.now) < 7).length;
  const bf = bugFlow(ctx);
  const rf = releaseFlow(ctx);
  return (
    <>
      {header(attention)}
      <>
        <KpiRow>
          <Kpi label="Assigned to me" value={mine.length} caption={overdue ? `${overdue} past the QA time limit` : mine.length ? 'All within the time limit' : 'Nothing assigned'} tone={overdue ? 'danger' : 'neutral'} onClick={() => onNavigate('releases')} />
          <Kpi label="Fixes to re-test" value={retest.length} caption="Developers say these are fixed" tone={retest.length ? 'warning' : 'success'} onClick={() => onNavigate('bugs')} />
          <Kpi label="Waiting for a tester" value={unassigned.length} caption="Builds nobody has picked up" tone={unassigned.length ? 'warning' : 'success'} onClick={() => onNavigate('releases')} />
          <Kpi label="Tested this week" value={tested7} caption="Builds you finished in the last 7 days" tone="neutral" />
        </KpiRow>
        <AttentionList items={attention} onAction={go} emptyText="Your queue is clear." />
        <div className="home-2col">
          <ItemList title="My test queue" subtitle="Oldest first." items={releaseItems(ctx, [...mine, ...unassigned], onOpenRelease)} empty="No builds waiting for testing." onMore={() => onNavigate('releases')} />
          <ItemList title="Bugs to re-test" subtitle="Verify the fix or reopen the bug." items={bugItems(ctx, retest, onOpenRelease)} empty="No fixes waiting for re-test." onMore={() => onNavigate('bugs')} />
        </div>
        <WhereWorkWaits releaseFlow={rf} bugFlow={bf} onNavigate={onNavigate} />
      </>
    </>
  );
}

/* ---------- page ---------- */
export function DashboardHome({
  releases, bugs, projects, profiles, teams = [], user, teamName, canSubmit,
  onSubmit, onOpenRelease, onOpenProject, onNavigate,
}) {
  const role = user?.role === 'Manager' ? 'Admin' : user?.role || 'Developer';
  const projectIds = useMemo(() => projects.map((p) => p.id).sort(), [projects]);
  const wantsTasks = role !== 'QA' && projectIds.length > 0;
  const idsKey = projectIds.join(',');
  const wbsQ = useQuery({ queryKey: ['dashboardWbs', user?.id, idsKey], queryFn: () => api.fetchWbsItemsForProjects(projectIds.filter((id) => projects.find((p) => p.id === id)?.type !== 'cms')), enabled: wantsTasks, staleTime: 60_000 });
  const cmsQ = useQuery({ queryKey: ['dashboardCms', user?.id, idsKey], queryFn: () => api.fetchCmsTasksForProjects(projectIds.filter((id) => projects.find((p) => p.id === id)?.type === 'cms')), enabled: wantsTasks, staleTime: 60_000 });
  const tasks = useMemo(() => normaliseTasks(wbsQ.data || [], cmsQ.data || []), [wbsQ.data, cmsQ.data]);
  const ctx = useMemo(() => buildContext({ releases, bugs, projects, profiles, tasks }), [releases, bugs, projects, profiles, tasks]);

  const go = (action) => {
    if (action.release) onOpenRelease(action.release);
    else if (action.page) onNavigate(action.page);
  };
  const props = { ctx, me: user, teams, go, onOpenRelease, onOpenProject, onNavigate };
  const tasksLoading = wantsTasks && (wbsQ.isLoading || cmsQ.isLoading);
  const header = (attention) => (
    <HomeHeader user={user} teamName={teamName} canSubmit={canSubmit} onSubmit={onSubmit} onNavigate={onNavigate} attention={attention} loading={tasksLoading} />
  );
  const View = role === 'Admin' ? AdminView : role === 'Team Lead' ? LeadView : role === 'QA' ? QaView : DeveloperView;
  return (
    <div className="anim-in home" style={{ maxWidth: 1460, margin: '0 auto' }}>
      <View {...props} header={header} />
    </div>
  );
}

function HomeHeader({ user, teamName, canSubmit, onSubmit, onNavigate, attention, loading }) {
  const firstName = (user?.name || '').split(/[\s_]+/)[0] || 'there';
  const urgent = attention.filter((a) => a.level === 'over').length;
  const total = attention.length;
  const summary = total === 0
    ? 'Nothing needs your attention right now.'
    : urgent
      ? `${plural(urgent, 'urgent item')}${total - urgent ? ` and ${plural(total - urgent, 'other item')}` : ''} ${total === 1 ? 'needs' : 'need'} your attention.`
      : `${plural(total, 'item')} ${total === 1 ? 'needs' : 'need'} your attention. Nothing urgent.`;
  return (
      <header className="glass" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Avatar name={user?.name} size={44} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              {greeting()}, {firstName}
            </h1>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', padding: '2px 9px', borderRadius: 999 }}>
              {ROLE_LABEL[user?.role] || user?.role}{teamName ? ` · ${teamName}` : ''}
            </span>
          </div>
          <p style={{ fontSize: 13, margin: '4px 0 0', color: urgent ? 'var(--danger)' : 'var(--color-text-secondary)', fontWeight: urgent ? 600 : 400 }}>
            {summary}{loading ? <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}> Loading tasks…</span> : null}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...ghostButton, display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => onNavigate('releases')}>
            <IconPackage size={15} /> All releases
          </button>
          {canSubmit && (
            <button style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={onSubmit}>
              <IconUpload size={15} /> Submit release
            </button>
          )}
        </div>
      </header>
  );
}
