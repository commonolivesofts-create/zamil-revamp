import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shiftInputSchema } from '@attendance/shared';
import { UploadDialog } from '../../features/attendanceCard/UploadDialog';
import { ApiError } from '../../lib/api';
import { ToastProvider } from '../Toast';
import { FormDialog } from './FormDialog';
import type { FormField } from './types';

type Values = {
  shiftName: string;
  status: string;
  startDate: string;
  endDate: string;
  checkIn: string;
  checkOut: string;
};
const FIELDS: FormField<Values>[] = [
  { name: 'shiftName', label: 'Shift Name', type: 'text', required: true },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: [{ value: 'ACTIVE', label: 'ACTIVE' }],
  },
  { name: 'startDate', label: 'Start Date', type: 'date' },
  { name: 'endDate', label: 'End Date', type: 'date' },
  { name: 'checkIn', label: 'Check In', type: 'time' },
  { name: 'checkOut', label: 'Check Out', type: 'time' },
];
const VALID: Values = {
  shiftName: 'Morning',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  checkIn: '07:00',
  checkOut: '16:00',
};

afterEach(() => vi.unstubAllGlobals());

describe('FormDialog', () => {
  it('shows the shared validation messages inline without calling the API', async () => {
    const onSubmit = vi.fn();
    render(
      <FormDialog<Values>
        title="Add Shift"
        fields={FIELDS}
        initial={{ ...VALID, shiftName: '', endDate: '2025-01-01' }}
        schema={shiftInputSchema}
        submitLabel="Save Shift"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save Shift' }));
    expect(screen.getByText('The Shift Name field is required.')).toBeInTheDocument();
    expect(screen.getByText('End Date must be on or after Start Date.')).toBeInTheDocument();
    expect(screen.getByLabelText('Shift Name *')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('maps server field errors onto the fields and keeps the dialog open', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError('VALIDATION', 400, 'Request validation failed', {
        issues: [
          {
            path: 'shiftName',
            message: 'The Shift Name already exists. Please use a unique value.',
          },
        ],
      }),
    );
    render(
      <FormDialog<Values>
        title="Add Shift"
        fields={FIELDS}
        initial={VALID}
        schema={shiftInputSchema}
        submitLabel="Save Shift"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save Shift' }));
    expect(
      await screen.findByText('The Shift Name already exists. Please use a unique value.'),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(VALID);
  });
});

describe('UploadDialog', () => {
  it('previews, then imports, showing counts including skipped employees', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    fetchMock.mockResolvedValueOnce(
      json({
        message: 'Attendance file validated successfully.',
        summary: { totalDataRows: 2, validRows: 1, invalidRows: 1 },
        rows: [
          {
            row: 2,
            empNo: '1001',
            empName: 'Ali',
            attDate: '2024-01-15',
            punchIn: '08:00',
            punchOut: '17:00',
          },
        ],
        errors: [{ row: 3, employeeId: '1002', errors: 'Invalid date' }],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      json({
        message: 'Attendance file imported successfully.',
        totalRows: 1,
        insertedRows: 0,
        updatedRows: 0,
        skippedRows: 1,
        skipped: [
          {
            row: 2,
            empNo: '1001',
            message: 'Employee is inactive or not found in the employee master.',
          },
        ],
        invalidRows: 1,
        validationErrors: [],
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <UploadDialog onClose={() => {}} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const importButton = screen.getByRole('button', { name: 'Import Attendance' });
    expect(importButton).toBeDisabled();

    await userEvent.upload(
      screen.getByLabelText('Attendance file'),
      new File(['x'], 'a.csv', { type: 'text/csv' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Valid: 1')).toBeInTheDocument();
    expect(screen.getByText('Invalid date')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    expect(((init as RequestInit).body as FormData).get('mode')).toBe('preview');

    await userEvent.click(importButton);
    expect(
      await screen.findByText(/Skipped \(inactive or unknown employee\): 1/),
    ).toBeInTheDocument();
    expect(((fetchMock.mock.calls[1]![1] as RequestInit).body as FormData).get('mode')).toBe(
      'import',
    );
  });
});
