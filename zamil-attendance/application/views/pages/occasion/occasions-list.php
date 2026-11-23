<style>
    :root {
        --shift-primary: #16833f;
        --shift-primary-deep: #11632f;
        --shift-text: #101828;
        --shift-muted: #667085;
        --shift-line: #d7e6dc;
        --shift-line-soft: #e8f0eb;
        --shift-bg: #f6fbf8;
    }

    .shift-page {
        background: #ffffff;
    }

    .shift-page .shift-page-shell {
        background: #ffffff;
        border-radius: 8px;
        padding: 8px;
    }

    .shift-page .shift-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
    }

    .shift-page .shift-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .shift-page .shift-title-icon {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #edf7f0;
        color: var(--shift-primary);
        flex: 0 0 auto;
    }

    .shift-page .shift-page-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.2;
        color: var(--shift-text);
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

    .shift-page .shift-table-heading {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--shift-text);
        line-height: 1.2;
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

    .shift-page .shift-filter-trigger {
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }

    .shift-page .table {
        margin-bottom: 0;
    }

    .shift-page .table thead th {
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
        color: #344054;
        vertical-align: middle;
    }

    .shift-page .table tbody td {
        vertical-align: middle;
        font-size: 12px;
        color: #101828;
        white-space: nowrap;
    }

    .shift-page .shift-name-chip,
    .shift-page .shift-date-chip,
    .shift-page .shift-time-chip,
    .shift-page .shift-stamp-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
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

    .shift-page .js-edit-occasion {
        color: var(--shift-primary);
    }

    .shift-page .js-edit-occasion:hover {
        color: var(--shift-primary-deep);
        border-color: #b9ddc6;
        background: #eff8f2;
    }

    .shift-page .js-delete-occasion {
        color: #dc2626;
    }

    .shift-page .js-delete-occasion:hover {
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
        display: none;
    }

    .shift-page .shift-filter-panel.show {
        display: block;
    }

    .shift-page .shift-filter-panel-header {
        padding: 10px 12px;
        border-bottom: 1px solid var(--shift-line-soft);
    }

    .shift-page .shift-filter-panel-body {
        padding: 10px 12px;
    }

    .shift-page .shift-filter-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .shift-page .shift-filter-field label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #344054;
        margin-bottom: 4px;
    }

    .shift-page .shift-filter-panel .form-control,
    .shift-page .shift-filter-panel .form-select {
        height: 34px;
        font-size: 12px;
        border-radius: 8px;
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
</style>

<div class="container-fluid shift-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="shift-page-shell">
                <div class="shift-page-topbar">
                    <div class="shift-title-wrap">
                        <div class="shift-title-icon">
                            <i class="ti ti-gift"></i>
                        </div>
                        <div>
                            <h1 class="shift-page-title">Occasion List</h1>
                        </div>
                    </div>

                    <div class="shift-topbar-meta">
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                            data-bs-target="#addOccasionModal">
                            <i class="ti ti-plus me-1"></i> Add Occasion
                        </button>
                    </div>
                </div>

                <div class="shift-table-card mt-1">
                    <div class="shift-table-card-header">
                        <div class="shift-card-toolbar">
                            <div class="shift-card-heading">
                                <div class="shift-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div class="shift-card-title-wrap">
                                    <h2 class="shift-table-heading">All Occasion Records</h2>
                                </div>
                            </div>

                            <div class="shift-card-actions">


                                <button class="btn btn-outline-secondary shift-filter-trigger" type="button"
                                    id="toggleOccasionFiltersBtn" aria-expanded="false" aria-controls="shiftFiltersDrawer">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>

                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadOccasionData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="shift-active-filters" id="occasionActiveFilters"></div>
                    </div>

                    <div class="shift-filter-panel" id="occasionFilterPanel">
                        <div class="shift-filter-panel-header py-2 px-3">
                            <strong class="small">Filter Occasion List</strong>
                        </div>

                        <div class="shift-filter-panel-body p-2">
                            <form id="occasionFiltersForm">
                                <div class="row g-2">

                                    <div class="col-md-6">
                                        <label for="occasionFilterName" class="form-label shift-filter-label">Occasion Name</label>
                                        <input type="text" id="occasionFilterName" class="form-control form-control-sm"
                                            placeholder="Enter occasion name">
                                    </div>

                                    <div class="col-md-6">
                                        <label for="occasionFilterType" class="form-label shift-filter-label">Occasion Type</label>
                                        <input type="text" id="occasionFilterType" class="form-control form-control-sm"
                                            placeholder="Enter occasion type">
                                    </div>

                                    <div class="col-md-6">
                                        <label for="occasionFilterFromDate" class="form-label shift-filter-label">From Date</label>
                                        <input type="date" id="occasionFilterFromDate" class="form-control form-control-sm">
                                    </div>

                                    <div class="col-md-6">
                                        <label for="occasionFilterToDate" class="form-label shift-filter-label">To Date</label>
                                        <input type="date" id="occasionFilterToDate" class="form-control form-control-sm">
                                    </div>

                                    <div class="col-md-6">
                                        <label for="occasionFilterCountAsPresent" class="form-label shift-filter-label">Count As Present</label>
                                        <select id="occasionFilterCountAsPresent" class="form-select form-select-sm">
                                            <option value="">Select</option>
                                            <option value="Y">Yes</option>
                                            <option value="N">No</option>
                                        </select>
                                    </div>

                                    <div class="col-md-6">
                                        <label for="occasionFilterPaidHoliday" class="form-label shift-filter-label">Paid Holiday</label>
                                        <select id="occasionFilterPaidHoliday" class="form-select form-select-sm">
                                            <option value="">Select</option>
                                            <option value="Y">Yes</option>
                                            <option value="N">No</option>
                                        </select>
                                    </div>

                                    <div class="col-12">
                                        <label for="occasionFilterActive" class="form-label shift-filter-label">Is Active</label>
                                        <select id="occasionFilterActive" class="form-select form-select-sm">
                                            <option value="">Select</option>
                                            <option value="Y">Yes</option>
                                            <option value="N">No</option>
                                        </select>
                                    </div>

                                </div>
                            </form>
                        </div>

                        <div class="shift-filter-panel-footer py-2 px-3">
                            <button type="button" class="btn btn-light btn-sm" id="cancelOccasionFiltersBtn">Cancel</button>
                            <div class="shift-filter-panel-footer-actions">
                                <button type="button" class="btn btn-outline-secondary btn-sm" id="resetOccasionFiltersBtn">Reset</button>
                                <button type="submit" form="occasionFiltersForm" class="btn btn-primary btn-sm">Apply</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table  align-middle mb-0" id="occasionListTable">
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Occasion Name</th>
                                    <th>From Date</th>
                                    <th>To Date</th>
                                    <th>Shift</th>
                                    <th>Occasion Type</th>
                                    <th>Count As Present</th>
                                    <th>Paid Holiday</th>
                                    <th>Is Active</th>
                                    <th>Created At</th>
                                    <th class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td colspan="11" class="text-center text-muted py-4">Loading occasion data...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="shift-pagination-wrap">
                        <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<?php $this->load->view('pages/occasion/form'); ?>