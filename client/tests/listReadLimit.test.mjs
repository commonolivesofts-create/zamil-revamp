import test from 'node:test'
import assert from 'node:assert/strict'
import { createListReadLimit } from '../src/services/api/listReadLimit.js'

test('list read limiter caps concurrent requests and releases slots after failures', async () => {
  const runLimited = createListReadLimit(2)
  let active = 0
  let maximum = 0
  const operations = Array.from({ length: 7 }, (_, index) => runLimited(async () => {
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    if (index === 3) throw new Error('expected test failure')
    return index
  }))
  const results = await Promise.allSettled(operations)

  assert.equal(maximum, 2)
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 6)
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
})

test('list read limiter removes aborted requests waiting in its queue', async () => {
  const runLimited = createListReadLimit(1)
  let releaseFirst
  let startedFirst
  const firstStarted = new Promise((resolve) => { startedFirst = resolve })
  const first = runLimited(() => new Promise((resolve) => {
    releaseFirst = resolve
    startedFirst()
  }))
  await firstStarted
  const controller = new AbortController()
  let ran = false
  const queued = runLimited(() => { ran = true }, controller.signal)
  const rejected = assert.rejects(queued)
  controller.abort()
  releaseFirst()

  await first
  await rejected
  assert.equal(ran, false)
})
