// Operator tool for the controlled Oracle TEST MFA runs (`npm run auth:mfa-test`). It drives the
// public API of a server already running on this machine (loopback only):
//   default:    login -> first-time enrollment or verification -> /me -> /csrf -> optional logout,
//               optionally followed by a second sign-in that exercises /mfa/verify;
//   --replace:  login with the current authenticator -> /mfa/replacement -> confirm with the NEW
//               authenticator -> confirm every session was revoked -> sign in again with the new
//               authenticator -> /me -> logout.
//
// The password and authenticator codes are read from hidden prompts. Cookies, session and CSRF
// tokens stay in memory and are never printed. The only secret ever printed is an authenticator
// setup key, shown once in the operator's own terminal, which must never be copied anywhere.
// The tool never touches the database directly; all writes happen through the API.
import { pathToFileURL } from 'node:url';
import { promptLine } from './bootstrap-test-rbac.js';

const HOST = '127.0.0.1';
const MAX_CODE_ATTEMPTS = 3;

export function parseArgs(argv) {
  let port = 3000;
  let replace = false;
  for (const arg of argv) {
    const match = /^--port=(\d{2,5})$/.exec(arg);
    if (match) port = Number(match[1]);
    else if (arg === '--replace') replace = true;
    else {
      throw new Error(
        'Only --port=<number> and --replace are accepted; no credentials are read from arguments.',
      );
    }
  }
  return { baseUrl: `http://${HOST}:${port}/api/v1/auth`, replace };
}

/** Minimal cookie jar: keeps name=value pairs from Set-Cookie, drops cleared cookies. */
export function createCookieJar() {
  const cookies = new Map();
  return {
    store(headers) {
      for (const header of headers.getSetCookie()) {
        const [pair] = header.split(';');
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (value === '' || /expires=Thu, 01 Jan 1970/i.test(header)) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    clear: () => cookies.clear(),
  };
}

export function createClient(baseUrl, jar = createCookieJar()) {
  return async function call(method, path, { body, csrf } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
    });
    jar.store(response.headers);
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, payload };
  };
}

// Status and stable error code only; messages and bodies may contain data and are not printed.
const describe = ({ status, payload }) => `HTTP ${status} ${payload?.error?.code ?? ''}`.trim();

async function askCode(io, label) {
  const code = (await promptLine(io, label, { hidden: true })).trim();
  if (!/^\d{6}$/.test(code)) throw new Error('A 6-digit code is required.');
  return code;
}

/** Submits codes until accepted (bounded, because every wrong code counts toward the lockout). */
async function submitCode(io, say, call, path, csrf, label) {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = await askCode(io, label);
    const result = await call('POST', path, { body: { code }, csrf });
    if (result.status === 200) return result.payload.data;
    say(`  Refused: ${describe(result)}`);
    if (result.payload?.error?.code !== 'MFA_VERIFICATION_FAILED') return null;
    if (attempt < MAX_CODE_ATTEMPTS) {
      say('  Wait for the next code (each wrong code counts toward the 5-failure lockout).');
    }
  }
  return null;
}

/** Shows setup material once, with the handling rules for it. */
function showSetupKey(say, setup, heading) {
  say('');
  say(heading);
  say(`  Issuer:       ${setup.issuer}`);
  say(`  Account name: ${setup.accountName}`);
  say(`  Setup key:    ${setup.secret.match(/.{1,4}/g).join(' ')}`);
  say(`  Type: time-based, ${setup.digits} digits, ${setup.periodSeconds} s, ${setup.algorithm}`);
  say('  SECRET: type it into the authenticator app only. Never copy it into a chat, ticket,');
  say('  e-mail, screenshot or log. Clear this terminal afterwards (Clear-Host / cls).');
  say('');
}

const CURRENT_CODE = 'Current 6-digit code from the authenticator app (hidden): ';

async function signInWithMfa(
  io,
  say,
  call,
  { codeLabel = CURRENT_CODE, allowEnrollment = true } = {},
) {
  const username = (await promptLine(io, 'Username (employee-master USER_NAME): ')).trim();
  const password = await promptLine(io, 'Password (hidden): ', { hidden: true });

  const login = await call('POST', '/login', { body: { username, password } });
  if (login.status !== 200) {
    say(`Login refused: ${describe(login)}`);
    return null;
  }
  const data = login.payload.data;
  if (data.authenticated) {
    say('Signed in WITHOUT MFA. Unexpected for a mandatory-MFA account: stop and report.');
    return { csrf: data.csrf.token, session: data.session };
  }
  say(`Password accepted. MFA challenge issued (expires ${data.mfa.expiresAt}).`);
  const challengeCsrf = data.csrf.token;

  if (data.mfa.enrollmentRequired) {
    if (!allowEnrollment) {
      say('This account has no authenticator yet; there is nothing to replace. Stopping.');
      return null;
    }
    const start = await call('POST', '/mfa/enrollment', { body: {}, csrf: challengeCsrf });
    if (start.status !== 200) {
      say(`Enrollment start refused: ${describe(start)}`);
      return null;
    }
    showSetupKey(
      say,
      start.payload.data,
      'Add this account in the authenticator app ("Enter a setup key"):',
    );
    const result = await submitCode(
      io,
      say,
      call,
      '/mfa/enrollment/confirm',
      challengeCsrf,
      codeLabel,
    );
    if (!result) return null;
    say('Authenticator enrolled and MFA-verified session issued.');
    return { csrf: result.csrf.token, session: result.session };
  }

  const result = await submitCode(io, say, call, '/mfa/verify', challengeCsrf, codeLabel);
  if (!result) return null;
  say('MFA verified and session issued.');
  return { csrf: result.csrf.token, session: result.session };
}

async function checkSession(say, call, signedIn) {
  const me = await call('GET', '/me');
  if (me.status !== 200) {
    say(`/me refused: ${describe(me)}`);
    return false;
  }
  const { user, session } = me.payload.data;
  say(
    `/me: USER_ID ${user.id}, mfaVerified=${session.mfaVerified}, idleTimeoutSeconds=${session.idleTimeoutSeconds}, expiresAt=${session.expiresAt}`,
  );
  const csrf = await call('GET', '/csrf');
  say(
    `/csrf: ${csrf.status === 200 && csrf.payload.data.token === signedIn.csrf ? 'matches the session' : describe(csrf)}`,
  );
  return true;
}

async function logout(say, call, signedIn) {
  const result = await call('POST', '/logout', { csrf: signedIn.csrf });
  say(`Logout: ${result.status === 204 ? 'HTTP 204' : describe(result)}`);
  const after = await call('GET', '/me');
  say(`/me after logout: ${describe(after)} (expected HTTP 401 UNAUTHENTICATED)`);
}

async function runEnrollmentFlow(io, say, baseUrl) {
  for (let round = 1; round <= 2; round += 1) {
    const call = createClient(baseUrl);
    const signedIn = await signInWithMfa(io, say, call);
    if (!signedIn) return 1;
    if (!(await checkSession(say, call, signedIn))) return 1;

    const keep = (await promptLine(io, 'Log out now? (Y/n): ')).trim().toLowerCase();
    if (keep !== 'n') await logout(say, call, signedIn);
    if (round === 2) break;
    const again = (await promptLine(io, 'Sign in again to test /mfa/verify? (y/N): '))
      .trim()
      .toLowerCase();
    if (again !== 'y') break;
    say('Wait for the authenticator to show a NEW code (a used code is refused as a replay).');
  }
  return 0;
}

async function runReplacementFlow(io, say, baseUrl) {
  say('Step 1: sign in with the CURRENT authenticator entry.');
  const call = createClient(baseUrl);
  const signedIn = await signInWithMfa(io, say, call, { allowEnrollment: false });
  if (!signedIn) return 1;

  const start = await call('POST', '/mfa/replacement', { body: {}, csrf: signedIn.csrf });
  if (start.status !== 200) {
    say(`Replacement start refused: ${describe(start)}`);
    return 1;
  }
  showSetupKey(
    say,
    start.payload.data,
    'Step 2: add a NEW authenticator entry with this setup key (keep the old one for now):',
  );
  say(`Confirm before ${start.payload.data.expiresAt}.`);

  const replaced = await submitCode(
    io,
    say,
    call,
    '/mfa/replacement/confirm',
    signedIn.csrf,
    'Code from the NEW authenticator entry (hidden): ',
  );
  if (!replaced) return 1;
  say(`Authenticator replaced; ${replaced.sessionsRevoked} session(s)/challenge(s) revoked.`);
  const after = await call('GET', '/me');
  say(`/me with the old session: ${describe(after)} (expected HTTP 401 UNAUTHENTICATED)`);

  say('');
  say('Step 3: sign in again with the NEW entry (wait for a fresh code).');
  const verifyCall = createClient(baseUrl);
  const again = await signInWithMfa(io, say, verifyCall, {
    allowEnrollment: false,
    codeLabel: 'Code from the NEW authenticator entry (hidden): ',
  });
  if (!again) return 1;
  if (!(await checkSession(say, verifyCall, again))) return 1;
  await logout(say, verifyCall, again);
  say('Now delete the OLD entry from the authenticator app, then clear this terminal.');
  return 0;
}

export async function main({ argv, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  try {
    const { baseUrl, replace } = parseArgs(argv);
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new Error('Run this in an interactive terminal (PowerShell, cmd or Windows Terminal).');
    }
    say(`Zamil Revamp MFA ${replace ? 'replacement' : 'test'} against ${baseUrl} (loopback only)`);
    const exitCode = replace
      ? await runReplacementFlow(io, say, baseUrl)
      : await runEnrollmentFlow(io, say, baseUrl);
    if (exitCode === 0) say('Done.');
    return exitCode;
  } catch (error) {
    say(`Stopped: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    io: { input: process.stdin, output: process.stdout },
  });
}
