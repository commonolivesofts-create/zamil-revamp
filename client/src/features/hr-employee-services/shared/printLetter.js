import { useCallback, useEffect, useState } from 'react'

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
const PRINT_TARGET = '.zrv-ir-letter-print'

// The hidden print target is rendered from React state, so it may appear a
// frame or two after the Print button updates it. Wait briefly instead of
// querying it once.
async function waitForTarget(isCancelled) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const target = document.querySelector(PRINT_TARGET)
    if (target) return target
    if (isCancelled()) return null
    await nextFrame()
  }
  return null
}

// Waits for the paper and its images before opening the browser print dialog,
// exactly as the employment offer letter and the sick leave drawer do.
export async function printLetterTarget(target, isCancelled = () => false) {
  if (!target) return false

  await Promise.all([
    document.fonts?.ready,
    ...Array.from(target.querySelectorAll('img'), (image) =>
      image.decode ? image.decode().catch(() => {}) : Promise.resolve(),
    ),
  ])
  await nextFrame()
  await nextFrame()
  if (isCancelled()) return false
  window.print()
  return true
}

// Shared state lets a report's Print button render the saved letter in a hidden
// print target before opening the browser print dialog.
export function usePrintLetter() {
  const [printRecord, setPrintRecord] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState('')

  useEffect(() => {
    if (!printRecord) return undefined
    const finish = () => {
      setPrintRecord(null)
      setPrinting(false)
    }
    window.addEventListener('afterprint', finish, { once: true })
    return () => window.removeEventListener('afterprint', finish)
  }, [printRecord])

  const updateRecord = useCallback((record) => {
    setPrintError('')
    setPrinting(true)
    setPrintRecord(record)
  }, [])

  const printLetter = useCallback(async (record) => {
    if (record) updateRecord(record)
    setPrintError('')
    setPrinting(true)
    // Allow the caller to commit the hidden print target before querying it.
    await nextFrame()
    const target = await waitForTarget()
    if (!target) {
      setPrinting(false)
      return false
    }
    const printed = await printLetterTarget(target)
    if (!printed) setPrinting(false)
    return printed
  }, [updateRecord])

  return { printLetter, printRecord, setPrintRecord, updateRecord, printing, setPrinting, printError, setPrintError }
}
