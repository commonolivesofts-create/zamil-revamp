# ExpenseHub — UI / UX Design Specification

Version 0.1 — 17 Oct 2026 · Direction **B "modern fintech"** (D-31) · Visual reference: second `expensehub.html` prototype (put a copy in `docs/reference/expensehub.html`)

> The prototype is a **visual reference only**. Do not copy its in-memory data, demo role switcher, sample trend figures, mock receipt or "Run payments" button.

## 1. Principles
1. **Figures first** — amounts are the largest text on a screen; tabular figures, `SAR` prefix, 2 decimals.
2. **Policy is visible while typing** — never surprise the user at submit.
3. **One primary action per screen.**
4. **Status is always answerable** — every report shows where it is, who holds it, since when.
5. **RTL-ready from day 1** — use CSS logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end` in Tailwind); no hard-coded left/right.

## 2. Design tokens (`apps/web/src/theme/tokens.css`)
All colours are CSS variables so ZPI brand (OQ-34) is a one-file change.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-brand` | `#0E9F6E` (placeholder) | `#31C48D` | primary buttons, links, progress |
| `--color-ink` | `#111827` | `#F9FAFB` | text, dark summary card bg (light mode) |
| `--color-muted` | `#6B7280` | `#9CA3AF` | secondary text |
| `--color-surface` | `#FFFFFF` | `#111827` | cards |
| `--color-canvas` | `#F7F8FA` | `#0B0F17` | page bg |
| `--color-border` | `#E5E7EB` | `#1F2937` | |
| `--color-pass` | `#0E9F6E` | `#31C48D` | policy pass |
| `--color-warn` | `#B45309` | `#F59E0B` | policy warn |
| `--color-block` | `#B91C1C` | `#F87171` | policy block, reject |
| `--color-info` | `#1D4ED8` | `#60A5FA` | info requested |
| Radius | 12 px cards, 8 px inputs, 999 px pills | | |
| Spacing | 4 px scale | | |

Typography: **Inter** (Latin), **IBM Plex Sans Arabic** (Arabic, phase 3), self-hosted via `@fontsource` (no external CDN at runtime). Money: `font-variant-numeric: tabular-nums`. Sizes: 32/24/18/16/14/12. Icons: `lucide-react`, 20 px, stroke 1.75. Dark mode: follows OS, toggle in user menu.

## 3. App shell
- **Desktop ≥ 1024 px:** left sidebar (logo, menu by role, user + BU at bottom), sticky top bar (global search by report number/merchant, notifications bell, "New expense" button).
- **Tablet 640–1023:** collapsible sidebar.
- **Mobile < 640:** bottom tab bar — Home · Expenses · **＋** · Reports · More.
- Menu items shown only for roles the user holds; a user with several roles sees all their sections (no role switcher).

## 4. Screen inventory (routes)

| Route | Screen | Roles | Phase | FR |
|---|---|---|---|---|
| `/login`, `/reset` | Sign-in, set/reset password | public | 1 | — |
| `/` | Role-aware home (employee / approver / finance blocks stacked) | all | 1 | FR-DSH-* |
| `/expenses` | Unreported expenses list, multi-select → Create report | Employee | 1 | FR-CAP-09 |
| `/expenses/new`, `/expenses/:id` | Expense entry | Employee | 1 | FR-CAP-01…08 |
| `/reports` | My reports, status filter chips, search | Employee | 1 | FR-REP-06 |
| `/reports/:id` | Report detail drawer (also opens over lists) | Employee, approver, finance | 1 | FR-REP-01 |
| `/status` | Where is my claim? | Employee | 1 | FR-REP-07 |
| `/approvals` | Approval inbox | Approvers | 1 | FR-DSH-02 |
| `/audit` | Audit queue + audit workspace | Accountant | 1 | FR-AUD-* |
| `/finance/payables` | Ready for payment, send, errors | Finance AP | 1 | FR-PAY-* |
| `/finance/quick-pays` | Quick Pay queue | Finance AP | 1 | FR-QP-* |
| `/advances` | My advances / request | Employee | 2 | FR-ADV-* |
| `/finance/advances` | Disburse / refund | Petty cashier | 2 | FR-ADV-* |
| `/cards` | Card transactions to itemize | Employee | 3 | FR-CRD-* |
| `/setup/*` | Expense types, approval chains, audit rules, options, roles, setup history | Admin | 1 | FR-SET-* |
| `/admin/prerequisites` | Prerequisite exceptions report | Admin, Finance | 1 | FR-SET-02 |
| `/admin/integrations` | Integration monitor | Admin, Finance | 1 | FR-SET-03 |
| `/admin/migration` | CSV upload, dry run, commit | Admin | 1 | FR-MIG |

## 5. Key screens

### 5.1 Employee home
- **Dark summary card** (ink bg): "On its way" amount (sum of approved-not-paid), sub-line "x reports".
- Quick actions: **New expense**, **Scan receipt** (opens file/camera picker → expense with receipt prefilled).
- 4 small figures: Unreported · Drafts · Open advance · Quick Pays pending.
- Recent reports (5) with status pill + 5-step progress bar.
- Spend by category (donut, last 90 days) · Monthly trend (bar, 12 months). Empty states with a call to action, never fake data.

### 5.2 Expense entry (most important screen)
Two columns on desktop (receipt **start**, form **end**); stacked on mobile (receipt collapsible on top).
- **Receipt pane:** drop zone → preview (image or PDF page 1, zoom). Badges: "ZATCA QR ✓ valid" / "QR not found" / "QR invalid – VAT not recoverable". OCR-filled fields get a subtle brand tint until the user touches them.
- **Form order:** expense type tiles (icon + name, 2–4 per row) → date → merchant → amount + currency (rate and SAR equivalent shown under it) → for MILEAGE: km × rate = amount (read-only) → business purpose → attendees (if type requires) → justification (appears when required) → cost center (defaults from HCM) → Business Trip / Quick Pay reference → tax-invoice toggle.
- **Charge account line** under the form: `IPP . 003 . 127 . 55251 . 000 . 000000` with each segment's description on hover; invalid segment in block colour.
- **Live policy checklist** (sticky on desktop): one row per rule with ✓ pass / ! warn / ✕ block and a plain-language message, e.g. "Meals limit is SAR 150 — you entered SAR 180 (warning, report will be audited)".
- Footer: **Save** (primary) · Save & add another · Cancel. Save disabled while any BLOCK.

### 5.3 Report detail drawer
Slides in from the **end** side, 560 px (full screen on mobile).
Header: report number, purpose, status pill, net payable (large). **Stepper:** Submitted → Approved → Audited → Invoiced → Paid, current step highlighted with holder name and "since 2 days".
Tabs: **Items** (lines with flags, receipt thumbnails, approved vs claimed when adjusted) · **Approvals** (each step: name, person, action, time, comment) · **Accounting preview** · **History**.
Actions by role and state: Submit / Withdraw / Correct (employee) · Approve / Reject / Request info (approver) · Verify / Adjust / Release / Reject (accountant) · Send to Payables / Retry (finance).

### 5.4 Approval inbox
Rows: claimant + BU, report number, purpose, amount, age, flag tags (Over limit · Missing receipt · Duplicate? · Foreign currency · QR invalid). Inline **Approve** and **Reject** (reject opens reason modal); click row → drawer. Bulk approve allowed only for rows with no flags.

### 5.5 Finance — Payables
Tabs: Ready for payment · Invoiced (unpaid) · Paid · Errors. Multi-select → **Send to Payables** (confirm modal with count and total). Each row shows Fusion invoice number and status once known. Error rows show the Fusion message and **Retry**.

### 5.6 Quick Pay queue
Columns: employee, element, effective date, amount, status. Actions: Create invoice (bulk), Exclude (reason).

## 6. Components (`apps/web/src/components/ui`)
`Button` (primary/secondary/ghost/danger, loading) · `Money` (SAR formatting, negative in block colour) · `StatusPill` (one colour per status, defined once) · `PolicyRow` · `Stepper` · `Drawer` · `DataTable` (sort, select, empty state, skeleton) · `Tag` · `Tile` (expense type) · `FileDrop` · `ConfirmModal` · `ReasonModal` · `Toast` · `EmptyState` · `StatCard`.

## 7. States and feedback
Every data view has: loading skeleton, empty state with action, error state with retry. Mutations show toast on success; errors show the API message. Destructive and money-sending actions need confirmation. Never block the UI longer than 300 ms without a spinner.

## 8. Accessibility
WCAG 2.1 AA contrast in both themes; all controls keyboard reachable; visible focus ring (`--color-brand`, 2 px); form errors linked with `aria-describedby`; status never by colour alone (icon + text).

## 9. Arabic (phase 3)
`dir="rtl"` on `<html>` by user preference; i18n via `react-i18next`, all strings in `locales/en.json` from day 1 (no hard-coded UI text); numbers stay Latin digits unless Finance asks otherwise.

## 10. Open questions for this document
OQ-34 (brand colours, logo). See [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
