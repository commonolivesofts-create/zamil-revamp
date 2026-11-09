import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

const retryable = (err: unknown) => (err as { retryable?: boolean }).retryable === true;
const fail = (retryable: boolean) => Object.assign(new Error('boom'), { retryable });

describe('withRetry (INTEGRATION §2.4)', () => {
  it('returns at once on success', async () => {
    const out = await withRetry(async () => 42, {
      delaysMs: [2000, 10000, 30000],
      isRetryable: retryable,
    });
    expect(out).toEqual({ ok: true, value: 42, retries: 0 });
  });

  it('waits 2 s, 10 s, 30 s between retries, then gives up after 3 retries', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fn = vi.fn(async () => {
      throw fail(true);
    });
    const out = await withRetry(fn, {
      delaysMs: [2000, 10000, 30000],
      isRetryable: retryable,
      sleep,
    });
    expect(out.ok).toBe(false);
    expect(out.retries).toBe(3);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 10000, 30000]);
  });

  it('recovers when a retry succeeds', async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw fail(true);
        return 'ok';
      },
      { delaysMs: [0, 0, 0], isRetryable: retryable, sleep: async () => {} },
    );
    expect(out).toEqual({ ok: true, value: 'ok', retries: 2 });
  });

  it('never retries a non-retryable error (4xx other than 429)', async () => {
    const fn = vi.fn(async () => {
      throw fail(false);
    });
    const out = await withRetry(fn, {
      delaysMs: [0, 0, 0],
      isRetryable: retryable,
      sleep: async () => {},
    });
    expect(out.retries).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
