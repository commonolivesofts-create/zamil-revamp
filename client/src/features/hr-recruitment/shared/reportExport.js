import { isValidElement } from "react";
import { INSIGHT_TEXT as T } from "../hrRecruitmentText.js";
import { toCsv, withBom } from "../report/periodwiseModel.js";
import { businessToday } from "./hrFormat.js";

// Shared CSV and PDF export of the HR report tables.
//   columns: [{ label, value(row) → text }] for every export.

const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 200;

// Every row of a list query, read page by page at the server's largest page size.
export async function loadAllRows(list, query) {
  const rows = [];
  for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
    const result = await list({ ...query, page, limit: EXPORT_PAGE_SIZE });
    rows.push(...result.items);
    if (!result.pagination.hasNextPage) return rows;
  }
  throw new Error(T.exportTooLarge);
}

// The visible text of a rendered cell (strings, numbers and element children; icons add nothing).
export function cellText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).filter(Boolean).join(" ").trim();
  if (isValidElement(node)) return cellText(node.props.children);
  return "";
}

const text = (value) => (value === null || value === undefined ? "" : String(value));

export function downloadCsv(rows, columns, fileName) {
  const csv = toCsv(rows, columns.map((column) => ({ label: column.label, value: (row) => text(column.value(row)) })));
  const url = URL.createObjectURL(new Blob([withBom(csv)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}_${businessToday()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeHtml = (value) =>
  text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Opens the rows as a print-ready table; the browser's print dialog saves it as PDF.
export function printPdf(rows, columns, title) {
  const view = window.open("", "_blank");
  if (!view) throw new Error(T.popupBlocked);
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}</tr>`)
    .join("");
  view.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
body { font: 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 0; }
h1 { font-size: 16px; margin: 0 0 2px; }
p { margin: 0 0 10px; color: #555; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #f1f3f5; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(T.exportedOn(businessToday(), rows.length))}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
  view.document.close();
  view.focus();
  view.print();
}
