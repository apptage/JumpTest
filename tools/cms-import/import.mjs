#!/usr/bin/env node
/* CMS project importer — standalone, temporary.

   node tools/cms-import/import.mjs template [file.xlsx] [--example]
   node tools/cms-import/import.mjs check  <file.xlsx> [--env staging|production]
   node tools/cms-import/import.mjs apply  <file.xlsx> [--env staging|production] [--yes]

   See tools/cms-import/README.md. Nothing in the app depends on this folder. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import {
  SHEETS, KINDS, REQUESTERS, CHANNELS, CATEGORIES, PRIORITIES, TASK_STATUSES,
  STAGES, STAGE_STATUSES, MEMBER_ROLES, LINK_CATEGORIES, KIND_ALIASES, categoryForNewDevelopment, DEFAULT_REQUESTER, REQUESTER_ALIASES, categorySuitsKind,
} from './schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/* ------------------------------------------------------------------ */
/* Template                                                            */
/* ------------------------------------------------------------------ */

const EXAMPLE = {
  Projects: [
    { project_name: 'Acme Bakery Website', cms_kind: 'website', team: '', brand: '' },
    { project_name: 'Acme CRM Sync', cms_kind: 'api_integration', team: '', brand: '' },
  ],
  Tasks: [
    { project_name: 'Acme Bakery Website', category: 'existing_changes', title: 'Update opening hours on the contact page', details: 'New hours from 1 Dec.', requested_by: 'am', channel: 'basecamp', reference_url: 'https://basecamp.com/example/123', assignee_email: '', priority: 'Medium', status: 'todo', due_date: '2026-12-01', requested_on: '2026-11-04' },
    { project_name: 'Acme Bakery Website', category: 'blogs', title: 'Upload November blog posts', details: '4 posts in the shared folder.', requested_by: 'seo', channel: 'group', reference_url: '', assignee_email: '', priority: 'Low', status: 'in_progress', due_date: '', requested_on: '' },
    { project_name: 'Acme CRM Sync', category: 'api_integration', title: 'Send contact form leads to the CRM', details: '', requested_by: 'pmo', channel: 'crm', reference_url: '', assignee_email: '', priority: 'High', status: 'todo', due_date: '', requested_on: '' },
  ],
  Journey: [
    { project_name: 'Acme Bakery Website', stage: 'template_selection', status: 'done', owner_email: '', due_date: '', notes: 'Client chose template B.' },
    { project_name: 'Acme Bakery Website', stage: 'landing_development', status: 'in_progress', owner_email: '', due_date: '2026-11-20', notes: '' },
  ],
  Members: [],
  Links: [
    { project_name: 'Acme Bakery Website', category: 'domain', title: 'Live website', url: 'https://acme-bakery.example.com', notes: '' },
    { project_name: 'Acme Bakery Website', category: 'staging', title: 'Staging', url: 'https://staging.acme-bakery.example.com', notes: '' },
  ],
};

function valuesText(values) {
  return Object.entries(values).map(([k, label]) => (k === label ? k : `${k} (${label})`)).join(', ');
}

export function buildTemplate({ example = false } = {}) {
  const wb = XLSX.utils.book_new();

  const intro = [
    ['CMS projects import'],
    [''],
    ['Fill one sheet per kind of data. Only Projects is needed to create projects; the other sheets are optional.'],
    ['Row 1 of each sheet holds the column names: do not rename or reorder them. Columns marked * are required.'],
    ['Values can be typed as the key (e.g. in_progress) or the label shown in the app (e.g. In progress).'],
    ['Rows on the other sheets link to a project by project_name: a project on the Projects sheet, or a CMS project already in the app.'],
    ['Importing the same file twice is safe: existing projects, tasks, members and links are not duplicated.'],
    ['Credentials (logins, passwords, keys) are NOT imported. Add them on the project’s Project info page.'],
    [''],
  ];
  for (const s of SHEETS) {
    intro.push([`Sheet: ${s.name}`], [s.about], ['Column', 'Required', 'Allowed values / notes']);
    for (const c of s.columns) {
      intro.push([c.key, c.req ? '*' : '', [c.values ? valuesText(c.values) : '', c.note || ''].filter(Boolean).join('  —  ')]);
    }
    intro.push(['']);
  }
  const ws = XLSX.utils.aoa_to_sheet(intro);
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Instructions');

  for (const s of SHEETS) {
    const header = s.columns.map((c) => c.key);
    const rows = example ? (EXAMPLE[s.name] || []).map((r) => header.map((h) => r[h] ?? '')) : [];
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    sheet['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 4, ...rows.map((r) => String(r[header.indexOf(h)] ?? '').length + 2)) }));
    XLSX.utils.book_append_sheet(wb, sheet, s.name);
  }
  return wb;
}

/* ------------------------------------------------------------------ */
/* Reading + validating the workbook (no database needed)             */
/* ------------------------------------------------------------------ */

const norm = (v) => String(v ?? '').trim();
const fold = (v) => norm(v).toLowerCase();
const foldKey = (v) => fold(v).replace(/[\s\-/]+/g, '_');

// accept a key or its label, any case
function choice(value, map) {
  const v = norm(value);
  if (!v) return { value: null };
  for (const [k, label] of Object.entries(map)) {
    const l = typeof label === 'string' ? label : label.label;
    if (fold(k) === fold(v) || foldKey(k) === foldKey(v) || fold(l) === fold(v)) return { value: k };
  }
  return { error: `"${v}" is not allowed. Use one of: ${Object.keys(map).join(', ')}` };
}

function dateCell(value) {
  if (value === null || value === undefined || norm(value) === '') return { value: null };
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return { error: `"${value}" is not a date` };
    return { value: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` };
  }
  const v = norm(value);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (!m) return { error: `"${v}" is not a date. Use YYYY-MM-DD` };
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return { error: `"${v}" is not a real date` };
  return { value: iso };
}

function urlCell(value) {
  const v = norm(value);
  if (!v) return { value: null };
  if (!/^https?:\/\/\S+$/i.test(v)) return { error: `"${v}" must start with http:// or https://` };
  return { value: v };
}

function emailCell(value) {
  const v = fold(value);
  if (!v) return { value: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { error: `"${norm(value)}" is not an email address` };
  return { value: v };
}

const SECRET_HINT = /\b(password|passwd|pwd|pass|secret|api[_ ]?key|token)\b\s*[:=]/i;

/* Reads the workbook into clean rows. Returns { data, errors, warnings };
   each error/warning names the sheet and spreadsheet row. */
export function readWorkbook(wb) {
  const errors = [];
  const warnings = [];
  const data = {};
  const converted = { kinds: 0, landing: 0, major: 0 };

  for (const s of SHEETS) {
    data[s.name] = [];
    const ws = wb.Sheets[s.name];
    if (!ws) {
      if (s.name === 'Projects') errors.push(`Sheet "Projects" is missing.`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    if (!rows.length) continue;
    const header = rows[0].map((h) => foldKey(h).replace(/\*$/, ''));
    const known = new Set(s.columns.map((c) => c.key));
    const unknown = header.filter((h) => h && !known.has(h));
    if (unknown.length) warnings.push(`${s.name}: ignoring unknown column(s) ${unknown.join(', ')}`);
    const missingReq = s.columns.filter((c) => c.req && !header.includes(c.key));
    if (missingReq.length) {
      errors.push(`${s.name}: missing required column(s) ${missingReq.map((c) => c.key).join(', ')}`);
      continue;
    }
    rows.slice(1).forEach((cells, i) => {
      const raw = {};
      header.forEach((h, j) => { if (known.has(h)) raw[h] = cells[j]; });
      if (Object.values(raw).every((v) => norm(v) === '')) return;
      const rowNo = i + 2; // spreadsheet row number
      const where = `${s.name} row ${rowNo}`;
      const rowErrors = [];
      for (const c of s.columns) if (c.req && norm(raw[c.key]) === '') rowErrors.push(`${c.key} is required`);
      const out = { _row: rowNo, _where: where };
      const take = (key, res) => { if (res.error) rowErrors.push(`${key}: ${res.error}`); else out[key] = res.value; };
      const text = (key) => { out[key] = norm(raw[key]) || null; };

      text('project_name');
      if (s.name === 'Projects') {
        const kindAlias = KIND_ALIASES[fold(raw.cms_kind)];
        if (kindAlias) converted.kinds += 1;
        take('cms_kind', choice(kindAlias ?? raw.cms_kind, KINDS));
        text('team');
        text('brand');
      } else if (s.name === 'Tasks') {
        let category = raw.category;
        if (foldKey(category) === 'new_development') {
          category = categoryForNewDevelopment(raw.title);
          converted[category === 'app_landing' ? 'landing' : 'major'] += 1;
        }
        take('category', choice(category, CATEGORIES));
        text('title');
        out.details = norm(raw.details);
        take('requested_by', choice(norm(raw.requested_by) === '' ? DEFAULT_REQUESTER : REQUESTER_ALIASES[fold(raw.requested_by)] ?? raw.requested_by, REQUESTERS));
        take('channel', choice(raw.channel, CHANNELS));
        take('reference_url', urlCell(raw.reference_url));
        take('assignee_email', emailCell(raw.assignee_email));
        take('priority', choice(raw.priority, PRIORITIES));
        take('status', choice(raw.status, TASK_STATUSES));
        take('due_date', dateCell(raw.due_date));
        take('requested_on', dateCell(raw.requested_on));
        const cat = CATEGORIES[out.category];
        if (cat && out.requested_by && !cat.requesters.includes(out.requested_by)) {
          rowErrors.push(`requested_by: ${cat.label} can only be requested by ${cat.requesters.join(' or ')}`);
        }
      } else if (s.name === 'Journey') {
        take('stage', choice(raw.stage, STAGES));
        take('status', choice(raw.status, STAGE_STATUSES));
        take('owner_email', emailCell(raw.owner_email));
        take('due_date', dateCell(raw.due_date));
        out.notes = norm(raw.notes);
      } else if (s.name === 'Members') {
        take('email', emailCell(raw.email));
        take('project_role', choice(raw.project_role, MEMBER_ROLES));
        take('support_expires_on', dateCell(raw.support_expires_on));
      } else if (s.name === 'Links') {
        take('category', choice(raw.category, LINK_CATEGORIES));
        text('title');
        take('url', urlCell(raw.url));
        out.notes = norm(raw.notes);
        if (SECRET_HINT.test(out.notes)) rowErrors.push('notes look like they contain a password or key. Add credentials on the Project info page instead');
      }
      if (rowErrors.length) rowErrors.forEach((e) => errors.push(`${where}: ${e}`));
      else data[s.name].push(out);
    });
  }

  if (converted.kinds) warnings.push(`Projects: ${converted.kinds} App Landing Page row(s) stored as website`);
  if (converted.landing + converted.major) {
    warnings.push(`Tasks: ${converted.landing + converted.major} new_development row(s) stored as app_landing (${converted.landing}) or major_functionality (${converted.major})`);
  }

  // duplicates inside the file
  const seen = new Map();
  for (const p of data.Projects) {
    const k = fold(p.project_name);
    if (seen.has(k)) errors.push(`${p._where}: "${p.project_name}" is already on ${seen.get(k)}`);
    else seen.set(k, p._where);
  }
  const dupCheck = (sheet, keyFn, label) => {
    const m = new Map();
    for (const r of data[sheet]) {
      const k = keyFn(r);
      if (m.has(k)) errors.push(`${r._where}: same ${label} as ${m.get(k)}`);
      else m.set(k, r._where);
    }
  };
  dupCheck('Tasks', (r) => [fold(r.project_name), r.category, fold(r.title)].join('|'), 'project, category and title');
  dupCheck('Journey', (r) => [fold(r.project_name), r.stage].join('|'), 'project and stage');
  dupCheck('Members', (r) => [fold(r.project_name), r.email].join('|'), 'project and email');
  dupCheck('Links', (r) => [fold(r.project_name), r.category, fold(r.title)].join('|'), 'project, category and title');

  return { data, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Planning against the database                                       */
/* ------------------------------------------------------------------ */

async function fetchAll(query, label) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) {
      const hint = /relation .* does not exist|schema cache/i.test(error.message)
        ? ' (has the migration that creates it been applied to this database?)' : '';
      throw new Error(`Could not read ${label}: ${error.message}${hint}`);
    }
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function fetchIn(db, table, column, ids, label) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    out.push(...await fetchAll(() => db.from(table).select('*').in(column, chunk), label));
  }
  return out;
}

/* Works out exactly what would be written. Never writes. */
export async function plan(db, data) {
  const errors = [];
  const warnings = [];

  const [projects, teams, brands, profiles] = await Promise.all([
    fetchAll(() => db.from('projects').select('id, name, type, team_id, brand_id, cms_kind').order('id'), 'projects'),
    fetchAll(() => db.from('teams').select('id, name').order('id'), 'teams'),
    fetchAll(() => db.from('brands').select('id, name').order('id'), 'brands'),
    fetchAll(() => db.from('profiles').select('id, email, name, role, team_id').order('id'), 'users'),
  ]);

  const byName = (list) => {
    const m = new Map();
    for (const x of list) {
      const k = fold(x.name);
      m.set(k, m.has(k) ? 'ambiguous' : x);
    }
    return m;
  };
  const projectByName = byName(projects);
  const teamByName = byName(teams);
  const brandByName = byName(brands);
  const profileByEmail = new Map(profiles.filter((p) => p.email).map((p) => [fold(p.email), p]));

  const lookup = (map, name, what, where) => {
    if (!name) return null;
    const hit = map.get(fold(name));
    if (!hit) { errors.push(`${where}: no ${what} named "${name}"`); return undefined; }
    if (hit === 'ambiguous') { errors.push(`${where}: more than one ${what} is named "${name}"`); return undefined; }
    return hit;
  };
  const person = (email, where, field) => {
    if (!email) return null;
    const p = profileByEmail.get(email);
    if (!p) { errors.push(`${where}: ${field} ${email} is not a user in the app`); return undefined; }
    return p;
  };

  // ---- projects ----
  const target = new Map(); // folded name -> { id|null, name, kind, team_id }
  const projectOps = [];
  for (const r of data.Projects) {
    const team = lookup(teamByName, r.team, 'team', r._where);
    const brand = lookup(brandByName, r.brand, 'brand', r._where);
    const existing = projectByName.get(fold(r.project_name));
    if (existing === 'ambiguous') { errors.push(`${r._where}: more than one project in the app is named "${r.project_name}"`); continue; }
    if (existing && existing.type !== 'cms') {
      errors.push(`${r._where}: "${r.project_name}" already exists as a ${existing.type} project, not CMS. Rename one of them`);
      continue;
    }
    if (existing) {
      const patch = {};
      if (r.cms_kind && r.cms_kind !== existing.cms_kind) patch.cms_kind = r.cms_kind;
      if (team && team.id !== existing.team_id) patch.team_id = team.id;
      if (brand && brand.id !== existing.brand_id) patch.brand_id = brand.id;
      projectOps.push({ op: Object.keys(patch).length ? 'update' : 'keep', id: existing.id, name: existing.name, patch, where: r._where });
      target.set(fold(r.project_name), { id: existing.id, name: existing.name, kind: patch.cms_kind || existing.cms_kind || 'website', team_id: patch.team_id ?? existing.team_id });
    } else {
      const row = { name: r.project_name, type: 'cms', platform: 'CMS', cms_kind: r.cms_kind || 'website', team_id: team?.id ?? null, ...(brand ? { brand_id: brand.id } : {}) };
      const ref = { id: null, name: r.project_name, kind: row.cms_kind, team_id: row.team_id };
      projectOps.push({ op: 'create', name: r.project_name, row, ref, where: r._where });
      target.set(fold(r.project_name), ref);
    }
  }
  // A name on another sheet that's on neither Projects nor the app gets a new project.
  // It takes the team when the Projects sheet uses just one, and is flagged in case it's a typo.
  const sheetTeams = [...new Set(data.Projects.map((r) => fold(r.team)).filter(Boolean))];
  const defaultTeam = sheetTeams.length === 1 ? teamByName.get(sheetTeams[0]) : null;
  const createMissingProject = (r) => {
    const tasks = data.Tasks.filter((t) => fold(t.project_name) === fold(r.project_name));
    const kind = tasks.length && tasks.every((t) => t.category === 'api_integration') ? 'api_integration' : 'website';
    const team = defaultTeam && defaultTeam !== 'ambiguous' ? defaultTeam : null;
    const row = { name: r.project_name, type: 'cms', platform: 'CMS', cms_kind: kind, team_id: team?.id ?? null };
    const ref = { id: null, name: r.project_name, kind, team_id: row.team_id };
    projectOps.push({ op: 'create', name: r.project_name, row, ref, where: r._where });
    target.set(fold(r.project_name), ref);
    warnings.push(`${r._where}: "${r.project_name}" isn't on the Projects sheet or in the app, so it will be created (${kind}, team ${team?.name || 'none'}). Check it isn't a typo`);
    return ref;
  };
  // rows on other sheets may also point at CMS projects already in the app
  const resolveProject = (r) => {
    const k = fold(r.project_name);
    if (target.has(k)) return target.get(k);
    const existing = projectByName.get(k);
    if (existing && existing !== 'ambiguous' && existing.type === 'cms') {
      const t = { id: existing.id, name: existing.name, kind: existing.cms_kind || 'website', team_id: existing.team_id };
      target.set(k, t);
      return t;
    }
    if (existing === 'ambiguous') errors.push(`${r._where}: more than one project in the app is named "${r.project_name}"`);
    else if (existing) errors.push(`${r._where}: "${r.project_name}" is a ${existing.type} project, not CMS`);
    else return createMissingProject(r);
    return null;
  };

  // pre-resolve so existing rows can be loaded in one go
  for (const sheet of ['Tasks', 'Journey', 'Members', 'Links']) for (const r of data[sheet]) r._project = resolveProject(r);
  const existingIds = [...new Set([...target.values()].map((t) => t.id).filter(Boolean))];
  const [tasks, stages, members, links] = existingIds.length
    ? await Promise.all([
      fetchIn(db, 'cms_tasks', 'project_id', existingIds, 'CMS tasks'),
      fetchIn(db, 'cms_stages', 'project_id', existingIds, 'CMS journey stages'),
      fetchIn(db, 'project_members', 'project_id', existingIds, 'project members'),
      fetchIn(db, 'project_resources', 'project_id', existingIds, 'project links'),
    ])
    : [[], [], [], []];
  const has = (list, keyFn) => new Set(list.map(keyFn));
  const taskByKey = new Map(tasks.map((t) => [[t.project_id, t.category, fold(t.title)].join('|'), t]));
  const stageByKey = new Map(stages.map((s) => [`${s.project_id}|${s.stage}`, s]));
  const memberKeys = has(members, (m) => `${m.project_id}|${m.user_id}`);
  const linkKeys = has(links, (l) => [l.project_id, l.category, fold(l.title)].join('|'));

  // ---- tasks ----
  const taskOps = [];
  for (const r of data.Tasks) {
    const p = r._project;
    const assignee = person(r.assignee_email, r._where, 'assignee');
    if (!p || assignee === undefined) continue;
    if (!categorySuitsKind(r.category, p.kind)) {
      errors.push(`${r._where}: category ${r.category} does not suit ${p.name} (${KINDS[p.kind]})`);
      continue;
    }
    const existingTask = p.id ? taskByKey.get([p.id, r.category, fold(r.title)].join('|')) : null;
    if (existingTask) {
      // the same task worked on by someone else: keep their details on it, once
      const block = assignee && r.details ? `${assignee.name || assignee.email}: ${r.details}` : '';
      const current = existingTask.details || '';
      if (block && assignee.id !== existingTask.assigned_to && !current.includes(block)) {
        taskOps.push({
          op: 'append', id: existingTask.id, project: p, title: r.title, where: r._where,
          by: assignee.name || assignee.email, details: current ? `${current}\n\n${block}` : block,
        });
      } else {
        taskOps.push({ op: 'skip', project: p, title: r.title, where: r._where });
      }
      continue;
    }
    taskOps.push({
      op: 'create', project: p, title: r.title, where: r._where,
      row: {
        category: r.category, title: r.title, details: r.details, requested_by: r.requested_by,
        channel: r.channel, reference_url: r.reference_url, assigned_to: assignee?.id ?? null,
        priority: r.priority, status: r.status || 'todo', due_date: r.due_date,
        ...(r.requested_on ? { created_at: `${r.requested_on}T09:00:00Z` } : {}),
      },
    });
  }

  // ---- journey ----
  const journeyOps = [];
  const journeyProjects = new Map();
  for (const r of data.Journey) {
    const p = r._project;
    const owner = person(r.owner_email, r._where, 'owner');
    if (!p || owner === undefined) continue;
    if (!journeyProjects.has(p)) journeyProjects.set(p, []);
    const patch = {};
    if (r.status) patch.status = r.status;
    if (owner) patch.owner_id = owner.id;
    if (r.due_date) patch.due_date = r.due_date;
    if (r.notes) patch.notes = r.notes;
    journeyProjects.get(p).push({ stage: r.stage, patch, where: r._where });
  }
  for (const [p, rows] of journeyProjects) {
    const missing = Object.keys(STAGES).filter((s) => !(p.id && stageByKey.has(`${p.id}|${s}`)));
    if (missing.length) journeyOps.push({ op: 'start', project: p, stages: missing });
    for (const r of rows) {
      const cur = p.id ? stageByKey.get(`${p.id}|${r.stage}`) : null;
      const changed = Object.fromEntries(Object.entries(r.patch).filter(([k, v]) => !cur || cur[k] !== v));
      if (Object.keys(changed).length) journeyOps.push({ op: 'update', project: p, stage: r.stage, patch: changed, where: r.where });
    }
  }

  // ---- members ----
  const memberOps = [];
  for (const r of data.Members) {
    const p = r._project;
    const u = person(r.email, r._where, 'user');
    if (!p || !u) continue;
    if (u.role === 'Admin') { warnings.push(`${r._where}: ${r.email} is an Admin and already sees every project; skipped`); continue; }
    if (p.id && memberKeys.has(`${p.id}|${u.id}`)) { memberOps.push({ op: 'skip', project: p, email: r.email, where: r._where }); continue; }
    const support = !p.team_id || u.team_id !== p.team_id;
    if (!support && r.support_expires_on) warnings.push(`${r._where}: ${r.email} is on the project's team, so support_expires_on is ignored`);
    memberOps.push({
      op: 'create', project: p, email: r.email, where: r._where,
      row: {
        user_id: u.id, project_role: r.project_role || 'developer', access_type: support ? 'support' : 'home',
        expires_at: support && r.support_expires_on ? `${r.support_expires_on}T23:59:59Z` : null,
      },
    });
  }

  // ---- links ----
  const linkOps = [];
  for (const r of data.Links) {
    const p = r._project;
    if (!p) continue;
    if (p.id && linkKeys.has([p.id, r.category, fold(r.title)].join('|'))) { linkOps.push({ op: 'skip', project: p, title: r.title, where: r._where }); continue; }
    linkOps.push({ op: 'create', project: p, title: r.title, where: r._where, row: { category: r.category, title: r.title, url: r.url, notes: r.notes } });
  }

  return { errors, warnings, projectOps, taskOps, journeyOps, memberOps, linkOps };
}

export function summarize(p) {
  const n = (ops, op) => ops.filter((o) => o.op === op).length;
  const lines = [
    `Projects: ${n(p.projectOps, 'create')} to create, ${n(p.projectOps, 'update')} to update, ${n(p.projectOps, 'keep')} unchanged`,
    `Tasks:    ${n(p.taskOps, 'create')} to create, ${n(p.taskOps, 'append')} to add details to, ${n(p.taskOps, 'skip')} already there`,
    `Journey:  ${n(p.journeyOps, 'start')} journey(s) to start, ${n(p.journeyOps, 'update')} stage(s) to update`,
    `Members:  ${n(p.memberOps, 'create')} to add, ${n(p.memberOps, 'skip')} already there`,
    `Links:    ${n(p.linkOps, 'create')} to create, ${n(p.linkOps, 'skip')} already there`,
  ];
  const detail = [];
  for (const o of p.projectOps) if (o.op !== 'keep') detail.push(`  ${o.op === 'create' ? '+' : '~'} project  ${o.name}${o.op === 'update' ? `  (${Object.keys(o.patch).join(', ')})` : ''}`);
  for (const o of p.taskOps) if (o.op === 'create') detail.push(`  + task     ${o.project.name}: ${o.title}`);
  for (const o of p.taskOps) if (o.op === 'append') detail.push(`  ~ task     ${o.project.name}: ${o.title} (adds details from ${o.by})`);
  for (const o of p.journeyOps) detail.push(o.op === 'start' ? `  + journey  ${o.project.name} (${o.stages.length} stages)` : `  ~ stage    ${o.project.name}: ${o.stage} (${Object.keys(o.patch).join(', ')})`);
  for (const o of p.memberOps) if (o.op === 'create') detail.push(`  + member   ${o.project.name}: ${o.email} (${o.row.project_role}, ${o.row.access_type})`);
  for (const o of p.linkOps) if (o.op === 'create') detail.push(`  + link     ${o.project.name}: ${o.title}`);
  return [...lines, ...(detail.length ? ['', 'Changes:', ...detail] : [])].join('\n');
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/* Applies a plan. Safe to re-run after a failure: anything already written
   is found again by name/title and skipped next time. */
export async function apply(db, p, log = () => {}) {
  const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

  for (const o of p.projectOps) {
    if (o.op === 'create') {
      const row = must(await db.from('projects').insert(o.row).select('id').single(), `Creating project ${o.name}`);
      o.ref.id = row.id; // the other ops hold this same object, so they pick up the id
      log(`created project ${o.name}`);
    } else if (o.op === 'update') {
      must(await db.from('projects').update(o.patch).eq('id', o.id), `Updating project ${o.name}`);
      log(`updated project ${o.name}`);
    }
  }
  const creates = (ops) => ops.filter((o) => o.op === 'create');
  const insertMany = async (table, ops, label) => {
    const rows = creates(ops).map((o) => ({ ...o.row, project_id: o.project.id }));
    for (let i = 0; i < rows.length; i += 200) must(await db.from(table).insert(rows.slice(i, i + 200)), `Adding ${label}`);
    if (rows.length) log(`added ${rows.length} ${label}`);
  };
  await insertMany('cms_tasks', p.taskOps, 'task(s)');
  const appends = p.taskOps.filter((o) => o.op === 'append');
  for (const o of appends) must(await db.from('cms_tasks').update({ details: o.details }).eq('id', o.id), `Adding details to ${o.title} on ${o.project.name}`);
  if (appends.length) log(`added details to ${appends.length} task(s)`);
  for (const o of p.journeyOps.filter((x) => x.op === 'start')) {
    must(await db.from('cms_stages').upsert(o.stages.map((stage) => ({ project_id: o.project.id, stage })), { onConflict: 'project_id,stage', ignoreDuplicates: true }), `Starting the journey for ${o.project.name}`);
  }
  for (const o of p.journeyOps.filter((x) => x.op === 'update')) {
    must(await db.from('cms_stages').update(o.patch).eq('project_id', o.project.id).eq('stage', o.stage), `Updating ${o.stage} for ${o.project.name}`);
  }
  if (p.journeyOps.length) log(`updated journeys`);
  await insertMany('project_members', p.memberOps, 'member(s)');
  await insertMany('project_resources', p.linkOps, 'link(s)');
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function connect(envName) {
  const file = join(ROOT, envName ? `.env.${envName}.local` : '.env.local');
  const env = { ...loadEnv(file), ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error(`No Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL in ${file} or SUPABASE_URL in the environment.`);
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Copy it from Supabase → Project Settings → API (service_role) and pass it for this command only, e.g.\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=... node tools/cms-import/import.mjs check data.xlsx --env staging\n' +
      'Do not save it in a file in the repo.',
    );
  }
  return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), url, file };
}

function readFile(path) {
  if (!path) throw new Error('Pass the workbook to import, e.g. node tools/cms-import/import.mjs check data.xlsx');
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false });
}

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flag = (f) => argv.includes(f);
  const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const [cmd, file] = args.filter((a) => a !== opt('--env'));
  const envName = opt('--env');
  if (envName && !['staging', 'production'].includes(envName)) throw new Error('--env must be staging or production');

  if (cmd === 'template') {
    const out = file || (flag('--example') ? 'cms-import-example.xlsx' : 'cms-import-template.xlsx');
    XLSX.writeFile(buildTemplate({ example: flag('--example') }), out);
    console.log(`Wrote ${out}`);
    return 0;
  }
  if (cmd !== 'check' && cmd !== 'apply') {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).join('\n').replace(/^\/\*|\*\/$/gm, ''));
    return cmd ? 1 : 0;
  }

  const { data, errors: fileErrors, warnings: fileWarnings } = readWorkbook(readFile(file));
  fileWarnings.forEach((w) => console.warn(`warning: ${w}`));
  if (fileErrors.length) {
    console.error(`\n${fileErrors.length} problem(s) in ${file}. Nothing was imported.\n`);
    fileErrors.forEach((e) => console.error(`  ✗ ${e}`));
    return 1;
  }

  const { db, url, file: envFile } = connect(envName);
  const host = new URL(url).host;
  console.log(`Database: ${host}  (from ${envFile.replace(`${ROOT}/`, '')})\n`);

  const p = await plan(db, data);
  p.warnings.forEach((w) => console.warn(`warning: ${w}`));
  if (p.errors.length) {
    console.error(`\n${p.errors.length} problem(s). Nothing was imported.\n`);
    p.errors.forEach((e) => console.error(`  ✗ ${e}`));
    return 1;
  }
  console.log(summarize(p));

  if (cmd === 'check') {
    console.log('\nCheck only. Nothing was written. Run "apply" to import.');
    return 0;
  }
  const nothing = [p.taskOps, p.memberOps, p.linkOps].every((ops) => !ops.some((o) => o.op === 'create' || o.op === 'append'))
    && !p.projectOps.some((o) => o.op !== 'keep') && !p.journeyOps.length;
  if (nothing) { console.log('\nNothing to import.'); return 0; }

  if (!flag('--yes')) {
    const ref = host.split('.')[0];
    if (!process.stdin.isTTY) throw new Error('Not a terminal: pass --yes to confirm the import.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nType "${ref}" to import into ${host}: `);
    rl.close();
    if (answer.trim() !== ref) { console.log('Cancelled. Nothing was written.'); return 1; }
  }
  await apply(db, p, (m) => console.log(`  ✓ ${m}`));
  console.log('\nImport finished.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}
