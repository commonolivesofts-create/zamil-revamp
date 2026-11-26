import test from 'node:test'
import assert from 'node:assert/strict'
import {
  startActivitySessionTracker,
  KEEPALIVE_INTERVAL_MS,
  ACTIVE_WINDOW_MS,
  POINTER_MOVE_THROTTLE_MS,
  ACTIVITY_BROADCAST_THROTTLE_MS,
  HEARTBEAT_INTERVAL_MS,
  CHECK_INTERVAL_MS,
} from '../src/features/auth/activityTracker.js'

class MockBroadcastChannel {
  static channels = new Map()

  constructor(name) {
    this.name = name
    this.listeners = new Set()
    this.closed = false
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set())
    }
    MockBroadcastChannel.channels.get(name).add(this)
  }

  addEventListener(type, listener) {
    if (type === 'message') this.listeners.add(listener)
  }

  removeEventListener(type, listener) {
    if (type === 'message') this.listeners.delete(listener)
  }

  postMessage(data) {
    if (this.closed) throw new Error('Channel closed')
    const peers = MockBroadcastChannel.channels.get(this.name)
    if (!peers) return
    for (const peer of peers) {
      if (peer !== this && !peer.closed) {
        for (const listener of peer.listeners) {
          listener({ data: JSON.parse(JSON.stringify(data)) })
        }
      }
    }
  }

  close() {
    this.closed = true
    this.listeners.clear()
    const peers = MockBroadcastChannel.channels.get(this.name)
    peers?.delete(this)
  }

  static reset() {
    MockBroadcastChannel.channels.clear()
  }
}

function createMockEnvironment({ initialTime = 1_000_000, initialVisibility = 'visible' } = {}) {
  let currentTime = initialTime
  const windowListeners = new Map()
  const documentListeners = new Map()
  const intervals = new Map()
  let nextIntervalId = 1

  const mockWindow = {
    addEventListener(name, listener) {
      if (!windowListeners.has(name)) windowListeners.set(name, new Set())
      windowListeners.get(name).add(listener)
    },
    removeEventListener(name, listener) {
      windowListeners.get(name)?.delete(listener)
    },
    setInterval(callback, ms) {
      const id = nextIntervalId++
      intervals.set(id, { callback, ms, nextTrigger: currentTime + ms })
      return id
    },
    clearInterval(id) {
      intervals.delete(id)
    },
    dispatch(name, eventData = {}) {
      const list = windowListeners.get(name)
      if (list) {
        for (const listener of list) listener(eventData)
      }
    },
  }

  const mockDocument = {
    visibilityState: initialVisibility,
    addEventListener(name, listener) {
      if (!documentListeners.has(name)) documentListeners.set(name, new Set())
      documentListeners.get(name).add(listener)
    },
    removeEventListener(name, listener) {
      documentListeners.get(name)?.delete(listener)
    },
    dispatch(name, eventData = {}) {
      const list = documentListeners.get(name)
      if (list) {
        for (const listener of list) listener(eventData)
      }
    },
    setVisibility(state) {
      mockDocument.visibilityState = state
      mockDocument.dispatch('visibilitychange')
    },
  }

  const advanceTimers = async (ms) => {
    const target = currentTime + ms
    while (currentTime < target) {
      currentTime = Math.min(currentTime + CHECK_INTERVAL_MS, target)
      for (const [, timer] of [...intervals.entries()]) {
        if (currentTime >= timer.nextTrigger) {
          timer.nextTrigger += timer.ms
          await timer.callback()
        }
      }
    }
  }

  return {
    mockWindow,
    mockDocument,
    now: () => currentTime,
    advanceTimers,
    advanceClock: (ms) => {
      currentTime += ms
    },
    windowListeners,
    documentListeners,
    intervals,
  }
}

test('activity detection registers all expected event listeners and cleans them up on unmount', () => {
  const env = createMockEnvironment()
  const stop = startActivitySessionTracker({
    windowTarget: env.mockWindow,
    documentTarget: env.mockDocument,
    now: env.now,
  })

  const expectedEvents = [
    'pointerdown',
    'keydown',
    'scroll',
    'input',
    'change',
    'touchstart',
    'pointermove',
  ]
  for (const name of expectedEvents) {
    assert.equal(env.windowListeners.get(name)?.size, 1, `Window listener for ${name} registered`)
  }
  assert.equal(
    env.documentListeners.get('visibilitychange')?.size,
    1,
    'Document listener for visibilitychange registered',
  )
  assert.equal(env.intervals.size, 2, 'Two interval timers active (heartbeat and tick)')

  stop()

  for (const name of expectedEvents) {
    assert.equal(env.windowListeners.get(name)?.size, 0, `Window listener for ${name} removed`)
  }
  assert.equal(
    env.documentListeners.get('visibilitychange')?.size,
    0,
    'Document listener for visibilitychange removed',
  )
  assert.equal(env.intervals.size, 0, 'All interval timers cleared')
})

test('broadcast throttling prevents message flooding during rapid scrolling and keystrokes', () => {
  MockBroadcastChannel.reset()
  const env = createMockEnvironment()
  const messages = []

  const testChannel = new MockBroadcastChannel('zamil-session-activity-v1')
  testChannel.addEventListener('message', (e) => messages.push(e.data))

  const stop = startActivitySessionTracker({
    windowTarget: env.mockWindow,
    documentTarget: env.mockDocument,
    channelFactory: (name) => new MockBroadcastChannel(name),
    now: env.now,
  })

  // First keystroke broadcasts immediately
  env.mockWindow.dispatch('keydown')
  const initialCount = messages.filter((m) => m.type === 'activity').length
  assert.equal(initialCount, 1, 'Initial activity broadcast sent')

  // 100 rapid scroll and input events over the next 500ms
  for (let i = 0; i < 50; i++) {
    env.advanceClock(10)
    env.mockWindow.dispatch('scroll')
    env.mockWindow.dispatch('input')
  }

  const floodCount = messages.filter((m) => m.type === 'activity').length
  assert.equal(floodCount, 1, 'Subsequent activity broadcasts throttled within throttle window')

  // Advance past the 1500ms throttle threshold
  env.advanceClock(ACTIVITY_BROADCAST_THROTTLE_MS + 10)
  env.mockWindow.dispatch('input')

  const nextCount = messages.filter((m) => m.type === 'activity').length
  assert.equal(nextCount, 2, 'New activity broadcast dispatched after throttle window elapsed')

  stop()
  testChannel.close()
})

test('keepalive scheduling: sends keepalive after 3 minutes of activity and suppresses on API activity', async () => {
  MockBroadcastChannel.reset()
  const env = createMockEnvironment()
  const keepaliveCalls = []
  let apiActivityCallback = null

  const stop = startActivitySessionTracker({
    windowTarget: env.mockWindow,
    documentTarget: env.mockDocument,
    authService: {
      keepalive: async () => {
        keepaliveCalls.push(env.now())
      },
    },
    subscribeApiActivity: (cb) => {
      apiActivityCallback = cb
      return () => {
        apiActivityCallback = null
      }
    },
    channelFactory: (name) => new MockBroadcastChannel(name),
    now: env.now,
  })

  // User interacts continuously for 2 minutes
  for (let i = 0; i < 12; i++) {
    await env.advanceTimers(10_000)
    env.mockWindow.dispatch('keydown')
  }
  assert.equal(keepaliveCalls.length, 0, 'No keepalive call before 3 minutes')

  // User triggers a normal authenticated API request at 2m30s
  apiActivityCallback?.(env.now())

  // Advance another 2 minutes (total 4m30s, but only 2m since last API call)
  for (let i = 0; i < 12; i++) {
    await env.advanceTimers(10_000)
    env.mockWindow.dispatch('keydown')
  }
  assert.equal(
    keepaliveCalls.length,
    0,
    'Keepalive suppressed by recent authenticated API activity',
  )

  // Advance 3 more minutes with active typing (total >3m since API activity)
  for (let i = 0; i < 18; i++) {
    await env.advanceTimers(10_000)
    env.mockWindow.dispatch('keydown')
  }
  assert.equal(
    keepaliveCalls.length,
    1,
    'Keepalive triggered when 3 minutes elapse without API activity',
  )

  stop()
})

test('inactivity handling: keepalive stops when user is inactive for more than 5 minutes', async () => {
  MockBroadcastChannel.reset()
  const env = createMockEnvironment()
  const keepaliveCalls = []

  const stop = startActivitySessionTracker({
    windowTarget: env.mockWindow,
    documentTarget: env.mockDocument,
    authService: {
      keepalive: async () => {
        keepaliveCalls.push(env.now())
      },
    },
    subscribeApiActivity: () => () => {},
    channelFactory: (name) => new MockBroadcastChannel(name),
    now: env.now,
  })

  // User interacts initially
  env.mockWindow.dispatch('pointerdown')

  // Advance 3 minutes while maintaining activity
  for (let i = 0; i < 18; i++) {
    await env.advanceTimers(10_000)
    env.mockWindow.dispatch('keydown')
  }
  assert.equal(keepaliveCalls.length, 1, 'First keepalive called at 3 minutes')

  // User stops all activity at 3m.
  // At 6m (3m inactive < 5m ACTIVE_WINDOW_MS), one final keepalive is sent
  for (let i = 0; i < 18; i++) {
    await env.advanceTimers(10_000)
  }
  assert.equal(
    keepaliveCalls.length,
    2,
    'Second keepalive called while still within the 5-minute active window',
  )

  // Advance another 6 minutes with zero interactions (now >5m inactive since 3m mark)
  for (let i = 0; i < 36; i++) {
    await env.advanceTimers(10_000)
  }

  assert.equal(
    keepaliveCalls.length,
    2,
    'No additional keepalive sent after user has been inactive for >5 minutes',
  )

  stop()
})

test('multi-tab leader election: only the leader tab sends keepalive requests', async () => {
  MockBroadcastChannel.reset()
  const envA = createMockEnvironment()
  const envB = createMockEnvironment()
  const keepalivesA = []
  const keepalivesB = []

  // Tab A and Tab B
  const stopA = startActivitySessionTracker({
    windowTarget: envA.mockWindow,
    documentTarget: envA.mockDocument,
    authService: {
      keepalive: async () => {
        keepalivesA.push(envA.now())
      },
    },
    subscribeApiActivity: () => () => {},
    channelFactory: (name) => new MockBroadcastChannel(name),
    now: envA.now,
  })

  const stopB = startActivitySessionTracker({
    windowTarget: envB.mockWindow,
    documentTarget: envB.mockDocument,
    authService: {
      keepalive: async () => {
        keepalivesB.push(envB.now())
      },
    },
    subscribeApiActivity: () => () => {},
    channelFactory: (name) => new MockBroadcastChannel(name),
    now: envB.now,
  })

  // User types in Tab B only
  for (let i = 0; i < 20; i++) {
    envB.mockWindow.dispatch('input')
    await envA.advanceTimers(10_000)
    await envB.advanceTimers(10_000)
  }

  // Exactly one tab should have performed the keepalive call (the elected leader)
  const totalKeepalives = keepalivesA.length + keepalivesB.length
  assert.equal(totalKeepalives, 1, 'Exactly one tab sent a keepalive request')

  stopA()
  stopB()
})

test('background tab suspension: background tabs do not send keepalives', async () => {
  MockBroadcastChannel.reset()
  const env = createMockEnvironment({ initialVisibility: 'hidden' })
  const keepalives = []

  const stop = startActivitySessionTracker({
    windowTarget: env.mockWindow,
    documentTarget: env.mockDocument,
    authService: {
      keepalive: async () => {
        keepalives.push(env.now())
      },
    },
    subscribeApiActivity: () => () => {},
    channelFactory: (name) => new MockBroadcastChannel(name),
    now: env.now,
  })

  // Tab is hidden, user had activity
  env.mockWindow.dispatch('keydown')

  // Advance 10 minutes while tab is hidden
  for (let i = 0; i < 60; i++) {
    await env.advanceTimers(10_000)
  }
  assert.equal(keepalives.length, 0, 'No keepalive sent while tab is in background')

  // Focus tab and interact
  env.mockDocument.setVisibility('visible')
  env.mockWindow.dispatch('pointerdown')
  await env.advanceTimers(10_000)

  assert.equal(
    keepalives.length,
    1,
    'Keepalive dispatched after tab became visible and user interacted',
  )

  stop()
})

test('safe fallback when BroadcastChannel throws or is unavailable', async () => {
  const env = createMockEnvironment()
  const keepalives = []

  const failingChannelFactory = () => {
    throw new Error('SecurityError: Access to BroadcastChannel is denied')
  }

  // Should not throw during initialization
  const stop = startActivitySessionTracker({
    windowTarget: env.mockWindow,
    documentTarget: env.mockDocument,
    authService: {
      keepalive: async () => {
        keepalives.push(env.now())
      },
    },
    subscribeApiActivity: () => () => {},
    channelFactory: failingChannelFactory,
    now: env.now,
  })

  // User interacts in tab
  env.mockWindow.dispatch('keydown')

  // Advance 3 minutes
  for (let i = 0; i < 18; i++) {
    await env.advanceTimers(10_000)
    env.mockWindow.dispatch('keydown')
  }

  assert.equal(
    keepalives.length,
    1,
    'Tab successfully tracked activity and scheduled keepalive autonomously',
  )

  // Should not throw during cleanup
  assert.doesNotThrow(() => stop())
})
