// Background jobs: nightly employee sync from Fusion and approval reminders.
import { riyadhDate } from './lib/dates';
import { sendReminders } from './domain/requests';
import { syncEmployees } from './integrations/fusion/sync';
import type { Services } from './services';

export function startJobs(svc: Services) {
  let lastSyncDay = '';
  let lastReminderHour = '';
  const tick = async () => {
    const now = svc.clock();
    const riyadhHour = (now.getUTCHours() + 3) % 24;
    const day = riyadhDate(now);
    try {
      if (riyadhHour === svc.config.fusion.syncHour && lastSyncDay !== day) {
        lastSyncDay = day;
        const r = await syncEmployees(svc.ctx(null), svc.employees);
        svc.log.info({ status: r.statusCode }, `nightly employee sync: ${r.message}`);
      }
      const hourKey = `${day}T${riyadhHour}`;
      if (riyadhHour >= 8 && riyadhHour <= 17 && lastReminderHour !== hourKey && riyadhHour % 3 === 2) {
        lastReminderHour = hourKey;
        const n = await sendReminders(svc.ctx(null));
        if (n) svc.log.info(`sent ${n} approval reminder(s)`);
      }
    } catch (err) {
      svc.log.error({ err }, 'background job failed');
    }
  };
  const timer = setInterval(() => void tick(), 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
