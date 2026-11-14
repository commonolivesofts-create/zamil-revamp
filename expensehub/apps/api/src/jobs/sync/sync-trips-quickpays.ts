// Implements: INT-05a (EH_HCM_BUSINESS_TRIPS) + INT-05b (EH_PAY_QUICK_PAYS), TRD §7.
// Both are windowed extracts (trips: start ≥ today − 365; Quick Pays: last 90 days), so their
// counts rise and fall naturally and the 50 % guard does not apply (INTEGRATION §2.5 note).
import { addDays, riyadhDate } from '../../lib/dates';
import { businessTripCsv, parseRows, quickPayCsv } from '../../integrations/fusion/contracts';
import {
  DEFAULT_TRIP_DESTINATION_FIELD,
  toBusinessTrips,
  toQuickPays,
  withDestination,
} from '../../integrations/fusion/mappers';
import type { JobDefinition } from '../types';
import { sameMirrorRow } from './common';

export const TRIP_WINDOW_DAYS = 365;

function jsonList(value: string | undefined, fallback: string[]): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '');
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
}

export const syncTripsQuickPays: JobDefinition = {
  name: 'sync-trips-quickpays',
  interfaces: ['INT-05a', 'INT-05b'],
  dailyAt: { hour: 2, minute: 0 },
  async run({ data, fusion, clock }) {
    const now = clock();
    const today = riyadhDate(now);
    const windowStart = addDays(today, -TRIP_WINDOW_DAYS);
    const [absenceTypes, elements, destinationField] = await data.read(async (r) => [
      // OQ-10 / OQ-07 proposals: filters are system options passed to the BIP reports.
      jsonList((await r.systemOptions.resolve('TRIP_ABSENCE_TYPES', 'IPP'))?.optionValue, [
        'Business Leave',
      ]),
      jsonList((await r.systemOptions.resolve('QUICKPAY_ELEMENTS', 'IPP'))?.optionValue, []),
      // D-46: which field of the business leave request holds the destination.
      (
        (await r.systemOptions.resolve('TRIP_DESTINATION_FIELD', 'IPP'))?.optionValue ||
        DEFAULT_TRIP_DESTINATION_FIELD
      )
        .trim()
        .toUpperCase(),
    ]);

    const tripRows = withDestination(
      await fusion.bip('INT-05a', 'EH_HCM_BUSINESS_TRIPS', {
        P_ABSENCE_TYPES: absenceTypes.join(','),
        P_FROM_DATE: windowStart,
      }),
      destinationField as string,
    );
    const quickPayRows = await fusion.bip('INT-05b', 'EH_PAY_QUICK_PAYS', {
      P_ELEMENTS: elements.join(','),
      P_FROM_DATE: addDays(today, -90),
    });

    const trips = toBusinessTrips(
      parseRows(businessTripCsv, tripRows, 'EH_HCM_BUSINESS_TRIPS'),
      now.toISOString(),
    );
    const quickPays = toQuickPays(
      parseRows(quickPayCsv, quickPayRows, 'EH_PAY_QUICK_PAYS'),
      now.toISOString(),
    );

    return data.withTransaction(async (r) => {
      let changed = 0;
      const seenTrips = new Set<number>();
      for (const row of trips) {
        seenTrips.add(row.tripId);
        if (!sameMirrorRow(await r.businessTrips.get(row.tripId), row)) changed += 1;
        await r.businessTrips.upsert(row);
      }
      // A trip inside the extract window that Fusion no longer sends was withdrawn; trips older
      // than the window simply left the extract and stay as they are.
      for (const existing of await r.businessTrips.list()) {
        if (
          !seenTrips.has(existing.tripId) &&
          existing.startDate >= windowStart &&
          existing.approvalStatus === 'APPROVED'
        ) {
          await r.businessTrips.upsert({
            ...existing,
            approvalStatus: 'WITHDRAWN',
            syncedAt: now.toISOString(),
          });
          changed += 1;
        }
      }

      for (const row of quickPays) {
        const existing = await r.quickPays.getByFusionKey(row.payrollActionId, row.runResultId);
        // INT-05b: a Quick Pay already sent to Payables is never updated.
        if (existing && (await r.quickPayInvoices.getByQuickPay(existing.quickPayId))) continue;
        const { quickPayId: _ehId, ...existingContent } = existing ?? { quickPayId: 0 };
        if (!existing || !sameMirrorRow(existingContent as typeof row, row)) changed += 1;
        await r.quickPays.upsertByFusionKey(row);
      }

      return { rowsRead: trips.length + quickPays.length, rowsChanged: changed };
    });
  },
};
