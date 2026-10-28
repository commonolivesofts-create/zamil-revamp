// The active module registry: the only list of registered modules.
//
// Pure JavaScript (relative imports, no React/Vite), so future Node.js tooling
// can import the same definitions. To register a module, import its definition
// file and add it to `registeredModules` (see module-registry.example.js, which
// is documentation only and must never be imported here).
import { buildRegistry } from './defineModule.js'
import { NAVIGATION_GROUPS } from './navigationGroups.js'
import commonModule from './modules/common.module.js'
import securityAdministrationModule from './modules/securityAdministration.module.js'
import requisitionsModule from './modules/requisitions.module.js'
import interviewAssessmentsModule from './modules/interviewAssessments.module.js'
import employmentOffersModule from './modules/employmentOffers.module.js'

export const registeredModules = Object.freeze([
  commonModule,
  securityAdministrationModule,
  requisitionsModule,
  interviewAssessmentsModule,
  employmentOffersModule,
])

// Validated once at import; any definition error throws here.
export const registry = buildRegistry(registeredModules, NAVIGATION_GROUPS)

export { NAVIGATION_GROUPS }
