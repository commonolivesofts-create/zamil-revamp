import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/services/api/apiClient.js";
import { createCsrfStore } from "../src/services/api/csrfStore.js";
import { createAuthService } from "../src/features/auth/authService.js";
import { authConfig } from "../src/config/authConfig.js";
import {
  CHALLENGE_TOKEN,
  RESTORED_TOKEN,
  SESSION_TOKEN,
  currentUser,
  failure,
  loginResult,
  mfaChallenge,
  noContent,
  recordingFetch,
  success,
} from "./helpers/http.mjs";

function setup(responder) {
  const { fetchImpl, calls } = recordingFetch(responder);
  const csrfStore = createCsrfStore();
  let unauthorized = 0;
  const client = createApiClient({
    baseUrl: "/api/v1",
    fetchImpl,
    csrfStore,
    onUnauthorized: () => {
      unauthorized += 1;
    },
  });
  return {
    service: createAuthService({ client }),
    calls,
    csrfStore,
    unauthorizedCount: () => unauthorized,
  };
}

test("login sends only the documented body, without any CSRF token", async () => {
  const { service, calls, csrfStore } = setup(() => success(loginResult()));
  csrfStore.setSessionToken("stale-token");
  const result = await service.login({
    username: "test.user",
    password: "secret",
    trustBrowser: true,
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.csrfToken, SESSION_TOKEN);
  assert.equal(calls[0].url, "/api/v1/auth/login");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    username: "test.user",
    password: "secret",
  });
  assert.equal(calls[0].init.headers.has("X-CSRF-Token"), false);
});

test("login returns the MFA-pending contract unchanged in meaning", async () => {
  const { service } = setup(() =>
    success(
      mfaChallenge({
        mfa: {
          required: true,
          enrollmentRequired: true,
          expiresAt: "2026-10-21T08:10:00Z",
        },
      }),
    ),
  );
  const result = await service.login({ username: "zaid", password: "secret" });
  assert.equal(result.authenticated, false);
  assert.equal(result.mfa.enrollmentRequired, true);
  assert.equal(result.challengeCsrfToken, CHALLENGE_TOKEN);
});

test("public login failures keep backend codes and never emit the session 401 event", async () => {
  const { service, unauthorizedCount } = setup(() =>
    failure(
      401,
      "AUTHENTICATION_FAILED",
      "Sign-in failed. Check your username and password, or try again later.",
    ),
  );
  await assert.rejects(service.login({ username: "x", password: "y" }), {
    code: "AUTHENTICATION_FAILED",
    message:
      "Sign-in failed. Check your username and password, or try again later.",
  });
  assert.equal(unauthorizedCount(), 0);

  const expired = setup(() =>
    failure(
      403,
      "PASSWORD_EXPIRED",
      "Your password has expired and must be changed before you can sign in.",
    ),
  );
  await assert.rejects(
    expired.service.login({ username: "x", password: "y" }),
    { code: "PASSWORD_EXPIRED", status: 403 },
  );
});

test("session restoration calls /auth/me and /auth/csrf without emitting the 401 event", async () => {
  const { service, calls } = setup((url) =>
    url.endsWith("/auth/me")
      ? success(currentUser())
      : success({ token: RESTORED_TOKEN, headerName: "X-CSRF-Token" }),
  );
  assert.equal((await service.getCurrentUser()).user.id, "105");
  assert.equal(await service.getCsrfToken(), RESTORED_TOKEN);
  assert.deepEqual(
    calls.map((call) => [call.init.method, call.url]),
    [
      ["GET", "/api/v1/auth/me"],
      ["GET", "/api/v1/auth/csrf"],
    ],
  );

  const anonymous = setup(() =>
    failure(401, "UNAUTHENTICATED", "Authentication is required"),
  );
  await assert.rejects(anonymous.service.getCurrentUser(), { status: 401 });
  assert.equal(anonymous.unauthorizedCount(), 0);
});

test("logout accepts 204 and sends the session CSRF token", async () => {
  const { service, calls, csrfStore } = setup(() => noContent());
  csrfStore.setSessionToken(SESSION_TOKEN);
  await service.logout();
  assert.equal(calls[0].url, "/api/v1/auth/logout");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.get("X-CSRF-Token"), SESSION_TOKEN);
  assert.equal(calls[0].init.body, undefined);
});

test("password recovery requests use the backend contract (replaces the pre-Batch C stub)", async () => {
  const { service, calls } = setup(() =>
    success(
      {
        accepted: true,
        message:
          "If the account is eligible, instructions have been sent to its registered address.",
      },
      202,
    ),
  );
  const result = await service.requestRecovery({
    username: "test.user",
    purpose: "PASSWORD_RESET",
  });
  assert.equal(result.accepted, true);
  assert.equal(calls[0].url, "/api/v1/auth/recovery/request");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    username: "test.user",
    purpose: "PASSWORD_RESET",
  });
});

test("auth configuration uses fixed endpoints and never enables preview outside Vite DEV", () => {
  assert.equal(authConfig.developmentPreview, false);
  assert.equal(authConfig.configured, true);
  assert.deepEqual(authConfig.endpoints, {
    login: "/auth/login",
    currentUser: "/auth/me",
    profileImage: "/auth/me/profile-image",
    csrf: "/auth/csrf",
    logout: "/auth/logout",
    mfaVerify: "/auth/mfa/verify",
    mfaEnrollment: "/auth/mfa/enrollment",
    mfaEnrollmentConfirm: "/auth/mfa/enrollment/confirm",
    mfaReplacement: "/auth/mfa/replacement",
    mfaReplacementConfirm: "/auth/mfa/replacement/confirm",
    passwordPolicy: "/auth/password/policy",
    recoveryRequest: "/auth/recovery/request",
    passwordSetup: "/auth/password/setup",
    passwordReset: "/auth/password/reset",
    passwordChange: "/auth/password/change",
    mfaRecoveryStart: "/auth/mfa/recovery/start",
    mfaRecoveryConfirm: "/auth/mfa/recovery/confirm",
  });
});
