# Responsive layout review

Reviewed on 16 November 2026. Changes preserve the existing theme, routes,
permissions and print layouts. No dependencies were changed.

## Areas updated

- Recruitment, onboarding, employee services, letters, dashboards and workflow
  grids now let their minimum column width fit the containing card.
- Small-screen form actions stack without splitting their labels. Survey
  filters and administration detail lists stack at narrow widths.
- The bilingual live offer table scrolls inside its own keyboard-accessible
  region. HR and TrainingHub pagination can wrap.
- Native fields fit their columns; touch fields use 16px text. Compact client
  buttons and rating controls have larger touch targets.
- Dialogs fit narrow content areas. ExpenseHub drawers and TrainingHub modals
  keep their headers and footers available while their bodies scroll.
- TrainingHub cards and table containers can shrink. Its notification menu and
  ExpenseHub dropdowns are bounded by the available viewport.

## Verification

| Check                                                                                             | Result                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Client complete test suite                                                                        | 537 passed, 3 existing TODOs, no failures  |
| Client recruitment/shared-component/survey tests after changes                                    | 24 passed                                  |
| Client ESLint, production build and static release verification                                   | Passed                                     |
| TrainingHub web type check and production build                                                   | Passed                                     |
| ExpenseHub changed-component ESLint, web type check, production build and production-bundle guard | Passed                                     |
| ExpenseHub source backup                                                                          | Completed using its existing backup script |
| Whitespace validation                                                                             | `git diff --check` passed                  |

Browser checks used Edge through the already installed Playwright dependency.
A temporary production build enabled every client feature: 57 non-parameterized
routes were checked at 320, 375, 768, 1024, 1440 and 1920px, with no remaining
uncontained horizontal overflow findings. The final recruitment toolbar changes
were also checked on requisition, interview and offer pages at those widths.

The login, forgotten-password and three public recovery/setup pages were checked
at the same widths. At 375x812 with touch enabled, form text measured 16px and
rendered recruitment buttons met the 44px height check. Command search, the
create-role dialog and mobile navigation fit the viewport and opened/closed.

## Verification limits

Browser authentication used synthetic session/permission responses. Other API
requests returned unavailable-data responses; recovery/setup links used their
missing-token states. Populated reports, saved-record variants, successful
approval flows and real token/MFA flows still require connected backend data.
ExpenseHub and TrainingHub received source review, type checks and build checks;
their authenticated pages were not exhaustively browser-tested.

On this Windows sandbox, the hubs' default Vite config bundler could not traverse
an ancestor directory. Both builds passed with `--configLoader native`, without
changing project configuration. Existing chunk-size, vendor chunk-cycle and
third-party annotation warnings remain.
