import * as XLSX from 'xlsx';

/* WBS spreadsheet reader — format-agnostic.

   Import is a bulk-migration path only (the WBS Builder is primary). We do NOT
   assume fixed columns: we return the raw grid (a detected header row + data
   rows) and let the import wizard map columns → fields (Title, Module, Platform
   Type, Description, Estimated Date, Priority, Status). Only Title is required. */

/* Bulk text parser — turn a pasted list / outline into flat WBS items.

   Rules (documented in the Bulk Add modal):
     • `# Name`            → sets the Platform Type (and resets the module)
     • `## Name` / deeper  → sets the Module
     • any other line      → an item under the current platform/module
     • leading bullets (`-  *  •  1.  1)`) are stripped from the title
   `defaultPlatform` / `defaultModule` seed the context, so a plain flat list
   (no headers) becomes items under those defaults. */
export function parseWbsBulk(text, { defaultPlatform = '', defaultModule = '' } = {}) {
  const items = [];
  let platform = (defaultPlatform || '').trim();
  let module = (defaultModule || '').trim();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      if (h[1].length === 1) {
        platform = h[2].trim();
        module = (defaultModule || '').trim();
      } else {
        module = h[2].trim();
      }
      continue;
    }
    const title = line.replace(/^([-*•]|\d+[.)])\s+/, '').trim();
    if (!title) continue;
    items.push({ platform_type: platform, module: module || 'General', title });
  }
  return items;
}

export async function parseWbsFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (!grid.length) return { headers: [], rows: [] };

  const filledCount = (r) => (r || []).filter((c) => String(c ?? '').trim()).length;
  // header = the widest non-empty row within the first few (usually row 0)
  let headerIdx = 0;
  for (let i = 1; i < Math.min(grid.length, 5); i++) {
    if (filledCount(grid[i]) > filledCount(grid[headerIdx])) headerIdx = i;
  }
  const width = grid.reduce((w, r) => Math.max(w, (r || []).length), 0);
  const headers = Array.from({ length: width }, (_, c) => String(grid[headerIdx]?.[c] ?? '').trim() || `Column ${c + 1}`);
  const rows = grid.slice(headerIdx + 1).filter((r) => filledCount(r) > 0);
  return { headers, rows };
}
