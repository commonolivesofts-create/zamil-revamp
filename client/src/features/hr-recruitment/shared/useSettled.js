import { useEffect, useState } from 'react'

// The value after it has stopped changing for `delay` ms (search-as-you-type).
export function useSettled(value, delay) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
