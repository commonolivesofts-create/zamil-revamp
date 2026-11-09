// M3 smoke tests: setup edits are logged; "Run now" syncs from the Fusion fixtures.
import { expect, test, type Page } from '@playwright/test';

async function quickLogin(page: Page, name: string) {
  await page.goto('/login');
  await page
    .getByTestId('dev-quick-login')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name.split(' ')[0]!);
}

test('the admin adds an expense type and changes an option; both land in the history', async ({
  page,
}) => {
  const code = `PARK${Date.now().toString().slice(-6)}`;
  await quickLogin(page, 'Yousef Al-Malki');
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/setup\/expense-types$/);

  await page.getByRole('button', { name: 'New expense type' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Name', { exact: true }).fill('Airport parking');
  await drawer.getByLabel('Code').fill(code);
  await drawer.getByLabel('Natural account').selectOption('55240');
  await drawer.getByLabel('Default limit').fill('80');
  await drawer.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Expense type created')).toBeVisible();
  await expect(page.getByRole('button', { name: `Edit Airport parking` }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Options' }).click();
  const staleDays = page.getByLabel('RATE_STALE_DAYS');
  // Dev data persists between runs: always write a value different from the current one.
  await staleDays.fill((await staleDays.inputValue()) === '9' ? '8' : '9');
  await staleDays.press('Enter');
  await expect(page.getByText('Option saved')).toBeVisible();

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByText('RATE_STALE_DAYS|*').first()).toBeVisible(); // newest first
});

test('the admin runs a sync now and reads its call log', async ({ page }) => {
  await quickLogin(page, 'Yousef Al-Malki');
  await page.goto('/admin/integrations');
  await expect(page.getByText('Fusion: mock fixtures (D-33)')).toBeVisible();
  await page.getByRole('button', { name: 'Run now: Employees & payees' }).click();
  await expect(page.getByText(/Employees & payees: 17 rows read/)).toBeVisible();
  await expect(page.getByRole('button', { name: /INT-01/ }).first()).toBeVisible();
});

test('Finance sees the monitor read-only and no setup', async ({ page }) => {
  await quickLogin(page, 'Tariq Al-Zahrani');
  await page.goto('/admin/integrations');
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run now' })).toHaveCount(0);
  await expect(page.getByText('The call log is visible to system administrators.')).toBeVisible();
  await page.goto('/setup/options');
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
