<style>
    .payroll-file-page {
        --payroll-file-line: #dde6df;
        --payroll-file-line-soft: #ebf2ed;
        --payroll-file-text: #0f172a;
        --payroll-file-muted: #667085;
        --payroll-file-row-text: #475467;
        --payroll-file-primary: #16833f;
        --payroll-file-primary-deep: #116632;
        --payroll-file-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .payroll-file-page .payroll-file-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .payroll-file-page .payroll-file-page-topbar,
    .payroll-file-page .payroll-file-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;

    }

    .payroll-file-page .payroll-file-title-wrap,
    .payroll-file-page .payroll-file-heading,
    .payroll-file-page .payroll-file-actions,
    .payroll-file-page .payroll-file-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .payroll-file-page .payroll-file-actions,
    .payroll-file-page .payroll-file-filter-panel-footer-actions {
        margin-left: auto;
        gap: 6px;
    }

    .payroll-file-page .payroll-file-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--payroll-file-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .payroll-file-page .payroll-file-page-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: var(--payroll-file-text);
    }

    .payroll-file-page .payroll-file-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--payroll-file-text);
    }

    .payroll-file-page .btn {
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 12px;
        box-shadow: none !important;
    }

    .payroll-file-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--shift-primary) !important;
        border-color: #c0edd1 !important;
    }

    .payroll-file-page .btn-link {
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--payroll-file-primary);
        font-size: 10.5px;
        font-weight: 700;
        text-decoration: none;
    }

    .payroll-file-page .btn-soft,
    .payroll-file-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--payroll-file-primary) !important;
        border-color: var(--payroll-file-primary);
    }

    .payroll-file-page .payroll-file-table-card {
        position: relative;
        border: 1px solid var(--payroll-file-line);
        border-radius: 4px;
        overflow: visible;

    }

    .payroll-file-page .payroll-file-toolbar {
        flex-wrap: wrap;
        border-bottom: 1px solid var(--payroll-file-line-soft);
    }

    .payroll-file-page .payroll-file-filter-trigger.is-active {
        border-color: #b9ddc6;
        background: #eff8f2;
        color: var(--payroll-file-primary-deep);
    }

    .payroll-file-page .payroll-file-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--payroll-file-line-soft);
        background: #fbfdfb;
    }

    .payroll-file-page .payroll-file-active-filters.is-visible {
        display: flex;
    }

    .payroll-file-page .payroll-file-active-filters-spacer {
        flex: 1 1 auto;
    }

    .payroll-file-page .payroll-file-filter-summary {
        color: var(--payroll-file-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .payroll-file-page .payroll-file-filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 22px;
        padding: 0 8px;
        border: 1px solid #d7e6dc;
        border-radius: 999px;
        background: #f2f8f4;
        color: #264532;
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
    }

    .payroll-file-page .payroll-file-filter-pill-label {
        color: var(--payroll-file-primary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .payroll-file-page .payroll-file-filter-pill-remove {
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

    .payroll-file-page .payroll-file-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 360px;
        border: 1px solid var(--payroll-file-line);
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .payroll-file-page .payroll-file-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .payroll-file-page .payroll-file-filter-panel-header,
    .payroll-file-page .payroll-file-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--payroll-file-line-soft);
        background: #fff;
    }

    .payroll-file-page .payroll-file-filter-panel-footer {
        border-top: 1px solid var(--payroll-file-line-soft);
        border-bottom: 0;
        padding-bottom: 12px;
    }

    .payroll-file-page .payroll-file-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--payroll-file-text);
    }

    .payroll-file-page .payroll-file-filter-panel-close {
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #667085;
    }

    .payroll-file-page .payroll-file-filter-section {
        background: #fff;
        padding: 10px;
    }

    .payroll-file-page .payroll-file-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .payroll-file-page .payroll-file-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .payroll-file-page .payroll-file-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .payroll-file-page .payroll-file-filter-panel .form-control {
        width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        color: var(--payroll-file-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-shadow: none;
    }

    .payroll-file-page .payroll-file-table thead th {
        background: #f6faf7;
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--payroll-file-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .payroll-file-page .payroll-file-table tbody td {
        font-size: 12px;
        font-weight: 500 !important;
        color: var(--payroll-file-row-text);
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
    }

    .payroll-file-page .payroll-file-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: 700 !important;
        font-variant-numeric: tabular-nums;
    }

    .payroll-file-page .payroll-file-name-text,
    .payroll-file-page .payroll-file-chip {
        color: #475467;
        font-size: 12px !important;
        font-weight: 500;
    }

    .payroll-file-page .payroll-file-name-text {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .payroll-file-page .payroll-file-pagination-wrap {
        margin-top: 2px;
    }

    @media (max-width: 767.98px) {
        .payroll-file-page .payroll-file-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .payroll-file-page .payroll-file-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid payroll-file-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="payroll-file-page-shell">
                <div class="payroll-file-page-topbar">
                    <div class="payroll-file-title-wrap">
                        <div class="payroll-file-title-icon">
                            <i class="ti ti-file-dollar"></i>
                        </div>
                        <h1 class="payroll-file-page-title">Payroll File</h1>
                    </div>
                </div>

                <div class="payroll-file-table-card">
                    <div class="payroll-file-table-card-header">
                        <div class="payroll-file-toolbar">
                            <div class="payroll-file-heading">
                                <div class="payroll-file-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <h2 class="payroll-file-table-heading">All Payroll File Records</h2>
                            </div>

                            <div class="payroll-file-actions">
                                <button class="btn btn-outline-secondary payroll-file-filter-trigger" type="button" id="openPayrollFileFiltersBtn" aria-expanded="false" aria-controls="payrollFileFiltersPanel">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button" onclick="downloadPayrollFileData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="payroll-file-active-filters" id="payrollFileActiveFilters"></div>
                    </div>

                    <div class="payroll-file-filter-panel" id="payrollFileFiltersPanel" aria-hidden="true">
                        <div class="payroll-file-filter-panel-header">
                            <div class="payroll-file-filter-panel-title">Filter Payroll File</div>
                            <button type="button" class="payroll-file-filter-panel-close" id="closePayrollFileFiltersBtn" aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="payroll-file-filter-panel-body">
                            <form class="payroll-file-filter-form" id="payrollFileFiltersForm">
                                <div class="payroll-file-filter-section">
                                    <div class="payroll-file-filter-grid">
                                        <div class="payroll-file-filter-field">
                                            <label class="payroll-file-filter-label" for="payrollFileFilterEmpNo">Employee Number</label>
                                            <input type="text" class="form-control" id="payrollFileFilterEmpNo" placeholder="Employee Number">
                                        </div>
                                        <div class="payroll-file-filter-field">
                                            <label class="payroll-file-filter-label" for="payrollFileSearch">Employee
                                                Name</label>
                                            <input type="text" class="form-control" id="payrollFileSearch" placeholder="Employee Name">
                                        </div>
                                        <div class="payroll-file-filter-field">
                                            <label class="payroll-file-filter-label" for="payrollFileFilterFromDate">From Date</label>
                                            <input type="date" class="form-control" id="payrollFileFilterFromDate">
                                        </div>
                                        <div class="payroll-file-filter-field">
                                            <label class="payroll-file-filter-label" for="payrollFileFilterToDate">To
                                                Date</label>
                                            <input type="date" class="form-control" id="payrollFileFilterToDate">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="payroll-file-filter-panel-footer">
                            <button type="button" class="btn btn-link" id="cancelPayrollFileFiltersBtn">Cancel</button>
                            <div class="payroll-file-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft" id="resetPayrollFileFiltersBtn">Reset</button>
                                <button type="submit" form="payrollFileFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table payroll-file-table align-middle" id="payroll-file-table">
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Emp No</th>
                                    <th>Emp Name</th>
                                    <th>Late</th>
                                    <th>Early</th>
                                    <th>TOT_DELAY</th>
                                    <th>Overtime hrs</th>
                                    <th>Absence WO</th>
                                    <th class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="payroll-file-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="payrollFileAdjustModal" tabindex="-1" aria-labelledby="payrollFileAdjustModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="payrollFileAdjustModalLabel">Edit Payroll File</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <form id="payrollFileAdjustForm">
                <?php if (isset($this->security)) : ?>
                    <input type="hidden" name="<?php echo $this->security->get_csrf_token_name(); ?>" value="<?php echo $this->security->get_csrf_hash(); ?>">
                <?php endif; ?>

                <input type="hidden" name="emp_no" id="payrollAdjustEmpNo">
                <input type="hidden" name="from_date" id="payrollAdjustFromDate">
                <input type="hidden" name="to_date" id="payrollAdjustToDate">

                <div class="modal-body">
                    <div class="mb-2">
                        <label class="form-label">Employee Name</label>
                        <input type="text" class="form-control" name="emp_name" id="payrollAdjustEmpName" readonly>
                    </div>

                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label">Late</label>
                            <input type="number" step="0.01" min="0" class="form-control" name="late" id="payrollAdjustLate">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Early</label>
                            <input type="number" step="0.01" min="0" class="form-control" name="early" id="payrollAdjustEarly">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Total Delay</label>
                            <input type="number" step="0.01" min="0" class="form-control" name="tot_delay" id="payrollAdjustTotDelay" readonly>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Overtime Hours</label>
                            <input type="number" step="0.01" min="0" class="form-control" name="overtime_hrs" id="payrollAdjustOvertime">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Absence WO</label>
                            <input type="number" step="1" min="0" class="form-control" name="absence_wo" id="payrollAdjustAbsenceWo">
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="payrollAdjustSubmitBtn">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>