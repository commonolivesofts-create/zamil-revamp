<?php
defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Validates the Zamil Digitalization session for the attendance system.
 *
 * Mirrors traininghub/apps/api/src/auth/zamil-sso.ts: the HttpOnly Zamil
 * session cookie is read server-side and forwarded to Zamil's own
 * GET /auth/me endpoint. Only a successful, unexpired response is trusted.
 */
class Zamil_sso
{
	const TOKEN_PATTERN = '/^[A-Za-z0-9_-]{43}$/';

	/** Zamil said the session is missing, expired or revoked. */
	const RESULT_UNAUTHENTICATED = 'unauthenticated';
	/** Zamil could not be reached or answered unexpectedly. */
	const RESULT_UNAVAILABLE = 'unavailable';

	/** @var array */
	protected $config;

	/** @var string|null Last failure reason (one of the RESULT_* constants). */
	public $lastError = null;

	public function __construct()
	{
		$CI =& get_instance();
		$CI->config->load('zamil_sso', TRUE);
		$this->config = $CI->config->item('zamil_sso', 'zamil_sso');
	}

	public function config($key)
	{
		return isset($this->config[$key]) ? $this->config[$key] : null;
	}

	/**
	 * Zamil login URL. A loopback URL is rewritten to the host the user used
	 * (LAN IP / hostname), like Zamil's own external-link resolver.
	 */
	public function loginUrl()
	{
		$url = (string) $this->config['login_url'];
		$loginHost = parse_url($url, PHP_URL_HOST);
		$currentHost = isset($_SERVER['HTTP_HOST']) ? parse_url('http://' . $_SERVER['HTTP_HOST'], PHP_URL_HOST) : null;
		$loopback = array('localhost', '127.0.0.1', '[::1]', '::1');
		if ($loginHost && $currentHost
			&& in_array(strtolower($loginHost), $loopback, true)
			&& !in_array(strtolower($currentHost), $loopback, true)
			&& preg_match('/^[A-Za-z0-9.\-\[\]:]+$/', $currentHost)) {
			$url = preg_replace('#^(https?://)' . preg_quote($loginHost, '#') . '#i', '${1}' . $currentHost, $url, 1);
		}
		return $url;
	}

	/**
	 * Zamil session cookies presented by the browser, as name => token.
	 */
	public function presentedCookies()
	{
		$cookies = array();
		foreach ($this->config['cookie_names'] as $name) {
			$token = isset($_COOKIE[$name]) ? $_COOKIE[$name] : null;
			if (is_string($token) && preg_match(self::TOKEN_PATTERN, $token)) {
				$cookies[$name] = $token;
			}
		}
		return $cookies;
	}

	/**
	 * Stable fingerprint of the presented Zamil cookie(s); used to notice when
	 * the user signs in as someone else or the Zamil session is replaced.
	 */
	public function fingerprint()
	{
		$cookies = $this->presentedCookies();
		if (empty($cookies)) {
			return null;
		}
		ksort($cookies);
		return hash('sha256', http_build_query($cookies));
	}

	/**
	 * Resolve the signed-in Zamil user.
	 *
	 * @return array|null ['employeeNumber' => string, 'userId' => mixed,
	 *                     'fullName' => string|null, 'expiresAt' => int] or null
	 *                    (see $lastError for the reason).
	 */
	public function resolveIdentity()
	{
		$this->lastError = null;
		$cookies = $this->presentedCookies();
		if (empty($cookies)) {
			$this->lastError = self::RESULT_UNAUTHENTICATED;
			return null;
		}

		$unavailable = false;
		foreach ($cookies as $name => $token) {
			$response = $this->request('GET', '/auth/me', $name . '=' . $token);
			if ($response === null) {
				$unavailable = true;
				continue;
			}
			if ($response['status'] === 401 || $response['status'] === 403) {
				continue;
			}
			$identity = $this->parseIdentity($response);
			if ($identity !== null) {
				return $identity;
			}
			$unavailable = true;
		}

		$this->lastError = $unavailable ? self::RESULT_UNAVAILABLE : self::RESULT_UNAUTHENTICATED;
		return null;
	}

	/**
	 * Revoke the central Zamil session (sign-out from the attendance system
	 * also signs out of Zamil, otherwise SSO would immediately sign back in).
	 */
	public function revokeSession()
	{
		foreach ($this->presentedCookies() as $name => $token) {
			$cookie = $name . '=' . $token;
			$csrf = $this->request('GET', '/auth/csrf', $cookie);
			$body = $csrf ? $csrf['body'] : null;
			$csrfToken = isset($body['data']['token']) ? $body['data']['token'] : null;
			$headerName = isset($body['data']['headerName']) ? $body['data']['headerName'] : null;
			if (
				!$csrf || $csrf['status'] !== 200 || !isset($body['success']) || $body['success'] !== true
				|| !is_string($csrfToken) || !preg_match(self::TOKEN_PATTERN, $csrfToken)
				|| $headerName !== 'X-CSRF-Token'
			) {
				continue;
			}
			$logout = $this->request('POST', '/auth/logout', $cookie, array('X-CSRF-Token: ' . $csrfToken), '{}');
			if ($logout && $logout['status'] >= 200 && $logout['status'] < 300) {
				return true;
			}
		}
		return false;
	}

	protected function parseIdentity(array $response)
	{
		$body = $response['body'];
		if ($response['status'] !== 200 || !is_array($body) || !isset($body['success']) || $body['success'] !== true) {
			return null;
		}
		$user = isset($body['data']['user']) && is_array($body['data']['user']) ? $body['data']['user'] : array();
		$employeeNumber = isset($user['employeeNumber']) ? $user['employeeNumber'] : null;
		$expiresAt = isset($body['data']['session']['expiresAt']) ? strtotime((string) $body['data']['session']['expiresAt']) : false;

		if (!is_string($employeeNumber) || trim($employeeNumber) === '' || $expiresAt === false || $expiresAt <= time()) {
			return null;
		}

		return array(
			'employeeNumber' => trim($employeeNumber),
			'userId'         => isset($user['id']) ? $user['id'] : null,
			'fullName'       => isset($user['fullName']) ? $user['fullName'] : null,
			'expiresAt'      => $expiresAt,
		);
	}

	/**
	 * @return array|null ['status' => int, 'body' => array|null] or null when
	 *                    the Zamil API could not be reached.
	 */
	protected function request($method, $path, $cookie, array $headers = array(), $body = null)
	{
		if (empty($this->config['api_base_url'])) {
			return null;
		}

		// PHP's built-in HTTP stream wrapper: no dependency on the curl extension.
		$requestHeaders = array_merge(array('Accept: application/json', 'Connection: close', 'Cookie: ' . $cookie), $headers);
		if ($body !== null) {
			$requestHeaders[] = 'Content-Type: application/json';
		}
		$userAgent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : 'zamil-attendance';
		$requestHeaders[] = 'User-Agent: ' . str_replace(array("\r", "\n"), '', $userAgent);

		$context = stream_context_create(array('http' => array(
			'method'          => $method,
			'header'          => implode("\r\n", $requestHeaders),
			'content'         => $body !== null ? $body : '',
			'timeout'         => max(1, (int) $this->config['timeout_seconds']),
			'follow_location' => 0,
			'max_redirects'   => 1,
			'ignore_errors'   => true,
			'protocol_version' => 1.1,
		)));

		$raw = @file_get_contents($this->config['api_base_url'] . $path, false, $context);
		$responseHeaders = function_exists('http_get_last_response_headers')
			? (array) http_get_last_response_headers()
			: (isset($http_response_header) ? $http_response_header : array());

		$status = 0;
		if (!empty($responseHeaders) && preg_match('#^HTTP/\S+\s+(\d{3})#', $responseHeaders[0], $m)) {
			$status = (int) $m[1];
		}
		if ($raw === false || $status === 0) {
			$error = error_get_last();
			log_message('error', 'Zamil SSO: ' . $method . ' ' . $path . ' failed: ' . ($error ? $error['message'] : 'no response'));
			return null;
		}

		$decoded = json_decode((string) $raw, true);
		return array('status' => $status, 'body' => is_array($decoded) ? $decoded : null);
	}
}
