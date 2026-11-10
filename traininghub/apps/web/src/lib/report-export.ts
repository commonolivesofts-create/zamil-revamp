type ExportColumn<T> = { label: string; value: (row: T) => unknown };

const plainText = (value: unknown) => (value == null ? '' : String(value));
const escapeHtml = (value: unknown) =>
  plainText(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  );

/** Export the full filtered result set, independent of the currently visible page. */
export function downloadCsv<T>(rows: T[], columns: ExportColumn<T>[], fileName: string) {
  const quote = (value: unknown) => `"${plainText(value).replace(/"/g, '""')}"`;
  const csv = [
    columns.map((column) => quote(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => quote(column.value(row))).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a print-ready report; the browser print dialog can save the report as PDF. */
export function printPdf<T>(rows: T[], columns: ExportColumn<T>[], title: string) {
  const view = window.open('', '_blank');
  if (!view) throw new Error('Allow pop-ups to print this report.');
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`)
    .join('');
  view.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font:11px/1.45 Arial,sans-serif;color:#18231d}h1{font-size:18px;margin:0 0 4px}p{color:#617067;margin:0 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d9e2dc;padding:6px;text-align:left;vertical-align:top}th{background:#eaf3ed;color:#245e40}thead{display:table-header-group}tr{break-inside:avoid}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${rows.length} skills · Exported ${new Date().toLocaleDateString()}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
  view.document.close();
  view.focus();
  view.print();
}
