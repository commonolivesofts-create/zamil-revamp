import { useEffect, useState } from 'react'
import useAuth from './useAuth.js'

// Loads the live password policy. While it is loading or unavailable there is
// no policy, and forms must not claim compliance or accept a new password.
// Strict Mode safe: the first request is aborted and its result ignored.
export default function usePasswordPolicy() {
  const { getPasswordPolicy } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ policy: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    getPasswordPolicy({ signal: controller.signal })
      .then((policy) => { if (!controller.signal.aborted) setState({ policy, error: null }) })
      .catch((error) => { if (!controller.signal.aborted) setState({ policy: null, error }) })
    return () => controller.abort()
  }, [getPasswordPolicy, attempt])

  const retry = () => {
    setState({ policy: null, error: null })
    setAttempt((value) => value + 1)
  }
  return { policy: state.policy, error: state.error, loading: !state.policy && !state.error, retry }
}
