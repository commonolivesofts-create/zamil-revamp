/** Zamil Digitalization login URL (the attendance system has no login page of its own). */
export function zamilLoginUrl(): string {
  const configuredUrl = import.meta.env.VITE_ZAMIL_LOGIN_URL?.trim();
  const destination = configuredUrl
    ? new URL(configuredUrl, window.location.origin)
    : new URL('/login', window.location.origin);
  // The local launcher serves Zamil on 7382 and the sibling apps on their own ports
  // (TrainingHub 7384, ExpenseHub 7386, Attendance 7388).
  if (
    !configuredUrl &&
    import.meta.env.DEV &&
    ['7384', '7386', '7388'].includes(window.location.port)
  ) {
    destination.port = '7382';
  }
  return destination.toString();
}

/** Send signed-out users to the parent Zamil application. */
export function redirectToZamilLogin(): void {
  // Prevent JSDOM tests from attempting a browser navigation.
  if (import.meta.env.MODE === 'test') return;
  window.location.replace(zamilLoginUrl());
}

/** The Zamil Digitalization home page (same host, Zamil port in development). */
export function zamilHomeUrl(): string {
  const url = new URL(zamilLoginUrl());
  url.pathname = '/dashboard';
  return url.toString();
}
