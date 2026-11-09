// M6 smoke: a SAR 6,000 claim is selected for audit after its approvals; the Accountant adjusts
// a line in the workspace (totals + journal update), releases it; the claimant sees the result.
import { expect, test, type Browser, type Page } from '@playwright/test';

const H = { 'X-Requested-With': 'ExpenseHub' };

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

async function json(page: Page, method: 'GET' | 'POST', url: string, data?: unknown) {
  const res = await page.request.fetch(url, { method, headers: H, data });
  expect(res.ok(), `${method} ${url} → ${res.status()}`).toBe(true);
  return res.json();
}

test('selected for audit → adjust a line → release', async ({ browser }) => {
  test.setTimeout(90_000);
  const tag = Date.now().toString().slice(-6);
  const purpose = `Audit trip ${tag}`;

  // Claimant: two airfare lines (SAR 6,000 > the SAR 3,000 audit threshold), submitted.
  const ahmed = await signIn(browser, 'Ahmed');
  const types = await json(ahmed, 'GET', '/api/v1/ref/expense-types');
  const typeId = types.items.find((t: { typeCode: string }) => t.typeCode === 'AIRFARE').typeId;
  const ids: number[] = [];
  for (const [merchant, amount] of [
    [`Saudia ${tag}`, '4000'],
    [`flynas ${tag}`, '2000'],
  ]) {
    const e = await json(ahmed, 'POST', '/api/v1/expenses', {
      typeId,
      expenseDate: '2026-10-10',
      merchant,
      description: 'Flight to Jubail',
      attendees: null,
      justification: 'Customer visit',
      amount,
      currency: 'SAR',
      quantity: null,
      tripId: null,
      quickPayId: null,
      costCenter: null,
      taxInvoice: false,
      receiptId: null,
    });
    ids.push(e.expenseId);
  }
  let report = await json(ahmed, 'POST', '/api/v1/reports', { purpose, expenseIds: ids });
  report = await json(ahmed, 'POST', `/api/v1/reports/${report.reportId}/submit`, {
    version: report.version,
  });

  // D-49: Line Manager → their manager (top of HCM) → Finance Manager approve through the API.
  for (const name of ['Majed', 'Khalid', 'Faisal']) {
    const approver = await signIn(browser, name);
    const inbox = await json(approver, 'GET', '/api/v1/approvals/inbox');
    const item = inbox.items.find((i: { reportId: number }) => i.reportId === report.reportId);
    await json(approver, 'POST', `/api/v1/approvals/${item.stepId}/approve`, {});
  }

  // Accountant: the audit queue → workspace.
  const omar = await signIn(browser, 'Omar');
  await omar.goto('/audit');
  const row = omar.getByRole('main').getByRole('link').filter({ hasText: purpose });
  await expect(row).toContainText('Large total');
  await row.click();
  await expect(omar.getByRole('heading', { level: 1 })).toHaveText(report.reportNumber);
  await expect(omar.getByText('Selected because')).toBeVisible();

  const line = omar.getByRole('listitem').filter({ hasText: `Saudia ${tag}` });
  await line.getByLabel('Approved (SAR)').fill('3000');
  await line.getByLabel('Reason').fill('Economy fare only');
  await line.getByRole('button', { name: 'Adjust' }).click();
  await expect(omar.getByText('Line adjusted — the claimant has been told')).toBeVisible();
  await expect(omar.getByTestId('approved-total')).toHaveText('SAR 5,000.00');
  await expect(omar.getByTestId('journal-dr')).toHaveText('SAR 5,000.00');
  await expect(omar.getByTestId('journal-cr')).toHaveText('SAR 5,000.00');
  await expect(omar.getByText('Balanced')).toBeVisible();

  await omar.getByRole('button', { name: 'Release for payment' }).click();
  await omar.getByRole('dialog').getByRole('button', { name: 'Release for payment' }).click();
  await expect(omar.getByText('Released — ready for payment')).toBeVisible();
  await expect(omar).toHaveURL(/\/audit$/);

  // Claimant: ready for payment, the cut is visible, the journal is in the drawer.
  await ahmed.goto(`/reports/${report.reportId}`);
  const drawer = ahmed.getByRole('dialog');
  await expect(drawer.getByText('Ready for payment')).toBeVisible();
  await expect(drawer.getByTestId('report-net')).toHaveText('SAR 5,000.00');
  await expect(drawer.getByText('SAR 3,000.00')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Accounting preview' }).click();
  await expect(
    drawer.getByText('Preview — Oracle Fusion creates the accounting.', { exact: false }),
  ).toBeVisible();
  await drawer.getByRole('tab', { name: 'History' }).click();
  await expect(drawer.getByText('Line amount adjusted')).toBeVisible();
});
