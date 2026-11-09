import { parseSar } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { ContractError, hcmEmployeeCsv, parseRows, quickPayCsv } from './contracts';
import { toEmployees } from './mappers';
import { loadMockMasterData } from './mock/fixtures';

describe('Fusion inbound contracts (INTEGRATION §4)', () => {
  it('parses every mock fixture', () => {
    const data = loadMockMasterData('2026-10-18T00:00:00.000Z');
    expect(data.employees).toHaveLength(17);
    expect(data.coaValues.length).toBeGreaterThan(20);
    expect(data.businessTrips).toHaveLength(4);
    expect(data.quickPays).toHaveLength(4);
    // D-46: extra leave-request columns are ignored; DESTINATION is kept.
    expect(data.businessTrips[0]).toMatchObject({ destination: 'Dubai, United Arab Emirates' });
    expect(data.rates).toHaveLength(9);
    expect(data.rates.find((r) => r.fromCcy === 'INR')?.rate).toBe('0.04463000');
  });

  it('reports bad rows with their file line number', () => {
    const rows = [
      {
        PAYROLL_ACTION_ID: '1',
        RUN_RESULT_ID: '2',
        PERSON_ID: '3',
        ELEMENT_NAME: 'X',
        PAY_VALUE: '10.00',
        EFFECTIVE_DATE: '2026-10-01',
        BU_CODE: 'IPP',
      },
      {
        PAYROLL_ACTION_ID: 'abc',
        RUN_RESULT_ID: '2',
        PERSON_ID: '3',
        ELEMENT_NAME: 'X',
        PAY_VALUE: '10.005',
        EFFECTIVE_DATE: '01/10/2026',
        BU_CODE: 'XYZ',
      },
    ];
    try {
      parseRows(quickPayCsv, rows, 'EH_PAY_QUICK_PAYS.csv');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      const issues = (err as ContractError).issues;
      expect(issues.every((i) => i.startsWith('line 3'))).toBe(true);
      expect(issues.map((i) => i.split(' ')[2])).toEqual(
        expect.arrayContaining(['PAYROLL_ACTION_ID:', 'PAY_VALUE:', 'EFFECTIVE_DATE:', 'BU_CODE:']),
      );
    }
  });

  it('converts amounts to halalas exactly', () => {
    const [row] = parseRows(
      quickPayCsv,
      [
        {
          PAYROLL_ACTION_ID: '1',
          RUN_RESULT_ID: '2',
          PERSON_ID: '3',
          ELEMENT_NAME: 'X',
          PAY_VALUE: '1500.10',
          EFFECTIVE_DATE: '2026-10-01',
          BU_CODE: 'IPP',
        },
      ],
      'test',
    );
    expect(row?.PAY_VALUE).toBe(parseSar('1500.10'));
  });

  it('sets payee_ok only with supplier, active site for the BU and active bank (INT-07)', () => {
    const [emp] = parseRows(
      hcmEmployeeCsv,
      [
        {
          PERSON_ID: '1',
          PERSON_NUMBER: '1',
          FULL_NAME: 'A',
          EMAIL: '',
          MOBILE: '',
          ASSIGNMENT_ID: '',
          BU_CODE: 'IPP',
          JOB_NAME: '',
          LOCATION_CODE: '',
          SUPERVISOR_PERSON_ID: '',
          DEFAULT_EXPENSE_ACCOUNT: 'IPP.001.110.55251.000.000000',
          ACTIVE_FLAG: 'Y',
        },
      ],
      'test',
    );
    const payee = {
      PERSON_ID: 1,
      SUPPLIER_NUMBER: 'EMP-1',
      SUPPLIER_SITE: 'IPP-EMP',
      BU_CODE: 'IPP' as const,
      SITE_ACTIVE_FLAG: 'Y' as const,
      HAS_ACTIVE_BANK_FLAG: 'Y' as const,
    };
    const at = '2026-10-18T00:00:00.000Z';
    expect(toEmployees([emp!], [payee], at)[0]).toMatchObject({
      payeeOk: 'Y',
      costCenter: '110',
      supervisorId: null,
    });
    expect(toEmployees([emp!], [{ ...payee, HAS_ACTIVE_BANK_FLAG: 'N' }], at)[0]?.payeeOk).toBe(
      'N',
    );
    expect(toEmployees([emp!], [{ ...payee, BU_CODE: 'FPP' }], at)[0]?.payeeOk).toBe('N');
    expect(toEmployees([emp!], [], at)[0]?.payeeOk).toBe('N');
  });
});
