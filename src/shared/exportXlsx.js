/* Excel export in the house report format (see QA_Workload_Report_*.xlsx):
     Sheet 1 "About"  — title · Generated · Source · Scope · Definitions · Notes
     Sheets 2..n      — one header row, plain values, autofilter over the table,
                        sensible column widths, no merged cells.
   Uses the same `xlsx` package the WBS importer already depends on. */
import * as XLSX from 'xlsx';

const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

/* spec = {
     title, source, scope,
     legend?: [[term, meaning], …],
     notes?:  [string, …],
     sheets:  [{ name, columns: [{ header, key | (row)=>value, width? }], rows: [obj, …] }, …]
   } */
export function buildWorkbook(spec) {
  const wb = XLSX.utils.book_new();

  const about = [
    [`Miaro Verify — ${spec.title}`, ''],
    ['Generated', new Date().toISOString()],
    ['Source', spec.source || ''],
    ['Scope', spec.scope || ''],
    ['', ''],
  ];
  if (spec.legend?.length) {
    about.push(['Definitions', '']);
    spec.legend.forEach(([k, v]) => about.push([k, v]));
    about.push(['', '']);
  }
  if (spec.notes?.length) {
    about.push(['Notes', '']);
    spec.notes.forEach((n) => about.push([n, '']));
  }
  const aws = XLSX.utils.aoa_to_sheet(about);
  aws['!cols'] = [{ wch: 36 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, aws, 'About');

  (spec.sheets || []).forEach(({ name, columns, rows }) => {
    const header = columns.map((c) => c.header);
    const data = (rows || []).map((r) =>
      columns.map((c) => {
        const v = typeof c.key === 'function' ? c.key(r) : r[c.key];
        return v == null ? '' : v;
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!cols'] = columns.map((c) => ({ wch: c.width || Math.min(48, Math.max(12, String(c.header).length + 2)) }));
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, data.length), c: Math.max(0, columns.length - 1) } }),
    };
    XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 31)); // Excel caps sheet names at 31
  });
  return wb;
}

export function downloadWorkbook(wb, baseName) {
  XLSX.writeFile(wb, `${baseName}_${today()}.xlsx`);
}
