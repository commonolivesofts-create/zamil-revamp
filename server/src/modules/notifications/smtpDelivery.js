import nodemailer from 'nodemailer';
import { logger } from '../../shared/logger/index.js';
import { createRecipientResolver, DeliveryUnavailable } from './delivery.js';

/*
 * Office 365 SMTP delivery channel (owner decision, Phase 05; not Microsoft Graph).
 *
 * Transport: smtp.office365.com:587, STARTTLS required, TLS 1.2+, certificate verification always on
 * (no option to disable), no file or URL access while composing, Nodemailer logging off.
 *
 * Authentication:
 *   - OAUTH2 (preferred): SMTP AUTH XOAUTH2. An access token for https://outlook.office365.com/.default
 *     is obtained with the Entra ID client-credentials grant and cached until shortly before expiry;
 *     a rejected token is renewed once. The tenant must allow the app to send as SMTP_USER.
 *   - PASSWORD: SMTP AUTH LOGIN for tenants that still permit basic SMTP AUTH on the mailbox.
 *
 * Test safety: with a test recipient override, each send first proves (once per process) that the
 * connected database is the configured TEST database, and refuses any recipient other than the
 * override. Production configuration cannot carry an override (config validation).
 *
 * Nothing here logs links, tokens, message bodies, recipients or credentials.
 */
const TOKEN_SCOPE = 'https://outlook.office365.com/.default';
const TOKEN_EARLY_RENEW_MS = 60_000;

const PURPOSE_TEXT = Object.freeze({
  PASSWORD_SETUP: {
    subject: 'Set up your Zamil Revamp password',
    action: 'set up the password for your new Zamil Revamp account',
  },
  PASSWORD_RESET: {
    subject: 'Reset your Zamil Revamp password',
    action: 'reset your Zamil Revamp password',
  },
  MFA_RECOVERY: {
    subject: 'Recover your Zamil Revamp authenticator',
    action: 'replace the authenticator app used for your Zamil Revamp sign-in',
  },
});

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** The frontend link; the token travels in the fragment, which browsers never send to servers. */
export function buildLink(links, purpose, token) {
  const path = links[purpose];
  if (!links.baseUrl || !path) throw new DeliveryUnavailable('LINK_NOT_CONFIGURED');
  const url = new URL(path, links.baseUrl);
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

export function composeMessage({ purpose, link, expiresAt, test, employeeNumber }) {
  const text = PURPOSE_TEXT[purpose];
  if (!text) throw new DeliveryUnavailable('UNSUPPORTED_PURPOSE');
  const expiry = new Date(expiresAt).toISOString().replace('T', ' ').slice(0, 16);
  const banner = test
    ? `TEST ENVIRONMENT: this message was redirected from the account of employee ${employeeNumber}.\n\n`
    : '';
  const body =
    `${banner}Use the link below to ${text.action}. It works once and expires at ${expiry} UTC.\n\n` +
    `${link}\n\n` +
    'If you did not expect this message, do not use the link and contact your administrator.\n' +
    'Zamil Revamp will never ask you for your password or authenticator codes by e-mail.';
  const html =
    (test ? `<p><strong>${escapeHtml(banner.trim())}</strong></p>` : '') +
    `<p>Use the link below to ${escapeHtml(text.action)}. It works once and expires at ` +
    `${escapeHtml(expiry)} UTC.</p><p><a href="${escapeHtml(link)}">${escapeHtml(text.subject)}</a></p>` +
    '<p>If you did not expect this message, do not use the link and contact your administrator. ' +
    'Zamil Revamp will never ask you for your password or authenticator codes by e-mail.</p>';
  return { subject: `${test ? '[TEST] ' : ''}${text.subject}`, text: body, html };
}

/** Entra ID client-credentials token provider for SMTP XOAUTH2 (cached; never logged). */
export function createOAuthTokenProvider(
  { tenantId, clientId, clientSecret },
  { fetchImpl = fetch, now = Date.now } = {},
) {
  let cached = null;
  return async function getAccessToken(renew = false) {
    if (!renew && cached && cached.expires - TOKEN_EARLY_RENEW_MS > now()) return cached;
    const response = await fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: TOKEN_SCOPE,
          grant_type: 'client_credentials',
        }),
        redirect: 'error',
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.access_token !== 'string') {
      // Only the OAuth error code is surfaced; descriptions can echo tenant details.
      const error = new Error(`OAuth token request failed (${payload.error ?? response.status})`);
      error.code = 'SMTP_OAUTH_TOKEN_FAILED';
      throw error;
    }
    cached = {
      accessToken: payload.access_token,
      expires: now() + Number(payload.expires_in ?? 0) * 1000,
    };
    return cached;
  };
}

export function createTransportOptions(smtp, getAccessToken) {
  const auth =
    smtp.authMethod === 'OAUTH2'
      ? {
          type: 'OAuth2',
          user: smtp.user,
          provisionCallback: (_user, renew, callback) => {
            getAccessToken(renew).then(
              (token) => callback(null, token.accessToken, token.expires),
              (error) => callback(error),
            );
          },
        }
      : { user: smtp.user, pass: smtp.password };
  return {
    host: smtp.host,
    port: smtp.port,
    secure: false, // STARTTLS on 587 ...
    requireTLS: true, // ... and never continue without it
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: smtp.host },
    auth,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

/**
 * @param {object} deps
 * @param {object} deps.smtp     config.smtp
 * @param {object} deps.links    config.links
 * @param {() => Promise<string|null>} deps.readDatabaseName  connected DB_NAME (Oracle)
 */
export function createSmtpDelivery({
  smtp,
  links,
  readDatabaseName,
  createTransport = nodemailer.createTransport,
  fetchImpl = fetch,
}) {
  const override = smtp.testRecipientOverride;
  const getAccessToken =
    smtp.authMethod === 'OAUTH2' ? createOAuthTokenProvider(smtp.oauth, { fetchImpl }) : null;
  const transport = createTransport(createTransportOptions(smtp, getAccessToken));
  let identityVerified = false;

  async function assertTestDatabase() {
    if (!override || identityVerified) return;
    const name = await readDatabaseName().catch(() => null);
    if (!name || name !== smtp.testDatabaseName) {
      logger.error(
        'Test recipient override refused: database identity is not the configured TEST database',
      );
      throw new DeliveryUnavailable('DATABASE_IDENTITY_UNVERIFIED');
    }
    identityVerified = true;
  }

  return {
    configured: true,
    resolveRecipient: createRecipientResolver({
      testRecipientOverride: override,
      privilegedDeliveryEnabled: smtp.privilegedDeliveryEnabled,
    }),

    async deliver({ purpose, recipient, employeeNumber, token, expiresAt }) {
      await assertTestDatabase();
      // Defence in depth: under an override only the override mailbox may ever be addressed.
      if (override ? recipient.address !== override : recipient.source === 'TEST_OVERRIDE') {
        throw new DeliveryUnavailable('RECIPIENT_NOT_PERMITTED');
      }
      const message = composeMessage({
        purpose,
        link: buildLink(links, purpose, token),
        expiresAt,
        test: Boolean(override),
        employeeNumber,
      });
      let info;
      try {
        info = await transport.sendMail({
          from: { name: smtp.from.name, address: smtp.from.address },
          to: recipient.address,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (error) {
        logger.error(
          { smtpCode: error.code, responseCode: error.responseCode },
          'SMTP delivery failed',
        );
        throw new DeliveryUnavailable('DELIVERY_FAILED');
      }
      const accepted = (info.accepted ?? []).map((a) => String(a.address ?? a).toLowerCase());
      if (!accepted.includes(recipient.address) || (info.rejected ?? []).length > 0) {
        logger.error('SMTP delivery was not accepted for the recipient');
        throw new DeliveryUnavailable('DELIVERY_FAILED');
      }
    },

    /** Connection, STARTTLS and authentication check without sending (operator tooling). */
    async verifyConnection() {
      await assertTestDatabase();
      await transport.verify();
    },
  };
}
