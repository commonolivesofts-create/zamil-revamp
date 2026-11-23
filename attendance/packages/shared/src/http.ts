// Transport constants shared by the API and the web client.

export const API_BASE = '/api/v1';

/** CSRF guard: every non-GET request must carry this header (same-origin via the Vite proxy). */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'Attendance';

/** The attendance session cookie (HttpOnly, SameSite=Strict). */
export const SESSION_COOKIE = 'at_session';
