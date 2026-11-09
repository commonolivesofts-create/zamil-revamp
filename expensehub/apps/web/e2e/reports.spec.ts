// M5 smoke: report → submit → line manager approves from the inbox → HR rejects with a reason →
// the claimant sees why and corrects it; and the "more information" round trip (OQ-06).
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

/** Two airfare lines through the API (the capture screen has its own e2e). */
async function twoExpenses(page: Page, tag: string): Promise<void> {
  const types = await (await page.request.get('/api/v1/ref/expense-types', { headers: H })).json();
  const airfare = types.items.find((t: { typeCode: string }) => t.typeCode === 'AIRFARE').typeId;
  for (const [merchant, amount] of [
    [`Saudia ${tag}`, '300'],
    [`flynas ${tag}`, '200'],
  ]) {
    const res = await page.request.post('/api/v1/expenses', {
      headers: H,
      data: {
        typeId: airfare,
        expenseDate: '2026-10-10',
        merchant,
        description: 'Flight to the Jubail plant',
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
      },
    });
    expect(res.status()).toBe(201);
  }
}

async function createAndSubmit(page: Page, tag: string, purpose: string) {
  await twoExpenses(page, tag);
  await page.goto('/expenses');
  for (const merchant of [`Saudia ${tag}`, `flynas ${tag}`]) {
    await page.getByRole('checkbox', { name: new RegExp(`Select ${merchant}`) }).check();
  }
  await page.getByRole('button', { name: 'Create report' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Business purpose').fill(purpose);
  await dialog.getByRole('button', { name: 'Create report' }).click();

  // The drawer is titled "Draft report" until submit assigns the EH number (OQ-19).
  await expect(page.getByRole('dialog', { name: 'Draft report' })).toBeVisible();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByTestId('report-net')).toHaveText('SAR 500.00');
  await drawer.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Submitted for approval')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /^EH-IPP-2026-\d{6}$/ })).toBeVisible();
  await expect(drawer.getByText('In approval')).toBeVisible();
  await expect(drawer.getByText(/With Majed Al-Anazi \(Line Manager\)/)).toBeVisible();
}

test('submit, approve from the inbox, reject with a reason, correct', async ({ browser }) => {
  const tag = Date.now().toString().slice(-6);
  const purpose = `Jubail visit ${tag}`;

  const ahmed = await signIn(browser, 'Ahmed');
  await createAndSubmit(ahmed, tag, purpose);

  // Line manager: inline approve in the inbox (no flags on these lines).
  const majed = await signIn(browser, 'Majed');
  await majed.goto('/approvals');
  const row = majed.getByRole('listitem').filter({ hasText: purpose });
  await expect(row).toContainText('SAR 500.00');
  await row.getByRole('button', { name: /^Approve/ }).click();
  await expect(majed.getByText('1 report approved')).toBeVisible();
  await expect(majed.getByRole('listitem').filter({ hasText: purpose })).toHaveCount(0);

  // D-49: the next level up the hierarchy opens the drawer and rejects with a reason.
  const khalid = await signIn(browser, 'Khalid');
  await khalid.goto('/approvals');
  await khalid
    .getByRole('listitem')
    .filter({ hasText: purpose })
    .getByRole('button', { name: /Ahmed/ })
    .click();
  const drawer = khalid.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Approvals' }).click();
  await expect(drawer.getByText('Line Manager · level 2').first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Reject' }).click();
  const reason = khalid.getByRole('dialog', { name: /^Reject/ });
  await reason.getByLabel('Reason').fill('Attach the boarding passes');
  await reason.getByRole('button', { name: 'Reject' }).click();
  await expect(khalid.getByText('Rejected — the claimant has been told')).toBeVisible();

  // The claimant sees the reason and reopens the report.
  await ahmed.goto('/reports');
  await ahmed.getByRole('button', { name: new RegExp(purpose) }).click();
  const mine = ahmed.getByRole('dialog');
  await expect(
    mine.getByText('Rejected by Khalid Al-Harbi (Line Manager · level 2)'),
  ).toBeVisible();
  await expect(mine.getByText('“Attach the boarding passes”').first()).toBeVisible();
  await mine.getByRole('button', { name: 'Correct and resubmit' }).click();
  await expect(mine.getByRole('button', { name: 'Submit for approval' })).toBeVisible();

  // The email trail is in the dev outbox.
  await ahmed.goto('/dev/mail');
  await expect(ahmed.getByText(/^Rejected: EH-IPP-2026-/).first()).toBeVisible();
});

test('an approver asks for information and the claimant replies (OQ-06)', async ({ browser }) => {
  const tag = Date.now().toString().slice(-6);
  const purpose = `Client trip ${tag}`;
  const ahmed = await signIn(browser, 'Ahmed');
  await createAndSubmit(ahmed, tag, purpose);

  const majed = await signIn(browser, 'Majed');
  await majed.goto('/approvals');
  await majed
    .getByRole('listitem')
    .filter({ hasText: purpose })
    .getByRole('button', { name: /Ahmed/ })
    .click();
  await majed.getByRole('dialog').getByRole('button', { name: 'Ask for info' }).click();
  const ask = majed.getByRole('dialog', { name: 'Ask for more information' });
  await ask.getByLabel('Your question').fill('Which customer did you visit?');
  await ask.getByRole('button', { name: 'Ask for info' }).click();
  await expect(majed.getByText('Question sent to the claimant')).toBeVisible();

  await ahmed.goto('/reports');
  await ahmed.getByRole('button', { name: new RegExp(purpose) }).click();
  const mine = ahmed.getByRole('dialog');
  await expect(mine.getByText('Majed Al-Anazi asked for more information')).toBeVisible();
  await mine.getByRole('button', { name: 'Reply' }).click();
  const reply = ahmed.getByRole('dialog', { name: 'Reply to the approver' });
  await reply.getByLabel('Your answer').fill('SABIC Jubail');
  await reply.getByRole('button', { name: 'Reply' }).click();
  await expect(ahmed.getByText('Reply sent')).toBeVisible();

  await majed.goto('/approvals');
  const row = majed.getByRole('listitem').filter({ hasText: purpose });
  await expect(row.getByText('Info requested')).toHaveCount(0);
});
