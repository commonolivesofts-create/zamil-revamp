import { Outlet } from 'react-router'

// Original sign-in and recovery pages own their distinct auth-shell/system-state markup.
// A shared wrapper would change the purchased template's CSS selectors and layout.
export default function AuthLayout() {
  return <Outlet />
}
