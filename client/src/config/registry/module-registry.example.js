// =============================================================================
// EXAMPLE ONLY — NOT AN ACTIVE MODULE DEFINITION.
// Never import this file from config/registry/index.js or from application code,
// and never let any registration tooling read it. Nothing here is registered,
// routed, listed in navigation or created in Oracle. The example codes start
// with EXAMPLE_ and the example paths with /example so they cannot be mistaken
// for real definitions. A test validates this file in isolation and checks
// that nothing imports it.
// =============================================================================
//
// HOW TO ADD A MODULE
//
// 1. Agree the module, resource and action codes in the requirement first
//    (docs/FEATURE-DELIVERY-WORKFLOW.md). Codes are UPPER_SNAKE_CASE and stable
//    once used: MODULE_CODE ≤ 60, RESOURCE_CODE ≤ 80, ACTION_CODE ≤ 40 characters.
//    Actions come only from registry/actions.js (STANDARD_ACTIONS); list only
//    the actions the resource really supports.
// 2. Create config/registry/modules/<name>.module.js exporting
//    `defineModule({...})` as its default export (see the definitions below).
// 3. If the module needs its own sidebar section, add a group to
//    registry/navigationGroups.js (id, label, icon; array order = display order).
// 4. Register it in config/registry/index.js:
//
//      import budgetModule from './modules/budget.module.js'
//      import productionModule from './modules/production.module.js'
//
//      export const registeredModules = Object.freeze([
//        commonModule,
//        securityAdministrationModule,
//        budgetModule,          // one line per module, in any order
//        productionModule,
//      ])
//
// 5. Every internal navigation entry needs its React route in
//    src/app/router.jsx with the same path and `handle: { routeId: '<entry id>' }`
//    plus its lazy page export in src/routes/RouteComponents.jsx (a test checks
//    registry and router match). Use `implemented: false` until the page works:
//    it is then never routed, listed or searchable.
// 6. Registering frontend navigation creates no permission. The permissions
//    (MODULE.RESOURCE:ACTION) must exist in the Oracle catalogue and be granted
//    to roles before anyone sees the entries (deny by default).
//
// NAVIGATION ENTRY FIELDS
//   id            unique kebab-case id (also the router handle routeId)
//   title, icon   sidebar/palette label and OrvexaIcon name
//   group, order  navigation group id and position inside that group (unique)
//   type          optional. Missing or 'internal' = React route with `path`.
//                 Only 'external' = external destination with `href`.
//                 Any other value fails validation.
//   path          internal only: '/area/page' or '/area/page/:id'
//   href          external only: an absolute https URL (host name or IP address,
//                 no credentials) or { env: 'VITE_EXTERNAL_<NAME>' } for an
//                 environment-specific approved URL. Build-time VITE_ values are
//                 public: never put tokens, passwords or keys in them. A missing
//                 or invalid environment value hides the entry.
//                 External links open in a new tab (noopener, noreferrer).
//   requiredAction  action needed to see the entry (default 'VIEW'; must be one
//                 of the resource's actions)
//   alsoRequires  further permissions the page needs: 'RESOURCE:ACTION' (same
//                 module) or 'MODULE.RESOURCE:ACTION'
//   requiresMfa   true when the backend requires an MFA-verified session
//   hidden        true for a detail page reached from another page (not listed)
//   implemented   false while the destination is not available (default true)
import { defineModule } from './defineModule.js'

// Example navigation groups this example would add to navigationGroups.js.
export const EXAMPLE_GROUPS = Object.freeze([
  Object.freeze({ id: 'example-sales', label: 'Sales (example)', icon: 'receipt' }),
  Object.freeze({ id: 'example-production', label: 'Production (example)', icon: 'factory' }),
])

// One module with one resource and default (internal) navigation.
export const exampleSalesModule = defineModule({
  code: 'EXAMPLE_SALES',
  name: 'Sales (example)',
  description: 'Example only: a module with a single resource.',
  displayOrder: 900,
  resources: [
    {
      code: 'EXAMPLE_SALES_ORDERS',
      name: 'Sales Orders (example)',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'CANCEL', 'PRINT', 'EXPORT'],
      navigation: [
        // No `type`: internal by default.
        { id: 'example-sales-orders', path: '/example/sales/orders', title: 'Sales orders', icon: 'receipt', group: 'example-sales', order: 10 },
        // Detail page: guarded like any page, never listed.
        { id: 'example-sales-order', path: '/example/sales/orders/:orderId', title: 'Sales order', icon: 'receipt', group: 'example-sales', order: 11, hidden: true },
        // Listed only for users who may approve.
        { id: 'example-sales-approvals', path: '/example/sales/approvals', title: 'Order approvals', icon: 'check-check', group: 'example-sales', order: 20, requiredAction: 'APPROVE' },
      ],
    },
  ],
})

// One module with several resources: explicit internal and external
// navigation, a cross-resource dependency and a resource without navigation.
export const exampleProductionModule = defineModule({
  code: 'EXAMPLE_PRODUCTION',
  name: 'Production (example)',
  description: 'Example only: a module with multiple resources.',
  displayOrder: 910,
  resources: [
    {
      code: 'EXAMPLE_WORK_ORDERS',
      name: 'Work Orders (example)',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'SCHEDULE', 'RELEASE', 'START', 'COMPLETE', 'CLOSE'],
      navigation: [
        // Explicit internal type (same as omitting it).
        { id: 'example-work-orders', type: 'internal', path: '/example/production/work-orders', title: 'Work orders', icon: 'clipboard-list', group: 'example-production', order: 10 },
      ],
    },
    {
      code: 'EXAMPLE_MATERIAL_ISSUES',
      name: 'Material Issues (example)',
      actions: ['VIEW', 'CREATE', 'ISSUE', 'REVERSE'],
      navigation: [
        // The page also reads work orders, so it needs that permission too.
        { id: 'example-material-issues', path: '/example/production/material-issues', title: 'Material issues', icon: 'package-minus', group: 'example-production', order: 20, alsoRequires: ['EXAMPLE_WORK_ORDERS:VIEW'] },
      ],
    },
    {
      // Resource without navigation: its permissions guard actions on other pages.
      code: 'EXAMPLE_PRODUCTION_COSTS',
      name: 'Production Costs (example)',
      actions: ['VIEW', 'ALLOCATE', 'POST', 'REVERSE'],
    },
    {
      code: 'EXAMPLE_PRODUCTION_REPORTS',
      name: 'Production Reports (example)',
      actions: ['VIEW', 'RUN', 'EXPORT'],
      navigation: [
        // External destination with a fixed approved URL (example.com is reserved for examples).
        { id: 'example-production-dashboard', type: 'external', href: 'https://reports.example.com/production', title: 'Production dashboard', icon: 'external-link', group: 'example-production', order: 30 },
        // Environment-specific approved URL: set VITE_EXTERNAL_EXAMPLE_PLANT_PORTAL
        // per environment; unset or invalid hides the entry. Requires RUN.
        { id: 'example-plant-portal', type: 'external', href: { env: 'VITE_EXTERNAL_EXAMPLE_PLANT_PORTAL' }, title: 'Plant portal', icon: 'external-link', group: 'example-production', order: 40, requiredAction: 'RUN' },
      ],
    },
  ],
})

// Multiple modules, as they would be listed in index.js `registeredModules`.
export const EXAMPLE_MODULES = Object.freeze([exampleSalesModule, exampleProductionModule])
