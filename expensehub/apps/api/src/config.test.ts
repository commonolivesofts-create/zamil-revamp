import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';
import { REPO_ROOT } from './paths';
import { TEST_SECRET } from './test-utils';
import path from 'node:path';

const base = { SESSION_SECRET: TEST_SECRET };

function issuesOf(env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
  return [];
}

describe('loadConfig', () => {
  it('applies D-33 development defaults', () => {
    const config = loadConfig(base);
    expect(config.env).toBe('development');
    expect(config.data.mode).toBe('memory');
    expect(config.fusion.mode).toBe('mock');
    expect(config.notify.transport).toBe('outbox');
    expect(config.api.port).toBe(7385);
    expect(config.auth.devQuickLogin).toBe(true);
    expect(config.data.file).toBe(path.join(REPO_ROOT, 'storage', 'dev-data.json'));
  });

  it('refuses to start without a session secret', () => {
    expect(issuesOf({})).toEqual([expect.stringContaining('SESSION_SECRET')]);
  });

  it('treats empty values as unset', () => {
    const config = loadConfig({ ...base, TEAMS_WEBHOOK_URL: '', API_PORT: '  ' });
    expect(config.notify.teamsWebhookUrl).toBeUndefined();
    expect(config.api.port).toBe(7385);
  });

  it('requires the DB settings only when DATA_MODE=oracle', () => {
    const issues = issuesOf({ ...base, DATA_MODE: 'oracle' });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DB_USER'),
        expect.stringContaining('DB_PASSWORD'),
        expect.stringContaining('DB_CONNECT_STRING'),
        expect.stringContaining('DB_WALLET_DIR'),
      ]),
    );
  });

  it('requires the Fusion credentials only when FUSION_MODE=live', () => {
    expect(issuesOf({ ...base, FUSION_MODE: 'live' })).toHaveLength(3);
  });

  it('requires SMTP settings only when NOTIFY_TRANSPORT=smtp', () => {
    expect(issuesOf({ ...base, NOTIFY_TRANSPORT: 'smtp' })).toHaveLength(2);
  });

  it('refuses memory store, mock Fusion and placeholder secrets in production', () => {
    const issues = issuesOf({
      NODE_ENV: 'production',
      SESSION_SECRET: 'change-me-64-chars-change-me-64-chars',
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DATA_MODE'),
        expect.stringContaining('FUSION_MODE'),
        expect.stringContaining('placeholder secret'),
      ]),
    );
  });

  it('never enables dev quick-login in production', () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: 'production',
      DEV_QUICK_LOGIN: 'true',
      DATA_MODE: 'oracle',
      DB_USER: 'EXPENSEHUB',
      DB_PASSWORD: 'x',
      DB_CONNECT_STRING: 'expensehub_low',
      DB_WALLET_DIR: '../secrets/oracle/Wallet_zpadwtest',
      FUSION_MODE: 'live',
      FUSION_BASE_URL: 'https://pod.fa.example.oraclecloud.com',
      FUSION_USER: 'u',
      FUSION_PASSWORD: 'p',
    });
    expect(config.auth.devQuickLogin).toBe(false);
  });

  it('rejects unknown modes', () => {
    expect(issuesOf({ ...base, DATA_MODE: 'sqlite' })).toEqual([
      expect.stringContaining('DATA_MODE'),
    ]);
  });
});
