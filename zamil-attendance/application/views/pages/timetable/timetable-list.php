<style>
    .timetable-page {
        --timetable-line: #dde6df;
        --timetable-line-soft: #ebf2ed;
        --timetable-text: #0f172a;
        --timetable-muted: #667085;
        --timetable-row-text: #475467;
        --timetable-panel: #ffffff;
        --timetable-head-bg: #f6faf7;
        --timetable-primary: #16833f;
        --timetable-primary-deep: #116632;
        --timetable-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .timetable-page .timetable-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .timetable-page .timetable-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 4px;
    }

    .timetable-page .timetable-title-wrap,
    .timetable-page .timetable-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .timetable-page .timetable-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--timetable-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .timetable-page .timetable-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--timetable-text);
        letter-spacing: -0.12px;
    }

    .timetable-page .timetable-topbar-meta,
    .timetable-page .timetable-card-actions,
    .timetable-page .timetable-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
    }

    .timetable-page .timetable-topbar-meta,
    .timetable-page .timetable-card-actions {
        margin-left: auto;
    }

    .timetable-page .btn {
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 12px;
        box-shadow: none !important;
    }

    .timetable-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--timetable-primary) !important;
        border-color: #c0edd1 !important;
    }

    .timetable-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--timetable-primary) !important;
        border-color: var(--timetable-primary);
    }

    /* .timetable-page .btn-outline-secondary:hover {
        background: #f5faf7;
        border-color: #c7d8cd;
        color: #344054;
    } */

    .timetable-page .btn-link {
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--timetable-primary);
        font-size: 10.5px;
        font-weight: 700;
        text-decoration: none;
    }

    .timetable-page .btn-soft {
        border: 1px solid #d7e6dc;
        color: #344054;
        background: #f7fbf8;
    }

    .timetable-page .timetable-table-card {
        position: relative;
        border: 1px solid var(--timetable-line);
        border-radius: 4px;
        overflow: visible;

    }

    .timetable-page .timetable-card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--timetable-line-soft);

    }

    .timetable-page .timetable-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--timetable-text);
        letter-spacing: -0.05px;
    }

    .timetable-page .timetable-filter-trigger.is-active {
        border-color: #b9ddc6;
        background: #eff8f2;
        color: var(--timetable-primary-deep);
    }

    .timetable-page .timetable-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--timetable-line-soft);
        background: #fbfdfb;
    }

    .timetable-page .timetable-active-filters.is-visible {
        display: flex;
    }

    .timetable-page .timetable-active-filters-spacer {
        flex: 1 1 auto;
    }

    .timetable-page .timetable-filter-summary {
        color: var(--timetable-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .timetable-page .timetable-filter-pill {
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

    .timetable-page .timetable-filter-pill-label {
        color: var(--timetable-primary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .timetable-page .timetable-filter-pill-remove {
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

    .timetable-page .timetable-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 330px;
        border: 1px solid var(--timetable-line);
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .timetable-page .timetable-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .timetable-page .timetable-filter-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--timetable-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .timetable-page .timetable-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--timetable-text);
    }

    .timetable-page .timetable-filter-panel-close {
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #667085;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .timetable-page .timetable-filter-panel-body {
        padding: 12px;
        background: #fbfdfb;
    }

    .timetable-page .timetable-filter-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .timetable-page .timetable-filter-section {
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .timetable-page .timetable-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .timetable-page .timetable-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .timetable-page .timetable-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .timetable-page .timetable-filter-panel .form-control,
    .timetable-page .timetable-filter-panel .form-select {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fff;
        color: var(--timetable-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-sizing: border-box;
        box-shadow: none;
    }

    .timetable-page .timetable-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--timetable-line-soft);
        background: #fff;
    }



    .timetable-page .timetable-table thead th {
        background: var(--timetable-head-bg);
        color: #475467;
        font-size: 8.75px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--timetable-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .timetable-page .timetable-table tbody td {
        font-size: 12px;
        font-weight: normal !important;
        color: var(--timetable-row-text) !important;
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .timetable-page .timetable-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: normal !important;
        font-variant-numeric: tabular-nums;
    }

    .timetable-page .timetable-primary-cell {
        color: var(--timetable-text) !important;
    }

    .timetable-page .timetable-person-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
    }

    .timetable-page .timetable-name-avatar {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #ecf7f0;
        color: var(--timetable-primary);
        font-size: 7.5px;
        font-weight: normal;
        text-transform: uppercase;
    }

    .timetable-page .timetable-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    .timetable-page .timetable-chip,
    .timetable-page .timetable-stamp-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-height: 18px;
        padding: 0 5px;
        /* border-radius: 5px; */
        border: none;
        background: #fbfdfb;
        color: #475467;
        font-size: 12px !important;
        font-weight: normal;
        font-variant-numeric: tabular-nums;
    }

    .timetable-page .timetable-stamp-chip {
        background: transparent;
        border-color: transparent;
        padding-left: 0;
        padding-right: 0;
    }

    .timetable-page .timetable-status-badge {
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

    .timetable-page .timetable-status-badge.status-active {
        background: #eaf7ef;
        border-color: #b9ddc6;
        color: var(--timetable-primary);
    }

    .timetable-page .timetable-status-badge.status-inactive {
        background: #f7f8f7;
        border-color: #e5e7eb;
        color: #667085;
    }

    .timetable-page .timetable-action-cell {
        width: 72px;
    }

    .timetable-page .timetable-action-stack {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    .timetable-page .timetable-action-btn {
        width: 18px;
        height: 18px;
        border: none;
        /* border-radius: 5px; */
        background: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        padding: 0;
        transition: all 0.18s ease;
    }

    .timetable-page .js-edit-timetable {
        color: var(--timetable-primary);
    }

    .timetable-page .js-delete-timetable {
        color: #dc2626;
    }

    .timetable-page .timetable-pagination-wrap {
        margin-top: 2px;
    }

    @media (max-width: 767.98px) {
        .timetable-page .timetable-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .timetable-page .timetable-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid timetable-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="timetable-page-shell">
                <div class="timetable-page-topbar">
                    <div class="timetable-title-wrap">
                        <div class="timetable-title-icon">
                            <i class="ti ti-calendar-time"></i>
                        </div>
                        <div>
                            <h1 class="timetable-page-title">Timetable List</h1>
                        </div>
                    </div>

                    <div class="timetable-topbar-meta">
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                            data-bs-target="#addTimetableModal">
                            <i class="ti ti-plus me-1"></i> Add Timetable
                        </button>
                    </div>
                </div>

                <div class="timetable-table-card">
                    <div class="timetable-table-card-header">
                        <div class="timetable-card-toolbar">
                            <div class="timetable-card-heading">
                                <div class="timetable-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div>
                                    <h2 class="timetable-table-heading">All Timetable Records</h2>
                                </div>
                            </div>

                            <div class="timetable-card-actions">
                                <button class="btn btn-outline-secondary timetable-filter-trigger" type="button"
                                    id="openTimetableFiltersBtn" aria-expanded="false"
                                    aria-controls="timetableFiltersPanel">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadTimetableData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="timetable-active-filters" id="timetableActiveFilters"></div>
                    </div>

                    <div class="timetable-filter-panel" id="timetableFiltersPanel" aria-hidden="true">
                        <div class="timetable-filter-panel-header">
                            <div class="timetable-filter-panel-title">Filter Timetable</div>
                            <button type="button" class="timetable-filter-panel-close" id="closeTimetableFiltersBtn"
                                aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="timetable-filter-panel-body">
                            <form class="timetable-filter-form" id="timetableFiltersForm">
                                <div class="timetable-filter-section">
                                    <div class="timetable-filter-grid">
                                        <div class="timetable-filter-field">
                                            <label class="timetable-filter-label" for="timetableFilterEmpNo">Emp
                                                No</label>
                                            <input type="text" id="timetableFilterEmpNo" class="form-control"
                                                placeholder="Emp No">
                                        </div>

                                        <div class="timetable-filter-field">
                                            <label class="timetable-filter-label" for="timetableSearch">Employee</label>
                                            <input type="text" id="timetableSearch" class="form-control"
                                                placeholder="Employee Name">
                                        </div>

                                    </div>
                                </div>

                                <div class="timetable-filter-section">
                                    <div class="timetable-filter-grid">
                                        <div class="timetable-filter-field">
                                            <label class="timetable-filter-label"
                                                for="timetableFilterShiftId">Shift</label>
                                            <select id="timetableFilterShiftId" class="form-select">
                                                <option value="">All Shifts</option>
                                                <?php foreach ((isset($shiftOptions) && is_array($shiftOptions) ? $shiftOptions : []) as $shift): ?>
                                                    <option value="<?php echo html_escape($shift['ID']); ?>">
                                                        <?php echo html_escape($shift['SHIFT_NAME']); ?>
                                                    </option>
                                                <?php endforeach; ?>
                                            </select>
                                        </div>
                                        <div class="timetable-filter-field">
                                            <label class="timetable-filter-label"
                                                for="timetableFilterStatus">Status</label>
                                            <select id="timetableFilterStatus" class="form-select">
                                                <option value="">All Statuses</option>
                                                <option value="ACTIVE">ACTIVE</option>
                                                <option value="INACTIVE">INACTIVE</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div class="timetable-filter-section">
                                    <div class="timetable-filter-grid">
                                        <div class="timetable-filter-field">
                                            <label class="timetable-filter-label" for="timetableFilterStartDate">Start
                                                Date</label>
                                            <input type="date" id="timetableFilterStartDate" class="form-control">
                                        </div>
                                        <div class="timetable-filter-field">
                                            <label class="timetable-filter-label" for="timetableFilterEndDate">End
                                                Date</label>
                                            <input type="date" id="timetableFilterEndDate" class="form-control">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="timetable-filter-panel-footer">
                            <button type="button" class="btn btn-link" id="cancelTimetableFiltersBtn">Cancel</button>
                            <div class="timetable-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft" id="resetTimetableFiltersBtn">Reset</button>
                                <button type="submit" form="timetableFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table timetable-table align-middle mb-0" id="timetable-table">
                            <colgroup>
                                <col class="timetable-col-no">
                                <col class="timetable-col-emp-no">
                                <col class="timetable-col-name">
                                <col class="timetable-col-shift">
                                <col class="timetable-col-date">
                                <col class="timetable-col-date">
                                <col class="timetable-col-status">
                                <col class="timetable-col-stamp">
                                <col class="timetable-col-action">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Emp No</th>
                                    <th>Emp Name</th>
                                    <th>Shift</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Overtime Allowed</th>
                                    <th>Exclude Timesheet</th>
                                    <th>Status</th>
                                    <th>Created At</th>
                                    <th class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="timetable-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php $this->load->view('pages/timetable/form'); ?>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>