/* Reports — departmental Excel exports (Settings → Reports).
   Every report is a clean multi-sheet workbook in the house format (About sheet
   with generated time / source / scope / definitions, then one header-row +
   autofilter sheet per table). All numbers come from the shared metric layer, so
   a report always agrees with the Dashboard and Analytics. Data is role-scoped
   exactly like the pages (Admin: whole org + team filter; Team Lead: their team). */
import { useState } from 'react';
import * as api from '@/api.js';
import { card, primaryButton, ghostButton, inputStyle } from '@/ui.jsx';
import { Pill } from '@shared/dashboard-kit.jsx';
import { avgDaysBetween, statusSince } from '@shared/ui-kit.jsx';
import { buildWorkbook, downloadWorkbook } from '@shared/exportXlsx.js';
import { computeReleaseMetrics } from '@shared/releaseMetrics.js';
import { computeProjectWbsHealth, computeCompositeHealth, milestoneLabel } from '@shared/wbsMetrics.js';
import {
  STATUSES, BUG_STATUSES, SEVERITIES, BUG_RESOLUTIONS, WBS_STATUSES,
  isActiveBug, isActiveStatus, isClosedStatus, bugSlaLevel, slaLevel, projectTypeLabel, formatVersion,
} from '@/constants.js';
import { IconChart } from '@/icons.jsx';

/* ---------- small formatters ---------- */
const d = (iso) => (iso ? String(iso).slice(0, 10) : '');
const dt = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) : '');
const days = (a, b) => (a && b ? Math.round(((new Date(b) - new Date(a)) / 86400000) * 10) / 10 : '');
const yn = (v) => (v ? 'Yes' : 'No');
const pctOf = (n, den) => (den ? Math.round((n / den) * 100) : '');
const rel1 = (n) => (n == null || Number.isNaN(n) ? '' : Math.round(n * 10) / 10);
const relStatus = (s) => STATUSES[s]?.label || s;
const bugStatus = (s) => BUG_STATUSES[s]?.label || s;
const sev = (s) => SEVERITIES[s]?.label || s;
const slaWord = (lvl) => (lvl === 'over' ? 'Overdue' : lvl === 'warn' ? 'Approaching limit' : 'Within limit');
const monthKeys = (n) => {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
  });
};
const ym = (iso) => (iso ? String(iso).slice(0, 7) : '');

/* ---------- scope: role + toolbar filters → the datasets every report reads ---------- */
function makeCtx(props, f) {
  const { projects, releases, bugs, profiles, teams, projectMembers, projectsById, profilesById } = props;
  const teamsById = Object.fromEntries((teams || []).map((t) => [t.id, t]));
  const inTeam = (x) => f.team === 'all' || x.teamId === f.team;
  const projs = projects.filter(inTeam);
  const pids = new Set(projs.map((p) => p.id));
  const inRange = (day) => (!f.from || day >= f.from) && (!f.to || day <= f.to);
  const releaseById = Object.fromEntries(releases.map((r) => [r.id, r]));
  const rels = releases.filter((r) => pids.has(r.projectId) && inRange(r.date || d(r.createdAt)));
  const bugsAll = bugs.filter((b) => pids.has(releaseById[b.releaseId]?.projectId) && inRange(d(b.createdAt)));
  const people = profiles.filter((p) => f.team === 'all' || p.teamId === f.team);
  const scopeBits = [
    f.team !== 'all' ? `Team: ${teamsById[f.team]?.name || ''}` : null,
    f.from || f.to ? `Dates: ${f.from || '…'} → ${f.to || '…'}` : null,
  ].filter(Boolean);
  return {
    ...props, teamsById, projs, pids, rels, bugsAll, people, releaseById, f,
    name: (id) => profilesById[id]?.name || '',
    teamName: (id) => teamsById[id]?.name || '',
    projName: (id) => projectsById[id]?.name || '',
    scopeText: scopeBits.length ? `(${scopeBits.join(' · ')})` : '',
    now: Date.now(),
  };
}
async function loadWbs(ctx) {
  const ids = [...ctx.pids];
  const [items, targets] = await Promise.all([api.fetchWbsItemsForProjects(ids), api.fetchWbsPlatformTargetsForProjects(ids)]);
  return { items, targets };
}
async function loadTimeLogs(ctx) {
  const lists = await Promise.all([...ctx.pids].map((id) => api.fetchTimeLogsForProject(id).catch(() => [])));
  return lists.flat();
}
async function loadBugStats() {
  try { return await api.fetchReleaseBugStats(); } catch { return {}; }
}
const col = (header, key, width) => ({ header, key, width });

/* ====================================================================== */
/* The report catalogue                                                    */
/* ====================================================================== */
export const REPORTS = [
  {
    key: 'qa-workload', file: 'QA_Workload_Report', title: 'QA Workload',
    desc: 'Which projects each QA resource is assigned to — home, support and other — with expiry.',
    sheets: ['QA Workload Summary', 'Assigned Projects'],
    build: async (ctx) => {
      const rows = []; const summary = [];
      ctx.people.filter((p) => p.role === 'QA').forEach((q) => {
        let team = 0, support = 0, other = 0;
        ctx.projectMembers.filter((m) => m.userId === q.id && ctx.projectsById[m.projectId]).forEach((m) => {
          const p = ctx.projectsById[m.projectId];
          const active = !m.expiresAt || new Date(m.expiresAt).getTime() > ctx.now;
          const cat = m.accessType === 'support' ? 'Support project' : p.teamId && p.teamId === q.teamId ? 'Team project' : 'Other assigned project';
          if (active) { if (cat === 'Support project') support++; else if (cat === 'Team project') team++; else other++; }
          rows.push({ qa: q.name, email: q.email, home: ctx.teamName(q.teamId), project: p.name, owner: ctx.teamName(p.teamId), cat, access: m.accessType === 'support' ? 'Support' : 'Team (home)', role: m.projectRole || '', platform: projectTypeLabel(p.type), wbs: yn(p.wbsEnabled), on: d(m.createdAt), exp: d(m.expiresAt), status: active ? 'Active' : 'Expired' });
        });
        summary.push({ qa: q.name, email: q.email, home: ctx.teamName(q.teamId), total: team + support + other, team, support, other });
      });
      summary.sort((a, b) => b.total - a.total);
      return {
        title: 'QA project workload report', source: 'project_members + profiles + projects + teams',
        scope: 'Org-role QA resources only. Workload = count of assigned projects, not releases or bugs.',
        legend: [['Team project', 'Home membership on a project owned by the QA resource’s home team'], ['Support project', 'Temporary support membership on another team’s project'], ['Other assigned project', 'Assigned (home) to a project that is not owned by the QA resource’s home team']],
        notes: ['Expired support grants are listed on Assigned Projects but excluded from summary counts.'],
        sheets: [
          { name: 'QA Workload Summary', rows: summary, columns: [col('QA resource', 'qa', 22), col('Email', 'email', 30), col('QA home team', 'home', 16), col('Total assigned projects', 'total'), col('Team projects', 'team'), col('Support projects', 'support'), col('Other assigned projects', 'other')] },
          { name: 'Assigned Projects', rows, columns: [col('QA resource', 'qa', 22), col('Email', 'email', 30), col('QA home team', 'home', 16), col('Project name', 'project', 22), col('Project owning team', 'owner', 18), col('Assignment category', 'cat', 22), col('Access type', 'access', 14), col('Project role', 'role', 12), col('Platform / type', 'platform', 14), col('WBS enabled', 'wbs', 12), col('Assigned on', 'on', 12), col('Expires on', 'exp', 12), col('Membership status', 'status', 16)] },
        ],
      };
    },
  },
  {
    key: 'dev-workload', file: 'Developer_Workload_Report', title: 'Developer Workload',
    desc: 'Builds each developer submitted, how many passed, and the problems still on their plate.',
    sheets: ['Developer Summary', 'Their Builds'],
    build: async (ctx) => {
      const summary = []; const builds = [];
      ctx.people.filter((p) => p.role === 'Developer' || p.role === 'Team Lead').forEach((dev) => {
        const mine = ctx.rels.filter((r) => r.submittedById === dev.id);
        const ids = new Set(mine.map((r) => r.id));
        const onMine = ctx.bugsAll.filter((b) => ids.has(b.releaseId));
        const m = computeReleaseMetrics(mine, onMine, { releaseById: ctx.releaseById });
        const open = onMine.filter(isActiveBug);
        summary.push({ dev: dev.name, email: dev.email, role: dev.role, team: ctx.teamName(dev.teamId), submitted: mine.length, approved: m.approved, sentBack: m.rejected, pass: m.decided ? `${m.passRate}%` : '', inQa: mine.filter((r) => isActiveStatus(r.status)).length, open: open.length, critical: open.filter((b) => b.severity === 'critical').length, needsDev: onMine.filter((b) => ['open', 'in_progress', 'disputed'].includes(b.status)).length, projects: new Set(mine.map((r) => r.projectId)).size });
        mine.forEach((r) => builds.push({ dev: dev.name, project: ctx.projName(r.projectId), version: formatVersion(r.version), platform: r.platform, env: r.environment || 'Production', status: relStatus(r.status), qa: ctx.name(r.assignedQa), submitted: d(r.date || r.createdAt), qaDone: d(r.qaCompletedAt), openBugs: onMine.filter((b) => b.releaseId === r.id && isActiveBug(b)).length }));
      });
      summary.sort((a, b) => b.needsDev - a.needsDev || b.submitted - a.submitted);
      return {
        title: 'Developer workload report', source: 'releases + bugs + profiles', scope: 'Developers and Team Leads (who also submit builds). Builds = releases they submitted.',
        legend: [['Problems to fix', 'Bugs on their builds that are open, being fixed, or need clarification'], ['Approval rate', 'Approved ÷ judged builds; an approved build still carrying a Major/Critical bug counts as sent back']],
        sheets: [
          { name: 'Developer Summary', rows: summary, columns: [col('Developer', 'dev', 22), col('Email', 'email', 30), col('Role', 'role', 12), col('Team', 'team', 16), col('Builds submitted', 'submitted'), col('Approved', 'approved'), col('Sent back', 'sentBack'), col('Approval rate', 'pass'), col('Builds in QA now', 'inQa'), col('Open problems on their builds', 'open'), col('Critical', 'critical'), col('Problems to fix', 'needsDev'), col('Projects touched', 'projects')] },
          { name: 'Their Builds', rows: builds, columns: [col('Developer', 'dev', 22), col('Project', 'project', 22), col('Version', 'version', 12), col('Platform', 'platform', 10), col('Environment', 'env', 12), col('Status', 'status', 18), col('QA', 'qa', 20), col('Submitted', 'submitted', 12), col('QA done', 'qaDone', 12), col('Open bugs', 'openBugs')] },
        ],
      };
    },
  },
  {
    key: 'release-history', file: 'Release_History_Report', title: 'Release History',
    desc: 'Every build ever submitted, with who, when, the QA verdict, timings and bug counts.',
    sheets: ['Releases'],
    build: async (ctx) => {
      const stats = await loadBugStats();
      const rows = [...ctx.rels].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((r) => ({
        project: ctx.projName(r.projectId), team: ctx.teamName(ctx.projectsById[r.projectId]?.teamId), platform: r.platform, component: r.component || '', version: formatVersion(r.version), env: r.environment || 'Production', type: r.releaseType || '', status: relStatus(r.status), by: r.submittedBy || ctx.name(r.submittedById), qa: ctx.name(r.assignedQa), submitted: dt(r.createdAt) || d(r.date), assigned: dt(r.qaAssignedAt), done: dt(r.qaCompletedAt), cycle: days(r.createdAt, r.qaCompletedAt), handled: stats[r.id]?.total ?? '', reported: stats[r.id]?.reported ?? '', carried: stats[r.id]?.carried ?? '', link: r.linkUrl || '', notes: (r.releaseNotes || '').replace(/\s+/g, ' ').trim(),
      }));
      return {
        title: 'Release history report', source: 'releases + bug_history', scope: 'Every build in scope, all statuses (superseded builds included).',
        legend: [['QA cycle (days)', 'Calendar days from submission to QA completion'], ['Bugs handled', 'Bugs reported on this build plus bugs carried in from the previous build']],
        sheets: [{ name: 'Releases', rows, columns: [col('Project', 'project', 22), col('Team', 'team', 16), col('Platform', 'platform', 10), col('Component', 'component', 14), col('Version', 'version', 12), col('Environment', 'env', 12), col('Type', 'type', 10), col('Status', 'status', 18), col('Submitted by', 'by', 20), col('QA', 'qa', 20), col('Submitted at', 'submitted', 17), col('QA assigned at', 'assigned', 17), col('QA done at', 'done', 17), col('QA cycle (days)', 'cycle'), col('Bugs handled', 'handled'), col('Reported here', 'reported'), col('Carried in', 'carried'), col('Build link', 'link', 30), col('Release notes', 'notes', 60)] }],
      };
    },
  },
  {
    key: 'bug-register', file: 'Bug_Register', title: 'Bug Register',
    desc: 'The complete defect log — every bug with its build, severity, status, reporter and resolution.',
    sheets: ['Bugs'],
    build: async (ctx) => {
      const rows = [...ctx.bugsAll].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map((b) => {
        const r = ctx.releaseById[b.releaseId];
        return { project: ctx.projName(r?.projectId), version: r ? formatVersion(r.version) : '', platform: r?.platform || '', title: b.title, desc: (b.description || '').replace(/\s+/g, ' ').trim(), severity: sev(b.severity), status: bugStatus(b.status), feature: b.feature || '', tags: (b.tags || []).join(', '), reporter: b.createdBy || ctx.name(b.createdById), reported: dt(b.createdAt), verified: dt(b.verifiedAt), verifiedBy: ctx.name(b.verifiedById), resolution: b.resolution || '', carried: yn(b.carriedForward), iteration: b.iteration || 1, developer: ctx.name(r?.submittedById) };
      });
      return {
        title: 'Bug register', source: 'bugs + releases', scope: 'Every bug in scope, all statuses. One bug = one row (a bug moves between builds; it is never duplicated).',
        legend: [['Carried forward', 'Not fixed on the previous build, so it moved to the next one'], ['Iteration', 'How many builds the bug has been through']],
        sheets: [{ name: 'Bugs', rows, columns: [col('Project', 'project', 22), col('Build', 'version', 12), col('Platform', 'platform', 10), col('Title', 'title', 40), col('Description', 'desc', 60), col('Severity', 'severity', 10), col('Status', 'status', 22), col('Feature', 'feature', 16), col('Tags', 'tags', 20), col('Reported by', 'reporter', 20), col('Reported at', 'reported', 17), col('Verified at', 'verified', 17), col('Verified by', 'verifiedBy', 20), col('Resolution', 'resolution', 18), col('Carried forward', 'carried', 14), col('Iteration', 'iteration'), col('Developer', 'developer', 20)] }],
      };
    },
  },
  {
    key: 'open-aging', file: 'Open_Bugs_Aging_Report', title: 'Open Bugs & Aging',
    desc: 'Everything still open, how old it is, and whether it has blown past the agreed limit.',
    sheets: ['Open Bugs', 'By Severity & Status'],
    build: async (ctx) => {
      const open = ctx.bugsAll.filter(isActiveBug).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const rows = open.map((b) => { const r = ctx.releaseById[b.releaseId]; return { title: b.title, project: ctx.projName(r?.projectId), version: r ? formatVersion(r.version) : '', severity: sev(b.severity), status: bugStatus(b.status), age: Math.round((ctx.now - new Date(b.createdAt)) / 86400000), sla: slaWord(bugSlaLevel(b.status, b.createdAt)), developer: ctx.name(r?.submittedById), reporter: b.createdBy || ctx.name(b.createdById), reported: d(b.createdAt), carried: yn(b.carriedForward) }; });
      const summary = [];
      Object.keys(SEVERITIES).forEach((s) => Object.keys(BUG_STATUSES).forEach((st) => { const n = open.filter((b) => b.severity === s && b.status === st).length; if (n) summary.push({ severity: sev(s), status: bugStatus(st), count: n, overdue: open.filter((b) => b.severity === s && b.status === st && bugSlaLevel(b.status, b.createdAt) === 'over').length }); }));
      return {
        title: 'Open bugs & aging report', source: 'bugs + releases', scope: 'Bugs not yet confirmed fixed, oldest first.',
        legend: [['Age (days)', 'Days since the bug was reported'], ['Limit', 'Whether the bug is within, approaching or past the agreed open-time limit']],
        sheets: [
          { name: 'Open Bugs', rows, columns: [col('Title', 'title', 40), col('Project', 'project', 22), col('Build', 'version', 12), col('Severity', 'severity', 10), col('Status', 'status', 22), col('Age (days)', 'age'), col('Limit', 'sla', 18), col('Developer', 'developer', 20), col('Reported by', 'reporter', 20), col('Reported on', 'reported', 12), col('Carried forward', 'carried', 14)] },
          { name: 'By Severity & Status', rows: summary, columns: [col('Severity', 'severity', 10), col('Status', 'status', 22), col('Open', 'count'), col('Of which overdue', 'overdue')] },
        ],
      };
    },
  },
  {
    key: 'project-health', file: 'Project_Health_Report', title: 'Project Health',
    desc: 'One line per project: builds, open and critical problems, approval rate, cycle time, WBS progress and an overall health call.',
    sheets: ['Projects'],
    build: async (ctx) => {
      const { items, targets } = await loadWbs(ctx);
      const rows = ctx.projs.map((p) => {
        const rel = ctx.rels.filter((r) => r.projectId === p.id);
        const ids = new Set(rel.map((r) => r.id));
        const pb = ctx.bugsAll.filter((b) => ids.has(b.releaseId));
        const m = computeReleaseMetrics(rel, pb, { releaseById: ctx.releaseById });
        const open = pb.filter(isActiveBug); const critical = open.filter((b) => b.severity === 'critical').length;
        const wh = computeProjectWbsHealth(items.filter((i) => i.projectId === p.id), targets.filter((t) => t.projectId === p.id), ctx.now);
        const pass = m.decided ? m.passRate : null;
        const h = computeCompositeHealth({ wbsPct: wh.hasWbs ? wh.pct : null, openBugs: open.length, critical, passRate: pass, milestoneRisk: wh.milestoneRisk });
        const active = rel.filter((r) => !isClosedStatus(r.status)).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        return { project: p.name, team: ctx.teamName(p.teamId), platform: projectTypeLabel(p.type), builds: rel.length, active: active ? `${formatVersion(active.version)} · ${relStatus(active.status)}` : '', approved: m.approved, sentBack: m.rejected, pass: pass == null ? '' : `${pass}%`, cycle: rel1(m.cycleDays), open: open.length, critical, prod: m.prodBugs, wbs: wh.hasWbs ? `${wh.pct}%` : '', wbsDone: wh.hasWbs ? `${wh.completed}/${wh.total}` : '', blocked: wh.hasWbs ? wh.blocked : '', milestone: milestoneLabel(wh.milestoneRisk).label, health: h.label };
      }).sort((a, b) => b.open - a.open);
      return {
        title: 'Project health report', source: 'releases + bugs + wbs_items + wbs_platform_targets', scope: 'Every project in scope.',
        legend: [['Health', 'Healthy / Needs attention / At risk — from open & critical problems, approval rate and milestone risk'], ['Approval rate', 'Approved ÷ judged builds']],
        sheets: [{ name: 'Projects', rows, columns: [col('Project', 'project', 22), col('Team', 'team', 16), col('Platform', 'platform', 14), col('Builds', 'builds'), col('Current build', 'active', 26), col('Approved', 'approved'), col('Sent back', 'sentBack'), col('Approval rate', 'pass'), col('Avg cycle (days)', 'cycle'), col('Open problems', 'open'), col('Critical', 'critical'), col('On live builds', 'prod'), col('WBS progress', 'wbs'), col('WBS done / total', 'wbsDone'), col('WBS blocked', 'blocked'), col('Milestone', 'milestone', 14), col('Health', 'health', 16)] }],
      };
    },
  },
  {
    key: 'team-performance', file: 'Team_Performance_Report', title: 'Team Performance',
    desc: 'Per-team delivery and quality rollup, with a line for every member.',
    sheets: ['Teams', 'Members'],
    build: async (ctx) => {
      const teamList = ctx.f.team === 'all' ? ctx.teams : ctx.teams.filter((t) => t.id === ctx.f.team);
      const teamsRows = teamList.map((t) => {
        const pids = new Set(ctx.projs.filter((p) => p.teamId === t.id).map((p) => p.id));
        const rel = ctx.rels.filter((r) => pids.has(r.projectId)); const ids = new Set(rel.map((r) => r.id));
        const tb = ctx.bugsAll.filter((b) => ids.has(b.releaseId)); const m = computeReleaseMetrics(rel, tb, { releaseById: ctx.releaseById });
        const open = tb.filter(isActiveBug); const ppl = ctx.people.filter((p) => p.teamId === t.id);
        return { team: t.name, projects: pids.size, devs: ppl.filter((p) => p.role === 'Developer').length, qas: ppl.filter((p) => p.role === 'QA').length, lead: ppl.find((p) => p.role === 'Team Lead')?.name || '', builds: rel.length, approved: m.approved, sentBack: m.rejected, pass: m.decided ? `${m.passRate}%` : '', cycle: rel1(m.cycleDays), bugs: tb.length, open: open.length, critical: open.filter((b) => b.severity === 'critical').length, verified: tb.filter((b) => b.status === 'verified').length };
      });
      const members = ctx.people.filter((p) => p.role !== 'Admin').map((p) => {
        const isQa = p.role === 'QA';
        const mine = isQa ? ctx.rels.filter((r) => r.assignedQa === p.id) : ctx.rels.filter((r) => r.submittedById === p.id);
        const ids = new Set(mine.map((r) => r.id)); const onMine = ctx.bugsAll.filter((b) => ids.has(b.releaseId));
        const m = computeReleaseMetrics(mine, onMine, { releaseById: ctx.releaseById });
        return { name: p.name, email: p.email, role: p.role, team: ctx.teamName(p.teamId), builds: mine.length, approved: m.approved, sentBack: m.rejected, pass: m.decided ? `${m.passRate}%` : '', reported: isQa ? ctx.bugsAll.filter((b) => b.createdById === p.id).length : '', open: isQa ? '' : onMine.filter(isActiveBug).length };
      });
      return {
        title: 'Team performance report', source: 'releases + bugs + profiles + teams', scope: 'Teams in scope and every non-admin member.',
        legend: [['Builds (member)', 'QA: builds assigned to them · Developer/Lead: builds they submitted']],
        sheets: [
          { name: 'Teams', rows: teamsRows, columns: [col('Team', 'team', 18), col('Projects', 'projects'), col('Developers', 'devs'), col('QA', 'qas'), col('Team Lead', 'lead', 20), col('Builds', 'builds'), col('Approved', 'approved'), col('Sent back', 'sentBack'), col('Approval rate', 'pass'), col('Avg cycle (days)', 'cycle'), col('Bugs', 'bugs'), col('Open', 'open'), col('Critical', 'critical'), col('Confirmed fixed', 'verified')] },
          { name: 'Members', rows: members, columns: [col('Name', 'name', 22), col('Email', 'email', 30), col('Role', 'role', 12), col('Team', 'team', 16), col('Builds', 'builds'), col('Approved', 'approved'), col('Sent back', 'sentBack'), col('Approval rate', 'pass'), col('Bugs reported', 'reported'), col('Open bugs on their builds', 'open')] },
        ],
      };
    },
  },
  {
    key: 'monthly-quality', file: 'Monthly_Release_Quality_Report', title: 'Monthly Release Quality',
    desc: 'Twelve months of builds submitted, approved and sent back, plus bugs found and closed.',
    sheets: ['By Month'],
    build: async (ctx) => {
      const rows = monthKeys(12).map((k) => {
        const sub = ctx.rels.filter((r) => ym(r.date) === k); const app = ctx.rels.filter((r) => r.status === 'approved' && ym(r.qaCompletedAt || r.date) === k); const sb = ctx.rels.filter((r) => r.status === 'sent_back' && ym(r.statusChangedAt || r.date) === k);
        const found = ctx.bugsAll.filter((b) => ym(b.createdAt) === k);
        return { month: k, submitted: sub.length, approved: app.length, sentBack: sb.length, pass: pctOf(app.length, app.length + sb.length) === '' ? '' : `${pctOf(app.length, app.length + sb.length)}%`, bugs: found.length, critical: found.filter((b) => b.severity === 'critical').length, major: found.filter((b) => b.severity === 'major').length, verified: ctx.bugsAll.filter((b) => ym(b.verifiedAt) === k).length };
      });
      return {
        title: 'Monthly release quality report', source: 'releases + bugs', scope: 'Last 12 calendar months.',
        legend: [['Approval rate', 'Approved ÷ (approved + sent back) in that month']],
        sheets: [{ name: 'By Month', rows, columns: [col('Month', 'month', 10), col('Builds submitted', 'submitted'), col('Approved', 'approved'), col('Sent back', 'sentBack'), col('Approval rate', 'pass'), col('Bugs found', 'bugs'), col('Critical', 'critical'), col('Major', 'major'), col('Bugs confirmed fixed', 'verified')] }],
      };
    },
  },
  {
    key: 'wbs-progress', file: 'WBS_Progress_Report', title: 'WBS Progress',
    desc: 'Work breakdown completion per project, platform and module, every task, and platform milestone dates.',
    sheets: ['By Module', 'Tasks', 'Milestones'],
    build: async (ctx) => {
      const { items, targets } = await loadWbs(ctx);
      const byModule = []; const tasks = []; const milestones = [];
      ctx.projs.forEach((p) => {
        const its = items.filter((i) => i.projectId === p.id);
        const groups = {};
        its.filter((i) => i.type !== 'milestone').forEach((i) => { const k = `${i.platformType || 'General'}||${i.module || 'General'}`; (groups[k] = groups[k] || []).push(i); });
        Object.entries(groups).forEach(([k, arr]) => { const [platform, module] = k.split('||'); const c = (s) => arr.filter((i) => i.status === s).length; byModule.push({ project: p.name, platform, module, total: arr.length, notStarted: c('not_started'), inProgress: c('in_progress'), inQa: c('in_qa'), completed: c('completed'), blocked: c('blocked'), pct: `${pctOf(c('completed'), arr.length)}%`, est: arr.map((i) => i.estimatedCompletionDate).filter(Boolean).sort().pop() || '' }); });
        its.forEach((i) => tasks.push({ project: p.name, platform: i.platformType || '', module: i.module || '', task: i.title, type: i.type || 'task', status: WBS_STATUSES[i.status]?.label || i.status, priority: i.priority || '', assignee: ctx.name(i.assignedTo), est: i.estimatedCompletionDate || '', actual: d(i.actualCompletionDate), notes: (i.devComments || '').replace(/\s+/g, ' ').trim() }));
        const wh = computeProjectWbsHealth(its, targets.filter((t) => t.projectId === p.id), ctx.now);
        wh.byPlatform.forEach((pl) => milestones.push({ project: p.name, platform: pl.platform, pct: `${pl.pct}%`, done: `${pl.completed}/${pl.total}`, completion: pl.target?.completionDate || '', deployment: pl.target?.deploymentDate || '', risk: milestoneLabel(pl.risk).label }));
      });
      return {
        title: 'WBS progress report', source: 'wbs_items + wbs_platform_targets', scope: 'Every WBS-enabled project in scope.',
        legend: [['Progress', 'Completed ÷ all non-milestone tasks'], ['Milestone risk', 'On track / At risk / Overdue against the platform completion date']],
        sheets: [
          { name: 'By Module', rows: byModule, columns: [col('Project', 'project', 22), col('Platform', 'platform', 14), col('Module', 'module', 24), col('Tasks', 'total'), col('Not started', 'notStarted'), col('In progress', 'inProgress'), col('In QA', 'inQa'), col('Completed', 'completed'), col('Blocked', 'blocked'), col('Progress', 'pct'), col('Latest target date', 'est', 16)] },
          { name: 'Tasks', rows: tasks, columns: [col('Project', 'project', 22), col('Platform', 'platform', 14), col('Module', 'module', 24), col('Task', 'task', 40), col('Type', 'type', 10), col('Status', 'status', 14), col('Priority', 'priority', 10), col('Assignee', 'assignee', 20), col('Target date', 'est', 12), col('Completed on', 'actual', 12), col('Developer notes', 'notes', 40)] },
          { name: 'Milestones', rows: milestones, columns: [col('Project', 'project', 22), col('Platform', 'platform', 14), col('Progress', 'pct'), col('Done / total', 'done'), col('Completion date', 'completion', 14), col('Deployment date', 'deployment', 14), col('Risk', 'risk', 14)] },
        ],
      };
    },
  },
  {
    key: 'time-logs', file: 'Time_Log_Report', title: 'Time Logs',
    desc: 'Hours logged per person, project and task, with every entry.',
    sheets: ['By Person', 'By Project', 'Entries'],
    build: async (ctx) => {
      const [logs, { items }] = await Promise.all([loadTimeLogs(ctx), loadWbs(ctx)]);
      const itemTitle = (id) => items.find((i) => i.id === id)?.title || '';
      const done = logs.filter((l) => l.status === 'completed' && l.hours != null);
      const sum = (arr) => Math.round(arr.reduce((s, l) => s + l.hours, 0) * 100) / 100;
      const byPerson = ctx.people.map((p) => { const mine = done.filter((l) => l.userId === p.id); return { name: p.name, role: p.role, team: ctx.teamName(p.teamId), hours: sum(mine), entries: mine.length, projects: new Set(mine.map((l) => l.projectId)).size, timer: sum(mine.filter((l) => l.source === 'timer')), manual: sum(mine.filter((l) => l.source === 'manual')) }; }).filter((r) => r.entries).sort((a, b) => b.hours - a.hours);
      const byProject = ctx.projs.map((p) => { const mine = done.filter((l) => l.projectId === p.id); return { project: p.name, team: ctx.teamName(p.teamId), hours: sum(mine), entries: mine.length, people: new Set(mine.map((l) => l.userId)).size }; }).filter((r) => r.entries).sort((a, b) => b.hours - a.hours);
      const entries = [...done].sort((a, b) => (b.logDate || '').localeCompare(a.logDate || '')).map((l) => ({ date: l.logDate, name: ctx.name(l.userId), project: ctx.projName(l.projectId), task: itemTitle(l.wbsItemId), hours: l.hours, source: l.source, from: l.startedAt ? new Date(l.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '', to: l.endedAt ? new Date(l.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '', note: l.note || '' }));
      return {
        title: 'Time log report', source: 'time_logs + wbs_items', scope: 'Completed entries only (a running or paused timer has no hours yet).',
        notes: logs.length ? [] : ['No time logs found. If time logging has not been enabled yet, run the time_logs migration (fixes23).'],
        sheets: [
          { name: 'By Person', rows: byPerson, columns: [col('Name', 'name', 22), col('Role', 'role', 12), col('Team', 'team', 16), col('Hours', 'hours'), col('Entries', 'entries'), col('Projects', 'projects'), col('Timer hours', 'timer'), col('Manual hours', 'manual')] },
          { name: 'By Project', rows: byProject, columns: [col('Project', 'project', 22), col('Team', 'team', 16), col('Hours', 'hours'), col('Entries', 'entries'), col('People', 'people')] },
          { name: 'Entries', rows: entries, columns: [col('Date', 'date', 12), col('Name', 'name', 22), col('Project', 'project', 22), col('WBS task', 'task', 30), col('Hours', 'hours'), col('Source', 'source', 10), col('From', 'from', 8), col('To', 'to', 8), col('Note', 'note', 40)] },
        ],
      };
    },
  },
  {
    key: 'cycle-time', file: 'Cycle_Time_Report', title: 'Cycle Time',
    desc: 'How long each build waited before testing started, how long testing took, and the total — with per-project averages.',
    sheets: ['Per Build', 'Per Project'],
    build: async (ctx) => {
      const timed = ctx.rels.filter((r) => r.createdAt && r.qaCompletedAt);
      const perBuild = timed.map((r) => ({ project: ctx.projName(r.projectId), version: formatVersion(r.version), platform: r.platform, status: relStatus(r.status), submitted: dt(r.createdAt), assigned: dt(r.qaAssignedAt), done: dt(r.qaCompletedAt), wait: days(r.createdAt, r.qaAssignedAt), test: days(r.qaAssignedAt, r.qaCompletedAt), total: days(r.createdAt, r.qaCompletedAt), qa: ctx.name(r.assignedQa), dev: ctx.name(r.submittedById) })).sort((a, b) => (b.total || 0) - (a.total || 0));
      const perProject = ctx.projs.map((p) => { const rel = timed.filter((r) => r.projectId === p.id); const coh = rel.filter((r) => r.qaAssignedAt); return { project: p.name, builds: rel.length, wait: rel1(avgDaysBetween(coh, 'createdAt', 'qaAssignedAt')), test: rel1(avgDaysBetween(coh, 'qaAssignedAt', 'qaCompletedAt')), total: rel1(avgDaysBetween(rel, 'createdAt', 'qaCompletedAt')), slowest: rel.map((r) => days(r.createdAt, r.qaCompletedAt)).sort((a, b) => b - a)[0] ?? '' }; }).filter((r) => r.builds);
      return {
        title: 'Cycle time report', source: 'releases', scope: 'Builds with both a submission and a QA-completion timestamp.',
        legend: [['Wait (days)', 'Submission → QA picked it up'], ['Test (days)', 'QA started → QA finished'], ['Total (days)', 'Submission → QA finished']],
        sheets: [
          { name: 'Per Build', rows: perBuild, columns: [col('Project', 'project', 22), col('Version', 'version', 12), col('Platform', 'platform', 10), col('Status', 'status', 18), col('Submitted', 'submitted', 17), col('QA assigned', 'assigned', 17), col('QA done', 'done', 17), col('Wait (days)', 'wait'), col('Test (days)', 'test'), col('Total (days)', 'total'), col('QA', 'qa', 20), col('Developer', 'dev', 20)] },
          { name: 'Per Project', rows: perProject, columns: [col('Project', 'project', 22), col('Builds measured', 'builds'), col('Avg wait (days)', 'wait'), col('Avg test (days)', 'test'), col('Avg total (days)', 'total'), col('Slowest build (days)', 'slowest')] },
        ],
      };
    },
  },
  {
    key: 'carried-forward', file: 'Carried_Forward_Bugs_Report', title: 'Carried-Forward Bugs',
    desc: 'Problems that were not fixed on one build and moved to the next — and how many rounds they have taken.',
    sheets: ['Carried Bugs', 'By Project'],
    build: async (ctx) => {
      const carried = ctx.bugsAll.filter((b) => b.carriedForward);
      const rows = carried.map((b) => { const r = ctx.releaseById[b.releaseId]; const from = ctx.releaseById[b.carriedFromReleaseId]; return { title: b.title, project: ctx.projName(r?.projectId), current: r ? formatVersion(r.version) : '', from: from ? formatVersion(from.version) : '', iteration: b.iteration || 1, severity: sev(b.severity), status: bugStatus(b.status), reported: d(b.createdAt), developer: ctx.name(r?.submittedById) }; }).sort((a, b) => b.iteration - a.iteration);
      const byProject = ctx.projs.map((p) => { const ids = new Set(ctx.rels.filter((r) => r.projectId === p.id).map((r) => r.id)); const all = ctx.bugsAll.filter((b) => ids.has(b.releaseId)); const c = all.filter((b) => b.carriedForward); return { project: p.name, bugs: all.length, carried: c.length, rate: all.length ? `${pctOf(c.length, all.length)}%` : '', stillOpen: c.filter(isActiveBug).length, avgRounds: c.length ? rel1(c.reduce((s, b) => s + (b.iteration || 1), 0) / c.length) : '' }; }).filter((r) => r.bugs).sort((a, b) => b.carried - a.carried);
      return {
        title: 'Carried-forward bugs report', source: 'bugs + releases', scope: 'Bugs that moved from one build to a later one.',
        legend: [['Carry rate', 'Carried bugs ÷ all bugs on that project'], ['Rounds', 'How many builds the bug has been through']],
        sheets: [
          { name: 'Carried Bugs', rows, columns: [col('Title', 'title', 40), col('Project', 'project', 22), col('Current build', 'current', 12), col('Carried from', 'from', 12), col('Rounds', 'iteration'), col('Severity', 'severity', 10), col('Status', 'status', 22), col('First reported', 'reported', 12), col('Developer', 'developer', 20)] },
          { name: 'By Project', rows: byProject, columns: [col('Project', 'project', 22), col('Bugs', 'bugs'), col('Carried', 'carried'), col('Carry rate', 'rate'), col('Still open', 'stillOpen'), col('Avg rounds', 'avgRounds')] },
        ],
      };
    },
  },
  {
    key: 'resolutions', file: 'Bug_Resolutions_Report', title: 'Bug Resolutions',
    desc: 'Reports closed without a code change — not a bug, out of scope, duplicate, cannot reproduce — and who raised them.',
    sheets: ['Summary', 'Closed Without Fix'],
    build: async (ctx) => {
      const closedNoFix = ctx.bugsAll.filter((b) => BUG_RESOLUTIONS.includes(b.resolution));
      const summary = BUG_RESOLUTIONS.map((r) => ({ resolution: r, count: closedNoFix.filter((b) => b.resolution === r).length, share: ctx.bugsAll.length ? `${pctOf(closedNoFix.filter((b) => b.resolution === r).length, ctx.bugsAll.length)}%` : '' }));
      summary.push({ resolution: 'All closed without a code change', count: closedNoFix.length, share: ctx.bugsAll.length ? `${pctOf(closedNoFix.length, ctx.bugsAll.length)}%` : '' });
      const rows = closedNoFix.map((b) => { const r = ctx.releaseById[b.releaseId]; return { title: b.title, project: ctx.projName(r?.projectId), version: r ? formatVersion(r.version) : '', resolution: b.resolution, reporter: b.createdBy || ctx.name(b.createdById), closedBy: ctx.name(b.verifiedById || b.resolutionById), note: b.resolutionNote || '', reported: d(b.createdAt), closed: d(b.verifiedAt || b.resolutionAt) }; });
      return {
        title: 'Bug resolutions report', source: 'bugs', scope: 'Bugs in scope that were closed without a code change. A high share usually means requirements were unclear.',
        sheets: [
          { name: 'Summary', rows: summary, columns: [col('Resolution', 'resolution', 32), col('Count', 'count'), col('Share of all bugs', 'share')] },
          { name: 'Closed Without Fix', rows, columns: [col('Title', 'title', 40), col('Project', 'project', 22), col('Build', 'version', 12), col('Resolution', 'resolution', 18), col('Reported by', 'reporter', 20), col('Closed by', 'closedBy', 20), col('Reason given', 'note', 40), col('Reported on', 'reported', 12), col('Closed on', 'closed', 12)] },
        ],
      };
    },
  },
  {
    key: 'overdue-builds', file: 'Overdue_Builds_Report', title: 'Overdue Builds (SLA)',
    desc: 'Builds that have waited longer than the agreed limit at their current stage, and who is holding them.',
    sheets: ['Overdue & Approaching'],
    build: async (ctx) => {
      const rows = ctx.rels.filter((r) => isActiveStatus(r.status)).map((r) => ({ r, lvl: slaLevel(r.status, statusSince(r)) })).filter((x) => x.lvl).map(({ r, lvl }) => ({ project: ctx.projName(r.projectId), version: formatVersion(r.version), platform: r.platform, stage: relStatus(r.status), since: dt(r.statusChangedAt || r.createdAt), waiting: days(r.statusChangedAt || r.createdAt, new Date().toISOString()), limit: slaWord(lvl), qa: ctx.name(r.assignedQa) || 'Unassigned', dev: ctx.name(r.submittedById), openBugs: ctx.bugsAll.filter((b) => b.releaseId === r.id && isActiveBug(b)).length })).sort((a, b) => (b.waiting || 0) - (a.waiting || 0));
      return {
        title: 'Overdue builds report', source: 'releases + bugs', scope: 'Builds still in the QA pipeline that are past or approaching the time limit for their stage.',
        legend: [['Waiting (days)', 'Days in the current stage'], ['Limit', 'Overdue = past the agreed limit for that stage; Approaching = within the warning window']],
        sheets: [{ name: 'Overdue & Approaching', rows, columns: [col('Project', 'project', 22), col('Version', 'version', 12), col('Platform', 'platform', 10), col('Stage', 'stage', 18), col('In stage since', 'since', 17), col('Waiting (days)', 'waiting'), col('Limit', 'limit', 18), col('QA', 'qa', 20), col('Developer', 'dev', 20), col('Open bugs', 'openBugs')] }],
      };
    },
  },
];

/* ====================================================================== */
/* Settings → Reports                                                      */
/* ====================================================================== */
export function ReportsSection(props) {
  const { isAdmin, teams, showToast } = props;
  const [f, setF] = useState({ from: '', to: '', team: 'all' });
  const [busy, setBusy] = useState(null);
  const fSel = { ...inputStyle, width: 'auto', minHeight: 36, padding: '0 10px', fontSize: 12 };

  async function run(rep) {
    setBusy(rep.key);
    try {
      const ctx = makeCtx(props, f);
      const spec = await rep.build(ctx);
      downloadWorkbook(buildWorkbook({ ...spec, scope: `${spec.scope} ${ctx.scopeText}`.trim() }), rep.file);
      showToast?.(`${rep.title} exported`);
    } catch (e) {
      showToast?.(e?.message || 'Export failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 'var(--tracking-tight)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconChart size={17} /> Reports
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 3 }}>
            Departmental exports as clean Excel workbooks. Each opens with an About sheet (when it was generated, its source, scope and definitions), then one filterable sheet per table.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && (
            <select style={fSel} value={f.team} onChange={(e) => setF((s) => ({ ...s, team: e.target.value }))}>
              <option value="all">All teams</option>
              {(teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <input style={fSel} type="date" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} title="From" />
          <input style={fSel} type="date" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} title="To" />
          {(f.from || f.to || f.team !== 'all') && (
            <button style={{ ...ghostButton, minHeight: 36, padding: '0 12px' }} onClick={() => setF({ from: '', to: '', team: 'all' })}>Reset</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {REPORTS.map((rep) => (
          <div key={rep.key} className="mgr-card" style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{rep.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, flex: 1 }}>{rep.desc}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {rep.sheets.map((s) => <Pill key={s} label={s} tone="neutral" />)}
            </div>
            <button
              style={{ ...primaryButton(busy === rep.key), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              disabled={busy === rep.key}
              onClick={() => run(rep)}
            >
              {busy === rep.key ? 'Preparing…' : 'Export .xlsx'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
