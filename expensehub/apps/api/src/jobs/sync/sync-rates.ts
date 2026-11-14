// Implements: INT-06 daily corporate rates (REST currencyRates), TRD §7 sync-rates.
// Incremental (since yesterday) and rates are never deleted, so the 50 % guard does not apply.
import { addDays, riyadhDate } from '../../lib/dates';
import { currencyRatesResponse } from '../../integrations/fusion/contracts';
import { toRates } from '../../integrations/fusion/mappers';
import type { JobDefinition } from '../types';
import { sameMirrorRow } from './common';

export const syncRates: JobDefinition = {
  name: 'sync-rates',
  interfaces: ['INT-06'],
  dailyAt: { hour: 6, minute: 0 },
  async run({ data, fusion, clock }) {
    const now = clock();
    const [rateType, haveRates] = await data.read(async (r) => [
      (await r.systemOptions.resolve('RATE_TYPE', 'IPP'))?.optionValue ?? 'Corporate',
      (await r.rates.count()) > 0,
    ]);
    const body = await fusion.currencyRates({
      toCurrency: 'SAR',
      rateType: rateType as string,
      // First run (empty store): a year of history, so expenses have the latest rate on or
      // before their date even when Fusion's rates are months old (test pod: Jan 2026).
      since: addDays(riyadhDate(now), haveRates ? -1 : -365),
    });
    const parsed = currencyRatesResponse.safeParse(body);
    if (!parsed.success) {
      throw new Error(
        `currencyRates response does not match its contract: ${parsed.error.issues[0]?.message}`,
      );
    }
    const rates = toRates(parsed.data, now.toISOString()).filter((r) => r.rateType === rateType);

    return data.withTransaction(async (r) => {
      let changed = 0;
      for (const row of rates) {
        if (!sameMirrorRow(await r.rates.get(row), row)) changed += 1;
        await r.rates.upsert(row);
      }
      return { rowsRead: rates.length, rowsChanged: changed };
    });
  },
};
