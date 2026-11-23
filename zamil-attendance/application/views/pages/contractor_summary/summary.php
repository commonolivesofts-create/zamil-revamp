<style>
    .summary-page {
        --summary-line: #dde6df;
        --summary-line-soft: #ebf2ed;
        --summary-text: #0f172a;
        --summary-muted: #667085;
        --summary-panel: #ffffff;
        --summary-head-bg: #f6faf7;
        --summary-primary: #16833f;
        --summary-primary-deep: #116632;
        --summary-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .summary-page .summary-page-shell {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .summary-page .summary-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
    }

    .summary-page .summary-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .summary-page .summary-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--summary-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .summary-page .summary-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--summary-text);
        letter-spacing: -0.12px;
    }

    .summary-page .summary-page-subtitle {
        margin: 0;
        font-size: 11px;
        font-weight: 500;
        color: var(--summary-muted);
    }

    .summary-page .summary-filter-card {
        border: 1px solid var(--summary-line);
        border-radius: 8px;
        background: #fff;
        padding: 12px;
    }

    .summary-page .summary-filter-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
        gap: 10px;
        align-items: end;
    }

    .summary-page .summary-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .summary-page .summary-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2px;
        text-transform: uppercase;
        color: #475467;
    }

    .summary-page .summary-filter-grid .form-control,
    .summary-page .summary-filter-grid .form-select {
        height: 34px;
        border-radius: 8px;
        border: 1px solid #d6e1da;
        background: #fbfdfb;
        font-size: 11.5px;
        padding: 4px 10px;
    }

    .summary-page .summary-filter-grid .form-control:focus,
    .summary-page .summary-filter-grid .form-select:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    .summary-page .btn-run {
        height: 34px;
        border-radius: 8px;
        background: var(--summary-primary) !important;
        color: #fff !important;
        border: none;
        font-size: 11.5px;
        font-weight: 600;
        padding: 0 16px;
        white-space: nowrap;
    }

    .summary-page .btn-run:hover {
        background: var(--summary-primary-deep) !important;
    }

    .summary-page .summary-card {
        border: 1px solid var(--summary-line);
        border-radius: 8px;
        background: #fff;
        overflow: hidden;
    }

    .summary-page .nav-tabs {
        border-bottom: 1px solid var(--summary-line-soft);
        padding: 8px 12px 0;
        gap: 4px;
    }

    .summary-page .nav-tabs .nav-link {
        border: 1px solid transparent;
        border-radius: 8px 8px 0 0;
        font-size: 12px;
        font-weight: 600;
        color: #475467;
        padding: 8px 14px;
    }

    .summary-page .nav-tabs .nav-link.active {
        color: var(--summary-primary-deep);
        background: var(--summary-head-bg);
        border-color: var(--summary-line-soft) var(--summary-line-soft) var(--summary-head-bg);
    }

    .summary-page .tab-content {
        padding: 12px;
    }

    .summary-page .summary-tab-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
    }

    .summary-page .table-responsive {
        max-height: 65vh;
        overflow-y: auto;
    }

    .summary-page .summary-table thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--summary-primary) !important;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2px;
        text-transform: uppercase;
        padding: 6px 8px;
        white-space: nowrap;
    }

    .summary-page .summary-table tbody td {
        font-size: 12px;
        color: #344054;
        padding: 5px 8px;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
    }

    .summary-page .summary-table tbody tr.summary-subtotal-row td {
        background: #f2f8f4;
        font-weight: 700;
        color: #16833f;
    }

    .summary-page .summary-table tfoot th {
        position: sticky;
        bottom: 0;
        background: #eaf7ef;
        color: #16833f;
        font-size: 12px;
        padding: 6px 8px;
        white-space: nowrap;
    }

    .summary-page .summary-empty-row td {
        text-align: center;
        color: var(--summary-muted);
        padding: 16px !important;
    }

    @media (max-width: 991.98px) {
        .summary-page .summary-filter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>

<div class="container-fluid summary-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="summary-page-shell">
                <div class="summary-page-topbar">
                    <div class="summary-title-wrap">
                        <div class="summary-title-icon">
                            <i class="ti ti-report-money"></i>
                        </div>
                        <div>
                            <h1 class="summary-page-title">Contractor Summary</h1>
                            <p class="summary-page-subtitle">Hours &amp; cost report against clock-in/out punch data</p>
                        </div>
                    </div>
                </div>

                <div class="summary-filter-card">
                    <div class="summary-filter-grid">
                        <div class="summary-filter-field">
                            <label class="summary-filter-label" for="summaryFilterDiv">Division</label>
                            <select id="summaryFilterDiv" class="form-select">
                                <option value="">Select</option>
                                <option value="IBM">IPP BU</option>
                                <option value="Z3P">FPP BU</option>
                                <option value="ALL">ALL</option>
                            </select>
                        </div>
                        <div class="summary-filter-field">
                            <label class="summary-filter-label" for="summaryFilterConName">Contractor Name</label>
                            <input type="text" id="summaryFilterConName" class="form-control" list="summaryConNameOptions" placeholder="Any contractor">
                            <datalist id="summaryConNameOptions">
                                <?php if (!empty($contractorOptions)) : ?>
                                    <?php foreach ($contractorOptions as $cont) : ?>
                                        <option value="<?= html_escape($cont['CON_NAME'] ?? '') ?>"></option>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </datalist>
                        </div>
                        <div class="summary-filter-field">
                            <label class="summary-filter-label" for="summaryFilterDept">Department</label>
                            <input type="text" id="summaryFilterDept" class="form-control" list="summaryDeptOptions" placeholder="Any department">
                            <datalist id="summaryDeptOptions">
                                <?php if (!empty($departmentOptions)) : ?>
                                    <?php foreach ($departmentOptions as $dep) : ?>
                                        <option value="<?= html_escape($dep['DEPARTMENT'] ?? '') ?>"></option>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </datalist>
                        </div>
                        <div class="summary-filter-field">
                            <label class="summary-filter-label" for="summaryFilterFrom">From Date</label>
                            <input type="date" id="summaryFilterFrom" class="form-control" value="<?= html_escape($defaultFrom ?? '') ?>">
                        </div>
                        <div class="summary-filter-field">
                            <label class="summary-filter-label" for="summaryFilterTo">To Date</label>
                            <input type="date" id="summaryFilterTo" class="form-control" value="<?= html_escape($defaultTo ?? '') ?>">
                        </div>
                        <div class="summary-filter-field">
                            <button type="button" class="btn btn-run" id="runSummaryBtn">
                                <i class="ti ti-player-play me-1"></i> Run
                            </button>
                        </div>
                    </div>
                </div>

                <div class="summary-card">
                    <nav>
                        <div class="nav nav-tabs" id="summaryNavTab" role="tablist">
                            <button class="nav-link active" id="summary-tab" data-bs-toggle="tab" data-bs-target="#summary-tab-pane" type="button" role="tab" aria-controls="summary-tab-pane" aria-selected="true">Summary</button>
                            <button class="nav-link" id="report-tab" data-bs-toggle="tab" data-bs-target="#report-tab-pane" type="button" role="tab" aria-controls="report-tab-pane" aria-selected="false">Report</button>
                            <button class="nav-link" id="groupwise-tab" data-bs-toggle="tab" data-bs-target="#groupwise-tab-pane" type="button" role="tab" aria-controls="groupwise-tab-pane" aria-selected="false">Summary Group Wise</button>
                        </div>
                    </nav>

                    <div class="tab-content" id="summaryNavTabContent">

                        <div class="tab-pane fade show active" id="summary-tab-pane" role="tabpanel" aria-labelledby="summary-tab">
                            <div class="summary-tab-actions">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="exportSummaryCsv()">
                                    <i class="ti ti-file-export me-1"></i> Export CSV
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="exportSummaryExcel('table-summary', 'Contractor_Summary')">
                                    <i class="ti ti-file-spreadsheet me-1"></i> Export Excel
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="printSummaryTable('table-summary')">
                                    <i class="ti ti-printer me-1"></i> Print
                                </button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm summary-table" id="table-summary">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Con No</th>
                                            <th>Contractor Name</th>
                                            <th>Div</th>
                                            <th>Department</th>
                                            <th>Emp No</th>
                                            <th>Emp Name</th>
                                            <th>Iqamah</th>
                                            <th>Rate</th>
                                            <th>Tot Hrs</th>
                                            <th>Tot Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                    <tfoot>
                                        <tr>
                                            <th colspan="9" class="text-end">Total</th>
                                            <th id="summaryTotalHrs">0.00</th>
                                            <th id="summaryTotalCost">0.00</th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="report-tab-pane" role="tabpanel" aria-labelledby="report-tab">
                            <div class="summary-tab-actions">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="exportSummaryExcel('table-report', 'Contractor_Report')">
                                    <i class="ti ti-file-spreadsheet me-1"></i> Export Excel
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="printSummaryTable('table-report')">
                                    <i class="ti ti-printer me-1"></i> Print
                                </button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm summary-table" id="table-report">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Date</th>
                                            <th>Con #</th>
                                            <th>Con Name</th>
                                            <th>Dep ID</th>
                                            <th>Dept</th>
                                            <th>Emp #</th>
                                            <th>Emp Name</th>
                                            <th>Punch In</th>
                                            <th>Punch Out</th>
                                            <th>Act Hrs</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                    <tfoot>
                                        <tr>
                                            <th colspan="10" class="text-end">Total</th>
                                            <th id="reportTotalHrs">0.00</th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div class="tab-pane fade" id="groupwise-tab-pane" role="tabpanel" aria-labelledby="groupwise-tab">
                            <div class="summary-tab-actions">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="exportSummaryExcel('table-groupwise', 'Contractor_Group_Summary')">
                                    <i class="ti ti-file-spreadsheet me-1"></i> Export Excel
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="printSummaryTable('table-groupwise')">
                                    <i class="ti ti-printer me-1"></i> Print
                                </button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm summary-table" id="table-groupwise">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Con No</th>
                                            <th>Contractor Name</th>
                                            <th>Total Employees</th>
                                            <th>Total Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                    <tfoot>
                                        <tr>
                                            <th colspan="3" class="text-end">Total</th>
                                            <th id="groupwiseTotalEmp">0</th>
                                            <th id="groupwiseTotalCost">0.00</th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js"></script>
