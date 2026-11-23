<?php
/**
 * Minimal .env loader (no Composer dependency).
 *
 * Reads KEY=VALUE pairs from the project-root `.env` file before CodeIgniter
 * boots, so credentials live outside version control. Real environment
 * variables (Apache SetEnv, OS env) always win over the file.
 *
 * Supported syntax: `KEY=value`, `KEY="value with spaces"`, `KEY='literal'`,
 * `export KEY=value`, blank lines and `#` comments.
 */

if (!function_exists('att_load_env')) {
	function att_load_env($file)
	{
		if (!is_file($file) || !is_readable($file)) {
			return;
		}

		$lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
		foreach ($lines as $line) {
			$line = trim($line);
			if ($line === '' || $line[0] === '#') {
				continue;
			}
			if (strncmp($line, 'export ', 7) === 0) {
				$line = ltrim(substr($line, 7));
			}
			$pos = strpos($line, '=');
			if ($pos === false) {
				continue;
			}

			$key = trim(substr($line, 0, $pos));
			$value = trim(substr($line, $pos + 1));
			if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) {
				continue;
			}

			$quote = $value !== '' ? $value[0] : '';
			if (($quote === '"' || $quote === "'") && substr($value, -1) === $quote && strlen($value) >= 2) {
				$value = substr($value, 1, -1);
				if ($quote === '"') {
					$value = str_replace(['\\n', '\\"', '\\\\'], ["\n", '"', '\\'], $value);
				}
			} else {
				// Strip trailing inline comments on unquoted values.
				$value = trim(preg_replace('/\s+#.*$/', '', $value));
			}

			// Never override a variable that is already set by the server/OS.
			if (getenv($key) !== false || isset($_SERVER[$key]) || isset($_ENV[$key])) {
				continue;
			}
			$_ENV[$key] = $value;
			$_SERVER[$key] = $value;
			putenv($key . '=' . $value);
		}
	}
}

if (!function_exists('env')) {
	/**
	 * Read an environment value. 'true'/'false'/'null'/'' map to PHP values.
	 */
	function env($key, $default = null)
	{
		if (isset($_ENV[$key])) {
			$value = $_ENV[$key];
		} elseif (isset($_SERVER[$key]) && is_string($_SERVER[$key])) {
			$value = $_SERVER[$key];
		} else {
			$value = getenv($key);
		}
		if ($value === false || $value === null) {
			return $default;
		}

		switch (strtolower($value)) {
			case 'true':
				return true;
			case 'false':
				return false;
			case 'null':
				return null;
			case '':
				return $default;
		}
		return $value;
	}
}

if (!function_exists('env_path')) {
	/**
	 * Resolve a path from .env: absolute paths are kept, relative paths are
	 * resolved against the project root (works through the htdocs junction).
	 */
	function env_path($key, $default = '')
	{
		$path = (string) env($key, $default);
		if ($path === '') {
			return '';
		}
		$isAbsolute = preg_match('#^([A-Za-z]:)?[\\\\/]#', $path) === 1;
		$full = $isAbsolute ? $path : ATT_PROJECT_ROOT . DIRECTORY_SEPARATOR . $path;
		$real = realpath($full);
		return $real !== false ? $real : $full;
	}
}

if (!defined('ATT_PROJECT_ROOT')) {
	// realpath() resolves the C:\xampp\htdocs junction back to the repository.
	define('ATT_PROJECT_ROOT', realpath(dirname(__DIR__, 2)));
}

att_load_env(ATT_PROJECT_ROOT . DIRECTORY_SEPARATOR . '.env');
