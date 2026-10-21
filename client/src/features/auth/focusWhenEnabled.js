import { useCallback, useEffect, useState } from 'react'

// A focus request made while a field is still disabled (a request is pending)
// is kept and carried out once the form is enabled again. Calling focus() on a
// disabled field does nothing, which left keyboard users without focus after
// API errors. An element that is gone (unmounted, step changed) is skipped.
export function createDeferredFocus() {
  let target = null
  return Object.freeze({
    request(ref) { target = ref },
    // Returns true when an element received focus.
    flush(disabled) {
      if (disabled || !target) return false
      const element = target.current
      target = null
      if (!element || element.disabled) return false
      element.focus()
      return true
    },
  })
}

// Returns `focusLater(ref)`. The effect runs after React has committed the
// enabled field, and never after the component unmounts.
export default function useFocusWhenEnabled(disabled) {
  const [deferred] = useState(createDeferredFocus)
  useEffect(() => { deferred.flush(disabled) }, [deferred, disabled])
  return useCallback((ref) => deferred.request(ref), [deferred])
}
