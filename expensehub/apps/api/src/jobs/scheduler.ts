// Implements: TRD §7 schedules, in Asia/Riyadh. A small timer scheduler instead of node-cron:
// phase-1 jobs are "daily at HH:MM" or "hourly HH–HH", Riyadh has no daylight saving, and it
// keeps the next-run time visible to the integration monitor.
import type { Logger } from 'pino';
import { RIYADH_OFFSET_MS, type Clock } from '../lib/dates';
import type { JobRunner } from './runner';
import type { JobDefinition } from './types';

/** Next occurrence of hour:minute Riyadh time strictly after `now`. */
export function nextDailyRun(dailyAt: { hour: number; minute: number }, now: Date): Date {
  const riyadhNow = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const candidate = Date.UTC(
    riyadhNow.getUTCFullYear(),
    riyadhNow.getUTCMonth(),
    riyadhNow.getUTCDate(),
    dailyAt.hour,
    dailyAt.minute,
  );
  let next = candidate - RIYADH_OFFSET_MS;
  if (next <= now.getTime()) next += 24 * 60 * 60 * 1000;
  return new Date(next);
}

export function formatDailyAt({ hour, minute }: { hour: number; minute: number }): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Next run of a job: daily at HH:MM, or every hour fromHour…toHour (Riyadh). */
export function nextRun(job: Pick<JobDefinition, 'dailyAt' | 'hourly'>, now: Date): Date {
  if (!job.hourly) return nextDailyRun(job.dailyAt, now);
  const { fromHour, toHour } = job.hourly;
  const candidates = Array.from({ length: toHour - fromHour + 1 }, (_, i) =>
    nextDailyRun({ hour: fromHour + i, minute: 0 }, now),
  );
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

/** "01:00" daily, or "hourly 07:00–20:00". */
export function formatSchedule(job: Pick<JobDefinition, 'dailyAt' | 'hourly'>): string {
  if (!job.hourly) return formatDailyAt(job.dailyAt);
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `hourly ${hh(job.hourly.fromHour)}–${hh(job.hourly.toHour)}`;
}

export class Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly runner: JobRunner,
    private readonly jobs: readonly JobDefinition[],
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  start(): this {
    for (const job of this.jobs) this.arm(job);
    this.logger.info(
      { jobs: this.jobs.map((j) => `${j.name}@${formatSchedule(j)}`) },
      'job scheduler started (Asia/Riyadh)',
    );
    return this;
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private arm(job: JobDefinition): void {
    const delay = Math.max(0, nextRun(job, this.clock()).getTime() - Date.now());
    const timer = setTimeout(() => {
      void this.runner
        .run(job.name)
        .catch((err: unknown) => this.logger.error({ err, job: job.name }, 'scheduled job crashed'))
        .finally(() => this.arm(job));
    }, delay);
    timer.unref();
    this.timers.set(job.name, timer);
  }
}
