// FUSION_MODE=mock: reads the fixture files in this folder through the live contracts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import type { IsoTimestamp } from '../../../data/entities';
import {
  apPayeeCsv,
  businessTripCsv,
  currencyRatesResponse,
  glSegmentValueCsv,
  hcmEmployeeCsv,
  parseRows,
  quickPayCsv,
} from '../contracts';
import {
  DEFAULT_TRIP_DESTINATION_FIELD,
  toBusinessTrips,
  toCoaValues,
  toEmployees,
  toQuickPays,
  toRates,
  withDestination,
} from '../mappers';

const MOCK_DIR = import.meta.dirname;

export function readCsvFixture(name: string): Record<string, string>[] {
  const text = readFileSync(path.join(MOCK_DIR, `${name}.csv`), 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

export function readJsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(MOCK_DIR, `${name}.json`), 'utf8'));
}

/** All inbound master data, parsed and mapped exactly as a sync would. */
export function loadMockMasterData(syncedAt: IsoTimestamp) {
  const csv = <S extends Parameters<typeof parseRows>[0]>(schema: S, name: string) =>
    parseRows(schema, readCsvFixture(name), `${name}.csv`);

  const employees = csv(hcmEmployeeCsv, 'EH_HCM_EMPLOYEES');
  const payees = csv(apPayeeCsv, 'EH_AP_EMPLOYEE_PAYEES');
  return {
    employees: toEmployees(employees, payees, syncedAt),
    coaValues: toCoaValues(csv(glSegmentValueCsv, 'EH_GL_SEGMENT_VALUES'), syncedAt),
    businessTrips: toBusinessTrips(
      parseRows(
        businessTripCsv,
        withDestination(readCsvFixture('EH_HCM_BUSINESS_TRIPS'), DEFAULT_TRIP_DESTINATION_FIELD),
        'EH_HCM_BUSINESS_TRIPS.csv',
      ),
      syncedAt,
    ),
    quickPays: toQuickPays(csv(quickPayCsv, 'EH_PAY_QUICK_PAYS'), syncedAt),
    rates: toRates(currencyRatesResponse.parse(readJsonFixture('currencyRates')), syncedAt),
  };
}
