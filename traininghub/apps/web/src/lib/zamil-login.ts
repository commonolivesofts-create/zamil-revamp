/** Send signed-out users to the parent Zamil application. */
export function redirectToZamilLogin() {
  // Prevent JSDOM tests from attempting a browser navigation.
  if (import.meta.env.MODE === 'test') return;

  const configuredUrl = import.meta.env.VITE_ZAMIL_LOGIN_URL?.trim();
  const destination = configuredUrl
    ? new URL(configuredUrl, window.location.origin)
    : new URL('/login', window.location.origin);

  // The local launcher serves Zamil on 7382 and the hubs on separate ports.
  if (!configuredUrl && import.meta.env.DEV && ['7384', '7386'].includes(window.location.port)) {
    destination.port = '7382';
  }

  window.location.replace(destination.toString());
}
