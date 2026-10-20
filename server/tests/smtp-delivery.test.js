import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { APPROVED_TEST_RECIPIENT, loadConfig } from '../src/config/index.js';
import { DeliveryUnavailable } from '../src/modules/notifications/delivery.js';
import {
  buildLink,
  composeMessage,
  createOAuthTokenProvider,
  createSmtpDelivery,
  createTransportOptions,
} from '../src/modules/notifications/smtpDelivery.js';
import { addActiveAccount, createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac } from './helpers/rbacFakes.js';
import { installRecovery } from './helpers/recoveryFakes.js';
import { installUsers } from './helpers/usersFakes.js';

// No network: Nodemailer's transport and the token endpoint are replaced by recording doubles.
// Synthetic identifiers and secrets only.

const TEST_DB = 'G0000000000000_ZPADWTEST';
const OAUTH = {
  tenantId: 'contoso.onmicrosoft.com',
  clientId: '11111111-2222-3333-4444-555555555555',
  clientSecret: 'synthetic-client-secret',
};
const smtpConfig = (overrides = {}) => ({
  enabled: true,
  host: 'smtp.office365.com',
  port: 587,
  authMethod: 'OAUTH2',
  user: 'noreply@example.invalid',
  from: { address: 'noreply@example.invalid', name: 'Zamil Revamp' },
  oauth: OAUTH,
  password: null,
  testRecipientOverride: APPROVED_TEST_RECIPIENT,
  testDatabaseName: TEST_DB,
  privilegedDeliveryEnabled: false,
  ...overrides,
});
const LINKS = {
  baseUrl: 'https://revamp.example.invalid',
  PASSWORD_SETUP: '/password/setup',
  PASSWORD_RESET: '/password/reset',
  MFA_RECOVERY: '/mfa/recovery',
};
const TOKEN = 'A'.repeat(43);

function fakeTransport({ fail = null, accepted } = {}) {
  const sent = [];
  let options;
  return {
    sent,
    options: () => options,
    createTransport(opts) {
      options = opts;
      return {
        async sendMail(mail) {
          if (fail) throw fail;
          sent.push(mail);
          return { accepted: accepted ?? [mail.to], rejected: [] };
        },
        async verify() {
          return true;
        },
      };
    },
  };
}

const delivery = ({
  transport = fakeTransport(),
  smtp = smtpConfig(),
  dbName = TEST_DB,
  fetchImpl,
} = {}) => {
  let reads = 0;
  const channel = createSmtpDelivery({
    smtp,
    links: LINKS,
    readDatabaseName: async () => {
      reads += 1;
      if (dbName instanceof Error) throw dbName;
      return dbName;
    },
    createTransport: transport.createTransport,
    fetchImpl,
  });
  return { channel, transport, reads: () => reads };
};
const message = (address = APPROVED_TEST_RECIPIENT, source = 'TEST_OVERRIDE') => ({
  purpose: 'PASSWORD_RESET',
  recipient: { channel: 'EMAIL', address, source },
  userId: '7',
  employeeNumber: '4001',
  token: TOKEN,
  expiresAt: new Date('2026-10-20T10:30:00Z'),
});

describe('Office 365 SMTP transport', () => {
  it('uses smtp.office365.com:587 with mandatory STARTTLS and certificate verification', () => {
    const options = createTransportOptions(smtpConfig(), async () => ({}));
    assert.equal(options.host, 'smtp.office365.com');
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.tls, {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      servername: 'smtp.office365.com',
    });
    assert.equal(options.disableFileAccess, true);
    assert.equal(options.disableUrlAccess, true);
    assert.equal(options.logger, false);
    assert.equal(options.auth.type, 'OAuth2');
    assert.equal(options.auth.user, 'noreply@example.invalid');
    assert.equal('pass' in options.auth, false);
  });

  it('supports tenant-permitted basic SMTP AUTH as an explicit alternative', () => {
    const options = createTransportOptions(
      smtpConfig({ authMethod: 'PASSWORD', oauth: {}, password: 'synthetic-password' }),
      null,
    );
    assert.deepEqual(options.auth, { user: 'noreply@example.invalid', pass: 'synthetic-password' });
  });

  it('hands XOAUTH2 tokens to Nodemailer through the provision callback', async () => {
    const calls = [];
    const options = createTransportOptions(smtpConfig(), async (renew) => {
      calls.push(renew);
      return { accessToken: 'at-1', expires: 123 };
    });
    const result = await new Promise((resolve) =>
      options.auth.provisionCallback('noreply@example.invalid', true, (...args) => resolve(args)),
    );
    assert.deepEqual(result, [null, 'at-1', 123]);
    assert.deepEqual(calls, [true]);
    const failure = await new Promise((resolve) => {
      createTransportOptions(smtpConfig(), async () => {
        throw new Error('token failure');
      }).auth.provisionCallback('u', false, (error) => resolve(error));
    });
    assert.equal(failure.message, 'token failure');
  });
});

describe('Entra ID client-credentials token provider', () => {
  let requests;
  let now;
  const provider = (responses) => {
    requests = [];
    return createOAuthTokenProvider(OAUTH, {
      now: () => now,
      fetchImpl: async (url, init) => {
        requests.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)) });
        const next = responses.shift();
        return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => next.body };
      },
    });
  };
  beforeEach(() => {
    now = 1_000_000;
  });

  it('requests an Outlook SMTP token with client credentials and caches it', async () => {
    const get = provider([{ body: { access_token: 'at-1', expires_in: 3600 } }]);
    const token = await get();
    assert.equal(token.accessToken, 'at-1');
    assert.equal(token.expires, now + 3600_000);
    assert.equal(
      requests[0].url,
      'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token',
    );
    assert.deepEqual(requests[0].body, {
      client_id: OAUTH.clientId,
      client_secret: OAUTH.clientSecret,
      scope: 'https://outlook.office365.com/.default',
      grant_type: 'client_credentials',
    });
    await get();
    assert.equal(requests.length, 1);
  });

  it('renews when asked, or shortly before expiry', async () => {
    const get = provider([
      { body: { access_token: 'at-1', expires_in: 3600 } },
      { body: { access_token: 'at-2', expires_in: 3600 } },
      { body: { access_token: 'at-3', expires_in: 3600 } },
    ]);
    await get();
    assert.equal((await get(true)).accessToken, 'at-2');
    now += 3600_000 - 30_000;
    assert.equal((await get()).accessToken, 'at-3');
  });

  it('fails with the OAuth error code only (no description or secret)', async () => {
    const get = provider([
      {
        ok: false,
        status: 401,
        body: { error: 'invalid_client', error_description: 'AADSTS7000215 secret details' },
      },
    ]);
    await assert.rejects(get(), (error) => {
      assert.equal(error.code, 'SMTP_OAUTH_TOKEN_FAILED');
      assert.match(error.message, /invalid_client/);
      assert.doesNotMatch(error.message, /AADSTS|secret/);
      return true;
    });
  });
});

describe('SMTP delivery channel', () => {
  it('sends the link with the token in the URL fragment and a TEST banner', async () => {
    const { channel, transport } = delivery();
    await channel.deliver(message());
    const [mail] = transport.sent;
    assert.equal(mail.to, APPROVED_TEST_RECIPIENT);
    assert.deepEqual(mail.from, { name: 'Zamil Revamp', address: 'noreply@example.invalid' });
    assert.equal(mail.subject, '[TEST] Reset your Zamil Revamp password');
    assert.ok(mail.text.includes(`https://revamp.example.invalid/password/reset#token=${TOKEN}`));
    assert.match(mail.text, /redirected from the account of employee 4001/);
    assert.match(mail.text, /2026-10-20 10:30 UTC/);
  });

  it('builds links only from configuration and escapes HTML', () => {
    assert.equal(
      buildLink(LINKS, 'MFA_RECOVERY', TOKEN),
      `https://revamp.example.invalid/mfa/recovery#token=${TOKEN}`,
    );
    assert.throws(
      () => buildLink({ ...LINKS, baseUrl: null }, 'MFA_RECOVERY', TOKEN),
      DeliveryUnavailable,
    );
    const html = composeMessage({
      purpose: 'PASSWORD_SETUP',
      link: 'https://x.invalid/?a=1&b="<script>"',
      expiresAt: new Date(),
      test: false,
    }).html;
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&amp;b=&quot;&lt;script&gt;&quot;/);
  });

  it('refuses the override unless the connected database is the configured TEST database', async () => {
    for (const dbName of ['G0000000000000_ZPADWPROD', null, new Error('ORA-12545')]) {
      const { channel, transport } = delivery({ dbName });
      await assert.rejects(channel.deliver(message()), { reason: 'DATABASE_IDENTITY_UNVERIFIED' });
      assert.equal(transport.sent.length, 0);
    }
  });

  it('verifies the database identity once per process', async () => {
    const { channel, reads } = delivery();
    await channel.deliver(message());
    await channel.deliver(message());
    assert.equal(reads(), 1);
  });

  it('never sends to any address other than the override while it is set', async () => {
    const { channel, transport } = delivery();
    await assert.rejects(channel.deliver(message('employee@example.invalid', 'EMPLOYEE_MASTER')), {
      reason: 'RECIPIENT_NOT_PERMITTED',
    });
    assert.equal(transport.sent.length, 0);
  });

  it('without an override, sends to the employee and refuses override-sourced recipients', async () => {
    const { channel, transport, reads } = delivery({
      smtp: smtpConfig({ testRecipientOverride: null, testDatabaseName: null }),
    });
    await channel.deliver(message('employee@example.invalid', 'EMPLOYEE_MASTER'));
    assert.equal(transport.sent[0].to, 'employee@example.invalid');
    assert.equal(transport.sent[0].subject, 'Reset your Zamil Revamp password');
    assert.equal(reads(), 0);
    await assert.rejects(channel.deliver(message()), { reason: 'RECIPIENT_NOT_PERMITTED' });
  });

  it('maps SMTP authentication and transport errors to DELIVERY_FAILED without leaking', async () => {
    const authError = Object.assign(new Error('535 5.7.3 Authentication unsuccessful'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    const { channel } = delivery({ transport: fakeTransport({ fail: authError }) });
    await assert.rejects(channel.deliver(message()), (error) => {
      assert.ok(error instanceof DeliveryUnavailable);
      assert.equal(error.reason, 'DELIVERY_FAILED');
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      return true;
    });
  });

  it('treats a message the server did not accept for the recipient as failed', async () => {
    const { channel } = delivery({ transport: fakeTransport({ accepted: [] }) });
    await assert.rejects(channel.deliver(message()), { reason: 'DELIVERY_FAILED' });
  });

  it('resolves recipients by the approved policy', () => {
    const { channel } = delivery();
    const ordinary = { employeeNumber: '4001', employee: { email: ' Sara@Example.invalid ' } };
    assert.deepEqual(channel.resolveRecipient(ordinary), {
      channel: 'EMAIL',
      address: APPROVED_TEST_RECIPIENT,
      source: 'TEST_OVERRIDE',
    });
    assert.equal(channel.resolveRecipient({ ...ordinary, employee: { email: null } }), null);
    assert.equal(
      channel.resolveRecipient({ employeeNumber: '2172', employee: ordinary.employee }),
      null,
    );
    assert.equal(channel.resolveRecipient({ ...ordinary, hasSecurityAdministration: true }), null);
    const production = delivery({
      smtp: smtpConfig({
        testRecipientOverride: null,
        testDatabaseName: null,
        privilegedDeliveryEnabled: true,
      }),
    }).channel;
    assert.equal(production.resolveRecipient(ordinary).address, 'sara@example.invalid');
    assert.equal(
      production.resolveRecipient({ employeeNumber: '2172', employee: ordinary.employee }).address,
      'zaid.sayyed@zamilplastic.com',
    );
  });
});

describe('SMTP configuration', () => {
  const base = {
    NODE_ENV: 'development',
    ORACLE_USER: 'app_user',
    ORACLE_PASSWORD: 'db-secret',
    ORACLE_WALLET_DIR: '../secrets/oracle/Wallet_example',
    ORACLE_WALLET_PASSWORD: 'wallet-secret',
    ORACLE_LOW_ALIAS: 'example_low',
    ORACLE_HIGH_ALIAS: 'example_high',
    AUTH_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const smtpEnv = {
    SMTP_ENABLED: 'true',
    SMTP_USER: 'noreply@example.invalid',
    SMTP_OAUTH_TENANT_ID: OAUTH.tenantId,
    SMTP_OAUTH_CLIENT_ID: OAUTH.clientId,
    SMTP_OAUTH_CLIENT_SECRET: OAUTH.clientSecret,
    AUTH_FRONTEND_BASE_URL: 'https://revamp.example.invalid',
    SMTP_TEST_RECIPIENT_OVERRIDE: APPROVED_TEST_RECIPIENT,
    SMTP_TEST_DATABASE_NAME: TEST_DB,
  };
  const load = (overrides = {}) => loadConfig({ ...base, ...smtpEnv, ...overrides });

  it('is disabled by default', () => {
    assert.equal(loadConfig(base).smtp.enabled, false);
  });

  it('accepts a complete OAuth2 TEST configuration with the fixed Office 365 endpoint', () => {
    const { smtp, links } = load();
    assert.equal(smtp.host, 'smtp.office365.com');
    assert.equal(smtp.port, 587);
    assert.equal(smtp.authMethod, 'OAUTH2');
    assert.equal(smtp.testRecipientOverride, APPROVED_TEST_RECIPIENT);
    assert.equal(smtp.from.address, 'noreply@example.invalid');
    assert.equal(links.PASSWORD_SETUP, '/password/setup');
  });

  it('refuses unsafe or incomplete settings at startup', () => {
    const cases = [
      [
        { NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'https://revamp.example.invalid' },
        /SMTP_TEST_RECIPIENT_OVERRIDE/,
      ],
      [{ SMTP_TEST_RECIPIENT_OVERRIDE: undefined }, /SMTP_TEST_RECIPIENT_OVERRIDE/],
      [
        { SMTP_TEST_RECIPIENT_OVERRIDE: 'someone.else@example.invalid' },
        /SMTP_TEST_RECIPIENT_OVERRIDE/,
      ],
      [{ SMTP_TEST_DATABASE_NAME: undefined }, /SMTP_TEST_DATABASE_NAME/],
      [{ SMTP_TEST_DATABASE_NAME: 'G0000_ZPADWPROD' }, /SMTP_TEST_DATABASE_NAME/],
      [{ SMTP_PRIVILEGED_DELIVERY_ENABLED: 'true' }, /SMTP_PRIVILEGED_DELIVERY_ENABLED/],
      [{ SMTP_OAUTH_CLIENT_SECRET: undefined }, /SMTP_OAUTH_CLIENT_SECRET/],
      [{ SMTP_AUTH_METHOD: 'PASSWORD' }, /SMTP_PASSWORD|SMTP_OAUTH/],
      [{ SMTP_USER: undefined }, /SMTP_USER/],
      [{ AUTH_FRONTEND_BASE_URL: undefined }, /AUTH_FRONTEND_BASE_URL/],
      [{ NODE_ENV: 'uat', AUTH_FRONTEND_BASE_URL: 'http://revamp.example.invalid' }, /https/],
      [{ AUTH_PASSWORD_RESET_PATH: 'reset' }, /AUTH_PASSWORD_RESET_PATH/],
    ];
    for (const [overrides, pattern] of cases) {
      const env = { ...smtpEnv, ...overrides };
      for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
      assert.throws(() => loadConfig({ ...base, ...env }), pattern, JSON.stringify(overrides));
    }
  });
});

describe('SMTP delivery through the recovery API (fake transport)', () => {
  async function setup(transport, dbName = TEST_DB) {
    const store = createAuthStore();
    installRbac(store, { syncPrivilegeFlags: true });
    installUsers(store);
    installRecovery(store);
    await addActiveAccount(store, {
      password: 'Correct-Horse1!',
      employee: { employeeNumber: '4001', username: 'sara.k', email: 'sara.k@example.invalid' },
    });
    store.delivery = delivery({ transport, dbName }).channel;
    return { store, app: createTestApp(store) };
  }
  const reset = (app) =>
    request(app)
      .post('/api/v1/auth/recovery/request')
      .send({ username: 'sara.k', purpose: 'PASSWORD_RESET' });

  it('mails only the test mailbox; the link completes the reset', async () => {
    const transport = fakeTransport();
    const { store, app } = await setup(transport);
    const res = await reset(app);
    assert.equal(res.status, 202);
    assert.equal(JSON.stringify(res.body).includes('token'), false);
    const [mail] = transport.sent;
    assert.equal(mail.to, APPROVED_TEST_RECIPIENT);
    const token = /#token=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];
    assert.equal(JSON.stringify(store.state.audit).includes(token), false);
    const done = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'New-Passw0rd!x' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
  });

  it('leaves no usable token when SMTP fails or the database identity is wrong', async () => {
    for (const [transport, dbName, reason] of [
      [
        fakeTransport({ fail: Object.assign(new Error('535'), { code: 'EAUTH' }) }),
        TEST_DB,
        'DELIVERY_FAILED',
      ],
      [fakeTransport(), 'OTHER_DB', 'DATABASE_IDENTITY_UNVERIFIED'],
    ]) {
      const { store, app } = await setup(transport, dbName);
      const res = await reset(app);
      assert.equal(res.status, 202); // anonymous callers learn nothing
      assert.equal(store.state.actionTokens.length, 0);
      const failure = store.auditEvents('ACTION_TOKEN_ISSUED').at(-1);
      assert.equal(failure.eventOutcome, 'FAILURE');
      assert.equal(failure.reasonCode, reason);
      assert.equal(transport.sent.length, 0);
    }
  });
});
