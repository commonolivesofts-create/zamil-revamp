import { describe, expect, it } from 'vitest';
import { absenceListSpec } from '../modules/absences/repository';
import { employeeListSpec } from '../modules/employees/repository';
import { buildExportSql, buildListSql } from './sql';

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('buildListSql (employees)', () => {
  it('always restricts to current employees and pages with binds', () => {
    const { countSql, countBinds, listSql, listBinds } = buildListSql(employeeListSpec, {
      page: 3,
      limit: 25,
      search: '',
      filters: {},
    });
    expect(norm(countSql)).toBe(
      "SELECT COUNT(1) AS TOTAL FROM XX_DIGI_EMP_MASTER d WHERE d.CURRENT_EMP_FLAG = 'Y'",
    );
    expect(countBinds).toEqual({});
    expect(norm(listSql)).toMatch(
      /ORDER BY d\.HEADER_ID DESC, d\.EMPLOYEE_NUMBER OFFSET :b0 ROWS FETCH NEXT :b1 ROWS ONLY$/,
    );
    expect(listBinds).toEqual({ b0: 50, b1: 25 });
  });

  it('binds filters and search case-insensitively, escaping LIKE wildcards', () => {
    const { countSql, countBinds } = buildListSql(employeeListSpec, {
      page: 1,
      limit: 10,
      search: 'ali',
      filters: { department: 'it_ops', joiningDate: '2024-03-01' },
    });
    expect(norm(countSql)).toContain("UPPER(d.DEPARTMENT) LIKE :b0 ESCAPE '\\'");
    expect(norm(countSql)).toContain(
      "(d.JOINING_DATE >= TO_DATE(:b1, 'YYYY-MM-DD') AND d.JOINING_DATE < TO_DATE(:b1, 'YYYY-MM-DD') + 1)",
    );
    expect(countBinds.b0).toBe('%IT\\_OPS%');
    expect(countBinds.b1).toBe('2024-03-01');
    // Six searchable columns, one bind each.
    expect(Object.keys(countBinds)).toHaveLength(8);
    expect(countBinds.b2).toBe('%ALI%');
  });

  it('never puts filter values into the SQL text', () => {
    const { listSql } = buildListSql(employeeListSpec, {
      page: 1,
      limit: 10,
      search: "x' OR '1'='1",
      filters: { fullName: "'; DROP TABLE x; --" },
    });
    expect(listSql).not.toContain('DROP');
    expect(listSql).not.toContain("'1'='1");
  });
});

describe('absence spec', () => {
  it('parses stored DD-MM-YY dates safely for range filters and ordering', () => {
    const { countSql, countBinds, listSql } = buildListSql(absenceListSpec, {
      page: 1,
      limit: 10,
      search: '',
      filters: { leaveFrom: '2026-10-21', leaveTo: '2026-11-20', empNo: '10' },
    });
    const sql = norm(countSql);
    expect(sql).toContain("a.EMP_NO LIKE :b0 ESCAPE '\\'");
    expect(sql).toContain(
      "TO_DATE(TRIM(a.LEAVE_END_DATE) DEFAULT NULL ON CONVERSION ERROR, 'DD-MM-RR') >= TO_DATE(:b1, 'YYYY-MM-DD')",
    );
    expect(sql).toContain(
      "TO_DATE(TRIM(a.LEAVE_START_DATE) DEFAULT NULL ON CONVERSION ERROR, 'DD-MM-RR') <= TO_DATE(:b2, 'YYYY-MM-DD')",
    );
    expect(countBinds).toEqual({ b0: '%10%', b1: '2026-10-21', b2: '2026-11-20' });
    expect(norm(listSql)).toContain('DESC NULLS LAST, a.EMP_NO');
  });
});

describe('buildExportSql', () => {
  it('caps the row count with a bind', () => {
    const { sql, binds } = buildExportSql(absenceListSpec, { search: '', filters: {} }, 1001);
    expect(norm(sql)).toMatch(/FETCH FIRST :b0 ROWS ONLY$/);
    expect(binds).toEqual({ b0: 1001 });
  });
});
