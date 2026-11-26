// Small event boundary: API 401 responses can invalidate an authenticated
// frontend session without coupling the transport layer to React or the router.
const unauthorizedListeners = new Set()
const unavailableListeners = new Set()
const retryListeners = new Set()
const activityListeners = new Set()
let globalUnavailableError = null
const resourceUnavailableErrors = new Map()
let unavailableNotificationScheduled = false

export function subscribeApiActivity(listener) {
  activityListeners.add(listener)
  return () => activityListeners.delete(listener)
}

export function emitApiActivity() {
  for (const listener of activityListeners) {
    try {
      listener(Date.now())
    } catch {
      // Activity bookkeeping must not affect a completed API request.
    }
  }
}

export function subscribeApiUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

export function emitApiUnauthorized() {
  for (const listener of unauthorizedListeners) {
    try {
      listener()
    } catch {
      // One consumer must not replace the API error or block other listeners.
    }
  }
}

export function subscribeApiUnavailable(listener) {
  unavailableListeners.add(listener)
  return () => unavailableListeners.delete(listener)
}

export function getApiUnavailableError() {
  const latestResourceError = [...resourceUnavailableErrors.values()].at(-1)
  return latestResourceError ?? globalUnavailableError
}

export function isApiUnavailableOwner(resourceKey) {
  // Several resources on one page can fail together. Keep one visible inline
  // error at a time; after its retry succeeds, the next failed resource can
  // become the owner and offer its own retry.
  const latestResourceError = [...resourceUnavailableErrors.values()].at(-1)
  if (latestResourceError) return latestResourceError.resourceKey === resourceKey
  const activeError = globalUnavailableError
  return !activeError?.resourceKey || activeError.resourceKey === resourceKey
}

export function emitApiUnavailable(error, retry, metadata = {}) {
  const next = { error, retry, ...metadata }
  if (metadata.placement === 'resource' && metadata.resourceKey != null) {
    globalUnavailableError = null
    resourceUnavailableErrors.delete(metadata.resourceKey)
    resourceUnavailableErrors.set(metadata.resourceKey, next)
  } else {
    globalUnavailableError = next
  }
  if (unavailableNotificationScheduled) return
  unavailableNotificationScheduled = true
  setTimeout(() => {
    unavailableNotificationScheduled = false
    notifyUnavailableListeners()
  }, 0)
}

export function clearApiUnavailable(resourceKey) {
  if (resourceKey !== undefined) {
    const removedResourceError = resourceUnavailableErrors.delete(resourceKey)
    if (removedResourceError && !resourceUnavailableErrors.size) globalUnavailableError = null
  } else {
    resourceUnavailableErrors.clear()
    globalUnavailableError = null
  }
  notifyUnavailableListeners()
}

export function subscribeApiRetry(listener) {
  retryListeners.add(listener)
  return () => retryListeners.delete(listener)
}

export function notifyApiRetryCompleted() {
  for (const listener of retryListeners) {
    try {
      listener()
    } catch {
      // A page data listener must not replace the successful request result.
    }
  }
}

function notifyUnavailableListeners() {
  for (const listener of unavailableListeners) {
    try {
      listener()
    } catch {
      // A UI listener must not replace the API error or block other listeners.
    }
  }
}
