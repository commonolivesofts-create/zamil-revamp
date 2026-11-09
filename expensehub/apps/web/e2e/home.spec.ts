// M9 smoke: the role-aware home stacks the blocks a person's roles call for (UI-UX §5.1).
import { expect, test, type Browser } from '@playwright/test';

async function home(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page
    .getByTestId('dev-quick-login')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  return page;
}

test('employee, approver and finance blocks follow the roles', async ({ browser }) => {
  const ahmed = await home(browser, 'Ahmed');
  await expect(ahmed.getByText('On its way to you')).toBeVisible();
  await expect(ahmed.getByTestId('on-its-way')).toHaveText(/^SAR [\d,]+\.\d{2}$/);
  await expect(ahmed.getByRole('link', { name: /Unreported expenses/ })).toHaveAttribute(
    'href',
    '/expenses',
  );
  await expect(ahmed.getByRole('heading', { name: 'Approvals' })).toHaveCount(0);
  await expect(ahmed.getByRole('heading', { name: /^Finance · / })).toHaveCount(0);

  const majed = await home(browser, 'Majed');
  await expect(majed.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  await expect(majed.getByRole('link', { name: /Waiting for you/ })).toHaveAttribute(
    'href',
    '/approvals',
  );

  const tariq = await home(browser, 'Tariq');
  await expect(tariq.getByRole('heading', { name: 'Finance · IPP · FPP · APP' })).toBeVisible();
  await expect(tariq.getByRole('link', { name: /Ready for payment/ })).toHaveAttribute(
    'href',
    '/finance/payables',
  );
  await expect(tariq.getByText('Claims in progress')).toBeVisible();
});
