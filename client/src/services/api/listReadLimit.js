// Insight reports issue one list request for each overview and breakdown
// count. Bound that fan-out so a report cannot occupy the whole Oracle pool.
export function createListReadLimit(limit = 4) {
  let active = 0
  const queue = []
  const drain = () => {
    while (active < limit && queue.length) {
      const entry = queue.shift()
      entry.signal?.removeEventListener('abort', entry.cancel)
      if (entry.signal?.aborted) {
        entry.reject(entry.signal.reason ?? new DOMException('Aborted', 'AbortError'))
        continue
      }
      active += 1
      entry.resolve(() => {
        active -= 1
        drain()
      })
    }
  }
  return (operation, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const entry = { signal, resolve, reject, cancel: null }
    entry.cancel = () => {
      const index = queue.indexOf(entry)
      if (index !== -1) queue.splice(index, 1)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', entry.cancel, { once: true })
    queue.push(entry)
    drain()
  }).then(async (release) => {
    try {
      return await operation()
    } finally {
      release()
    }
  })
}
