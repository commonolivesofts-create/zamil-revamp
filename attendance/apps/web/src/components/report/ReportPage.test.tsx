import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { payrollPeriodEndingThisMonth } from '@attendance/shared';
import AbsencePage from '../../features/absences/AbsencePage';
import AlertsPage from '../../features/alerts/AlertsPage';
import EmployeeDetailsPage from '../../features/employees/EmployeeDetailsPage';
import { ToastProvider } from '../Toast';

const employee = (n: number) => ({
  userId: n,
  employeeNumber: String(1000 + n),
  fullName: `Employee ${n}`,
  email: `e${n}@example.com`,
  jobTitle: 'Operator',
  department: 'Production',
  joiningDate: '2020-01-15',
});

const page = (items: unknown[], total = items.length, pageNo = 1) => ({
  items,
  pagination: { page: pageNo, limit: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) },
});

function wrap(children: ReactNode, url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
const bodies = () =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const respond = (data: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  );

describe('ReportPage (Employee Details)', () => {
  it('loads the first page with the CSRF header and renders rows and paging', async () => {
    respond(page([employee(1), employee(2)], 12));
    render(wrap(<EmployeeDetailsPage />));

    expect(await screen.findByText('Employee 1')).toBeInTheDocument();
    expect(screen.getAllByText('15 Jan 2020')).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/employees/list');
    expect((init as RequestInit).headers).toMatchObject({ 'X-Requested-With': 'Attendance' });
    expect(bodies()[0]).toEqual({ page: 1, limit: 30, search: '', filters: {} });
    expect(screen.getByText('Page 1 of 2 · 12 total')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['#', 'Emp No', 'Employee Name', 'Email', 'Job Title', 'Department', 'Joining Date']);
  });

  it('applies filters from the panel and shows the empty state', async () => {
    const user = userEvent.setup();
    respond(page([employee(1)]));
    respond(page([]));
    render(wrap(<EmployeeDetailsPage />));
    await screen.findByText('Employee 1');

    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.type(screen.getByLabelText('Department'), 'Finance');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('No employees match the selected filters.')).toBeInTheDocument();
    expect(bodies()[1]).toEqual({
      page: 1,
      limit: 30,
      search: '',
      filters: { department: 'Finance' },
    });
  });

  it('shows a removable chip per applied filter (CI3 active filter pills)', async () => {
    const user = userEvent.setup();
    respond(page([employee(1)]));
    respond(page([employee(1)]));
    respond(page([employee(1)]));
    render(wrap(<EmployeeDetailsPage />));
    await screen.findByText('Employee 1');

    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.type(screen.getByLabelText('Department'), 'Finance');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const chips = await screen.findByRole('group', { name: 'Active filters' });
    expect(chips).toHaveTextContent('Finance');

    await user.click(within(chips).getByRole('button', { name: 'Remove Department filter' }));
    await waitFor(() =>
      expect(bodies()[2]).toEqual({ page: 1, limit: 30, search: '', filters: {} }),
    );
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
    // The filter form shows the removal too.
    expect(screen.getByLabelText('Department')).toHaveValue('');
  });

  it('shows API errors with a retry', async () => {
    respond(
      { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
      500,
    );
    render(wrap(<EmployeeDetailsPage />));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The all employee records could not be loaded. Something went wrong. Please try again.',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('ReportPage (Alerts, filters in the address bar as CI3)', () => {
  it('reads the filters and page from the URL', async () => {
    respond({
      fromDate: '2001-01-01',
      toDate: '2001-01-31',
      summary: {
        total: 0,
        high: 0,
        medium: 0,
        low: 0,
        missingPunch: 0,
        samePunch: 0,
        missingShift: 0,
        missingOccasion: 0,
        highOvertime: 0,
        missingTimetable: 0,
      },
      items: [],
      pagination: { page: 2, limit: 15, total: 0, totalPages: 1 },
      generatedAt: '21 Nov 2026, 02:30 PM',
    });
    render(
      wrap(
        <AlertsPage />,
        '/alerts-exceptions?from_date=2001-01-01&to_date=2001-01-31&type=missing_punch&severity=&currentPage=2',
      ),
    );
    await waitFor(() =>
      expect(bodies()[0]).toEqual({
        page: 2,
        limit: 15,
        search: '',
        filters: { fromDate: '2001-01-01', toDate: '2001-01-31', type: 'missing_punch' },
      }),
    );
  });
});

describe('ReportPage (Absence)', () => {
  it('opens on the current payroll period and shows status badges', async () => {
    respond(
      page([
        {
          empNo: '1001',
          departmentName: 'IT',
          empName: 'Test',
          position: 'Analyst',
          leaveStartDate: '21-10-26',
          leaveEndDate: '25-10-26',
          totalDays: '5',
          leaveType: 'Annual Leave',
          approvalStatus: 'APPROVED',
        },
      ]),
    );
    render(wrap(<AbsencePage />));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('APPROVED')).toHaveClass('zrv-admin-badge--good');
    const period = payrollPeriodEndingThisMonth(new Date());
    await waitFor(() =>
      expect(bodies()[0]).toEqual({
        page: 1,
        limit: 30,
        search: '',
        filters: { leaveFrom: period.from, leaveTo: period.to },
      }),
    );
  });

  it('Reset clears every filter, the default dates too (CI3)', async () => {
    const user = userEvent.setup();
    respond(page([]));
    respond(page([]));
    render(wrap(<AbsencePage />));
    await screen.findByRole('status');

    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() =>
      expect(bodies()[1]).toEqual({ page: 1, limit: 30, search: '', filters: {} }),
    );
  });

  it('Clear All resets the filters like Reset (CI3)', async () => {
    const user = userEvent.setup();
    respond(page([]));
    respond(page([]));
    render(wrap(<AbsencePage />));
    const chips = await screen.findByRole('group', { name: 'Active filters' });
    await user.click(within(chips).getByRole('button', { name: 'Clear All' }));
    await waitFor(() =>
      expect(bodies()[1]).toEqual({ page: 1, limit: 30, search: '', filters: {} }),
    );
  });
});
