<style>
    .employee-page {
        --employee-line: #dde6df;
        --employee-line-soft: #ebf2ed;
        --employee-text: #0f172a;
        --employee-muted: #667085;
        --employee-row-text: #475467;
        --employee-panel: #ffffff;
        --employee-head-bg: #f6faf7;
        --employee-primary: #16833f;
        --employee-primary-deep: #116632;
        --employee-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .employee-page .employee-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .employee-page .employee-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 4px;

    }

    .employee-page .employee-title-wrap,
    .employee-page .employee-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .employee-page .employee-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--employee-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .employee-page .employee-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--employee-text);
        letter-spacing: -0.12px;
    }

    .employee-page .employee-card-actions,
    .employee-page .employee-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        margin-left: auto;
    }

    .employee-page .btn {
        border-radius: 4px;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 12px;
        box-shadow: none !important;
    }

    .employee-page .btn-primary {
        background: linear-gradient(135deg, var(--employee-primary) 0%, var(--employee-primary-deep) 100%);
        border-color: transparent;
    }

    .employee-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--employee-primary) !important;
        border-color: var(--employee-primary);
    }

    /* .employee-page .btn-outline-secondary:hover {
        background: #f5faf7;
        border-color: #c7d8cd;
        color: #344054;
    } */

    .employee-page .btn-link {
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--employee-primary);
        font-size: 10.5px;
        font-weight: 700;
        text-decoration: none;
    }

    .employee-page .btn-soft {
        border: 1px solid #d7e6dc;
        color: #344054;
        background: #f7fbf8;
    }

    .employee-page .employee-table-card {
        position: relative;
        border: 1px solid var(--employee-line);
        border-radius: 4px;
        overflow: visible;

    }

    .employee-page .employee-card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--employee-line-soft);
    }

    .employee-page .employee-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--employee-text);
        letter-spacing: -0.05px;
    }

    .employee-page .employee-filter-trigger.is-active {
        border-color: #b9ddc6;
        background: #eff8f2;
        color: var(--employee-primary-deep);
    }

    .employee-page .employee-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--employee-line-soft);
        background: #fbfdfb;
    }

    .employee-page .employee-active-filters.is-visible {
        display: flex;
    }

    .employee-page .employee-active-filters-spacer {
        flex: 1 1 auto;
    }

    .employee-page .employee-filter-summary {
        color: var(--employee-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .employee-page .employee-filter-pill {
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

    .employee-page .employee-filter-pill-label {
        color: var(--employee-primary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .employee-page .employee-filter-pill-remove {
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

    .employee-page .employee-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 360px;
        border: 1px solid var(--employee-line);
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .employee-page .employee-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .employee-page .employee-filter-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--employee-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .employee-page .employee-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--employee-text);
    }

    .employee-page .employee-filter-panel-close {
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

    .employee-page .employee-filter-panel-body {
        padding: 0;
        background: #fbfdfb;
    }

    .employee-page .employee-filter-form {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .employee-page .employee-filter-section {
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .employee-page .employee-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .employee-page .employee-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .employee-page .employee-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .employee-page .employee-filter-panel .form-control {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fff;
        color: var(--employee-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-sizing: border-box;
        box-shadow: none;
    }

    .employee-page .employee-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--employee-line-soft);
        background: #fff;
    }

    .employee-page .employee-table {
        margin: 0;
        --bs-table-bg: transparent;
        table-layout: fixed;
    }

    .employee-page .employee-table col.employee-col-no {
        width: 30px;
    }

    .employee-page .employee-table col.employee-col-number {
        width: 50px;
    }

    .employee-page .employee-table col.employee-col-name {
        width: 170px;
    }

    .employee-page .employee-table col.employee-col-email {
        width: 190px;
    }

    .employee-page .employee-table col.employee-col-job {
        width: 150px;
    }

    .employee-page .employee-table col.employee-col-dept {
        width: 150px;
    }

    .employee-page .employee-table col.employee-col-date {
        width: 110px;
    }

    .employee-page .employee-table thead th {
        background: var(--employee-head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--employee-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .employee-page .employee-table tbody td {
        font-size: 12px;
        font-weight: normal !important;
        color: var(--employee-row-text) !important;
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .employee-page .employee-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: normal !important;
        font-variant-numeric: tabular-nums;
    }

    .employee-page .employee-primary-cell {
        color: var(--employee-text) !important;
    }

    .employee-page .employee-person-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
    }

    .employee-page .employee-name-avatar {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #ecf7f0;
        color: var(--employee-primary);
        font-size: 7.5px;
        font-weight: normal;
        text-transform: uppercase;
    }

    .employee-page .employee-name-text,
    .employee-page .employee-line {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    .employee-page .employee-chip,
    .employee-page .employee-date-chip {
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

    .employee-page .employee-pagination-wrap {
        margin-top: 2px;
    }

    @media (max-width: 767.98px) {
        .employee-page .employee-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .employee-page .employee-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid employee-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="employee-page-shell">
                <div class="employee-page-topbar">
                    <div class="employee-title-wrap">
                        <div class="employee-title-icon">
                            <i class="ti ti-users"></i>
                        </div>
                        <div>
                            <h1 class="employee-page-title">Employee Details</h1>
                        </div>
                    </div>
                </div>

                <div class="employee-table-card">
                    <div class="employee-table-card-header">
                        <div class="employee-card-toolbar">
                            <div class="employee-card-heading">
                                <div class="employee-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div>
                                    <h2 class="employee-table-heading">All Employee Records</h2>
                                </div>
                            </div>

                            <div class="employee-card-actions">
                                <button class="btn btn-outline-secondary employee-filter-trigger" type="button"
                                    id="openEmployeeFiltersBtn" aria-expanded="false"
                                    aria-controls="employeeFiltersPanel">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadEmployeeData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="employee-active-filters" id="employeeActiveFilters"></div>
                    </div>

                    <div class="employee-filter-panel" id="employeeFiltersPanel" aria-hidden="true">
                        <div class="employee-filter-panel-header">
                            <div class="employee-filter-panel-title">Filter Employees</div>
                            <button type="button" class="employee-filter-panel-close" id="closeEmployeeFiltersBtn"
                                aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="employee-filter-panel-body">
                            <form class="employee-filter-form" id="employeeFiltersForm">
                                <div class="employee-filter-section">
                                    <div class="employee-filter-grid">
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeSearch">Employee</label>
                                            <input type="text" class="form-control" id="employeeSearch"
                                                placeholder="Employee Name">
                                        </div>
                                    </div>
                                </div>

                                <div class="employee-filter-section">
                                    <div class="employee-filter-grid">
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterEmpNo">Emp
                                                No</label>
                                            <input type="text" class="form-control" id="employeeFilterEmpNo"
                                                placeholder="Employee Number">
                                        </div>
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterEmail">Email</label>
                                            <input type="text" class="form-control" id="employeeFilterEmail"
                                                placeholder="Email">
                                        </div>
                                    </div>
                                </div>

                                <div class="employee-filter-section">
                                    <div class="employee-filter-grid">
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterJobTitle">Job
                                                Title</label>
                                            <input type="text" class="form-control" id="employeeFilterJobTitle"
                                                placeholder="Job Title">
                                        </div>
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label"
                                                for="employeeFilterDepartment">Department</label>
                                            <input type="text" class="form-control" id="employeeFilterDepartment"
                                                placeholder="Department">
                                        </div>
                                    </div>
                                </div>

                                <div class="employee-filter-section">
                                    <div class="employee-filter-grid">
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterJoiningDate">Joining
                                                Date</label>
                                            <input type="date" class="form-control" id="employeeFilterJoiningDate">
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="employee-filter-panel-footer">
                            <button type="button" class="btn btn-link" id="cancelEmployeeFiltersBtn">Cancel</button>
                            <div class="employee-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft" id="resetEmployeeFiltersBtn">Reset</button>
                                <button type="submit" form="employeeFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table employee-table align-middle" id="employee-details-table">
                            <colgroup>
                                <col class="employee-col-no">
                                <col class="employee-col-number">
                                <col class="employee-col-name">
                                <col class="employee-col-email">
                                <col class="employee-col-job">
                                <col class="employee-col-dept">
                                <col class="employee-col-date">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Emp No</th>
                                    <th>Employee Name</th>
                                    <th>Email</th>
                                    <th>Job Title</th>
                                    <th>Department</th>
                                    <th>Joining Date</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="employee-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>