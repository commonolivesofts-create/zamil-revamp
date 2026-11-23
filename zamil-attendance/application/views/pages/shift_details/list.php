<style>
    .subshift-page {
        --line: #dde6df;
        --line-soft: #ebf2ed;
        --text: #0f172a;
        --muted: #667085;
        --head-bg: #f6faf7;
        --primary: #16833f;
        --primary-deep: #116632;
        --panel: #ffffff;
    }

    .subshift-page .page-shell {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .subshift-page .page-topbar,
    .subshift-page .card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 8px;
    }

    .subshift-page .title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .subshift-page .title-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--primary);
        font-size: 14px;
        flex: 0 0 auto;
    }

    .subshift-page .page-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: var(--text);
    }

    .subshift-page .table-card {
        border: 1px solid var(--line);
        border-radius: 4px;
        overflow: hidden;
        background: #fff;
    }

    .subshift-page .btn {
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
    }

    .subshift-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--primary) !important;
        border-color: #c0edd1 !important;
    }

    .subshift-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--primary) !important;
        border-color: var(--primary) !important;
    }

    .subshift-page .filter-row {
        display: grid;
        grid-template-columns: 1.2fr 180px 120px;
        gap: 8px;
        padding: 8px;
        border-top: 1px solid var(--line-soft);
        border-bottom: 1px solid var(--line-soft);
        background: #fbfdfb;
    }

    .subshift-page .filter-field label {
        display: block;
        margin-bottom: 4px;
        font-size: 10px;
        font-weight: 700;
        color: #475467;
        text-transform: uppercase;
    }

    .subshift-page .filter-field .form-control,
    .subshift-page .filter-field .form-select {
        height: 31px;
        border-radius: 6px;
        border: 1px solid #d6e1da;
        font-size: 12px;
    }

    .subshift-page .table-responsive {
        overflow: auto;
    }

    .subshift-page .subshift-table {
        min-width: 2400px;
        margin: 0;
    }

    .subshift-page .subshift-table thead th {
        background: var(--head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.28px;
        padding: 6px 6px;
        border-bottom: 1px solid var(--line-soft);
        white-space: nowrap;
        text-align: center;
        vertical-align: middle;
    }

    .subshift-page .subshift-table tbody td {
        font-size: 12px;
        color: #475467;
        padding: 5px 6px;
        border-bottom: 1px solid #eff3f8;
        white-space: nowrap;
        text-align: center;
        vertical-align: middle;
    }

    .subshift-page .subshift-table tbody tr:hover {
        background: #fbfdff;
    }

    .subshift-page .col-index {
        color: #98a2b3 !important;
        width: 50px;
    }

    .subshift-page .col-shift {
        min-width: 220px;
        text-align: left !important;
        font-weight: 600;
        color: var(--text) !important;
    }

    .subshift-page .status-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 74px;
        min-height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid #d7e6dc;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        background: #f7fbf8;
        color: #456052;
    }

    .subshift-page .status-badge.status-active {
        background: #eaf7ef;
        border-color: #b9ddc6;
        color: #16833f;
    }

    .subshift-page .status-badge.status-inactive {
        background: #f7f8f7;
        border-color: #e5e7eb;
        color: #667085;
    }

    .subshift-page .manage-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        text-decoration: none;
    }

    .subshift-page .pagination-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding: 8px;
        border-top: 1px solid var(--line-soft);
        background: #fff;
    }

    .subshift-page .pagination-meta {
        font-size: 12px;
        color: var(--muted);
    }

    .subshift-page .pagination-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .subshift-page .empty-text {
        padding: 18px 10px;
        text-align: center;
        font-size: 13px;
        color: var(--muted);
    }

    @media (max-width: 991.98px) {
        .subshift-page .filter-row {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid subshift-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="page-shell">
                <div class="page-topbar">
                    <div class="title-wrap">
                        <div class="title-icon">
                            <i class="ti ti-clock-hour-4"></i>
                        </div>
                        <div>
                            <h1 class="page-title">Sub Shifts</h1>
                        </div>
                    </div>

                    <div>
                        <a href="<?= base_url('shift-details/create') ?>" class="btn btn-primary">
                            <i class="ti ti-plus me-1"></i> Manage Shift Details
                        </a>
                    </div>
                </div>

                <div class="table-card">
                    <div class="card-toolbar">
                        <div class="title-wrap">
                            <div class="title-icon">
                                <i class="ti ti-table"></i>
                            </div>
                            <div>
                                <h2 class="page-title" style="font-size: 14px;">All Shift Detail Records</h2>
                            </div>
                        </div>
                    </div>

                    <div class="filter-row">
                        <div class="filter-field">
                            <label for="subShiftSearch">Shift Name</label>
                            <input type="text" id="subShiftSearch" class="form-control" placeholder="Search by shift name">
                        </div>

                        <div class="filter-field">
                            <label for="subShiftStatus">Status</label>
                            <select id="subShiftStatus" class="form-select">
                                <option value="">All Statuses</option>
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="INACTIVE">INACTIVE</option>
                            </select>
                        </div>

                        <div class="filter-field d-flex align-items-end">
                            <button type="button" id="subShiftFilterBtn" class="btn btn-outline-secondary w-100">
                                <i class="ti ti-filter me-1"></i> Filter
                            </button>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table subshift-table align-middle" id="subshift-table">
                            <thead>
                                <tr>
                                    <th rowspan="2">#</th>
                                    <th rowspan="2">Shift Name</th>
                                    <th rowspan="2">Status</th>

                                    <th colspan="3">Sunday</th>
                                    <th colspan="3">Monday</th>
                                    <th colspan="3">Tuesday</th>
                                    <th colspan="3">Wednesday</th>
                                    <th colspan="3">Thursday</th>
                                    <th colspan="3">Friday</th>
                                    <th colspan="3">Saturday</th>

                                    <th rowspan="2">Action</th>
                                </tr>
                                <tr>
                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>

                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>

                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>

                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>

                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>

                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>

                                    <th>Punch In</th>
                                    <th>Punch Out</th>
                                    <th>Gross</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>

                    <div class="pagination-bar">
                        <div class="pagination-meta">
                            Page <span id="current-page">1</span> of <span id="total-pages">1</span>
                            <span class="mx-2">|</span>
                            Records: <span id="range-of-records">0</span>
                        </div>

                        <div class="pagination-actions">
                            <button type="button" class="btn btn-outline-secondary" id="prev-page-btn">Previous</button>
                            <button type="button" class="btn btn-outline-secondary" id="next-page-btn">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>