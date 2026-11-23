<?php
defined('BASEPATH') or exit('No direct script access allowed');

/*
| -------------------------------------------------------------------
| ZAMIL DIGITALIZATION SINGLE SIGN-ON
| -------------------------------------------------------------------
| The attendance system has no login page of its own. It reuses the Zamil
| Digitalization (zamil-revamp) session, exactly like TrainingHub and
| ExpenseHub: the browser sends the HttpOnly Zamil session cookie (same
| hostname, any port), and this app forwards it server-side to Zamil's
| GET /api/v1/auth/me. The cookie is never exposed to JavaScript.
|
| api_base_url      Zamil backend base path ending in /api/v1.
| login_url         Where unauthenticated users are sent (return-url appended).
| cookie_names      Zamil session cookie names to try, in order
|                   (APP_ENV=test uses zr_session, local dev __Host-zr_session).
| recheck_seconds   How often an existing attendance session re-validates the
|                   Zamil session, so signing out of Zamil signs out here too.
| timeout_seconds   HTTP timeout for calls to the Zamil API.
*/

$config['zamil_sso'] = array(
	'api_base_url'    => rtrim((string) env('ZAMIL_AUTH_API_BASE_URL', 'http://127.0.0.1:7381/api/v1'), '/'),
	'login_url'       => (string) env('ZAMIL_LOGIN_URL', 'http://localhost:7382/login'),
	'cookie_names'    => array_values(array_unique(array_filter(array(
		(string) env('ZAMIL_AUTH_SESSION_COOKIE_NAME', 'zr_session'),
		'zr_session',
		'__Host-zr_session',
	)))),
	'recheck_seconds' => (int) env('ZAMIL_SSO_RECHECK_SECONDS', 60),
	'timeout_seconds' => (int) env('ZAMIL_SSO_TIMEOUT_SECONDS', 5),
);
