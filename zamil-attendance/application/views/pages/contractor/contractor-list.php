<style>
    .contractor-page {
        --contractor-line: #dde6df;
        --contractor-line-soft: #ebf2ed;
        --contractor-text: #0f172a;
        --contractor-muted: #667085;
        --contractor-row-text: #475467;
        --contractor-panel: #ffffff;
        --contractor-panel-soft: #f7fbf8;
        --contractor-panel-tint: #f2f8f4;
        --contractor-head-bg: #f6faf7;
        --contractor-primary: #16833f;
        --contractor-primary-deep: #116632;
        --contractor-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
    }

    .contractor-page .contractor-page-shell {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .contractor-page .contractor-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        /* border: 1px solid var(--contractor-line); */

    }

    .contractor-page .contractor-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .contractor-page .contractor-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--contractor-primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .contractor-page .contractor-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--contractor-text);
        letter-spacing: -0.12px;
    }

    .contractor-page .contractor-page-subtitle {
        margin: 0;
        font-size: 11px;
        font-weight: 500;
        color: var(--contractor-muted);
    }

    .contractor-page .contractor-topbar-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .contractor-page .btn {
        border-radius: 4px;
        /* more rounded like image */
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
    }

    /* Green primary button (like image) */
    .contractor-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--contractor-primary) !important;
        border-color: #c0edd1 !important;
    }

    .contractor-page .btn-primary:hover {
        background: #e9f6ee !important;
        color: var(--contractor-primary) !important;
        border-color: #c0edd1 !important;

    }

    .contractor-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--contractor-primary) !important;
        border-color: var(--contractor-primary);
    }


    /* Optional: softer secondary button */
    .contractor-page .btn-soft {
        border: 1px solid #bbf7d0;
        color: #065f46;
        background: #ecfdf5;
    }



    .contractor-page .contractor-card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;
        flex-wrap: wrap;
        padding: 5px 8px;
        border-bottom: 1px solid var(--contractor-line-soft);
        /* background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%); */
    }

    .contractor-page .contractor-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .contractor-page .contractor-card-title-wrap {
        min-width: 0;
    }

    .contractor-page .contractor-card-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        margin-left: auto;
    }

    .contractor-page .contractor-search-input {
        height: 30px;
        width: 220px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fbfdfb;
        font-size: 11.5px;
        padding: 4px 10px;
    }

    .contractor-page .contractor-search-input:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    .contractor-page .contractor-active-filters {
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        border-bottom: 1px solid var(--contractor-line-soft);
        background: #fbfdfb;
    }

    .contractor-page .contractor-active-filters.is-visible {
        display: flex;
    }

    .contractor-page .contractor-active-filters-spacer {
        flex: 1 1 auto;
    }

    .contractor-page .contractor-filter-pill {
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

    .contractor-page .contractor-filter-pill-label {
        color: #16833f;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12px;
    }

    .contractor-page .contractor-filter-pill-value {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .contractor-page .contractor-filter-pill-remove {
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

    .contractor-page .contractor-filter-summary {
        color: var(--contractor-muted);
        font-size: 10px;
        font-weight: 600;
    }

    .contractor-page .contractor-table-card {
        position: relative;
        border: 1px solid var(--contractor-line);
        border-radius: 4px;
        overflow: visible;

    }

    .contractor-page .contractor-table-card-header {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 8px;
        padding: 0;
        border-bottom: 0;
        background: transparent;
    }

    .contractor-page .contractor-table-heading {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: var(--contractor-text);
        letter-spacing: -0.05px;
    }

    .contractor-page .contractor-filter-trigger.is-active {
        border-color: #b9ddc6;
        background: #eff8f2;
        color: var(--contractor-primary-deep);
    }

    .contractor-page .table-responsive {
        margin: 0;
    }


    .contractor-page .contractor-table thead th {
        background: var(--contractor-head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.28px;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--contractor-line-soft);
        border-top: 0;
        white-space: nowrap;
    }

    .contractor-page .contractor-table tbody td {
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

    .contractor-page .contractor-table tbody tr:last-child td {
        border-bottom: 0;
    }

    .contractor-page .contractor-table tbody tr {
        transition: background-color 0.18s ease, box-shadow 0.18s ease;
    }

    .contractor-page .contractor-table tbody tr:hover {
        background: #fbfdff;
    }

    .contractor-page .contractor-col-index {
        text-align: center;
        color: #98a2b3 !important;
        font-weight: normal !important;
        font-variant-numeric: tabular-nums;
    }

    .contractor-page .contractor-name-cell {
        color: var(--contractor-text) !important;
        font-weight: normal !important;
        padding-right: 10px !important;
    }

    .contractor-page .contractor-name-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
    }

    .contractor-page .contractor-name-avatar {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #ecf7f0;
        color: var(--contractor-primary);
        font-size: 7.5px;
        font-weight: normal;
        text-transform: uppercase;
    }

    .contractor-page .contractor-name-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--contractor-text);
        text-decoration: none;
    }

    .contractor-page a.contractor-name-text:hover {
        color: var(--contractor-primary);
        text-decoration: underline;
    }

    .contractor-page .contractor-date-chip,
    .contractor-page .contractor-time-chip,
    .contractor-page .contractor-stamp-chip {
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

    .contractor-page .contractor-date-chip i,
    .contractor-page .contractor-time-chip i,
    .contractor-page .contractor-stamp-chip i {
        color: #98a2b3;
        font-size: 10px;
        flex: 0 0 auto;
    }

    .contractor-page .contractor-stamp-chip {
        background: transparent;
        border-color: transparent;
        padding-left: 0;
        padding-right: 0;
    }

    .contractor-page .contractor-status-badge {
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

    .contractor-page .contractor-status-badge.status-active {
        background: #eaf7ef;
        border-color: #b9ddc6;
        color: #16833f;
    }

    .contractor-page .contractor-status-badge.status-inactive {
        background: #f7f8f7;
        border-color: #e5e7eb;
        color: #667085;
    }

    .contractor-page .contractor-action-cell {
        width: 72px;
    }

    .contractor-page .contractor-action-stack {
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    .contractor-page .contractor-action-btn {
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



    .contractor-page .js-edit-contractor {
        color: var(--contractor-primary);
    }

    .contractor-page .js-edit-contractor:hover {
        color: var(--contractor-primary-deep);
        border-color: #b9ddc6;
        background: #eff8f2;
    }

    .contractor-page .js-delete-contractor {
        color: #dc2626;
    }

    .contractor-page .js-delete-contractor:hover {
        color: #b91c1c;
        border-color: #fecaca;
        background: #fef2f2;
    }

    .contractor-page .contractor-pagination-wrap {
        margin-top: 2px;
    }

    .contractor-page .contractor-filter-panel {
        position: absolute;
        top: 46px;
        right: 10px;
        z-index: 1050;
        width: 290px;
        border: 1px solid var(--contractor-line);
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 18px 42px rgba(16, 24, 40, 0.14);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px) scale(0.98);
        transform-origin: top right;
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    }

    .contractor-page .contractor-filter-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    .contractor-page .contractor-filter-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--contractor-line-soft);
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
    }

    .contractor-page .contractor-filter-panel-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--contractor-text);
    }

    .contractor-page .contractor-filter-panel-close {
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

    .contractor-page .contractor-filter-panel-close:hover {
        background: #f3f4f6;
        color: #344054;
    }

    .contractor-page .contractor-filter-panel-body {
        padding: 0;
        background: #fbfdfb;
    }

    .contractor-page .contractor-filter-form {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .contractor-page .contractor-filter-section {
        /* border: 1px solid var(--contractor-line); */
        border-radius: 10px;
        background: #fff;
        padding: 10px;
    }

    .contractor-page .contractor-filter-section-title {
        margin: 0 0 8px;
        font-size: 10px;
        font-weight: 700;
        color: var(--contractor-primary);
        text-transform: uppercase;
        letter-spacing: 0.28px;
    }

    .contractor-page .contractor-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
    }

    .contractor-page .contractor-filter-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .contractor-page .contractor-filter-label {
        margin: 0;
        font-size: 10px;
        font-weight: 600;
        color: #475467;
    }

    .contractor-page .contractor-filter-panel .form-control,
    .contractor-page .contractor-filter-panel .form-select {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        border-radius: 7px;
        border: 1px solid #d6e1da;
        background: #fff;
        color: var(--contractor-text);
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        box-sizing: border-box;
        box-shadow: none;
    }

    .contractor-page .contractor-filter-panel .form-control:focus,
    .contractor-page .contractor-filter-panel .form-select:focus {
        border-color: #6ab487;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    .contractor-page .contractor-filter-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--contractor-line-soft);
        background: #ffffff;
    }

    .contractor-page .contractor-filter-panel-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    @media (max-width: 991.98px) {
        .contractor-page .contractor-page-topbar {
            align-items: flex-start;
            flex-direction: column;
        }

        .contractor-page .contractor-topbar-meta {
            width: 100%;
            justify-content: space-between;
        }
    }

    @media (max-width: 767.98px) {

        .contractor-page .contractor-page-topbar,
        .contractor-page .contractor-card-toolbar,
        .contractor-page .contractor-active-filters {
            padding-left: 10px;
            padding-right: 10px;
        }

        .contractor-page .contractor-title-wrap {
            width: 100%;
        }

        .contractor-page .contractor-topbar-meta {
            justify-content: flex-start;
        }

        .contractor-page .contractor-filter-panel {
            left: 10px;
            right: 10px;
            width: auto;
        }

        .contractor-page .contractor-filter-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid contractor-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="contractor-page-shell">
                <div class="contractor-page-topbar">
                    <div class="contractor-title-wrap">
                        <div class="contractor-title-icon">
                            <i class="ti ti-building"></i>
                        </div>
                        <div>
                            <h1 class="contractor-page-title">Contractor List</h1>
                            <p class="contractor-page-subtitle">Contractor companies engaged for outsourced staff</p>
                        </div>
                    </div>

                    <div class="contractor-topbar-meta">
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                            data-bs-target="#addContractorModal">
                            <i class="ti ti-plus me-1"></i> Add Contractor
                        </button>
                    </div>
                </div>

                <div class="contractor-table-card">
                    <div class="contractor-table-card-header">
                        <div class="contractor-card-toolbar">
                            <div class="contractor-card-heading">
                                <div class="contractor-title-icon">
                                    <i class="ti ti-table"></i>
                                </div>
                                <div class="contractor-card-title-wrap">
                                    <h2 class="contractor-table-heading">All Contractor Records</h2>
                                </div>
                            </div>

                            <div class="contractor-card-actions">
                                <input type="text" id="contractorSearch" class="form-control contractor-search-input"
                                    placeholder="Search number, name, status...">
                                <button class="btn btn-outline-secondary contractor-filter-trigger" type="button"
                                    id="openContractorFiltersBtn" aria-expanded="false" aria-controls="contractorFiltersDrawer">
                                    <i class="ti ti-filter me-1"></i> Filter
                                </button>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="downloadContractorData('csv')">
                                    <i class="ti ti-file-export me-1"></i> CSV
                                </button>
                            </div>
                        </div>

                        <div class="contractor-active-filters" id="contractorActiveFilters"></div>
                    </div>

                    <div class="contractor-filter-panel" id="contractorFiltersDrawer" aria-hidden="true">
                        <div class="contractor-filter-panel-header">
                            <div class="contractor-filter-panel-title">Filter Contractors</div>
                            <button type="button" class="contractor-filter-panel-close" id="closeContractorFiltersBtn"
                                aria-label="Close filters">
                                <i class="ti ti-x"></i>
                            </button>
                        </div>
                        <div class="contractor-filter-panel-body">
                            <form class="contractor-filter-form" id="contractorFiltersForm">
                                <div class="contractor-filter-section">
                                    <div class="contractor-filter-grid">
                                        <div class="contractor-filter-field">
                                            <label class="contractor-filter-label" for="contractorFilterConNumber">Contractor Number</label>
                                            <input type="text" id="contractorFilterConNumber" class="form-control"
                                                placeholder="Contractor #">
                                        </div>
                                        <div class="contractor-filter-field">
                                            <label class="contractor-filter-label" for="contractorFilterConName">Contractor Name</label>
                                            <input type="text" id="contractorFilterConName" class="form-control"
                                                placeholder="Contractor Name">
                                        </div>
                                        <div class="contractor-filter-field">
                                            <label class="contractor-filter-label" for="contractorFilterStatus">Status</label>
                                            <select id="contractorFilterStatus" class="form-select">
                                                <option value="">All Statuses</option>
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="contractor-filter-panel-footer">
                            <button type="button" class="btn btn-link" id="cancelContractorFiltersBtn">Cancel</button>
                            <div class="contractor-filter-panel-footer-actions">
                                <button type="button" class="btn btn-soft" id="resetContractorFiltersBtn">Reset</button>
                                <button type="submit" form="contractorFiltersForm" class="btn btn-primary">Apply
                                    Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table contractor-table align-middle" id="contractors-table">
                            <colgroup>
                                <col class="contractor-col-no">
                                <col class="contractor-col-name">
                                <col class="contractor-col-name">
                                <col class="contractor-col-date">
                                <col class="contractor-col-date">
                                <col class="contractor-col-status">
                                <col class="contractor-col-time">
                                <col class="contractor-col-stamp">
                                <col class="contractor-col-action">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="text-center">#</th>
                                    <th>Contractor Number</th>
                                    <th>Contractor Name</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Status</th>
                                    <th>Rate / Hour</th>
                                    <th>Created</th>
                                    <th class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <div class="contractor-pagination-wrap">
                    <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php $this->load->view('pages/contractor/form'); ?>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>