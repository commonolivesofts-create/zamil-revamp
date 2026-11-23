<style>
    .timesheet-page {
        --timesheet-line: #dde6df;
        --timesheet-line-soft: #ebf2ed;
        --timesheet-text: #0f172a;
        --timesheet-muted: #667085;
        --timesheet-row-text: #475467;
        --timesheet-panel: #ffffff;
        --timesheet-head-bg: #f6faf7;
        --timesheet-primary: #16833f;
        --timesheet-primary-deep: #116632;
        --timesheet-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .timesheet-danger-text {
        color: #dc3545 !important;
        font-weight: 600;
    }

    .timesheet-row-light-danger {
        background-color: #fdf0f0 !important;
    }

    .timesheet-row-light-danger td {
        background-color: #fdf0f0 !important;
    }

    .timesheet-page .timesheet-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .timesheet-page .timesheet-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 4px;

    }

    .timesheet-page .timesheet-title-wrap,
    .timesheet-page .timesheet-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .timesheet-page .timesheet-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--timesheet-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .timesheet-page .timesheet-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--timesheet-text);
        letter-spacing: -0.12px;
    }

    .timesheet-page .timesheet-actions,
    .timesheet-page .timesheet-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        margin-left: auto;
    }

    .timesheet-page .btn {
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 12px;
        box-shadow: none !important;
    }

    .timesheet-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--timesheet-primary) !important;
        border-color: #c0edd1 !important;
    }

    .timesheet-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--timesheet-primary) !important;
        border-color: var(--timesheet-primary);
    }

    .timesheet-page .btn-outline-secondary:hover {
        background: #ffffff !important;
        color: var(--timesheet-primary) !important;
        border-color: var(--timesheet-primary);
    }

    .timesheet-page .btn-link {
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--timesheet-primary);
        font-size: 10.5px;
        font-weight: 700;
        text-decoration: none;
    }

    .timesheet-page .btn-soft {
        border: 1px solid #d7e6dc;
        color: #344054;
        background: #f7fbf8;
    }

    .timesheet-page .timesheet-table-card {
        position: relative;
        border: 1px solid var(--timesheet-line);
        border-radius: 4px;
        overflow: visible;
        background: var(--timesheet-panel);
        box-shadow: var(--timesheet-shadow);
    }

    .timesheet-page .timesheet-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--timesheet-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .timesheet-page .timesheet-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--timesheet-text);
        letter-spacing: -0.05px;
    }

    .timesheet-page .timesheet-filter-trigger.is-active {
        border-color: #b9ddc6;
        background: #eff8f2;
        color: var(--timesheet-primary-deep);
    }

    .timesheet-page .timesheet-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--timesheet-line-soft);
        background: #fbfdfb;
    }

    .timesheet-page .timesheet-active-filters.is-visible {
        display: flex;
    }

    .timesheet-page .timesheet-active-filters-spacer {
        flex: 1 1 auto;
    }

    .timesheet-page .timesheet-filter-summary {
        color: var(--timesheet-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .timesheet-page .timesheet-filter-pill {
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

    .timesheet-page .timesheet-filter-pill-label {
        color: var(--timesheet-primary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .timesheet-page .timesheet-filter-pill-remove {
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

    .timesheet-page .timesheet-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 360px;
        border: 1px solid var(--timesheet-line);
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .timesheet-page .timesheet-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .timesheet-page .timesheet-filter-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--timesheet-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .timesheet-page .timesheet-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--timesheet-text);
    }

    .timesheet-page .timesheet-filter-panel-close {
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

    .timesheet-page .timesheet-filter-panel-body {
        padding: 0;
        background: #fbfdfb;
    }

    .timesheet-page .timesheet-filter-form {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .timesheet-page .timesheet-filter-section {
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .timesheet-page .timesheet-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .timesheet-page .timesheet-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .timesheet-page .timesheet-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .timesheet-page .timesheet-filter-panel .form-control,
    .timesheet-page .timesheet-filter-panel .form-select {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fff;
        color: var(--timesheet-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-sizing: border-box;
        box-shadow: none;
    }

    .timesheet-page .timesheet-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--timesheet-line-soft);
        background: #fff;
    }


    .timesheet-page .timesheet-table thead th {
        background: var(--timesheet-head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--timesheet-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .timesheet-page .timesheet-table tbody td {
        font-size: 12px;
        font-weight: 500 !important;
        color: var(--timesheet-row-text);
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        overflow: visible;
        text-overflow: ellipsis;
    }

    .timesheet-page .timesheet-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: 700 !important;
        font-variant-numeric: tabular-nums;
    }

    .timesheet-page .timesheet-primary-cell {
        color: var(--timesheet-row-text) !important;
    }

    .timesheet-page .timesheet-name-text {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: #475467;
        font-weight: normal;
    }

    .timesheet-page .timesheet-chip,
    .timesheet-page .timesheet-date-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-height: 18px;
        color: #475467;
        font-size: 12px !important;
        font-weight: normal;
    }

    .timesheet-page .timesheet-pagination-wrap {
        margin-top: 2px;
    }

    @media (max-width: 767.98px) {
        .timesheet-page .timesheet-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .timesheet-page .timesheet-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid timesheet-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="timesheet-page-shell">
                <div class="timesheet-page-topbar">
                    <div class="timesheet-title-wrap">
                        <div class="timesheet-title-icon">
                            <i class="ti ti-file-time"></i>
                        </div>
                        <div>
                            <h1 class="timesheet-page-title">Timesheet</h1>
                        </div>
                    </div>
                </div>

                <div class="timesheet-table-card">
                    <div class="timesheet-table-card-header">
                        <div class="timesheet-toolbar">
                            <div class="timesheet-heading">
                                <div class="timesheet-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div>
                                    <h2 class="timesheet-table-heading">All Timesheet Records</h2>
                                </div>
                            </div>

                            <div class="timesheet-actions">
                                <button class="btn btn-outline-secondary timesheet-filter-trigger" type="button"
                                    id="openTimesheetFiltersBtn" aria-expanded="false"
                                    aria-controls="timesheetFiltersPanel">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadTimesheetData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="timesheet-active-filters" id="timesheetActiveFilters"></div>
                    </div>

                    <div class="timesheet-filter-panel" id="timesheetFiltersPanel" aria-hidden="true">
                        <div class="timesheet-filter-panel-header">
                            <div class="timesheet-filter-panel-title">Filter Timesheets</div>
                            <button type="button" class="timesheet-filter-panel-close" id="closeTimesheetFiltersBtn"
                                aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="timesheet-filter-panel-body">
                            <form class="timesheet-filter-form" id="timesheetFiltersForm">
                                <div class="timesheet-filter-section">
                                    <div class="timesheet-filter-grid">
                                        <div class="timesheet-filter-field">
                                            <label class="timesheet-filter-label" for="timesheetFilterEmpNo">Employee
                                                Number</label>
                                            <input type="text" class="form-control" id="timesheetFilterEmpNo"
                                                placeholder="Employee Number">
                                        </div>
                                        <div class="timesheet-filter-field">
                                            <label class="timesheet-filter-label" for="timesheetSearch">Employee
                                                Name</label>
                                            <input type="text" class="form-control" id="timesheetSearch"
                                                placeholder="Employee Name">
                                        </div>
                                        <div class="timesheet-filter-field">
                                            <label class="timesheet-filter-label"
                                                for="timesheetFilterShift">Shift</label>
                                            <select class="form-select" id="timesheetFilterShift">
                                                <option value="">All Shifts</option>
                                                <?php foreach ((isset($shiftOptions) && is_array($shiftOptions) ? $shiftOptions : []) as $shift): ?>
                                                    <?php $shiftName = isset($shift['SHIFT_NAME']) ? (string) $shift['SHIFT_NAME'] : ''; ?>
                                                    <?php if ($shiftName === '') {
                                                        continue;
                                                    } ?>
                                                    <option value="<?php echo html_escape($shiftName); ?>">
                                                        <?php echo html_escape($shiftName); ?>
                                                    </option>
                                                <?php endforeach; ?>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div class="timesheet-filter-section">
                                    <div class="timesheet-filter-grid">
                                        <div class="timesheet-filter-field">
                                            <label class="timesheet-filter-label"
                                                for="timesheetFilterAttDateStart">Attendance Date Start</label>
                                            <input type="date" class="form-control" id="timesheetFilterAttDateStart">
                                        </div>
                                        <div class="timesheet-filter-field">
                                            <label class="timesheet-filter-label"
                                                for="timesheetFilterAttDateEnd">Attendance Date End</label>
                                            <input type="date" class="form-control" id="timesheetFilterAttDateEnd">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="timesheet-filter-panel-footer">
                            <button type="button" class="btn btn-link" id="cancelTimesheetFiltersBtn">Cancel</button>
                            <div class="timesheet-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft" id="resetTimesheetFiltersBtn">Reset</button>
                                <button type="submit" form="timesheetFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table timesheet-table align-middle" id="timesheet-table">

                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Emp #</th>
                                    <th>Employee Name</th>
                                    <th>Shift</th>
                                    <th>Attendance Date</th>
                                    <th>Attendance Day</th>
                                    <th>Check In</th>
                                    <th>Punch In</th>
                                    <th>Check Out</th>
                                    <th>Punch Out</th>
                                    <th>Total Minutes</th>
                                    <th>Early</th>
                                    <th>Late</th>
                                    <th>Overtime</th>
                                    <th>Absence</th>
                                    <th>Delay</th>
                                    <th>Total Overtime</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="timesheet-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>