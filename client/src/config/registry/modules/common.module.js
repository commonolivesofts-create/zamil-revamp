// Pages every signed-in user can open. Authentication is required; no business
// permission is. Session-only (rbac: false): never registered in Oracle.
// Sign Out is a session action in the header, not a navigation entry.
import { defineModule } from '../defineModule.js'

export default defineModule({
  code: 'COMMON',
  name: 'Common',
  rbac: false,
  navigation: [
    {
      id: 'dashboard',
      path: '/dashboard',
      title: 'Dashboard',
      icon: 'layout-dashboard',
      group: 'workspace',
      order: 10,
    },
    {
      id: 'pending-worklist',
      path: '/worklist/pending',
      title: 'Pending Worklist',
      icon: 'list-checks',
      group: 'workspace',
      order: 20,
    },
    {
      id: 'account-password',
      path: '/account/password',
      title: 'Password',
      icon: 'key-round',
      group: 'account',
      subgroup: 'account-settings',
      order: 10,
    },
    {
      id: 'account-authenticator',
      path: '/account/authenticator',
      title: 'Authenticator app',
      icon: 'smartphone',
      group: 'account',
      subgroup: 'account-settings',
      order: 20,
    },
    // Talent Management pages served by TrainingHub (same sign-in); TrainingHub
    // decides who may use each page.
    {
      id: 'training-hub-job-skill-matrix',
      type: 'external',
      href: { env: 'VITE_EXTERNAL_TRAINING_HUB', path: '/jsm' },
      title: 'Job skill matrix',
      icon: 'grid-3x3',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 300,
    },
    {
      id: 'training-hub-catalog',
      type: 'external',
      href: { env: 'VITE_EXTERNAL_TRAINING_HUB', path: '/catalog' },
      title: 'Training catalog',
      icon: 'book-open',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 310,
    },
    {
      id: 'training-hub-team-skills',
      type: 'external',
      href: { env: 'VITE_EXTERNAL_TRAINING_HUB', path: '/team' },
      title: 'Team skills',
      icon: 'users',
      group: 'human-resources',
      subgroup: 'hr-talent-management',
      order: 320,
    },
    {
      id: 'training-hub',
      type: 'external',
      href: { env: 'VITE_EXTERNAL_TRAINING_HUB' },
      title: 'Training Hub',
      icon: 'graduation-cap',
      group: 'human-resources',
      order: 999,
    },
    {
      id: 'expense-hub',
      type: 'external',
      href: { env: 'VITE_EXTERNAL_EXPENSE_HUB' },
      title: 'Expense Hub',
      icon: 'wallet-cards',
      group: 'finance',
      order: 10,
    },
  ],
})
