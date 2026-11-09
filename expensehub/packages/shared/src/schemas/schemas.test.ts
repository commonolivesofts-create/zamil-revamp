import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_HTTP_STATUS } from '../errors';
import { errorEnvelopeSchema } from './error';
import { healthResponseSchema } from './health';

describe('healthResponseSchema', () => {
  const valid = {
    status: 'ok',
    db: 'ok',
    dataMode: 'memory',
    fusionMode: 'mock',
    notifyTransport: 'outbox',
    env: 'development',
    version: '0.1.0',
    time: '2026-10-18T09:00:00.000+03:00',
    uptimeSeconds: 12,
  };

  it('accepts a valid health payload', () => {
    expect(healthResponseSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown data mode', () => {
    expect(healthResponseSchema.safeParse({ ...valid, dataMode: 'sqlite' }).success).toBe(false);
  });

  it('rejects a timestamp without offset information', () => {
    expect(healthResponseSchema.safeParse({ ...valid, time: 'yesterday' }).success).toBe(false);
  });
});

describe('error codes', () => {
  it('maps every code to an HTTP status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('parses the API error envelope', () => {
    const body = { error: { code: 'POLICY_BLOCK', message: 'Limit exceeded', details: {} } };
    expect(errorEnvelopeSchema.parse(body).error.code).toBe('POLICY_BLOCK');
  });

  it('rejects an unknown error code', () => {
    const body = { error: { code: 'TEAPOT', message: 'x' } };
    expect(errorEnvelopeSchema.safeParse(body).success).toBe(false);
  });
});
