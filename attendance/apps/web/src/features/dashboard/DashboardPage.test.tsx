import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '@attendance/shared';
import DashboardPage from './DashboardPage';

const dashboard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  period: {
    fromDate: '2026-10-21',
    toDate: '2026-11-20',
    fromLabel: '21 Oct 2026',
    toLabel: '20 Nov 2026',
    generatedAt: '23 Nov 2026 10:00',
  },
  process: {
    coverage: 97,
    processedEmployees: 146,
    assignedEmployees: 150,
    statusText: 'Ready for payroll review',
  },
  totalEmployees: 150,
  missingTimetableEmployees: 3,
  blankPunchEmployees: 12,
  overtimeHours: 4210.5,
  employeesWithOvertime: 88,
  departments: [
    { department: 'Production', employeeCount: 90 },
    { department: 'Admin', employeeCount: 10 },
  ],
  trend: [
    { date: '2026-10-21', label: '21 Oct 2026', present: 120, onLeave: 8, absent: 2, late: 6 },
    { date: '2026-10-22', label: '22 Oct 2026', present: 118, onLeave: 9, absent: 3, late: 4 },
  ],
  exceptions: {
    lateMinutes: 600,
    lateEmployees: 14,
    earlyMinutes: 90,
    earlyEmployees: 5,
    absentDays: 21,
    absentEmployees: 7,
    leaveDays: 40,
  },
  absenceTypes: [
    { type: 'Annual Leave', days: 30 },
    { type: 'Absence without permission', days: 21 },
    { type: 'Sick Leave', days: 10 },
  ],
  topOvertime: [
    { empNo: '1148', empName: 'TAHER, SYED', value: 137 },
    { empNo: '2506', empName: 'UDDIN, MOHAMMED', value: 148.45 },
  ],
  topLate: [],
  ...overrides,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // Reduced motion: count-up numbers show their final value at once.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderWith(data: Dashboard) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  it('shows the period hero, KPI cards, checklist and every widget', async () => {
    renderWith(dashboard());

    const hero = await screen.findByRole('region', { name: 'Payroll period overview' });
    expect(hero).toHaveTextContent('Ready for payroll review');
    expect(hero).toHaveTextContent('21 Oct 2026');
    expect(hero).toHaveTextContent('97%');
    // Attendance rate: (120/130 + 118/130) / 2 = 91.5%
    expect(hero).toHaveTextContent('91.5%');
    expect(
      within(hero).getByRole('list', { name: 'Attendance rate per processed day' }).children,
    ).toHaveLength(2);

    const kpis = screen.getByRole('region', { name: 'Key figures' });
    expect(within(kpis).getByText('150')).toBeInTheDocument();
    expect(within(kpis).getByText('119')).toBeInTheDocument(); // (120 + 118) / 2 present
    expect(within(kpis).getByText('10.0 h')).toBeInTheDocument(); // 600 late minutes
    expect(within(kpis).getByText('21 days')).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: /Timetables assigned.*needs attention/ }),
    ).toHaveAttribute('href', '/timetable');
    expect(screen.getByRole('link', { name: /Attendance processed.*done/ })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Daily attendance rate for 2 processed days/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^61 leave and absence days/ })).toBeInTheDocument();
    expect(screen.getByText('TAHER, SYED')).toBeInTheDocument();
    expect(screen.getByText('No late arrivals this period.')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Employee headcount by department' }),
    ).toHaveTextContent('Production');
  });

  it('explains empty widgets when nothing has been processed', async () => {
    renderWith(dashboard({ trend: [], absenceTypes: [], topOvertime: [], departments: [] }));
    expect(
      await screen.findByText('No processed days in this payroll period yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No leave or absence in this period.')).toBeInTheDocument();
    expect(screen.getByText('No overtime recorded this period.')).toBeInTheDocument();
    expect(screen.getByText('No department data available.')).toBeInTheDocument();
  });
});
