import * as XLSX from 'xlsx';

/* Parse an Excel/CSV WBS into a flat list of tasks.
   Best-effort auto-detection of columns + platform/section/milestone
   hierarchy; works for numbered feature lists and module-based sheets. */

const norm = (v) => String(v ?? '').trim();
const lc = (v) => norm(v).toLowerCase();

export function normalizeStatus(v) {
  const s = lc(v);
  if (!s) return 'not_started';
  if (s.includes('complete') || s === 'done' || s.includes('done')) return 'complete';
  if (s.includes('qa')) return 'in_qa';
  if (s.includes('progress') || s.includes('wip') || s.includes('ongoing') || s.includes('integrat'))
    return 'in_progress';
  if (s.includes('not started') || s === 'na' || s === 'n/a' || s === 'pending') return 'not_started';
  return 'not_started';
}

function detectColumns(rows) {
  // scan the first rows for the header
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = rows[i].map(lc);
    const find = (re) => cells.findIndex((c) => re.test(c));
    const desc = find(/task|description|feature|module|item|deliverable|screen|requirement/);
    const backend = find(/back[\s-]?end|backend|^api| api|server/);
    const frontend = find(/front[\s-]?end|frontend|integration|^ui| ui|client/);
    const est = find(/estimat|completion|eta|target|due|date/);
    const comments = find(/comment|note|remark/);
    const score = [desc, backend, frontend, est].filter((x) => x >= 0).length;
    if (score >= 2 && desc >= 0) {
      return { header: i, desc, backend, frontend, est, comments };
    }
  }
  // fallback: assume first column is the description
  return { header: -1, desc: 0, backend: -1, frontend: -1, est: -1, comments: -1 };
}

const PLATFORM_RE = /^(mobile app|mobile|web app|web|android|ios)$/i;

function platformOf(text) {
  const s = lc(text);
  if (/mobile|android|ios/.test(s)) return 'Mobile';
  if (/\bweb\b/.test(s)) return 'Web';
  return null;
}

export async function parseWbsFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) return [];

  const col = detectColumns(rows);
  const get = (row, idx) => (idx >= 0 && idx < row.length ? norm(row[idx]) : '');

  let platform = null;
  let section = '';
  let inMilestones = false;
  const tasks = [];
  const seen = new Map();

  for (let i = col.header + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const desc = get(row, col.desc);
    if (!desc) continue;

    const backendRaw = get(row, col.backend);
    const frontendRaw = get(row, col.frontend);
    const est = get(row, col.est);
    const comments = get(row, col.comments);
    const hasStatus = backendRaw || frontendRaw || est;

    // platform header row (e.g. "Mobile App", "Web")
    if (!hasStatus && PLATFORM_RE.test(desc)) {
      platform = platformOf(desc) || platform;
      section = '';
      inMilestones = false;
      continue;
    }

    // milestones / deliverables section
    if (!hasStatus && /milestone|deliverable/i.test(desc)) {
      inMilestones = true;
      section = desc;
      continue;
    }

    // section / module header: a row with a name but no status columns
    if (!hasStatus && !comments) {
      section = desc.replace(/^\s*\d+(\.\d+)*[).]?\s*/, '').trim() || desc;
      inMilestones = /milestone|deliverable/i.test(desc);
      continue;
    }

    const type = inMilestones || /completion|deployment|milestone/i.test(desc) ? 'milestone' : 'task';

    let key = `${platform || ''}|${section}|${desc}`.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) {
      seen.set(key, seen.get(key) + 1);
      key = `${key}#${seen.get(key)}`;
    } else {
      seen.set(key, 0);
    }

    tasks.push({
      import_key: key,
      platform,
      section,
      type,
      name: desc,
      dev_comments: comments,
      backend_status: normalizeStatus(backendRaw),
      frontend_status: normalizeStatus(frontendRaw),
      est_date: est,
      position: tasks.length,
    });
  }

  return tasks;
}
