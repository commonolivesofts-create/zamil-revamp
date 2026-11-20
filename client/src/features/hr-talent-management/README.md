# Talent Management dashboard

`/hr/talent-management/dashboard` (registry id `hr-talent-dashboard`, `hrEmployeeServices.module.js`)
is the overview of the Talent Management sub-module. Its design is its own, independent of the
recruitment dashboard: a brand masthead with the Talent Index and a "pulse" strip, a live KPI ticker, a bento grid with
one card per area, a target tracker, a smooth trend chart and an action centre. Widgets are in
`dashboard/TalentWidgets.jsx` and styles (`td-` classes, light and dark tokens) in
`styles/hr-talent-dashboard.css`. Only the data layer is shared with recruitment: the batched
counter in `hr-recruitment/dashboard/dashboardModel.js`.

- **Theme:** built on the brand tokens: green (default) or yellow (`html[data-accent-theme]`),
  light or dark (`html.dark`).
- **KPIs:** `dashboard/talentKpis.js` defines the scorecard (30+ KPIs across the five areas, shown as a target tracker of bullet charts per area), their
  working targets (`TARGETS`, tune them there) and the Talent Index (the average of the headline
  quality rates the user can see). Everything is computed from figures already loaded.
- **Motion:** the app's Motion preference "Reduced" (`html[data-motion]`) stops all animation; the
  system reduced-motion setting keeps fades, fills and count-ups but stops movement (drift, tilt,
  ticker, pulses).

| Area                  | Source                                                                                     | Shown when the user can open                     |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Performance appraisal | `/api/v1/hr/performance-appraisals` counts (year, status, grade) and `lookups/grade-stats` | `/hr/performance/appraisal/report`               |
| Reward nomination     | `/api/v1/hr/employee-of-the-month` counts (date, status, department)                       | `/hr/talent-management/reward-nomination/report` |
| Job skill matrix      | TrainingHub `GET /matrix`                                                                  | the `training-hub-job-skill-matrix` link         |
| Training catalog      | TrainingHub `GET /catalog?from=<today>`                                                    | the `training-hub-catalog` link                  |
| Team skills           | TrainingHub `GET /team`                                                                    | the `training-hub-team-skills` link              |

Appraisal and nomination figures follow the selected calendar year (compared with the year before);
TrainingHub figures are its current state. Every count is what the backend returns for the
signed-in user, so managers, HR and employees each see their own scope.

## TrainingHub access (`/training-hub-api`)

The browser reads TrainingHub on this application's origin under `/training-hub-api`
(`dashboard/trainingHubClient.js`). TrainingHub signs the user in from the Zamil session cookie
(`POST /auth/sso`), exactly as when TrainingHub is opened directly, and authorises every request.

- **Development / preview:** `vite.config.js` proxies `/training-hub-api/*` to
  `http://127.0.0.1:7383/api/v1/*` (override with `TRAINING_HUB_API_ORIGIN` in `client/.env`).
  Only `GET` and `POST /auth/sso` are forwarded.
- **Deployed:** the gateway or reverse proxy that serves this frontend and `/api` must also forward
  `/training-hub-api/*` to TrainingHub's `/api/v1/*` on the same host, passing cookies, and should
  allow only `GET` plus `POST /training-hub-api/auth/sso`.

When TrainingHub cannot be reached, the dashboard still shows appraisals and nominations, with a
notice and a link to open TrainingHub.
