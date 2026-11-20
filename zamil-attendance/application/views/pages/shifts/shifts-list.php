<style>
    .shift-page {
        --shift-line: #dde6df;
        --shift-line-soft: #ebf2ed;
        --shift-text: #0f172a;
        --shift-muted: #667085;
        --shift-row-text: #475467;
        --shift-panel: #ffffff;
        --shift-panel-soft: #f7fbf8;
        --shift-panel-tint: #f2f8f4;
        --shift-head-bg: #f6faf7;
        --shift-primary: #16833f;
        --shift-primary-deep: #116632;
        --shift-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .shift-page .shift-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .shift-page .shift-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        /* border: 1px solid var(--shift-line); */

    }

    .shift-page .shift-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .shift-page .shift-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--shift-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .shift-page .shift-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--shift-text);
        letter-spacing: -0.12px;
    }

    .shift-page .shift-page-subtitle {
        margin: 0;
        font-size: 11px;
        font-weight: 500;
        color: var(--shift-muted);
    }

    .shift-page .shift-topbar-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .shift-page .btn {
        border-radius: 4px;
        /* more rounded like image */
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
    }

    /* Green primary button (like image) */
    .shift-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--shift-primary) !important;
        border-color: #c0edd1 !important;
    }

    .shift-page .btn-primary:hover {
        background: #e9f6ee !important;
        color: var(--shift-primary) !important;
        border-color: #c0edd1 !important;

    }

    .shift-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--shift-primary) !important;
        border-color: var(--shift-primary);
    }


    /* Optional: softer secondary button */
    .shift-page .btn-soft {
        border: 1px solid #bbf7d0;
        color: #065f46;
        background: #ecfdf5;
    }



    .shift-page .shift-card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--shift-line-soft);
        /* background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%); */
    }

    .shift-page .shift-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .shift-page .shift-card-title-wrap {
        min-width: 0;
    }

    .shift-page .shift-card-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        margin-left: auto;
    }

    .shift-page .shift-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--shift-line-soft);
        background: #fbfdfb;
    }

    .shift-page .shift-active-filters.is-visible {
        display: flex;
    }

    .shift-page .shift-active-filters-spacer {
        flex: 1 1 auto;
    }

    .shift-page .shift-filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 22px;
        max-width: 100%;
        padding: 0 8px;
        border: 1px solid #d7e6dc;
        border-radius: 999px;
        background: #f2f8f4;
        color: #264532;
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
    }

    .shift-page .shift-filter-pill-label {
        color: #16833f;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .shift-page .shift-filter-pill-value {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .shift-page .shift-filter-pill-remove {
        width: 14px;
        height: 14px;
        border: 0;
        background: transparent;
        color: #667085;
        padding: 0;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .shift-page .shift-filter-summary {
        color: var(--shift-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .shift-page .shift-table-card {
        position: relative;
        border: 1px solid var(--shift-line);
        border-radius: 4px;
        overflow: visible;

    }

    .shift-page .shift-table-card-header {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 8px;
        padding: 0;
        border-bottom: 0;
        background: transparent;
    }

    .shift-page .shift-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--shift-text);
        letter-spacing: -0.05px;
    }

    .shift-page .shift-filter-trigger.is-active {
        border-color: #b9ddc6;
        background: #eff8f2;
        color: var(--shift-primary-deep);
    }

    .shift-page .table-responsive {
        margin: 0;
    }


    .shift-page .shift-table thead th {
        background: var(--shift-head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--shift-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .shift-page .shift-table tbody td {
        font-size: 12px;
        font-weight: normal !important;
        color: #475467 !important;
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .shift-page .shift-table tbody tr:last-child td {
        border-bottom: 0;
    }

    .shift-page .shift-table tbody tr {
        transition: background-color 0.18s ease, box-shadow 0.18s ease;
    }

    .shift-page .shift-table tbody tr:hover {
        background: #fbfdff;
    }

    .shift-page .shift-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: normal !important;
        font-variant-numeric: tabular-nums;
    }

    .shift-page .shift-name-cell {
        color: var(--shift-text) !important;
        font-weight: normal !important;
        padding-right: 10px !important;
    }

    .shift-page .shift-name-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
    }

    .shift-page .shift-name-avatar {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #ecf7f0;
        color: var(--shift-primary);
        font-size: 7.5px;
        font-weight: normal;
        text-transform: uppercase;
    }

    .shift-page .shift-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--shift-text);
        text-decoration: none;
    }

    .shift-page a.shift-name-text:hover {
        color: var(--shift-primary);
        text-decoration: underline;
    }

    .shift-page .shift-date-chip,
    .shift-page .shift-time-chip,
    .shift-page .shift-stamp-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        max-width: 100%;
        min-height: 18px;
        padding: 0 5px;
        border-radius: 5px;
        border: none;
        color: #475467;
        font-size: 12px !important;
        font-weight: normal;
        font-variant-numeric: tabular-nums;
    }

    .shift-page .shift-date-chip i,
    .shift-page .shift-time-chip i,
    .shift-page .shift-stamp-chip i {
        color: #98a2b3;
        font-size: 10px;
        flex: 0 0 auto;
    }

    .shift-page .shift-stamp-chip {
        background: transparent;
        border-color: transparent;
        padding-left: 0;
        padding-right: 0;
    }

    .shift-page .shift-status-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 60px;
        min-height: 20px;
        padding: 0 7px;
        border-radius: 999px;
        border: 1px solid #d7e6dc;
        background: #f7fbf8;
        color: #456052;
        font-size: 10px;
        font-weight: normal;
        letter-spacing: 0.1px;
        text-transform: uppercase;
    }

    .shift-page .shift-status-badge.status-active {
        background: #eaf7ef;
        border-color: #b9ddc6;
        color: #16833f;
    }

    .shift-page .shift-status-badge.status-inactive {
        background: #f7f8f7;
        border-color: #e5e7eb;
        color: #667085;
    }

    .shift-page .shift-action-cell {
        width: 72px;
    }

    .shift-page .shift-action-stack {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    .shift-page .shift-action-btn {
        width: 18px;
        height: 18px;
        border: none;

        background: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        padding: 0;
        transition: all 0.18s ease;
    }



    .shift-page .js-edit-shift {
        color: var(--shift-primary);
    }

    .shift-page .js-edit-shift:hover {
        color: var(--shift-primary-deep);
        border-color: #b9ddc6;
        background: #eff8f2;
    }

    .shift-page .js-delete-shift {
        color: #dc2626;
    }

    .shift-page .js-delete-shift:hover {
        color: #b91c1c;
        border-color: #fecaca;
        background: #fef2f2;
    }

    .shift-page .shift-pagination-wrap {
        margin-top: 2px;
    }

    .shift-page .shift-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 290px;
        border: 1px solid var(--shift-line);
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .shift-page .shift-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .shift-page .shift-filter-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--shift-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .shift-page .shift-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--shift-text);
    }

    .shift-page .shift-filter-panel-close {
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #667085;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: none !important;
    }

    .shift-page .shift-filter-panel-close:hover {
        background: #f3f4f6;
        color: #344054;
    }

    .shift-page .shift-filter-panel-body {
        padding: 0;
        background: #fbfdfb;
    }

    .shift-page .shift-filter-form {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .shift-page .shift-filter-section {
        /* border: 1px solid var(--shift-line); */
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .shift-page .shift-filter-section-title {
        margin: 0 0 8px;
        font-size: 10px;
        font-weight: 700;
        color: var(--shift-primary);
        text-transform: uppercase;
        letter-spacing: 0.28px;
    }

    .shift-page .shift-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .shift-page .shift-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .shift-page .shift-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .shift-page .shift-filter-panel .form-control,
    .shift-page .shift-filter-panel .form-select {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fff;
        color: var(--shift-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-sizing: border-box;
        box-shadow: none;
    }

    .shift-page .shift-filter-panel .form-control:focus,
    .shift-page .shift-filter-panel .form-select:focus {
        border-color: #6ab487;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    .shift-page .shift-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--shift-line-soft);
        background: #ffffff;
    }

    .shift-page .shift-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    @media (max-width: 991.98px) {
        .shift-page .shift-page-topbar {
            align-items: flex-start;
            flex-direction: column;
        }

        .shift-page .shift-topbar-meta {
            width: 100%;
            justify-content: space-between;
        }
    }

    @media (max-width: 767.98px) {

        .shift-page .shift-page-topbar,
        .shift-page .shift-card-toolbar,
        .shift-page .shift-active-filters {
            padding-left: 10px;
            padding-right: 10px;
        }

        .shift-page .shift-title-wrap {
            width: 100%;
        }

        .shift-page .shift-topbar-meta {
            justify-content: flex-start;
        }

        .shift-page .shift-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .shift-page .shift-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid shift-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="shift-page-shell">
                <div class="shift-page-topbar">
                    <div class="shift-title-wrap">
                        <div class="shift-title-icon">
                            <i class="ti ti-clock-hour-4"></i>
                        </div>
                        <div>
                            <h1 class="shift-page-title">Shift List</h1>
                        </div>
                    </div>

                    <div class="shift-topbar-meta">
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                            data-bs-target="#addShiftModal">
                            <i class="ti ti-plus me-1"></i> Add Shift
                        </button>
                    </div>
                </div>

                <div class="shift-table-card">
                    <div class="shift-table-card-header">
                        <div class="shift-card-toolbar">
                            <div class="shift-card-heading">
                                <div class="shift-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div class="shift-card-title-wrap">
                                    <h2 class="shift-table-heading">All Shift Records</h2>
                                </div>
                            </div>

                            <div class="shift-card-actions">
                                <button class="btn btn-outline-secondary shift-filter-trigger" type="button"
                                    id="openShiftFiltersBtn" aria-expanded="false" aria-controls="shiftFiltersDrawer">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadShiftData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="shift-active-filters" id="shiftActiveFilters"></div>
                    </div>

                    <div class="shift-filter-panel" id="shiftFiltersDrawer" aria-hidden="true">
                        <div class="shift-filter-panel-header">
                            <div class="shift-filter-panel-title">Filter Shifts</div>
                            <button type="button" class="shift-filter-panel-close" id="closeShiftFiltersBtn"
                                aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="shift-filter-panel-body">
                            <form class="shift-filter-form" id="shiftFiltersForm">
                                <div class="shift-filter-section">
                                    <!-- <p class="shift-filter-section-title">Basic</p> -->
                                    <div class="shift-filter-grid">
                                        <div class="shift-filter-field">
                                            <label class="shift-filter-label" for="shiftSearch">Shift Name</label>
                                            <input type="text" id="shiftSearch" class="form-control"
                                                placeholder="Shift Name">
                                        </div>
                                        <div class="shift-filter-field">
                                            <label class="shift-filter-label" for="shiftFilterStatus">Status</label>
                                            <select id="shiftFilterStatus" class="form-select">
                                                <option value="">All Statuses</option>
                                                <option value="ACTIVE">ACTIVE</option>
                                                <option value="INACTIVE">INACTIVE</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div class="shift-filter-section">
                                    <!-- <p class="shift-filter-section-title">Date Range</p> -->
                                    <div class="shift-filter-grid">
                                        <div class="shift-filter-field">
                                            <label class="shift-filter-label" for="shiftFilterStartDate">Start
                                                Date</label>
                                            <input type="date" id="shiftFilterStartDate" class="form-control">
                                        </div>
                                        <div class="shift-filter-field">
                                            <label class="shift-filter-label" for="shiftFilterEndDate">End Date</label>
                                            <input type="date" id="shiftFilterEndDate" class="form-control">
                                        </div>
                                    </div>
                                </div>

                                <div class="shift-filter-section">
                                    <!-- <p class="shift-filter-section-title">Time Range</p> -->
                                    <div class="shift-filter-grid">
                                        <div class="shift-filter-field">
                                            <label class="shift-filter-label" for="shiftFilterCheckIn">Check In</label>
                                            <input type="time" id="shiftFilterCheckIn" class="form-control">
                                        </div>
                                        <div class="shift-filter-field">
                                            <label class="shift-filter-label" for="shiftFilterCheckOut">Check
                                                Out</label>
                                            <input type="time" id="shiftFilterCheckOut" class="form-control">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="shift-filter-panel-footer">
                            <button type="button" class="btn btn-link" id="cancelShiftFiltersBtn">Cancel</button>
                            <div class="shift-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft" id="resetShiftFiltersBtn">Reset</button>
                                <button type="submit" form="shiftFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table shift-table align-middle" id="shifts-table">
                            <colgroup>
                                <col class="shift-col-no">
                                <col class="shift-col-name">
                                <col class="shift-col-date">
                                <col class="shift-col-date">
                                <col class="shift-col-status">
                                <col class="shift-col-time">
                                <col class="shift-col-time">
                                <col class="shift-col-name">
                                <col class="shift-col-name">
                                <col class="shift-col-stamp">
                                <col class="shift-col-action">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Shift Name</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Status</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Weekday Overtime Cap</th>
                                    <th>Weekend Overtime Cap</th>
                                    <th>Created At</th>
                                    <th class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="shift-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php $this->load->view('pages/shifts/form'); ?>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>