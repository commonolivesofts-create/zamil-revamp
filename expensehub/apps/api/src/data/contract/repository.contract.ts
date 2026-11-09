// Repository contract (D-33, TRD §12): every data implementation must pass this suite unchanged.
// Memory runs it now (memory.contract.test.ts); the Oracle store must pass it in M8.
import { parseSar } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import type { DataLayer } from '../ports';
import { SYNCED_AT, SYSTEM, basics, employee, expense, expenseType, report } from './builders';

export function describeRepositoryContract(name: string, makeDataLayer: () => Promise<DataLayer>) {
  describe(`repository contract — ${name}`, () => {
    describe('identity, audit columns and keys', () => {
      it('assigns identities and fills audit columns', async () => {
        const data = await makeDataLayer();
        const [a, b] = await data.withTransaction(async (r) => [
          await r.expenseTypes.insert(expenseType('A'), { actorId: 7 }),
          await r.expenseTypes.insert(expenseType('B'), SYSTEM),
        ]);
        expect(b!.typeId).toBeGreaterThan(a!.typeId);
        expect(a).toMatchObject({ version: 1, createdBy: 7, updatedBy: 7 });
        expect(Date.parse(a!.createdAt)).not.toBeNaN();
      });

      it('rejects a duplicate unique key with INVALID_STATE', async () => {
        const data = await makeDataLayer();
        await data.withTransaction((r) => r.expenseTypes.insert(expenseType('MEALS'), SYSTEM));
        await expect(
          data.withTransaction((r) => r.expenseTypes.insert(expenseType('MEALS'), SYSTEM)),
        ).rejects.toMatchObject({
          code: 'INVALID_STATE',
          details: { constraint: 'eh_expense_types_code_uk' },
        });
      });

      it('allows many rows with a NULL unique value (report number before submit)', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          await r.employees.upsert(employee(1));
          await r.reports.insert(report(1), SYSTEM);
          await r.reports.insert(report(1), SYSTEM);
        });
        expect(await data.read((r) => r.reports.listByPerson(1))).toHaveLength(2);
      });

      it('enforces CHECK constraints (delegation to self)', async () => {
        const data = await makeDataLayer();
        await expect(
          data.withTransaction((r) =>
            r.delegations.insert(
              {
                fromPersonId: 1,
                toPersonId: 1,
                startDate: '2026-10-01',
                endDate: '2026-10-10',
                active: 'Y',
              },
              SYSTEM,
            ),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      });

      it('reports NOT_FOUND for a missing row', async () => {
        const data = await makeDataLayer();
        await expect(data.read((r) => r.reports.getOrThrow(999))).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
        expect(await data.read((r) => r.reports.get(999))).toBeUndefined();
      });
    });

    describe('optimistic locking (API §1)', () => {
      it('bumps version and updated_by on update', async () => {
        const data = await makeDataLayer();
        const t = await data.withTransaction((r) =>
          r.expenseTypes.insert(expenseType('A'), SYSTEM),
        );
        const updated = await data.withTransaction((r) =>
          r.expenseTypes.update(t.typeId, { name: 'Renamed' }, { actorId: 5, expectedVersion: 1 }),
        );
        expect(updated).toMatchObject({
          name: 'Renamed',
          version: 2,
          updatedBy: 5,
          createdBy: null,
        });
      });

      it('rejects a stale version with VERSION_CONFLICT', async () => {
        const data = await makeDataLayer();
        const t = await data.withTransaction((r) =>
          r.expenseTypes.insert(expenseType('A'), SYSTEM),
        );
        await data.withTransaction((r) =>
          r.expenseTypes.update(t.typeId, { name: 'X' }, { actorId: 1, expectedVersion: 1 }),
        );
        await expect(
          data.withTransaction((r) =>
            r.expenseTypes.update(t.typeId, { name: 'Y' }, { actorId: 2, expectedVersion: 1 }),
          ),
        ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      });

      it('never changes a primary key through update', async () => {
        const data = await makeDataLayer();
        await data.withTransaction((r) =>
          r.systemOptions.insert(
            {
              optionKey: 'VAT_RATE',
              businessUnit: '*',
              optionValue: '15',
              valueType: 'NUMBER',
              description: null,
            },
            SYSTEM,
          ),
        );
        await expect(
          data.withTransaction((r) =>
            r.systemOptions.update(
              { optionKey: 'VAT_RATE', businessUnit: '*' },
              { optionKey: 'OTHER' },
              SYSTEM,
            ),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      });
    });

    describe('transactions', () => {
      it('rolls back every write when the function throws', async () => {
        const data = await makeDataLayer();
        await expect(
          data.withTransaction(async (r) => {
            await r.expenseTypes.insert(expenseType('A'), SYSTEM);
            await r.sequences.next('EH-IPP-2026');
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');
        expect(await data.read((r) => r.expenseTypes.list())).toEqual([]);
        // Gap-free: the rolled-back number is handed out again.
        expect(await data.withTransaction((r) => r.sequences.next('EH-IPP-2026'))).toBe(1);
      });

      it('joins an outer transaction; the outer failure rolls back the inner work', async () => {
        const data = await makeDataLayer();
        await expect(
          data.withTransaction(async () => {
            await data.withTransaction((r) => r.expenseTypes.insert(expenseType('INNER'), SYSTEM));
            const seen = await data.read((r) => r.expenseTypes.getByCode('INNER'));
            expect(seen).toBeDefined(); // read-your-writes inside the transaction
            throw new Error('outer fails');
          }),
        ).rejects.toThrow('outer fails');
        expect(await data.read((r) => r.expenseTypes.getByCode('INNER'))).toBeUndefined();
      });

      it('serialises concurrent transactions (no lost updates)', async () => {
        const data = await makeDataLayer();
        const numbers = await Promise.all(
          Array.from({ length: 20 }, () =>
            data.withTransaction(async (r) => {
              const n = await r.sequences.next('EH-FPP-2026');
              await new Promise((resolve) => setTimeout(resolve, 1));
              return n;
            }),
          ),
        );
        expect([...numbers].sort((a, b) => a - b)).toEqual(
          Array.from({ length: 20 }, (_, i) => i + 1),
        );
      });

      it('refuses writes through read()', async () => {
        const data = await makeDataLayer();
        await expect(
          data.read((r) => r.expenseTypes.insert(expenseType('A'), SYSTEM)),
        ).rejects.toThrow(/outside withTransaction/);
      });

      it('keeps sequences independent per name', async () => {
        const data = await makeDataLayer();
        const result = await data.withTransaction(async (r) => [
          await r.sequences.next('EH-IPP-2026'),
          await r.sequences.next('EH-IPP-2026'),
          await r.sequences.next('QP-IPP-2026'),
        ]);
        expect(result).toEqual([1, 2, 1]);
      });
    });

    describe('isolation of returned rows', () => {
      it('returns copies — mutating a result never changes stored data', async () => {
        const data = await makeDataLayer();
        const t = await data.withTransaction((r) =>
          r.expenseTypes.insert(expenseType('A'), SYSTEM),
        );
        t.name = 'hacked';
        const listed = await data.read((r) => r.expenseTypes.list());
        listed[0]!.name = 'hacked too';
        expect((await data.read((r) => r.expenseTypes.get(t.typeId)))!.name).toBe('A');
      });
    });

    describe('history is append-only (DB-05)', () => {
      it('exposes no update or delete', async () => {
        const data = await makeDataLayer();
        await data.read(async (r) => {
          expect('update' in r.reportHistory).toBe(false);
          expect('delete' in r.reportHistory).toBe(false);
          expect('update' in r.setupHistory).toBe(false);
          expect('delete' in r.setupHistory).toBe(false);
        });
      });

      it('appends in order and returns copies', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          for (const action of ['CREATED', 'SUBMITTED', 'APPROVED']) {
            await r.reportHistory.append({
              entityType: 'REPORT',
              entityId: 1,
              actorId: null,
              action,
              fromStatus: null,
              toStatus: null,
              detail: null,
            });
          }
        });
        const rows = await data.read((r) => r.reportHistory.listFor('REPORT', 1));
        expect(rows.map((h) => h.action)).toEqual(['CREATED', 'SUBMITTED', 'APPROVED']);
        rows[0]!.action = 'TAMPERED';
        const again = await data.read((r) => r.reportHistory.listFor('REPORT', 1));
        expect(again[0]!.action).toBe('CREATED');
      });
    });

    describe('mirror upserts (D-07)', () => {
      it('inserts then replaces by primary key', async () => {
        const data = await makeDataLayer();
        await data.withTransaction((r) => r.employees.upsert(employee(1, { fullName: 'Old' })));
        await data.withTransaction((r) => r.employees.upsert(employee(1, { fullName: 'New' })));
        expect(await data.read((r) => r.employees.count())).toBe(1);
        expect((await data.read((r) => r.employees.get(1)))!.fullName).toBe('New');
      });

      it('keeps the ExpenseHub id when a Quick Pay is re-synced', async () => {
        const data = await makeDataLayer();
        const qp = {
          payrollActionId: 10,
          runResultId: 20,
          personId: 1,
          elementName: 'Business Trip Allowance',
          amountSar: parseSar('1500'),
          effectiveDate: '2026-10-01',
          businessUnit: 'IPP' as const,
          syncedAt: SYNCED_AT,
        };
        const first = await data.withTransaction((r) => r.quickPays.upsertByFusionKey(qp));
        const second = await data.withTransaction((r) =>
          r.quickPays.upsertByFusionKey({ ...qp, amountSar: parseSar('1600') }),
        );
        expect(second.quickPayId).toBe(first.quickPayId);
        expect(second.amountSar).toBe(parseSar('1600'));
      });
    });

    describe('finders', () => {
      it('finds the latest rate on or before a date (PRD §6)', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          for (const [rateDate, rate] of [
            ['2026-10-01', '4.08000000'],
            ['2026-10-05', '4.06000000'],
            ['2026-10-20', '4.10000000'],
          ]) {
            await r.rates.upsert({
              fromCcy: 'EUR',
              toCcy: 'SAR',
              rateType: 'Corporate',
              rateDate: rateDate!,
              rate: rate!,
              syncedAt: SYNCED_AT,
            });
          }
        });
        expect(
          (await data.read((r) => r.rates.findLatest('EUR', 'Corporate', '2026-10-12')))?.rate,
        ).toBe('4.06000000');
        expect(
          await data.read((r) => r.rates.findLatest('EUR', 'Corporate', '2026-09-30')),
        ).toBeUndefined();
        expect(
          await data.read((r) => r.rates.findLatest('EUR', 'Spot', '2026-10-12')),
        ).toBeUndefined();
      });

      it('resolves a BU option before the "*" default', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          const opt = {
            optionKey: 'ACCT_INPUT_VAT',
            valueType: 'STRING' as const,
            description: null,
          };
          await r.systemOptions.insert(
            { ...opt, businessUnit: '*', optionValue: 'default' },
            SYSTEM,
          );
          await r.systemOptions.insert({ ...opt, businessUnit: 'FPP', optionValue: 'fpp' }, SYSTEM);
        });
        expect(
          (await data.read((r) => r.systemOptions.resolve('ACCT_INPUT_VAT', 'FPP')))?.optionValue,
        ).toBe('fpp');
        expect(
          (await data.read((r) => r.systemOptions.resolve('ACCT_INPUT_VAT', 'APP')))?.optionValue,
        ).toBe('default');
      });

      it('lists unreported expenses and finds possible duplicates (D-23)', async () => {
        const data = await makeDataLayer();
        const ids = await data.withTransaction(async (r) => {
          const { claimant, typeId } = await basics(r);
          const rep = await r.reports.insert(report(claimant), SYSTEM);
          const a = await r.expenses.insert(expense(claimant, typeId, '120.00'), SYSTEM);
          await r.expenses.insert(
            expense(claimant, typeId, '120.00', { reportId: rep.reportId, merchant: ' al baik ' }),
            SYSTEM,
          );
          await r.expenses.insert(expense(claimant, typeId, '99.00'), SYSTEM);
          return { a: a.expenseId };
        });
        expect(await data.read((r) => r.expenses.listUnreported(1))).toHaveLength(2);
        const dups = await data.read((r) =>
          r.expenses.findPossibleDuplicates({
            personId: 1,
            merchant: 'AL BAIK',
            amountSar: parseSar('120.00'),
            expenseDate: '2026-10-12',
            excludeExpenseId: ids.a,
          }),
        );
        expect(dups).toHaveLength(1);
      });

      it('deletes an unreported expense', async () => {
        const data = await makeDataLayer();
        const id = await data.withTransaction(async (r) => {
          const { claimant, typeId } = await basics(r);
          return (await r.expenses.insert(expense(claimant, typeId), SYSTEM)).expenseId;
        });
        await data.withTransaction((r) => r.expenses.delete(id));
        expect(await data.read((r) => r.expenses.get(id))).toBeUndefined();
      });

      it('deletes a draft report that never got a number', async () => {
        const data = await makeDataLayer();
        const id = await data.withTransaction(async (r) => {
          const { claimant } = await basics(r);
          return (await r.reports.insert(report(claimant), SYSTEM)).reportId;
        });
        await data.withTransaction((r) => r.reports.delete(id));
        expect(await data.read((r) => r.reports.get(id))).toBeUndefined();
      });

      it('replaces policy violations for a line', async () => {
        const data = await makeDataLayer();
        const id = await data.withTransaction(async (r) => {
          const { claimant, typeId } = await basics(r);
          const e = await r.expenses.insert(expense(claimant, typeId), SYSTEM);
          await r.policyViolations.replaceForExpense(e.expenseId, [
            { ruleCode: 'LIMIT', level: 'WARN', message: 'Over limit' },
            { ruleCode: 'RECEIPT', level: 'BLOCK', message: 'Receipt required' },
          ]);
          await r.policyViolations.replaceForExpense(e.expenseId, [
            { ruleCode: 'LIMIT', level: 'WARN', message: 'Over limit' },
          ]);
          return e.expenseId;
        });
        const rows = await data.read((r) => r.policyViolations.listByExpense(id));
        expect(rows.map((v) => v.ruleCode)).toEqual(['LIMIT']);
      });

      it('orders approval steps and lists pending ones per approver', async () => {
        const data = await makeDataLayer();
        const reportId = await data.withTransaction(async (r) => {
          const { claimant, approver } = await basics(r);
          const rep = await r.reports.insert(report(claimant), SYSTEM);
          const step = (seq: number, status: 'WAITING' | 'PENDING') => ({
            reportId: rep.reportId,
            seq,
            stepName: `Step ${seq}`,
            ruleId: null,
            isAuditStep: 'N' as const,
            assignedTo: approver,
            originalAssignee: null,
            status,
            actedBy: null,
            actedAt: null,
            commentText: null,
            pendingSince: status === 'PENDING' ? SYNCED_AT : null,
            remindedAt: null,
            escalatedAt: null,
            cycleNo: 1,
          });
          await r.approvalSteps.insert(step(2, 'WAITING'), SYSTEM);
          await r.approvalSteps.insert(step(1, 'PENDING'), SYSTEM);
          await expect(r.approvalSteps.insert(step(1, 'WAITING'), SYSTEM)).rejects.toMatchObject({
            code: 'INVALID_STATE',
          });
          return rep.reportId;
        });
        const steps = await data.read((r) => r.approvalSteps.listByReport(reportId));
        expect(steps.map((s) => s.seq)).toEqual([1, 2]);
        expect(await data.read((r) => r.approvalSteps.listPendingFor(2))).toHaveLength(1);
      });

      it('allows one invoice per Quick Pay (DB-09)', async () => {
        const data = await makeDataLayer();
        const quickPayId = await data.withTransaction(async (r) => {
          const qp = await r.quickPays.upsertByFusionKey({
            payrollActionId: 1,
            runResultId: 1,
            personId: 1,
            elementName: 'Business Trip Allowance',
            amountSar: parseSar('900'),
            effectiveDate: '2026-10-01',
            businessUnit: 'IPP',
            syncedAt: SYNCED_AT,
          });
          return qp.quickPayId;
        });
        const inv = {
          quickPayId,
          status: 'INVOICE_REQUESTED' as const,
          invoiceNumber: null,
          fusionInvoiceId: null,
          fusionStatus: null,
          paymentRef: null,
          paidAt: null,
          syncError: null,
          excludedReason: null,
          requestedBy: null,
        };
        await data.withTransaction((r) => r.quickPayInvoices.insert(inv, SYSTEM));
        await expect(
          data.withTransaction((r) => r.quickPayInvoices.insert(inv, SYSTEM)),
        ).rejects.toMatchObject({
          code: 'INVALID_STATE',
          details: { constraint: 'eh_qp_invoices_qp_uk' },
        });
      });

      it('keeps advance applied + refunded within the amount (DB-08)', async () => {
        const data = await makeDataLayer();
        const advance = {
          advanceNumber: null,
          personId: 1,
          businessUnit: 'IPP' as const,
          purpose: 'Trip',
          amountSar: parseSar('1000'),
          appliedSar: parseSar('800'),
          refundedSar: parseSar('300'),
          status: 'DISBURSED' as const,
          approverId: 2,
          approvedAt: null,
          disbursedBy: 3,
          disbursedAt: null,
          voucherNo: 'V-1',
          fusionRef: null,
        };
        await data.withTransaction((r) => r.employees.upsert(employee(1)));
        await expect(
          data.withTransaction((r) => r.advances.insert(advance, SYSTEM)),
        ).rejects.toMatchObject({
          code: 'INVALID_STATE',
          details: { constraint: 'eh_advances_balance_ck' },
        });
      });
    });

    describe('sync and monitor helpers', () => {
      it('finds the last run with a given status and the latest log per interface', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          const run = (status: 'OK' | 'ERROR') =>
            r.jobRuns.insert({
              jobName: 'sync-coa',
              startedAt: SYNCED_AT,
              endedAt: SYNCED_AT,
              status,
              rowsRead: status === 'OK' ? 33 : null,
              rowsChanged: 0,
              errorText: null,
            });
          await run('OK');
          await run('ERROR');
          const log = {
            direction: 'IN' as const,
            refType: null,
            refId: null,
            httpMethod: 'POST',
            url: null,
            request: null,
            response: null,
            httpStatus: 200,
            retries: 0,
            durationMs: 1,
          };
          await r.integrationLog.insert({ ...log, interface: 'INT-04', status: 'OK' });
          await r.integrationLog.insert({ ...log, interface: 'INT-04', status: 'ERROR' });
        });
        expect(
          (await data.read((r) => r.jobRuns.latestWithStatus('sync-coa', 'OK')))?.rowsRead,
        ).toBe(33);
        expect((await data.read((r) => r.jobRuns.latest('sync-coa')))?.status).toBe('ERROR');
        expect((await data.read((r) => r.integrationLog.latest('INT-04')))?.status).toBe('ERROR');
        expect(await data.read((r) => r.integrationLog.latest('INT-06'))).toBeUndefined();
      });

      it('limits setup history, newest first', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          for (let i = 1; i <= 3; i += 1) {
            await r.setupHistory.append({
              tableName: 'EH_SYSTEM_OPTIONS',
              rowKey: `K${i}`,
              actorId: null,
              oldJson: null,
              newJson: { i },
            });
          }
        });
        const rows = await data.read((r) => r.setupHistory.list({ limit: 2 }));
        expect(rows.map((h) => h.rowKey)).toEqual(['K3', 'K2']);
      });
    });

    describe('users', () => {
      it('finds a user by person and by reset-token hash', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          await r.employees.upsert(employee(1));
          await r.users.insert(
            {
              personId: 1,
              passwordHash: null,
              failedAttempts: 0,
              lockedUntil: null,
              lastLoginAt: null,
              resetTokenHash: 'abc123',
              resetExpiresAt: '2026-10-19T00:00:00.000Z',
              active: 'Y',
            },
            SYSTEM,
          );
        });
        expect((await data.read((r) => r.users.getByPersonId(1)))?.resetTokenHash).toBe('abc123');
        expect((await data.read((r) => r.users.getByResetTokenHash('abc123')))?.personId).toBe(1);
        expect(await data.read((r) => r.users.getByResetTokenHash('nope'))).toBeUndefined();
      });
    });

    describe('operations tables', () => {
      it('logs integration calls newest first, filtered by interface', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          const base = {
            direction: 'IN' as const,
            refType: null,
            refId: null,
            httpMethod: 'POST',
            url: null,
            request: null,
            response: null,
            httpStatus: 200,
            status: 'OK' as const,
            retries: 0,
            durationMs: 5,
          };
          await r.integrationLog.insert({ ...base, interface: 'INT-01' });
          const second = await r.integrationLog.insert({ ...base, interface: 'INT-06' });
          await r.integrationLog.update(second.logId, { status: 'ERROR', httpStatus: 500 });
        });
        const all = await data.read((r) => r.integrationLog.list());
        expect(all.map((l) => l.interface)).toEqual(['INT-06', 'INT-01']);
        expect(await data.read((r) => r.integrationLog.list({ status: 'ERROR' }))).toHaveLength(1);
      });

      it('tracks job runs and the notification outbox', async () => {
        const data = await makeDataLayer();
        await data.withTransaction(async (r) => {
          const run = await r.jobRuns.insert({
            jobName: 'sync-hcm',
            startedAt: SYNCED_AT,
            endedAt: null,
            status: 'RUNNING',
            rowsRead: null,
            rowsChanged: null,
            errorText: null,
          });
          await r.jobRuns.update(run.runId, { status: 'OK', rowsRead: 17 });
          const n = await r.notifications.insert({
            channel: 'EMAIL',
            recipientId: 1,
            templateCode: 'SUBMITTED',
            payload: { reportId: 1 },
            status: 'QUEUED',
            attempts: 0,
            sentAt: null,
            errorText: null,
          });
          await r.notifications.update(n.notificationId, { status: 'SENT', attempts: 1 });
        });
        expect((await data.read((r) => r.jobRuns.latest('sync-hcm')))?.status).toBe('OK');
        expect(await data.read((r) => r.notifications.listByStatus('QUEUED'))).toHaveLength(0);
        expect(await data.read((r) => r.notifications.listRecent())).toHaveLength(1);
      });
    });
  });
}
