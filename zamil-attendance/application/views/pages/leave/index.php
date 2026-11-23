<?php
$dashboardPayload = isset($dashboardPayload) && is_array($dashboardPayload) ? $dashboardPayload : [];
$period = isset($dashboardPayload['period']) ? $dashboardPayload['period'] : [];
$departments = isset($departments) && is_array($departments) ? $departments : [];
$selectedDepartment = isset($selectedDepartment) ? (string) $selectedDepartment : '';
$viewMode = isset($viewMode) ? (string) $viewMode : 'supervisor';
$period = isset($period) && is_array($period) ? $period : [];
$requests = isset($requests) && is_array($requests)
    ? $requests
    : [];
$e = static fn($value) => htmlspecialchars((string) ($value ?? ''), ENT_QUOTES, 'UTF-8');

$summary = isset($summary) && is_array($summary)
    ? $summary
    : [];

$fmt = static function ($value) {
    return number_format((float) $value, 0, '.', ',');
};

$statusPillClass = static function ($status) {
    switch (strtoupper(trim((string) $status))) {
        case 'APPROVED':
            return 'lr-pill-approved';
        case 'DENIED':
            return 'lr-pill-denied';
        case 'AWAITING':
        case 'PENDING':
            return 'lr-pill-pending';
        default:
            return 'lr-pill-other';
    }
};
?>

<style>
    .de-period {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 6px;
        padding: 2px 12px;
        color: #e9f5f3;
        background: rgba(255, 255, 255, .09);
        border: 1px solid rgba(255, 255, 255, .14);
        border-radius: 999px;
        font-size: 11px;
    }

    .da-hero {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        padding: 7px 26px;
        margin-bottom: 7px;
        border-radius: 14px;
        background: linear-gradient(120deg, #0e2036, #15304e 62%, #0f3e52);
        color: #fff;
        overflow: hidden;
        position: relative;
    }

    .da-hero:after {
        content: "";
        position: absolute;
        width: 220px;
        height: 220px;
        right: -70px;
        top: -100px;
        border-radius: 50%;
        background: rgba(15, 168, 148, 0.18);
    }

    .da-hero>* {
        position: relative;
        z-index: 1;
    }

    .da-eyebrow {
        display: block;
        margin-bottom: 5px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1.1px;
        color: #77e4d5;
        font-weight: 700;
    }

    .da-hero h1 {
        margin: 0;
        font-size: 25px;
        font-weight: 750;
    }

    .da-hero p {
        margin: 7px 0 0;
        color: #bdcadb;
        max-width: 680px;
        font-size: 13px;
    }



    .leave-page {
        --lr-line: #dbe5dc;
        --lr-line-soft: #eaf1ea;
        --lr-text: #0f172a;
        --lr-muted: #667085;
        --lr-primary: #16833f;
    }

    .leave-page .lr-card {
        border: 1px solid var(--lr-line);
        border-radius: 8px;
        background: #fff;
    }

    .leave-page .lr-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 4px 4px 14px;
    }

    .leave-page .lr-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--lr-text);
    }

    .leave-page .lr-subtitle {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--lr-muted);
    }

    .leave-page .lr-dept-form select {
        min-width: 220px;
        height: 34px;
        border-radius: 7px;
        border: 1px solid var(--lr-line);
        font-size: 12.5px;
        padding: 0 10px;
    }

    .leave-page .lr-tiles {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
    }

    .leave-page .lr-tile {
        padding: 7px 13px;
        border-left: 3px solid var(--lr-primary);
    }

    .leave-page .lr-tile-approved {
        border-left-color: #16833f;
    }

    .leave-page .lr-tile-pending {
        border-left-color: #d69e2e;
    }

    .leave-page .lr-tile-denied {
        border-left-color: #d92d20;
    }

    .leave-page .lr-tile-total {
        border-left-color: #6366f1;
    }

    .leave-page .lr-tile-label {
        margin: 0 0 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--lr-muted);
        text-transform: uppercase;
        letter-spacing: .3px;
    }

    .leave-page .lr-tile-value {
        font-size: 22px;
        font-weight: 700;
        color: var(--lr-text);
    }

    .leave-page .lr-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--lr-line-soft);
    }

    .leave-page .lr-section-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: var(--lr-text);
    }

    .leave-page table.lr-table {
        width: 100%;
        border-collapse: collapse;
    }

    .leave-page table.lr-table thead th {
        background: #f6faf7;
        color: #475467;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .25px;
        text-transform: uppercase;
        padding: 8px 10px;
        border-bottom: 1px solid var(--lr-line-soft);
        text-align: left;
        white-space: nowrap;
    }

    .leave-page table.lr-table tbody td {
        font-size: 11.5px;
        color: #344054;
        padding: 3px 10px;
        border-bottom: 1px solid #eff3f8;
        vertical-align: middle;
    }

    .leave-page .lr-pill {
        display: inline-flex;
        align-items: center;
        padding: 0px 9px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 500;
        white-space: nowrap;
    }

    .leave-page .lr-pill-approved {
        background: #eafaf0;
        color: #027a48;
        border-color: #86efac;
    }

    .leave-page .lr-pill-pending {
        background: #fff8eb;
        color: #b45309;
        border-color: #fcd34d;
    }

    .leave-page .lr-pill-denied {
        background: #fef3f2;
        color: #b42318;
        border-color: #fca5a5;
    }

    .leave-page .lr-pill-other {
        background: #f3f4f6;
        color: #4b5563;
        border-color: #d1d5db;
    }

    .leave-page .lr-actions {
        display: flex;
        gap: 6px;
    }

    .leave-page .lr-btn {
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border: 1px solid var(--lr-line);
        background: #fff;
        color: #344054;
        cursor: pointer;
    }

    .leave-page .lr-btn-approve {
        background: var(--lr-primary);
        border-color: var(--lr-primary);
        color: #fff;
    }

    .leave-page .lr-btn-deny {
        background: #fff;
        border-color: #fca5a5;
        color: #b42318;
    }

    .leave-page .lr-empty {
        padding: 18px 14px;
        font-size: 12.5px;
        color: var(--lr-muted);
        text-align: center;
    }

    @media (max-width: 991.98px) {
        .leave-page .lr-tiles {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    .lr-tile-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .lr-tile-icon {
        font-size: 32px;
        opacity: 0.85;
    }

    .lr-tile-approved .lr-tile-icon {
        color: #198754;
    }

    .lr-tile-pending .lr-tile-icon {
        color: #fd7e14;
    }

    .lr-tile-denied .lr-tile-icon {
        color: #dc3545;
    }

    .lr-tile-total .lr-tile-icon {
        color: #0d6efd;
    }

    .leave-page .lr-filter-card {
        padding: 5px 14px;
        margin-bottom: 6px;
    }

    .leave-page .lr-filter-grid {
        display: grid;
        grid-template-columns:
            minmax(170px, 220px) minmax(170px, 220px) auto;
        align-items: end;
        gap: 12px;
    }

    .leave-page .lr-filter-field label {
        display: block;
        margin-bottom: 5px;
        color: var(--lr-muted);
        font-size: 11px;
        font-weight: 600;
    }

    .leave-page .lr-filter-field input {
        width: 100%;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--lr-line);
        border-radius: 7px;
        background: #fff;
        color: var(--lr-text);
        font-size: 12px;
        outline: none;
    }

    .leave-page .lr-filter-field input:focus {
        border-color: var(--lr-primary);
        box-shadow: 0 0 0 3px rgba(22, 131, 63, .1);
    }

    .leave-page .lr-filter-actions {
        display: flex;
        align-items: center;
        gap: 7px;
    }

    .leave-page .lr-filter-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 36px;
        padding: 7px 14px;
        border: 1px solid var(--lr-line);
        border-radius: 7px;
        background: #fff;
        color: #344054;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
    }

    .leave-page .lr-filter-btn-primary {
        background: #0e2036;
        color: #fff;
        border-color: #0e2036;
    }

    .leave-page .lr-filter-btn:disabled {
        cursor: not-allowed;
        opacity: .65;
    }

    .leave-page .lr-filter-error {
        margin-top: 9px;
        padding: 7px 10px;
        border: 1px solid #fecaca;
        border-radius: 6px;
        background: #fef2f2;
        color: #b42318;
        font-size: 11.5px;
    }

    @media (max-width: 767.98px) {
        .leave-page .lr-filter-grid {
            grid-template-columns: 1fr;
        }

        .leave-page .lr-filter-actions {
            width: 100%;
        }

        .leave-page .lr-filter-btn {
            flex: 1;
        }
    }
</style>

<div class="container-fluid leave-page">

    <section class="da-hero">
        <div>
            <span class="da-eyebrow">Leave management</span>
            <h3>Leave Requests</h3>
            <p>Review employee leave requests, monitor approval status, and track pending, approved, and denied requests for the selected period.</p>
            <div class="de-period">
                <i class="ti ti-calendar-event"></i>
                Selected Period:

                <span id="leave-period-from">
                    <?= html_escape(
                        $period['from_label'] ?? '-'
                    ) ?>
                </span>

                –

                <span id="leave-period-to">
                    <?= html_escape(
                        $period['to_label'] ?? '-'
                    ) ?>
            </div>
        </div>

    </section>

    <div class="lr-card lr-filter-card">
        <div class="lr-filter-grid">

            <div class="lr-filter-field">
                <label for="leave-from-date">
                    From Date
                </label>

                <input
                    type="date"
                    id="leave-from-date"
                    value="<?= $e(
                                $period['from_date'] ?? ''
                            ) ?>">
            </div>

            <div class="lr-filter-field">
                <label for="leave-to-date">
                    To Date
                </label>

                <input
                    type="date"
                    id="leave-to-date"
                    value="<?= $e(
                                $period['to_date'] ?? ''
                            ) ?>">
            </div>

            <div class="lr-filter-actions">
                <button
                    type="button"
                    id="apply-leave-filter"
                    class="lr-filter-btn lr-filter-btn-primary btn-sm">
                    <i class="ti ti-filter"></i>
                    Apply
                </button>

                <button
                    type="button"
                    id="reset-leave-filter"
                    class="lr-filter-btn btn-sm"
                    data-from-date="<?= $e($period['from_date'] ?? '') ?>"
                    data-to-date="<?= $e($period['to_date'] ?? '') ?>">
                    <i class="ti ti-refresh"></i>
                    Reset
                </button>
            </div>

        </div>

        <div
            id="leave-filter-error"
            class="lr-filter-error"
            style="display:none;"></div>
    </div>
    <div class="lr-tiles">
        <div class="lr-card lr-tile lr-tile-approved">
            <p class="lr-tile-label">Approved This Period</p>
            <div class="lr-tile-footer">
                <div class="lr-tile-value" id="approved-count">0</div>
                <i class="ti ti-circle-check lr-tile-icon"></i>
            </div>
        </div>

        <div class="lr-card lr-tile lr-tile-pending">
            <p class="lr-tile-label">Pending Manager Review</p>
            <div class="lr-tile-footer">
                <div class="lr-tile-value" id="pending-count">0</div>
                <i class="ti ti-clock-hour-4 lr-tile-icon"></i>
            </div>
        </div>

        <div class="lr-card lr-tile lr-tile-denied">
            <p class="lr-tile-label">Denied This Period</p>
            <div class="lr-tile-footer">
                <div class="lr-tile-value" id="denied-count">0</div>
                <i class="ti ti-circle-x lr-tile-icon"></i>
            </div>
        </div>

        <div class="lr-card lr-tile lr-tile-total">
            <p class="lr-tile-label">Total Requests This Period</p>
            <div class="lr-tile-footer">
                <div class="lr-tile-value" id="total-count">0</div>
                <i class="ti ti-list-details lr-tile-icon"></i>
            </div>
        </div>
    </div>

    <div class="lr-card">
        <div class="lr-section-head">
            <div>
                <h2 class="lr-section-title">Leave Requests</h2>
            </div>
        </div>

        <div id="lrRequestsList">

            <div class="table-responsive">

                <table class="lr-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Employee</th>
                            <th>Type</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Days</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="leave-table-body">
                    </tbody>
                </table>
            </div>
        </div>

    </div>
    <div class="shift-pagination-wrap mt-2">
        <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
    </div>
</div>
<script>
    const BASE_URL = "<?= base_url(); ?>";
</script>

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>