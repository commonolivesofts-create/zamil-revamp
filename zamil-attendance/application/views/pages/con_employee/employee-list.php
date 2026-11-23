<style>
    .employee-page {
        --employee-line: #dde6df;
        --employee-line-soft: #ebf2ed;
        --employee-text: #0f172a;
        --employee-muted: #667085;
        --employee-row-text: #475467;
        --employee-panel: #ffffff;
        --employee-panel-soft: #f7fbf8;
        --employee-panel-tint: #f2f8f4;
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
        /* border: 1px solid var(--employee-line); */

    }

    .employee-page .employee-title-wrap {
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

    .employee-page .employee-page-subtitle {
        margin: 0;
        font-size: 11px;
        font-weight: 500;
        color: var(--employee-muted);
    }

    .employee-page .employee-topbar-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .employee-page .btn {
        border-radius: 4px;
        /* more rounded like image */
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
    }

    /* Green primary button (like image) */
    .employee-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--employee-primary) !important;
        border-color: #c0edd1 !important;
    }

    .employee-page .btn-primary:hover {
        background: #e9f6ee !important;
        color: var(--employee-primary) !important;
        border-color: #c0edd1 !important;

    }

    .employee-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--employee-primary) !important;
        border-color: var(--employee-primary);
    }


    /* Optional: softer secondary button */
    .employee-page .btn-soft {
        border: 1px solid #bbf7d0;
        color: #065f46;
        background: #ecfdf5;
    }



    .employee-page .employee-card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--employee-line-soft);
        /* background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%); */
    }

    .employee-page .employee-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .employee-page .employee-card-title-wrap {
        min-width: 0;
    }

    .employee-page .employee-card-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        margin-left: auto;
    }

    .employee-page .employee-search-input {
        height: 30px;
        width: 240px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fbfdfb;
        font-size: 11.5px;
        padding: 4px 10px;
    }

    .employee-page .employee-search-input:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
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
        color: #16833f;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .employee-page .employee-filter-pill-value {
        overflow: hidden;
        text-overflow: ellipsis;
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

    .employee-page .employee-filter-summary {
        color: var(--employee-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .employee-page .employee-table-card {
        position: relative;
        border: 1px solid var(--employee-line);
        border-radius: 4px;
        overflow: visible;

    }

    .employee-page .employee-table-card-header {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 8px;
        padding: 0;
        border-bottom: 0;
        background: transparent;
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

    .employee-page .table-responsive {
        margin: 0;
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
        color: #475467 !important;
        padding: 4px 6px;
        vertical-align: middle;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .employee-page .employee-table tbody tr:last-child td {
        border-bottom: 0;
    }

    .employee-page .employee-table tbody tr {
        transition: background-color 0.18s ease, box-shadow 0.18s ease;
    }

    .employee-page .employee-table tbody tr:hover {
        background: #fbfdff;
    }

    .employee-page .employee-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: normal !important;
        font-variant-numeric: tabular-nums;
    }

    .employee-page .employee-name-cell {
        color: var(--employee-text) !important;
        font-weight: normal !important;
        padding-right: 10px !important;
    }

    .employee-page .employee-name-chip {
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

    .employee-page .employee-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--employee-text);
        text-decoration: none;
    }

    .employee-page a.employee-name-text:hover {
        color: var(--employee-primary);
        text-decoration: underline;
    }

    .employee-page .employee-date-chip,
    .employee-page .employee-time-chip,
    .employee-page .employee-stamp-chip {
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

    .employee-page .employee-date-chip i,
    .employee-page .employee-time-chip i,
    .employee-page .employee-stamp-chip i {
        color: #98a2b3;
        font-size: 10px;
        flex: 0 0 auto;
    }

    .employee-page .employee-stamp-chip {
        background: transparent;
        border-color: transparent;
        padding-left: 0;
        padding-right: 0;
    }

    .employee-page .employee-status-badge {
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

    .employee-page .employee-status-badge.status-active {
        background: #eaf7ef;
        border-color: #b9ddc6;
        color: #16833f;
    }

    .employee-page .employee-status-badge.status-inactive {
        background: #f7f8f7;
        border-color: #e5e7eb;
        color: #667085;
    }

    .employee-page .employee-action-cell {
        width: 72px;
    }

    .employee-page .employee-action-stack {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    .employee-page .employee-action-btn {
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



    .employee-page .js-edit-employee {
        color: var(--employee-primary);
    }

    .employee-page .js-edit-employee:hover {
        color: var(--employee-primary-deep);
        border-color: #b9ddc6;
        background: #eff8f2;
    }

    .employee-page .js-delete-employee {
        color: #dc2626;
    }

    .employee-page .js-delete-employee:hover {
        color: #b91c1c;
        border-color: #fecaca;
        background: #fef2f2;
    }

    .employee-page .employee-pagination-wrap {
        margin-top: 2px;
    }

    .employee-page .employee-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 290px;
        border: 1px solid var(--employee-line);
        border-radius: 12px;
        background: #ffffff;
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
        box-shadow: none !important;
    }

    .employee-page .employee-filter-panel-close:hover {
        background: #f3f4f6;
        color: #344054;
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
        /* border: 1px solid var(--employee-line); */
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .employee-page .employee-filter-section-title {
        margin: 0 0 8px;
        font-size: 10px;
        font-weight: 700;
        color: var(--employee-primary);
        text-transform: uppercase;
        letter-spacing: 0.28px;
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

    .employee-page .employee-filter-panel .form-control,
    .employee-page .employee-filter-panel .form-select {
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

    .employee-page .employee-filter-panel .form-control:focus,
    .employee-page .employee-filter-panel .form-select:focus {
        border-color: #6ab487;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    .employee-page .employee-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--employee-line-soft);
        background: #ffffff;
    }

    .employee-page .employee-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    @media (max-width: 991.98px) {
        .employee-page .employee-page-topbar {
            align-items: flex-start;
            flex-direction: column;
        }

        .employee-page .employee-topbar-meta {
            width: 100%;
            justify-content: space-between;
        }
    }

    @media (max-width: 767.98px) {

        .employee-page .employee-page-topbar,
        .employee-page .employee-card-toolbar,
        .employee-page .employee-active-filters {
            padding-left: 10px;
            padding-right: 10px;
        }

        .employee-page .employee-title-wrap {
            width: 100%;
        }

        .employee-page .employee-topbar-meta {
            justify-content: flex-start;
        }

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
                            <h1 class="employee-page-title">Contractor Employees</h1>
                            <p class="employee-page-subtitle">Employees supplied by outsourced contractor companies</p>
                        </div>
                    </div>

                    <div class="employee-topbar-meta">
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                            data-bs-target="#addEmployeeModal">
                            <i class="ti ti-plus me-1"></i> Add Employee
                        </button>
                    </div>
                </div>

                <div class="employee-table-card">
                    <div class="employee-table-card-header">
                        <div class="employee-card-toolbar">
                            <div class="employee-card-heading">
                                <div class="employee-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div class="employee-card-title-wrap">
                                    <h2 class="employee-table-heading">All Employee Records</h2>
                                </div>
                            </div>

                            <div class="employee-card-actions">
                                <input type="text" id="employeeSearch" class="form-control employee-search-input"
                                    placeholder="Search employee, contractor, dept...">
                                <button class="btn btn-outline-secondary employee-filter-trigger" type="button"
                                    id="openEmployeeFiltersBtn" aria-expanded="false" aria-controls="employeeFiltersDrawer">
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

                    <div class="employee-filter-panel" id="employeeFiltersDrawer" aria-hidden="true">
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
                                            <label class="employee-filter-label" for="employeeFilterDivision">Division</label>
                                            <select id="employeeFilterDivision" class="form-select">
                                                <option value="">All Divisions</option>
                                                <option value="IBM">IPP BU</option>
                                                <option value="Z3P">FPP BU</option>
                                            </select>
                                        </div>
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterDepartment">Department</label>
                                            <select id="employeeFilterDepartment" class="form-select">
                                                <option value="">All Departments</option>
                                                <?php if (!empty($departmentOptions)) : ?>
                                                    <?php foreach ($departmentOptions as $deptOption) : ?>
                                                        <?php $deptValue = $deptOption['DEPARTMENT'] ?? ''; ?>
                                                        <?php if ($deptValue !== '' && strtoupper($deptValue) !== 'ALL') : ?>
                                                            <option value="<?= html_escape($deptValue) ?>"><?= html_escape($deptValue) ?></option>
                                                        <?php endif; ?>
                                                    <?php endforeach; ?>
                                                <?php endif; ?>
                                            </select>
                                        </div>
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterConNumber">Contractor Number</label>
                                            <input type="text" id="employeeFilterConNumber" class="form-control"
                                                placeholder="Contractor #">
                                        </div>
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterStatus">Status</label>
                                            <select id="employeeFilterStatus" class="form-select">
                                                <option value="">All Statuses</option>
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div class="employee-filter-section">
                                    <div class="employee-filter-grid">
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterStartDate">From
                                                Start Date</label>
                                            <input type="date" id="employeeFilterStartDate" class="form-control">
                                        </div>
                                        <div class="employee-filter-field">
                                            <label class="employee-filter-label" for="employeeFilterEndDate">To End Date</label>
                                            <input type="date" id="employeeFilterEndDate" class="form-control">
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
                        <table class="table employee-table align-middle" id="employees-table">
                            <colgroup>
                                <col class="employee-col-no">
                                <col class="employee-col-name">
                                <col class="employee-col-status">
                                <col class="employee-col-name">
                                <col class="employee-col-name">
                                <col class="employee-col-name">
                                <col class="employee-col-name">
                                <col class="employee-col-date">
                                <col class="employee-col-date">
                                <col class="employee-col-status">
                                <col class="employee-col-action">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Employee #</th>
                                    <th>Division</th>
                                    <th>Department</th>
                                    <th>Contractor Name</th>
                                    <th>Contractor #</th>
                                    <th>Employee Name</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Status</th>
                                    <th class="text-center">Action</th>
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

<?php $this->load->view('pages/con_employee/form'); ?>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>