<style>
    .attendance-card-page {
        --attendance-line: #dde6df;
        --attendance-line-soft: #ebf2ed;
        --attendance-text: #0f172a;
        --attendance-muted: #667085;
        --attendance-row-text: #475467;
        --attendance-panel: #ffffff;
        --attendance-head-bg: #f6faf7;
        --attendance-primary: #16833f;
        --attendance-primary-deep: #116632;
        --attendance-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .attendance-card-page .attendance-card-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .attendance-card-page .attendance-card-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 4px;

    }

    .attendance-card-page .attendance-card-title-wrap,
    .attendance-card-page .attendance-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .attendance-card-page .attendance-card-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--attendance-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .attendance-card-page .attendance-card-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--attendance-text);
        letter-spacing: -0.12px;
    }

    .attendance-card-page .attendance-card-actions,
    .attendance-card-page .attendance-card-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        margin-left: auto;
    }

    .attendance-card-page .btn {
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 12px;
        box-shadow: none !important;
    }

    .attendance-card-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--attendance-primary) !important;
        border-color: #c0edd1 !important;
    }

    .attendance-card-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--attendance-primary) !important;
        border-color: var(--attendance-primary);
    }

    .attendance-card-page .btn-outline-secondary:active,
    .attendance-card-page .btn-outline-secondary:focus,
    {
    background: #ffffff !important;
    color: var(--attendance-primary) !important;
    border-color: var(--attendance-primary);
    }

    .attendance-card-page .btn-link {
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--attendance-primary);
        font-size: 10.5px;
        font-weight: 700;
        text-decoration: none;
    }

    .attendance-card-page .btn-soft {
        border: 1px solid #d7e6dc;
        color: #344054;
        background: #f7fbf8;
    }

    .attendance-card-page .attendance-card-table-card {
        position: relative;
        border: 1px solid var(--attendance-line);
        border-radius: 4px;
        overflow: visible;

    }

    .attendance-card-page .attendance-card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--attendance-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .attendance-card-page .attendance-card-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--attendance-text);
        letter-spacing: -0.05px;
    }

    .attendance-card-page .attendance-card-filter-trigger.is-active {
        background: #ffffff !important;
        color: var(--attendance-primary) !important;
        border-color: var(--attendance-primary);
        v
    }

    .attendance-card-page .attendance-card-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--attendance-line-soft);
        background: #fbfdfb;
    }

    .attendance-card-page .attendance-card-active-filters.is-visible {
        display: flex;
    }

    .attendance-card-page .attendance-card-active-filters-spacer {
        flex: 1 1 auto;
    }

    .attendance-card-page .attendance-card-filter-summary {
        color: var(--attendance-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .attendance-card-page .attendance-card-filter-pill {
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

    .attendance-card-page .attendance-card-filter-pill-label {
        color: var(--attendance-primary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .attendance-card-page .attendance-card-filter-pill-remove {
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

    .attendance-card-page .attendance-card-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 360px;
        border: 1px solid var(--attendance-line);
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .attendance-card-page .attendance-card-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .attendance-card-page .attendance-card-filter-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--attendance-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .attendance-card-page .attendance-card-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--attendance-text);
    }

    .attendance-card-page .attendance-card-filter-panel-close {
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

    .attendance-card-page .attendance-card-filter-panel-body {
        padding: 0;
        background: #fbfdfb;
    }

    .attendance-card-page .attendance-card-filter-form {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .attendance-card-page .attendance-card-filter-section {
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .attendance-card-page .attendance-card-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .attendance-card-page .attendance-card-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .attendance-card-page .attendance-card-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .attendance-card-page .attendance-card-filter-panel .form-control {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fff;
        color: var(--attendance-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-sizing: border-box;
        box-shadow: none;
    }

    .attendance-card-page .attendance-card-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--attendance-line-soft);
        background: #fff;
    }

    .attendance-card-page .attendance-card-table {
        margin: 0;
        --bs-table-bg: transparent;
        table-layout: fixed;
    }

    .attendance-card-page .attendance-card-table col.attendance-card-col-no {
        width: 52px;
    }

    .attendance-card-page .attendance-card-table col.attendance-card-col-emp-no {
        width: 130px;
    }

    .attendance-card-page .attendance-card-table col.attendance-card-col-name {
        width: 220px;
    }

    .attendance-card-page .attendance-card-table col.attendance-card-col-date {
        width: 130px;
    }

    .attendance-card-page .attendance-card-table col.attendance-card-col-time {
        width: 110px;
    }

    .attendance-card-page .attendance-card-table thead th {
        background: var(--attendance-head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--attendance-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .attendance-card-page .attendance-card-table tbody td {
        font-size: 12px;
        font-weight: normal !important;
        color: var(--attendance-row-text) !important;
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .attendance-card-page .attendance-card-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: normal !important;
        font-variant-numeric: tabular-nums;
    }

    .attendance-card-page .attendance-card-primary-cell {
        color: var(--attendance-text) !important;
    }

    .attendance-card-page .attendance-card-name-text {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    .attendance-card-page .attendance-card-chip,
    .attendance-card-page .attendance-card-date-chip {
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
    }

    .attendance-card-page .attendance-card-pagination-wrap {
        margin-top: 2px;
    }

    @media (max-width: 767.98px) {
        .attendance-card-page .attendance-card-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .attendance-card-page .attendance-card-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid attendance-card-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="attendance-card-page-shell">
                <div class="attendance-card-page-topbar">
                    <div class="attendance-card-title-wrap">
                        <div class="attendance-card-title-icon">
                            <i class="ti ti-id"></i>
                        </div>
                        <div>
                            <h1 class="attendance-card-page-title">Attendance Card</h1>
                        </div>
                    </div>
                    <div>

                        <button type="button" class="btn btn-primary" onclick="openAttendanceGenerator(this)">
                            <i class="ti ti-plus me-1"></i> Generate Attendance
                        </button>
                    </div>
                </div>

                <div class="attendance-card-table-card">
                    <div class="attendance-card-table-card-header">
                        <div class="attendance-card-toolbar">
                            <div class="attendance-card-heading">
                                <div class="attendance-card-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div>
                                    <h2 class="attendance-card-table-heading">All Attendance Card Records</h2>
                                </div>
                            </div>

                            <div class="attendance-card-actions">
                                <button class="btn btn-outline-secondary attendance-card-filter-trigger" type="button"
                                    id="openAttendanceCardFiltersBtn" aria-expanded="false"
                                    aria-controls="attendanceCardFiltersPanel">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadAttendanceCardData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="attendance-card-active-filters" id="attendanceCardActiveFilters"></div>
                    </div>

                    <div class="attendance-card-filter-panel" id="attendanceCardFiltersPanel" aria-hidden="true">
                        <div class="attendance-card-filter-panel-header">
                            <div class="attendance-card-filter-panel-title">Filter Attendance Cards</div>
                            <button type="button" class="attendance-card-filter-panel-close"
                                id="closeAttendanceCardFiltersBtn" aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="attendance-card-filter-panel-body">
                            <form class="attendance-card-filter-form" id="attendanceCardFiltersForm">
                                <div class="attendance-card-filter-section">
                                    <div class="attendance-card-filter-grid">
                                        <div class="attendance-card-filter-field">
                                            <label class="attendance-card-filter-label"
                                                for="attendanceCardFilterEmpNo">Employee Number</label>
                                            <input type="text" class="form-control" id="attendanceCardFilterEmpNo"
                                                placeholder="Employee Number">
                                        </div>
                                        <div class="attendance-card-filter-field">
                                            <label class="attendance-card-filter-label"
                                                for="attendanceCardSearch">Employee Name</label>
                                            <input type="text" class="form-control" id="attendanceCardSearch"
                                                placeholder="Employee Name">
                                        </div>
                                    </div>
                                </div>

                                <div class="attendance-card-filter-section">
                                    <div class="attendance-card-filter-grid">
                                        <div class="attendance-card-filter-field">
                                            <label class="attendance-card-filter-label"
                                                for="attendanceCardFilterAttDate">Attendance Date</label>
                                            <input type="date" class="form-control" id="attendanceCardFilterAttDate">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="attendance-card-filter-panel-footer">
                            <button type="button" class="btn btn-link"
                                id="cancelAttendanceCardFiltersBtn">Cancel</button>
                            <div class="attendance-card-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft"
                                    id="resetAttendanceCardFiltersBtn">Reset</button>
                                <button type="submit" form="attendanceCardFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table attendance-card-table align-middle" id="attendance-card-table">
                            <colgroup>
                                <col class="attendance-card-col-no">
                                <col class="attendance-card-col-emp-no">
                                <col class="attendance-card-col-name">
                                <col class="attendance-card-col-date">
                                <col class="attendance-card-col-time">
                                <col class="attendance-card-col-time">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Employee Number</th>
                                    <th>Employee Name</th>
                                    <th>Attendance Date</th>
                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="attendance-card-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- SHOW GENERATE ATTENDANCE MODEL  -->
<?php
$this->load->view('pages/attendance_card/mdl-generate-attendance');
?>