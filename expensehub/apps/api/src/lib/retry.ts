// INTEGRATION §2.4: retry network errors, 429 and 5xx with back-off; never other 4xx.

export type RetryOutcome<T> =
  { ok: true; value: T; retries: number } | { ok: false; error: unknown; retries: number };

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** First attempt, then one retry per entry in delaysMs (waiting that long before it). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    delaysMs: readonly number[];
    isRetryable: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<RetryOutcome<T>> {
  const sleep = options.sleep ?? realSleep;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return { ok: true, value: await fn(), retries: attempt };
    } catch (error) {
      const delay = options.delaysMs[attempt];
      if (delay === undefined || !options.isRetryable(error)) {
        return { ok: false, error, retries: attempt };
      }
      await sleep(delay);
    }
  }
}
