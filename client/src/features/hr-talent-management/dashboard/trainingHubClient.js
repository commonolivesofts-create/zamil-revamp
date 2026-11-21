// Read-only access to the TrainingHub API for the Talent Management dashboard.
// The API is reached on this origin under TRAINING_HUB_API_BASE: the Vite
// development server proxies it (vite.config.js) and a deployed gateway must
// forward the same path to TrainingHub's /api/v1. TrainingHub authorises every
// request itself; without its own session it signs the user in from the Zamil
// session (POST /auth/sso), exactly as the TrainingHub web app does.
export const TRAINING_HUB_API_BASE = '/training-hub-api'
// TrainingHub rejects unsafe requests without its application header.
const APP_HEADER = Object.freeze({ 'X-Requested-With': 'TrainingHub' })

export class TrainingHubError extends Error {
  constructor(message, { code, status = 0 } = {}) {
    super(message)
    this.name = 'TrainingHubError'
    this.code = code
    this.status = status
  }
}

export function createTrainingHubClient({
  fetch: send = (...args) => globalThis.fetch(...args),
  base = TRAINING_HUB_API_BASE,
} = {}) {
  async function request(method, path, { signal } = {}) {
    let response
    try {
      response = await send(`${base}${path}`, {
        method,
        credentials: 'same-origin',
        headers: APP_HEADER,
        signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      throw new TrainingHubError('TrainingHub cannot be reached.', { code: 'UNAVAILABLE' })
    }
    if (response.status === 401)
      throw new TrainingHubError('Not signed in to TrainingHub.', {
        code: 'SIGNED_OUT',
        status: 401,
      })
    if (response.status === 403)
      throw new TrainingHubError('TrainingHub refused the request.', {
        code: 'FORBIDDEN',
        status: 403,
      })
    // A proxy without a running TrainingHub answers 404/502/503/504.
    if (!response.ok)
      throw new TrainingHubError('TrainingHub is unavailable.', {
        code: 'UNAVAILABLE',
        status: response.status,
      })
    try {
      return await response.json()
    } catch {
      throw new TrainingHubError('TrainingHub returned an unexpected response.', {
        code: 'UNAVAILABLE',
        status: response.status,
      })
    }
  }

  const get = (path, options) => request('GET', path, options)

  // The signed-in TrainingHub person; signs in from the Zamil session when needed.
  async function connect({ signal } = {}) {
    try {
      return await get('/me', { signal })
    } catch (error) {
      if (error?.code !== 'SIGNED_OUT') throw error
    }
    try {
      return await request('POST', '/auth/sso', { signal })
    } catch (error) {
      // TrainingHub refuses SSO with 401, or 403 when no Zamil session cookie reached it.
      if (error?.code === 'FORBIDDEN' || error?.code === 'SIGNED_OUT')
        throw new TrainingHubError('TrainingHub could not sign you in.', {
          code: 'SIGNED_OUT',
          status: error.status,
        })
      throw error
    }
  }

  // An area the person may not open is null rather than a failure of the whole load.
  const optional = (path, options) =>
    get(path, options).catch((error) => {
      if (error?.code === 'FORBIDDEN') return null
      throw error
    })

  return Object.freeze({
    connect,
    catalog: (from, options) => optional(`/catalog?from=${encodeURIComponent(from)}`, options),
    matrix: (options) => optional('/matrix', options),
    team: (options) => optional('/team', options),
  })
}

export const trainingHub = createTrainingHubClient()
