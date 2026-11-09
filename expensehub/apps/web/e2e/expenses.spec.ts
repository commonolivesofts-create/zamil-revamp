// M4 Done-when: a receipt with the sample ZATCA QR fills seller, VAT no., total and VAT;
// a BLOCK disables Save. Runs against the dev API (DATA_MODE=memory, FUSION_MODE=mock).
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLES = path.resolve(import.meta.dirname, '..', '..', '..', 'docs', 'samples');

async function quickLogin(page: Page, name: string) {
  await page.goto('/login');
  await page
    .getByTestId('dev-quick-login')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name.split(' ')[0]!);
}

test('a ZATCA receipt prefills the expense, which saves to the unreported list', async ({
  page,
}) => {
  const purpose = `Client lunch ${Date.now().toString().slice(-6)}`;
  await quickLogin(page, 'Ahmed');
  await page.goto('/expenses/new');

  await page.getByRole('radio', { name: 'Meals & entertainment' }).click();
  await page.getByTestId('receipt-input').setInputFiles(path.join(SAMPLES, 'zatca-receipt.png'));

  const badge = page.getByTestId('qr-badge');
  await expect(badge.getByText('ZATCA QR ✓ valid')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('300055184400003')).toBeVisible(); // VAT no.
  await expect(page.getByLabel('Merchant')).toHaveValue('Al Baik Restaurant'); // seller
  await expect(page.getByLabel('Amount')).toHaveValue('115.00'); // total
  await expect(page.getByLabel('Date')).toHaveValue('2026-10-12');
  await expect(page.getByRole('img', { name: /Receipt zatca-receipt\.png/ })).toBeVisible();

  await page.getByLabel('Business purpose').fill(purpose);
  await page.getByLabel('Attendees').fill('Mr. Saleh (client)');

  // D-41: no VAT is recovered — no tax-invoice switch, no VAT figures, the line stays gross.
  const checklist = page.getByRole('heading', { name: 'Policy check' }).locator('xpath=../..');
  await expect(page.getByTestId('amount-sar')).toHaveText('SAR 115.00');
  await expect(checklist.getByText(/Recoverable VAT/)).toHaveCount(0);
  await expect(page.getByLabel('Tax invoice')).toHaveCount(0);
  await expect(page.getByTestId('charge-account')).toContainText('55210');

  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page).toHaveURL(/\/expenses$/);
  const row = page.getByRole('listitem').filter({ hasText: purpose });
  await expect(row).toContainText('Al Baik Restaurant');
  await expect(row).toContainText('SAR 115.00');
});

test('a BLOCK rule disables Save until it is fixed', async ({ page }) => {
  await quickLogin(page, 'Ahmed');
  await page.goto('/expenses/new');

  await page.getByRole('radio', { name: 'Mobile & internet' }).click();
  await page.getByLabel('Merchant').fill('STC');
  await page.getByLabel('Business purpose').fill('Roaming during the Dubai trip');
  await page.getByLabel('Amount').fill('350');

  await expect(page.getByText(/you entered SAR 350\.00 \(not allowed\)/)).toBeVisible();
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute('title', 'Fix the blocked checks to save');

  await page.getByLabel('Amount').fill('280');
  await expect(save).toBeEnabled();
});
