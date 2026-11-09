// M4 Done-when (UI): a ZATCA receipt fills seller, VAT no., total, VAT; BLOCK disables Save.
import type { ExpenseDto, ExpenseEvaluation, ExpenseTypeDto } from '@expensehub/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderRoutes } from '../../test/render';
import { ExpenseEntryPage } from './ExpenseEntryPage';

afterEach(() => vi.unstubAllGlobals());

const type = (over: Partial<ExpenseTypeDto>): ExpenseTypeDto => ({
  typeId: 1,
  typeCode: 'MEALS',
  name: 'Meals & entertainment',
  nameAr: null,
  category: 'STANDARD',
  naturalAccount: '55210',
  defaultLimitSar: '150.00',
  limitAction: 'WARN',
  receiptOverSar: '0.00',
  justificationReq: false,
  attendeesReq: false,
  vatEligible: true,
  unit: null,
  unitRateSar: null,
  icon: 'utensils',
  sortOrder: 10,
  isPlaceholder: false,
  active: true,
  version: 1,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const TYPES = [
  type({}),
  type({
    typeId: 2,
    typeCode: 'TELECOM',
    name: 'Telecom',
    icon: 'smartphone',
    limitAction: 'BLOCK',
    defaultLimitSar: '300.00',
    sortOrder: 20,
  }),
];

const SEGMENTS: ExpenseEvaluation['segments'] = [
  { segment: 'COMPANY', value: 'IPP', description: 'Industrial Plastic Products', ok: true },
  { segment: 'LOCATION', value: '003', description: 'Dammam', ok: true },
  { segment: 'COST_CENTER', value: '127', description: 'Sales', ok: true },
  { segment: 'ACCOUNT', value: '55210', description: 'Meals', ok: true },
  { segment: 'SEGMENT5', value: '000', description: 'Default', ok: true },
  { segment: 'SEGMENT6', value: '000000', description: 'Default', ok: true },
];

function evaluation(over: Partial<ExpenseEvaluation>): ExpenseEvaluation {
  return {
    amountSar: '115.00',
    vatSar: '15.00',
    netSar: '100.00',
    vatRecovery: true,
    fxRate: '1.00000000',
    fxRateDate: null,
    quantity: null,
    unitRateSar: null,
    receiptRequired: true,
    chargeAccount: 'IPP.003.127.55210.000.000000',
    segments: SEGMENTS,
    results: [
      { rule: 'ACCOUNT', level: 'PASS', message: 'Charged to IPP.003.127.55210.000.000000.' },
    ],
    level: 'PASS',
    ...over,
  };
}

const SAVED: ExpenseDto = {
  expenseId: 1,
  reportId: null,
  expenseDate: '2026-10-12',
  typeId: 1,
  typeCode: 'MEALS',
  typeName: 'Meals & entertainment',
  typeIcon: 'utensils',
  category: 'STANDARD',
  merchant: 'Al Baik Restaurant',
  description: 'Lunch with client',
  attendees: null,
  justification: null,
  quantity: null,
  unitRateSar: null,
  amount: '115.00',
  currency: 'SAR',
  fxRate: '1.00000000',
  fxRateDate: null,
  amountSar: '115.00',
  vatSar: '15.00',
  netSar: '100.00',
  approvedAmountSar: '115.00',
  adjustmentReason: null,
  taxInvoice: true,
  receiptRequired: true,
  receiptAttached: true,
  chargeAccount: 'IPP.003.127.55210.000.000000',
  costCenter: null,
  tripId: null,
  quickPayId: null,
  source: 'CASH',
  policyLevel: 'PASS',
  violations: [],
  receipt: null,
  editMode: 'FULL',
  version: 1,
  createdAt: '2026-10-18T06:00:00.000Z',
};

function api(validate: (body: Record<string, unknown>) => ExpenseEvaluation) {
  return mockApi({
    'GET /api/v1/ref/expense-types': () => json(200, { items: TYPES }),
    'GET /api/v1/ref/currencies': () => json(200, { items: ['SAR', 'USD'] }),
    'GET /api/v1/ref/trips/mine': () => json(200, { items: [] }),
    'GET /api/v1/quick-pays/mine': () => json(200, { items: [] }),
    'GET /api/v1/ref/coa': () => json(200, { items: [] }),
    'POST /api/v1/expenses/validate': (init) =>
      json(200, validate(JSON.parse(init.body!) as Record<string, unknown>)),
    'POST /api/v1/receipts': () =>
      json(201, {
        receiptId: 77,
        originalName: 'albaik.png',
        mime: 'image/png',
        sizeBytes: 2048,
        url: '/api/v1/receipts/77/file',
        qr: {
          found: true,
          valid: true,
          fields: {
            sellerName: 'Al Baik Restaurant',
            vatNumber: '300055184400003',
            timestamp: '2026-10-12T13:25:00Z',
            total: '115.00',
            vat: '15.00',
          },
          errors: [],
        },
        ocr: { engine: 'none', fields: { merchant: null, date: null, total: null, vat: null } },
        duplicate: false,
      }),
    'POST /api/v1/expenses': () => json(201, SAVED),
  });
}

const render = () =>
  renderRoutes(
    [
      { path: '/expenses/new', element: <ExpenseEntryPage /> },
      { path: '/expenses', element: <p>Expense list</p> },
    ],
    '/expenses/new',
  );

describe('expense entry', () => {
  it('disables Save while a policy check blocks (FR-POL-03)', async () => {
    api((body) =>
      Number(body.amount) > 300
        ? evaluation({
            amountSar: body.amount as string,
            level: 'BLOCK',
            results: [
              {
                rule: 'LIMIT',
                level: 'BLOCK',
                message: 'Telecom limit is SAR 300.00 — you entered SAR 350.00 (not allowed).',
              },
            ],
          })
        : evaluation({ amountSar: body.amount as string }),
    );
    render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: 'Telecom' }));
    await user.type(screen.getByLabelText('Merchant'), 'STC');
    await user.type(screen.getByLabelText('Amount'), '350');
    await user.type(screen.getByLabelText('Business purpose'), 'Roaming in Dubai');

    expect(await screen.findByText(/you entered SAR 350.00 \(not allowed\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/Fix the blocked checks to save/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '250');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByTestId('amount-sar')).toHaveTextContent('SAR 250.00');
  });

  it('reads the ZATCA QR, prefills the form and saves with the receipt (FR-CAP-03/04)', async () => {
    const fetchMock = api(() => evaluation({}));
    const { router } = render();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: 'Meals & entertainment' }));
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'albaik.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByTestId('receipt-input'), file);

    // Seller, VAT no., total and VAT from the QR.
    const badge = await screen.findByTestId('qr-badge');
    expect(within(badge).getByText('ZATCA QR ✓ valid')).toBeInTheDocument();
    expect(screen.getByText('300055184400003')).toBeInTheDocument();
    expect(screen.getAllByText('SAR 15.00').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Merchant')).toHaveValue('Al Baik Restaurant');
    expect(screen.getByLabelText('Amount')).toHaveValue('115.00');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Merchant').className).toContain('bg-brand/5');

    await user.type(screen.getByLabelText('Business purpose'), 'Lunch with client');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    const account = screen.getByTestId('charge-account');
    for (const value of ['IPP', '003', '127', '55210', '000', '000000']) {
      expect(within(account).getByText(value)).toBeInTheDocument();
    }
    expect(
      within(account).getByRole('tooltip', { name: /Cost centre: Sales/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/expenses'));
    const saved = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/expenses') && init?.method === 'POST',
    );
    expect(JSON.parse(String(saved![1]!.body))).toMatchObject({
      typeId: 1,
      merchant: 'Al Baik Restaurant',
      amount: '115.00',
      currency: 'SAR',
      receiptId: 77,
      taxInvoice: true,
    });
  });
});
