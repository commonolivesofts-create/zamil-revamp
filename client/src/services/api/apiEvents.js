// Small event boundary: API 401 responses can invalidate an authenticated
// frontend session without coupling the transport layer to React or the router.
const unauthorizedListeners = new Set()

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
