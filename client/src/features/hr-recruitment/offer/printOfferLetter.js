import { useCallback, useEffect, useState } from 'react'

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))

export async function printOfferLetter(letter, isCancelled = () => false) {
  if (!letter) return false

  await Promise.all([
    document.fonts?.ready,
    ...Array.from(letter.querySelectorAll('img'), (image) =>
      image.decode ? image.decode().catch(() => {}) : Promise.resolve(),
    ),
  ])
  await nextFrame()
  await nextFrame()
  if (isCancelled()) return false
  window.print()
  return true
}

// Shared state lets report buttons and the dedicated print route render a
// letter before opening the browser print dialog.
export function usePrintOfferLetter() {
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

  const printOffer = useCallback(async (record) => {
    if (record) updateRecord(record)
    setPrintError('')
    setPrinting(true)
    // Allow the caller to commit the hidden print target before querying it.
    await nextFrame()
    await nextFrame()
    const letter = document.querySelector('.zrv-hr--offer .zrv-offer-letter')
    const printed = await printOfferLetter(letter)
    if (!printed) setPrinting(false)
    return printed
  }, [updateRecord])

  return { printOffer, printRecord, setPrintRecord, updateRecord, printing, setPrinting, printError, setPrintError }
}
