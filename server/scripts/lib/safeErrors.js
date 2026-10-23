// Error text for the RBAC registration CLI that is safe to print. Dependency-free on purpose: the
// CLI entry imports it before anything that loads the configuration, so even configuration or
// import failures are reported without raw messages (paths, aliases, settings or values).

/**
 * Safe operator text for an error raised before or around main(): configuration, wallet and driver
 * messages can contain paths, aliases or settings, so only fixed text and error codes are shown.
 */
export function describeStartupError(error) {
  if (error?.name === 'RegistrationRefused') return error.message;
  const message = String(error?.message ?? '');
  if (message.startsWith('Invalid configuration:')) {
    return 'The server configuration is invalid. Compare server/.env with server/.env.example (details are not shown).';
  }
  if (message.startsWith('Oracle wallet') || message.startsWith('Oracle aliases')) {
    return 'Oracle wallet validation failed. Check ORACLE_WALLET_DIR, the wallet files, the aliases and ORACLE_WALLET_PASSWORD (details are not shown).';
  }
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    return 'A required file is missing. The release must include server/ and client/src/config/registry/ (see server/docs/RBAC-REGISTRATION.md).';
  }
  const code = oracleErrorCode(error);
  return code
    ? `Oracle connection or statement failed (${code}).`
    : `Unexpected error (${error?.name ?? 'Error'}).`;
}

/** Oracle error classification for operator messages (codes only, never bind values). */
export function oracleErrorCode(error) {
  // Connection failures arrive wrapped (AppError SERVICE_UNAVAILABLE with the driver error as cause).
  for (let current = error, depth = 0; current && depth < 3; current = current.cause, depth += 1) {
    const match = /ORA-\d{5}|NJS-\d{3}|DPY-\d{4}/.exec(
      `${current.code ?? ''} ${current.message ?? ''}`,
    );
    if (match) return match[0];
    if (current.errorNum) return `ORA-${String(current.errorNum).padStart(5, '0')}`;
  }
  return error?.code === 'SERVICE_UNAVAILABLE' ? 'SERVICE_UNAVAILABLE' : null;
}
