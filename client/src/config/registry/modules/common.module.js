// Pages every signed-in user can open. Authentication is required; no business
// permission is. Session-only (rbac: false): never registered in Oracle.
// Sign Out is a session action in the header, not a navigation entry.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'COMMON',
  name: 'Common',
  rbac: false,
  navigation: [
    { id: 'dashboard', path: '/dashboard', title: 'Dashboard', icon: 'layout-dashboard', group: 'workspace', order: 10 },
    { id: 'account-password', path: '/account/password', title: 'Password', icon: 'key-round', group: 'account', order: 10 },
    { id: 'account-authenticator', path: '/account/authenticator', title: 'Authenticator app', icon: 'smartphone', group: 'account', order: 20 },
  ],
})
