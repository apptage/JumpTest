import * as XLSX from 'xlsx';

/* Format-agnostic WBS importer.

   The spreadsheet is NOT the source of truth for statuses/progress —
   the app manages those. We only extract:
     • Task Description
     • Estimated Date of Completion
   …and infer the hierarchy (Platform → Section/Module → Task, plus
   Milestones/Deliverables) from the *structure* of the sheet rather
   than from fixed column names.

   Heuristics (no fixed format assumed):
     - The description column = the column with the most text.
     - The estimated-date column = the column with the most date-like cells.
     - A row with only its description filled (a "lone label") is a header:
         · a Platform header if it reads like a platform/app/panel,
         · a Milestones/Deliverables header if it says so,
         · otherwise a Section/Module header.
     - A row that also carries a date (or other data) is a leaf Task —
       or a Milestone/Deliverable if it's under a milestones header or its
       name reads like a deliverable (completion, deployment, launch…).
   Section target dates are derived in the app from their child tasks. */

const norm = (v) => String(v ?? '').trim();
const lc = (v) => norm(v).toLowerCase();

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;

export function isDateLike(v) {
  const t = lc(v);
  if (!t) return false;
  if (MONTH_RE.test(t)) return true;
  // 2026-03-15 · 15/03/26 · 3.15.2026
  if (/\d{1,4}\s*[\/\-.]\s*\d{1,2}(\s*[\/\-.]\s*\d{1,4})?/.test(t)) return true;
  // Week 3 · Wk2 · Q2 · Phase 1 (relative targets teams use as "est completion")
  if (/\b(week|wk|q[1-4]|phase|sprint|month)\b/.test(t) && /\d/.test(t)) return true;
  return false;
}

// strip outline numbering / bullets: "1.2.3 ", "1) ", "- ", "• "
function cleanName(s) {
  return norm(s)
    .replace(/^[\s•\-*]+/, '')
    .replace(/^\d+(\.\d+)*[).]?\s+/, '')
    .trim();
}

const PLATFORM_RE =
  /\b(mobile app|web app|admin panel|admin dashboard|web ?site|website|web|mobile|android|ios|portal|dashboard|panel|backend|front[\s-]?end|api|cms|landing)\b/i;

function looksLikePlatform(name) {
  const words = norm(name).split(/\s+/).length;
  return words <= 5 && PLATFORM_RE.test(name);
}

const MILESTONE_RE =
  /\b(milestone|deliverable|completion|complete|deployment|deploy|launch|go[\s-]?live|golive|delivery|handover|hand[\s-]?off|uat|sign[\s-]?off|production release|go to market)\b/i;

const MILESTONE_HEADER_RE = /\b(milestone|deliverable)s?\b/i;

export async function parseWbsFile(file) {
  const buf = await file.arrayBuffer();
  // raw:false → cells come back as their displayed strings, so dates keep
  // whatever format the team used in the sheet ("15-Mar-2026", "Week 3"…).
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });
  if (!rows.length) return [];

  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);

  // --- pick the description + estimated-date columns by content ---
  const textCount = new Array(width).fill(0);
  const dateCount = new Array(width).fill(0);
  rows.forEach((r) => {
    for (let c = 0; c < width; c++) {
      const cell = norm(r[c]);
      if (!cell) continue;
      if (isDateLike(cell)) dateCount[c] += 1;
      else if (/[a-z]{3,}/i.test(cell)) textCount[c] += 1;
    }
  });
  let descCol = 0;
  for (let c = 1; c < width; c++) if (textCount[c] > textCount[descCol]) descCol = c;
  let estCol = -1;
  for (let c = 0; c < width; c++) {
    if (c === descCol) continue;
    if (dateCount[c] > 0 && (estCol < 0 || dateCount[c] > dateCount[estCol])) estCol = c;
  }

  // --- skip a header row if the first rows are obviously labels ---
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const d = lc(rows[i][descCol]);
    const e = lc(rows[i][estCol] ?? '');
    if (
      /\b(task|description|feature|module|item|activity|work|deliverable|requirement|screen)\b/.test(d) ||
      /\b(est|estimat|completion|due|target|deadline|eta|date)\b/.test(e) ||
      /\b(est|estimat|completion|due|target|deadline|eta|date)\b/.test(d)
    ) {
      start = i + 1;
      break;
    }
  }

  const get = (row, idx) => (idx >= 0 && idx < row.length ? norm(row[idx]) : '');

  let platform = null;
  let section = '';
  let milestoneMode = false;
  const tasks = [];
  const seen = new Map();

  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = cleanName(get(row, descCol));
    if (!name) continue;

    const est = get(row, estCol);
    const filled = row.filter((c) => norm(c)).length;
    const loneLabel = filled <= 1 && !est;

    if (loneLabel) {
      // a structural header row
      if (MILESTONE_HEADER_RE.test(name)) {
        milestoneMode = true;
        section = name;
        platform = null; // deliverables span platforms
      } else if (looksLikePlatform(name)) {
        platform = name;
        section = '';
        milestoneMode = false;
      } else {
        section = name;
        milestoneMode = false;
      }
      continue;
    }

    // a content row → Task, or Milestone/Deliverable
    const type = milestoneMode || MILESTONE_RE.test(name) ? 'milestone' : 'task';

    let key = `${platform || ''}|${section}|${name}`.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) {
      seen.set(key, seen.get(key) + 1);
      key = `${key}#${seen.get(key)}`;
    } else {
      seen.set(key, 0);
    }

    tasks.push({
      import_key: key,
      platform,
      section: section || (type === 'milestone' ? 'Milestones' : 'General'),
      type,
      name,
      est_date: est,
      position: tasks.length,
    });
  }

  return tasks;
}
