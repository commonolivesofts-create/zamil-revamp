// M2 smoke tests: sign-in (password + dev quick-login), menus by role, sign-out.
import { expect, test, type Page } from '@playwright/test';

const DEV_PASSWORD = 'ExpenseHub2026';

async function quickLogin(page: Page, name: string) {
  await page.goto('/login');
  await page
    .getByTestId('dev-quick-login')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name.split(' ')[0]!);
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Main menu' }).first();

test('a signed-out visitor is sent to sign-in and comes back after', async ({ page }) => {
  await page.goto('/admin/prerequisites');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fprerequisites/);
  await page.getByLabel('Person number').fill('1009');
  await page.getByLabel('Password', { exact: true }).fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Prerequisites' })).toBeVisible();
  // FR-SET-02: the two seeded problem cases.
  await expect(page.getByText('Mohammed Al-Shammari')).toBeVisible();
  await expect(page.getByText('Sara Al-Amri')).toBeVisible();
});

test('an employee sees only their own claims', async ({ page }) => {
  await quickLogin(page, 'Ahmed Al-Subaie');
  await expect(menu(page).getByRole('link', { name: 'Expenses' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Approval inbox' })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: 'Setup' })).toHaveCount(0);
  await page.goto('/admin/prerequisites');
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test('the accountant gets approvals and audit; the admin gets setup', async ({ page }) => {
  await quickLogin(page, 'Omar Al-Shehri');
  await expect(menu(page).getByRole('link', { name: 'Audit' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Approval inbox' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Setup' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Your session ended')).toHaveCount(0);

  await quickLogin(page, 'Yousef Al-Malki');
  await expect(menu(page).getByRole('link', { name: 'Setup' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'System status' })).toBeVisible();
});

test('an employee with missing prerequisites is told who to contact', async ({ page }) => {
  await quickLogin(page, 'Mohammed Al-Shammari');
  await expect(page.getByText('Before you can submit a claim')).toBeVisible();
  await expect(page.getByText('Contact Finance (AP)', { exact: true })).toBeVisible();
});

test('password reset link arrives in dev mail and sets a new password', async ({ page }) => {
  await page.goto('/reset');
  await page.getByLabel('Person number').fill('1015');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await page.getByRole('link', { name: 'Open dev mail' }).click();
  await page.getByRole('link', { name: 'Reset password' }).first().click();
  const newPassword = `Plant${Date.now()}`;
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password saved')).toBeVisible();
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await page.getByLabel('Person number').fill('1015');
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Abdullah');
});
