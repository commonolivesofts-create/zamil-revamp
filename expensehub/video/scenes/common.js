// Shared demo data (fictional people, sample amounts) and layout helpers for all scenes.
// Source of truth for features and terms: docs/ExpenseHub-Features-and-Process.docx.

export const CAST = {
  employee: { name: 'Omar Haddad', role: 'Employee · Sales, IPP' },
  lm1: { name: 'Khalid Nasser', role: 'Line Manager' },
  lm2: { name: 'Faisal Rahman', role: 'Line Manager · level 2' },
  fm: { name: 'Lina Saleh', role: 'Finance Manager' },
  acc: { name: 'Yousef Karim', role: 'Accountant' },
  ap: { name: 'Mona Ali', role: 'Finance AP' },
};

export const REPORT = 'EH-IPP-2026-000001';
export const SUPPLIER = { name: 'OMAR HADDAD', number: '20417', site: 'Main', bu: 'IPP BU' };
export const PAYMENT = { number: '104582', date: '30 Oct 2026' };

/** The report's three lines (sample amounts in SAR). Transport is reduced in the audit. */
export const LINES = [
  { type: 'Meal', icon: 'utensils', merchant: 'Najd Grill Restaurant', date: '12 Oct 2026', amount: 115, account: 'IPP.003.127.55201.000.0000000', receipt: 'receipt-meal.jpg' },
  { type: 'Transport', icon: 'car', merchant: 'Riyadh Ride Taxi', date: '13 Oct 2026', amount: 250, approved: 200, account: 'IPP.003.127.55204.000.0000000', receipt: 'receipt-taxi.jpg' },
  { type: 'Extra Expense', icon: 'briefcase', merchant: 'Office Mart', date: '13 Oct 2026', amount: 85, account: 'IPP.003.127.55202.000.0000000', receipt: 'receipt-office.pdf' },
];
export const TOTAL = LINES.reduce((s, l) => s + l.amount, 0); // 450
export const TOTAL_AFTER_AUDIT = LINES.reduce((s, l) => s + (l.approved ?? l.amount), 0); // 400

/** QR content of the meal receipt (fictional seller and VAT number). */
export const QR = { seller: 'Najd Grill Restaurant', vat: '310123456700003', total: 115, date: '12 Oct 2026' };

/** Centre (or fx/fy point) of an element in stage coordinates. */
export function pos(el, fx = 0.5, fy = 0.5) {
  const stage = document.querySelector('.stage').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return [r.left - stage.left + r.width * fx, r.top - stage.top + r.height * fy];
}

/** Lazily computed value (after the scene is laid out, before transforms are applied). */
export function lazy(fn) {
  let v;
  return () => (v ??= fn());
}
