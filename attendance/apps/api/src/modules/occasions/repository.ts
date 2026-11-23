// Occasions / holidays, XX_DIGI_ATT_OCCASIONS (CI3: Occasion_model).
import {
  normalizeShiftIds,
  type OccasionFilters,
  type OccasionInput,
  type OccasionRow,
} from '@attendance/shared';
import { num, str, type Db, type Row } from '../../db/oracle';
import { containsCi, csvContains, equals, type Binder, type ListSpec } from '../../db/sql';
import { AppError } from '../../lib/errors';
import { oracleReportRepository } from '../report';

const COLUMNS = `a.OCCASION_ID, a.OCCASION_NAME,
  TO_CHAR(a.FROM_DATE, 'YYYY-MM-DD') AS FROM_DATE, TO_CHAR(a.TO_DATE, 'YYYY-MM-DD') AS TO_DATE,
  a.OCCASION_TYPE, a.SHIFT_ID,
  (SELECT LISTAGG(s.SHIFT_NAME, ', ') WITHIN GROUP (ORDER BY s.SHIFT_NAME)
     FROM XX_DIGI_SHIFT_PR s
    WHERE INSTR(',' || a.SHIFT_ID || ',', ',' || s.ID || ',') > 0) AS SHIFT_NAMES,
  a.COUNT_AS_PRESENT, a.PAID_HOLIDAY, a.IS_ACTIVE, a.REMARKS, a.CREATED_BY,
  TO_CHAR(a.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT, a.UPDATED_BY,
  TO_CHAR(a.UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT`;

export const occasionListSpec: ListSpec<OccasionFilters> = {
  from: 'XX_DIGI_ATT_OCCASIONS a',
  select: COLUMNS,
  filters: {
    occasionName: containsCi('a.OCCASION_NAME'),
    occasionType: containsCi('a.OCCASION_TYPE'),
    // Containment, as in CI3: starts on/after "from", ends on/before "to".
    fromDate: (value: string, b: Binder) =>
      `TRUNC(a.FROM_DATE) >= TO_DATE(${b.add(value)}, 'YYYY-MM-DD')`,
    toDate: (value: string, b: Binder) =>
      `TRUNC(a.TO_DATE) <= TO_DATE(${b.add(value)}, 'YYYY-MM-DD')`,
    countAsPresent: equals('a.COUNT_AS_PRESENT'),
    paidHoliday: equals('a.PAID_HOLIDAY'),
    isActive: equals('a.IS_ACTIVE'),
    shiftId: csvContains('a.SHIFT_ID'),
  },
  search: ['a.OCCASION_NAME'],
  orderBy: 'a.FROM_DATE DESC, a.OCCASION_ID DESC',
};

export const mapOccasionRow = (row: Row): OccasionRow => ({
  occasionId: num(row.OCCASION_ID) ?? 0,
  occasionName: str(row.OCCASION_NAME),
  fromDate: str(row.FROM_DATE),
  toDate: str(row.TO_DATE),
  shiftIds: (str(row.SHIFT_ID) ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  shiftNames: str(row.SHIFT_NAMES),
  occasionType: str(row.OCCASION_TYPE),
  countAsPresent: str(row.COUNT_AS_PRESENT) ?? 'Y',
  paidHoliday: str(row.PAID_HOLIDAY) ?? 'Y',
  isActive: str(row.IS_ACTIVE) ?? 'Y',
  remarks: str(row.REMARKS),
  createdBy: str(row.CREATED_BY),
  createdAt: str(row.CREATED_AT),
  updatedBy: str(row.UPDATED_BY),
  updatedAt: str(row.UPDATED_AT),
});

export interface OccasionRepository {
  findById(id: number): Promise<OccasionRow | null>;
  insert(input: OccasionInput, user: string): Promise<OccasionRow>;
  update(id: number, input: OccasionInput, user: string): Promise<OccasionRow>;
  remove(id: number): Promise<void>;
}

const notFound = () => new AppError('NOT_FOUND', 'Occasion not found.');

const valueBinds = (input: OccasionInput) => ({
  name: input.occasionName,
  fromDate: input.fromDate,
  toDate: input.toDate,
  type: input.occasionType,
  shiftIds: normalizeShiftIds(input.shiftIds),
  countAsPresent: input.countAsPresent,
  paidHoliday: input.paidHoliday,
  isActive: input.isActive,
  remarks: input.remarks,
});

export function oracleOccasionRepository(db: Db): OccasionRepository {
  const findById = async (id: number) => {
    const rows = await db.query(
      'adw',
      `SELECT ${COLUMNS} FROM XX_DIGI_ATT_OCCASIONS a WHERE a.OCCASION_ID = :id`,
      {
        id,
      },
    );
    return rows[0] ? mapOccasionRow(rows[0]) : null;
  };

  return {
    findById,

    async insert(input, user) {
      const result = await db.execute(
        'adw',
        `INSERT INTO XX_DIGI_ATT_OCCASIONS (OCCASION_NAME, FROM_DATE, TO_DATE, OCCASION_TYPE, SHIFT_ID,
           COUNT_AS_PRESENT, PAID_HOLIDAY, IS_ACTIVE, REMARKS, CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT)
         VALUES (:name, TO_DATE(:fromDate, 'YYYY-MM-DD'), TO_DATE(:toDate, 'YYYY-MM-DD'), :type, :shiftIds,
           :countAsPresent, :paidHoliday, :isActive, :remarks, :userName, SYSTIMESTAMP, :userName, SYSTIMESTAMP)
         RETURNING OCCASION_ID INTO :newId`,
        { ...valueBinds(input), userName: user, newId: { out: 'number' } },
      );
      const occasion = await findById(Number(result.outBinds.newId));
      if (!occasion) throw new AppError('INTERNAL', 'Failed to add occasion.');
      return occasion;
    },

    async update(id, input, user) {
      const result = await db.execute(
        'adw',
        `UPDATE XX_DIGI_ATT_OCCASIONS SET OCCASION_NAME = :name,
           FROM_DATE = TO_DATE(:fromDate, 'YYYY-MM-DD'), TO_DATE = TO_DATE(:toDate, 'YYYY-MM-DD'),
           OCCASION_TYPE = :type, SHIFT_ID = :shiftIds, COUNT_AS_PRESENT = :countAsPresent,
           PAID_HOLIDAY = :paidHoliday, IS_ACTIVE = :isActive, REMARKS = :remarks,
           UPDATED_BY = :userName, UPDATED_AT = SYSTIMESTAMP
         WHERE OCCASION_ID = :id`,
        { ...valueBinds(input), userName: user, id },
      );
      if (result.rowsAffected === 0) throw notFound();
      const occasion = await findById(id);
      if (!occasion) throw notFound();
      return occasion;
    },

    async remove(id) {
      const result = await db.execute(
        'adw',
        'DELETE FROM XX_DIGI_ATT_OCCASIONS WHERE OCCASION_ID = :id',
        { id },
      );
      if (result.rowsAffected === 0) throw notFound();
    },
  };
}

export const occasionListRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', occasionListSpec, mapOccasionRow);
