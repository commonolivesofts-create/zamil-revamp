# Working rules: attendance/

Read [README.md](README.md) first: architecture, phases, parity method, known CI3 issues.

- **Never modify `../zamil-attendance/`.** It is the reference implementation.
- **Only the design changes.** Keep CI3 behaviour, access (no roles), defaults and exports exactly;
  only fix real CI3 bugs, and list every fix in the parity report.
- **Same Oracle tables** as CI3, on the **test ADW** (`zpadwtest_tp`). Never production. Any DDL or
  test-data load in the shared XXZP schema needs the user's explicit approval.
- **Bind variables only.** Lists use `ListSpec` + `oracleReportRepository` + `reportRoutes`
  (`apps/api/src/db/sql.ts`, `apps/api/src/modules/report.ts`); a new report is a spec, a row mapper and
  one route call.
- **Web:** list pages are a `ReportConfig` rendered by `components/report/ReportPage`. Use the main
  client's Orvexa / `zrv-*` classes. Attendance-only CSS lives in `src/styles/attendance.css`
  (`zat-` prefix, tokens only). No Tailwind build, no new UI library.
- **Contracts** live in `packages/shared` (zod). The API parses requests with them; the web validates
  responses with them.
- **Per module:** fill `docs/parity/<module>.md` from the template and update the README phase table.

| Command                                         | Purpose                                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                                   | API :7387 + web :7388 (creates `.env`, syncs Orvexa assets) |
| `npm run db:ping`                               | Check ADW connectivity and the attendance tables            |
| `npm run lint` / `typecheck` / `test` / `build` | Quality gates (all must pass)                               |
