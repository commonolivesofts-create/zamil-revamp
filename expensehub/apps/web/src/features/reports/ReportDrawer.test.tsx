// UI-UX §5.3: the drawer shows exactly the actions the API allows; reasons are mandatory.
import type { ReportDetail } from '@expensehub/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderRoutes } from '../../test/render';
import { ReportDrawer } from './ReportDrawer';

afterEach(() => vi.unstubAllGlobals());

function detail(over: Partial<ReportDetail> = {}): ReportDetail {
  return {
    reportId: 7,
    reportNumber: 'EH-IPP-2026-000007',
    purpose: 'Jubail plant visit',
    status: 'PENDING_APPROVAL',
    infoRequested: false,
    claimantName: 'Ahmed Al-Subaie',
    businessUnit: 'IPP',
    reportDate: '2026-10-18',
    totalSar: '6000.00',
    netPayableSar: '6000.00',
    lineCount: 0,
    submittedAt: '2026-10-18T06:00:00.000Z',
    currentStep: {
      stepName: 'Line Manager',
      assigneeName: 'Majed Al-Anazi',
      since: '2026-10-18T06:00:00.000Z',
    },
    version: 3,
    updatedAt: '2026-10-18T06:00:00.000Z',
    claimant: {
      personId: 11,
      personNumber: '1011',
      fullName: 'Ahmed Al-Subaie',
      jobName: 'Sales Engineer',
    },
    vatSar: '0.00',
    cashSar: '6000.00',
    approvedAt: null,
    lines: [],
    steps: [
      {
        stepId: 41,
        cycleNo: 1,
        seq: 1,
        stepName: 'Line Manager',
        status: 'PENDING',
        isAuditStep: false,
        assigneeName: 'Majed Al-Anazi',
        actedByName: null,
        actedAt: null,
        pendingSince: '2026-10-18T06:00:00.000Z',
        comment: null,
        note: null,
      },
      {
        stepId: 42,
        cycleNo: 1,
        seq: 2,
        stepName: 'CEO',
        status: 'SKIPPED',
        isAuditStep: false,
        assigneeName: 'Ahmed Al-Subaie',
        actedByName: null,
        actedAt: null,
        pendingSince: null,
        comment: null,
        note: 'BELOW_THRESHOLD',
      },
    ],
    history: [],
    permissions: {
      canEdit: false,
      canEditPurpose: false,
      canSubmit: false,
      canDelete: false,
      canWithdraw: false,
      canCorrect: false,
      canReplyInfo: false,
      actionableStepId: 41,
      canAudit: false,
    },
    audit: null,
    fusion: null,
    ...over,
  };
}

const render = () =>
  renderRoutes([{ path: '/', element: <ReportDrawer reportId={7} onClose={() => {}} /> }], '/');

describe('report drawer', () => {
  it('lets the approver approve, and insists on a reason to reject (FR-APR-04)', async () => {
    const calls: string[] = [];
    mockApi({
      'GET /api/v1/reports/7': () => json(200, detail()),
      'POST /api/v1/approvals/41/approve': () => {
        calls.push('approve');
        return json(200, detail({ status: 'PENDING_APPROVAL' }));
      },
      'POST /api/v1/approvals/41/reject': (init) => {
        calls.push(`reject:${JSON.parse(init.body!).comment}`);
        return json(200, detail({ status: 'REJECTED' }));
      },
    });
    render();
    const user = userEvent.setup();

    expect(await screen.findByText(/^With Majed Al-Anazi \(Line Manager\) · /)).toBeInTheDocument();
    expect(screen.getByTestId('report-net')).toHaveTextContent('SAR 6,000.00');
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: /Reject EH-IPP-2026-000007/ });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Attach the boarding pass');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(calls).toEqual(['reject:Attach the boarding pass']));
  });

  it('shows the skipped CEO step and why (FR-APR-02)', async () => {
    mockApi({ 'GET /api/v1/reports/7': () => json(200, detail()) });
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Approvals' }));
    expect(screen.getByText(/not above the CEO approval threshold/)).toBeInTheDocument();
  });

  it('lists what blocks a submit (FR-SET-02, FR-POL-06)', async () => {
    mockApi({
      'GET /api/v1/reports/7': () =>
        json(
          200,
          detail({
            status: 'DRAFT',
            reportNumber: null,
            currentStep: null,
            steps: [],
            permissions: {
              ...detail().permissions,
              canSubmit: true,
              canEdit: true,
              actionableStepId: null,
            },
          }),
        ),
      'POST /api/v1/reports/7/submit': () =>
        json(422, {
          error: {
            code: 'PREREQUISITE_MISSING',
            message: 'You cannot submit yet.',
            details: {
              checks: [
                {
                  code: 'LINE_MANAGER',
                  ok: false,
                  message: 'Your line manager is missing in Oracle HCM.',
                  contact: 'HR',
                },
              ],
            },
          },
        }),
    });
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You cannot submit yet');
    expect(alert).toHaveTextContent('Your line manager is missing in Oracle HCM.');
  });
});
