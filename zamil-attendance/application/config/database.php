<?php
defined('BASEPATH') or exit('No direct script access allowed');

/*
| -------------------------------------------------------------------
| DATABASE CONNECTIVITY SETTINGS
| -------------------------------------------------------------------
| All credentials come from the project-root .env file (git-ignored).
| See .env.example for the full list of keys.
|
| default : Oracle Autonomous Database (ADW) — schema XXZP. Locally this is the
|           Zamil Revamp TEST ADW (wallet secrets/oracle/Wallet_zpadwtest).
| ebs     : Oracle E-Business Suite database (contractor master data).
| -------------------------------------------------------------------
*/

$active_group = 'default';
$query_builder = TRUE;

if (!function_exists('att_adw_connect_descriptor')) {
	/**
	 * Build the ADW connect descriptor from the wallet's tnsnames.ora and pin
	 * the wallet directory inside it, so no TNS_ADMIN / sqlnet.ora edits are
	 * needed on the machine. Falls back to the raw alias when no wallet is set.
	 */
	function att_adw_connect_descriptor($walletDir, $alias)
	{
		if ($walletDir === '' || !is_file($walletDir . DIRECTORY_SEPARATOR . 'tnsnames.ora')) {
			return $alias;
		}
		$tns = file_get_contents($walletDir . DIRECTORY_SEPARATOR . 'tnsnames.ora');
		$pattern = '/^\s*' . preg_quote($alias, '/') . '\s*=\s*(\(.+\))\s*$/mi';
		if (!preg_match($pattern, $tns, $m)) {
			return $alias;
		}
		$wallet = str_replace('\\', '/', $walletDir);
		$descriptor = preg_replace(
			'/\(security\s*=/i',
			'(security=(my_wallet_directory="' . $wallet . '")',
			$m[1],
			1
		);
		// CI3's oci8 driver only accepts a descriptor matching ^\(DESCRIPTION=...
		// with no whitespace: strip whitespace outside quotes, uppercase the head.
		$descriptor = preg_replace_callback('/"[^"]*"|\s+/', function ($t) {
			return $t[0][0] === '"' ? $t[0] : '';
		}, $descriptor);
		return preg_replace('/^\(description=/i', '(DESCRIPTION=', $descriptor);
	}
}

$db['default'] = array(
	'dsn'      => '',
	'hostname' => att_adw_connect_descriptor(env_path('ADW_WALLET_DIR'), (string) env('ADW_TNS_ALIAS', '')),
	'username' => (string) env('ADW_USERNAME', ''),
	'password' => (string) env('ADW_PASSWORD', ''),
	'database' => '',
	'dbdriver' => 'oci8',
	'char_set' => 'AL32UTF8',
	'dbcollat' => 'AL32UTF8_GENERAL_CI',
	'pconnect' => (bool) env('ADW_PCONNECT', TRUE),
	'db_debug' => (ENVIRONMENT !== 'production'),
	'cache_on' => FALSE,
	'cachedir' => '',
	'encrypt'  => FALSE,
	'compress' => FALSE,
	'stricton' => FALSE,
	'failover' => array(),
	'save_queries' => (ENVIRONMENT !== 'production')
);

$db['ebs'] = array(
	'dsn'      => '',
	'hostname' => sprintf(
		'(DESCRIPTION=(CONNECT_TIMEOUT=%d)(ADDRESS=(PROTOCOL=TCP)(HOST=%s)(PORT=%s))(CONNECT_DATA=(SID=%s)))',
		(int) env('EBS_DB_CONNECT_TIMEOUT', 10),
		env('EBS_DB_HOST', ''),
		env('EBS_DB_PORT', '1521'),
		env('EBS_DB_SID', '')
	),
	'username' => (string) env('EBS_DB_USERNAME', ''),
	'password' => (string) env('EBS_DB_PASSWORD', ''),
	'database' => (string) env('EBS_DB_SID', ''),
	'dbdriver' => 'oci8',
	'dbprefix' => '',
	'pconnect' => FALSE,
	'db_debug' => (ENVIRONMENT !== 'production'),
	'cache_on' => FALSE,
	'cachedir' => '',
	'char_set' => 'utf8',
	'dbcollat' => 'utf8_general_ci',
	'swap_pre' => '',
	'encrypt'  => FALSE,
	'compress' => FALSE,
	'stricton' => FALSE,
	'failover' => array(),
	'save_queries' => (ENVIRONMENT !== 'production')
);
