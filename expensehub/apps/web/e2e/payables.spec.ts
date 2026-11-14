// M7 Done-when (UI): READY → INVOICED (Payables screen) → PAID (Fusion simulator panel);
// a mock 400 shows on the Errors tab with Retry.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';

const H = { 'X-Requested-With': 'ExpenseHub' };
const RECEIPT = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'docs',
  'samples',
  'zatca-receipt.png',
);
const HOLDER: Record<string, string> = {
  'Majed Al-Anazi': 'Majed',
  'Khalid Al-Harbi': 'Khalid',
  'Noura Al-Dosari': 'Noura',
  'Faisal Al-Qahtani': 'Faisal',
  'Omar Al-Shehri': 'Omar',
};

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page
    .getByTestId('dev-quick-login')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name.split(' ')[0]!);
  return page;
}

async function call(page: Page, method: 'GET' | 'POST', url: string, data?: unknown) {
  const res = await page.request.fetch(url, { method, headers: H, data });
  expect(res.ok(), `${method} ${url} → ${res.status()} ${await res.text()}`).toBe(true);
  return res.status() === 204 ? null : res.json();
}

/** A clean claim with a receipt, approved (and released if the random sample picks it). */
async function readyReport(browser: Browser, ahmed: Page, purpose: string) {
  const types = await call(ahmed, 'GET', '/api/v1/ref/expense-types');
  const typeId = types.items.find((t: { typeCode: string }) => t.typeCode === 'AIRFARE').typeId;
  const up = await ahmed.request.post('/api/v1/receipts', {
    headers: H,
    multipart: {
      file: { name: 'boarding.png', mimeType: 'image/png', buffer: readFileSync(RECEIPT) },
    },
  });
  const receiptId = (await up.json()).receiptId;
  const expense = await call(ahmed, 'POST', '/api/v1/expenses', {
    typeId,
    expenseDate: '2026-10-10',
    merchant: purpose,
    description: 'Flight to Jubail',
    attendees: null,
    justification: 'Customer visit',
    amount: '640',
    currency: 'SAR',
    quantity: null,
    tripId: null,
    quickPayId: null,
    costCenter: null,
    taxInvoice: false,
    receiptId,
  });
  let report = await call(ahmed, 'POST', '/api/v1/reports', {
    purpose,
    expenseIds: [expense.expenseId],
  });
  report = await call(ahmed, 'POST', `/api/v1/reports/${report.reportId}/submit`, {
    version: report.version,
  });
  const pages = new Map<string, Page>();
  while (report.status === 'PENDING_APPROVAL' || report.status === 'PENDING_AUDIT') {
    const step = report.steps.find((s: { status: string }) => s.status === 'PENDING');
    const who = HOLDER[step.assigneeName]!;
    if (!pages.has(who)) pages.set(who, await signIn(browser, who));
    const page = pages.get(who)!;
    report =
      report.status === 'PENDING_AUDIT'
        ? await call(page, 'POST', `/api/v1/audit/${report.reportId}/release`, {})
        : await call(page, 'POST', `/api/v1/approvals/${step.stepId}/approve`, {});
  }
  expect(report.status).toBe('READY_FOR_PAYMENT');
  return report as { reportId: number; reportNumber: string };
}

test('send to Payables, pay it in the simulator, retry a 400', async ({ browser }) => {
  test.setTimeout(120_000);
  const tag = Date.now().toString().slice(-6);
  const ahmed = await signIn(browser, 'Ahmed');
  const first = await readyReport(browser, ahmed, `Payables trip ${tag}`);
  const second = await readyReport(browser, ahmed, `Payables retry ${tag}`);

  // Finance AP: Ready → select → Send to Payables (confirm with count and total).
  const tariq = await signIn(browser, 'Tariq');
  await tariq.goto('/finance/payables');
  await tariq.getByRole('checkbox', { name: `Select ${first.reportNumber}` }).check();
  await expect(tariq.getByText('1 report selected')).toBeVisible();
  await tariq.getByRole('button', { name: 'Send to Payables' }).click();
  const confirm = tariq.getByRole('dialog', { name: 'Send 1 report to Payables?' });
  await expect(confirm).toContainText('SAR 640.00');
  await confirm.getByRole('button', { name: 'Send to Payables' }).click();
  await expect(tariq.getByText('1 invoice created in Fusion')).toBeVisible();

  await tariq.getByRole('tab', { name: /Invoiced/ }).click();
  const invoicedRow = tariq
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: first.reportNumber });
  await expect(invoicedRow).toContainText('Not validated');
  await expect(invoicedRow.getByRole('link', { name: 'Open in Fusion test pod' })).toHaveAttribute(
    'href',
    /iaeskf-test\.fa\.ocs\.oraclecloud\.com/,
  );

  // Dev Fusion simulator: pay it; the status sync runs at once.
  await tariq.goto('/dev/fusion');
  const mockRow = tariq
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: first.reportNumber });
  await expect(mockRow).toContainText('1 line · 1 attachment');
  await mockRow.getByRole('button', { name: `Pay ${first.reportNumber}` }).click();
  await expect(tariq.getByText('Invoice paid')).toBeVisible();
  await expect(mockRow).toContainText('ExpenseHub report · PAID');

  await tariq.goto('/finance/payables?tab=PAID');
  await expect(
    tariq.getByRole('main').getByRole('listitem').filter({ hasText: first.reportNumber }),
  ).toContainText(/Payment PAY-2026-\d{6}/);

  // A mock 400 → Errors tab → Retry.
  await tariq.goto('/dev/fusion');
  await tariq.getByRole('button', { name: 'Fail with 400' }).click();
  await expect(tariq.getByText('The next invoice send will fail with HTTP 400')).toBeVisible();
  await tariq.goto('/finance/payables');
  await tariq.getByRole('checkbox', { name: `Select ${second.reportNumber}` }).check();
  await tariq.getByRole('button', { name: 'Send to Payables' }).click();
  await tariq.getByRole('dialog').getByRole('button', { name: 'Send to Payables' }).click();
  await expect(tariq.getByText('1 report could not be sent — see Errors')).toBeVisible();
  await tariq.getByRole('tab', { name: /Errors/ }).click();
  const errorRow = tariq
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: second.reportNumber });
  await expect(errorRow).toContainText('Fusion HTTP 400');
  await errorRow.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(tariq.getByText('1 invoice created in Fusion')).toBeVisible();
  await tariq.getByRole('tab', { name: /Invoiced/ }).click();
  await expect(
    tariq.getByRole('main').getByRole('listitem').filter({ hasText: second.reportNumber }),
  ).toBeVisible();

  // The claimant sees the Fusion invoice and payment on the report.
  await ahmed.goto(`/reports/${first.reportId}`);
  const drawer = ahmed.getByRole('dialog');
  await expect(drawer.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(drawer.getByTestId('fusion-info')).toContainText(first.reportNumber);
  await expect(drawer.getByTestId('fusion-info')).toContainText(/PAY-2026-\d{6}/);
});
