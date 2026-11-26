import { authService as defaultAuthService } from './authService.js'
import { subscribeApiActivity as defaultSubscribeApiActivity } from '../../services/api/apiEvents.js'

export const KEEPALIVE_INTERVAL_MS = 3 * 60 * 1000
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000
export const POINTER_MOVE_THROTTLE_MS = 1000
export const ACTIVITY_BROADCAST_THROTTLE_MS = 1500
export const HEARTBEAT_INTERVAL_MS = 5000
export const PEER_TTL_MS = HEARTBEAT_INTERVAL_MS * 3
export const CHECK_INTERVAL_MS = 10_000
export const CHANNEL_NAME = 'zamil-session-activity-v1'

export function startActivitySessionTracker({
  authService = defaultAuthService,
  subscribeApiActivity = defaultSubscribeApiActivity,
  channelFactory = (name) => {
    if (typeof BroadcastChannel !== 'function') return null
    try {
      return new BroadcastChannel(name)
    } catch {
      return null
    }
  },
  now = () => Date.now(),
  windowTarget = typeof window !== 'undefined' ? window : null,
  documentTarget = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (!windowTarget || !documentTarget) return () => {}

  const tabId = globalThis.crypto?.randomUUID?.() ?? `${now()}-${Math.random()}`
  const peers = new Map()
  let channel = null
  try {
    channel = channelFactory(CHANNEL_NAME)
  } catch {
    channel = null
  }

  let lastActivityAt = 0
  let lastBroadcastActivityAt = 0
  let lastApiActivityAt = now()
  let lastKeepaliveAt = 0
  let lastPointerMoveAt = 0
  let requestPending = false

  const isVisible = () => documentTarget.visibilityState === 'visible'
  const recentActivityAt = () => {
    const otherActivity = Math.max(0, ...[...peers.values()].map((peer) => peer.activityAt))
    return Math.max(lastActivityAt, otherActivity)
  }
  const publish = (type, activityAt = lastActivityAt) => {
    try {
      channel?.postMessage({ type, tabId, activityAt, visible: isVisible(), at: now() })
    } catch {
      // BroadcastChannel errors must not break local activity tracking.
    }
  }
  const markActivity = () => {
    const current = now()
    lastActivityAt = current
    if (current - lastBroadcastActivityAt >= ACTIVITY_BROADCAST_THROTTLE_MS) {
      lastBroadcastActivityAt = current
      publish('activity', current)
    }
  }
  const onPointerMove = () => {
    const current = now()
    if (current - lastPointerMoveAt < POINTER_MOVE_THROTTLE_MS) return
    lastPointerMoveAt = current
    markActivity()
  }
  const onMessage = (event) => {
    const message = event.data
    if (!message || message.tabId === tabId || typeof message.tabId !== 'string') return
    if (message.type === 'bye') {
      peers.delete(message.tabId)
      return
    }
    if (!['heartbeat', 'activity', 'api-activity'].includes(message.type)) return
    peers.set(message.tabId, {
      at: now(),
      activityAt: Number.isFinite(message.activityAt) ? message.activityAt : 0,
      visible: message.visible === true,
    })
    if (message.type === 'api-activity' && Number.isFinite(message.at)) {
      lastApiActivityAt = Math.max(lastApiActivityAt, message.at)
    }
  }
  const onApiActivity = (at) => {
    lastApiActivityAt = Math.max(lastApiActivityAt, at)
    publish('api-activity')
  }
  const heartbeat = () => publish('heartbeat')
  const tick = async () => {
    const current = now()
    for (const [id, peer] of peers) {
      if (current - peer.at > PEER_TTL_MS) peers.delete(id)
    }
    if (!isVisible() || requestPending || current - recentActivityAt() >= ACTIVE_WINDOW_MS) return

    const activePeers = [...peers.entries()]
      .filter(([, peer]) => peer.visible && current - peer.at <= PEER_TTL_MS)
      .map(([id]) => id)
    if ([tabId, ...activePeers].sort()[0] !== tabId) return

    const lastRefreshAt = Math.max(lastApiActivityAt, lastKeepaliveAt)
    if (current - lastRefreshAt < KEEPALIVE_INTERVAL_MS) return

    requestPending = true
    lastKeepaliveAt = current
    try {
      await authService.keepalive()
    } catch {
      // A 401 is already delivered through the shared API client; transient failures
      // can be retried at the next interval while the user remains active.
    } finally {
      requestPending = false
    }
  }

  channel?.addEventListener?.('message', onMessage)
  const unsubscribeApiActivity = subscribeApiActivity(onApiActivity)
  const activityEvents = ['pointerdown', 'keydown', 'scroll', 'input', 'change', 'touchstart']
  for (const name of activityEvents)
    windowTarget.addEventListener(name, markActivity, { passive: true })
  windowTarget.addEventListener('pointermove', onPointerMove, { passive: true })
  documentTarget.addEventListener('visibilitychange', heartbeat)
  heartbeat()
  const heartbeatTimer = windowTarget.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS)
  const checkTimer = windowTarget.setInterval(tick, CHECK_INTERVAL_MS)

  return () => {
    publish('bye')
    channel?.removeEventListener?.('message', onMessage)
    try {
      channel?.close?.()
    } catch {
      // BroadcastChannel close errors must not throw during unmount.
    }
    unsubscribeApiActivity()
    for (const name of activityEvents) windowTarget.removeEventListener(name, markActivity)
    windowTarget.removeEventListener('pointermove', onPointerMove)
    documentTarget.removeEventListener('visibilitychange', heartbeat)
    windowTarget.clearInterval(heartbeatTimer)
    windowTarget.clearInterval(checkTimer)
  }
}
