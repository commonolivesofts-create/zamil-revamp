<?php
$filters = is_array($filters ?? null) ? $filters : [];
$summary = is_array($summary ?? null) ? $summary : [];
$rows = is_array($rows ?? null) ? $rows : [];
$departmentOptions = is_array($departmentOptions ?? null) ? $departmentOptions : [];
$shiftOptions = is_array($shiftOptions ?? null) ? $shiftOptions : [];

$e = static fn($value) => htmlspecialchars((string) ($value ?? ''), ENT_QUOTES, 'UTF-8');
$n = static fn($value) => number_format((float) ($value ?? 0));
$statusClass = static function ($status) {
    $classes = [
        'On Time' => 'da-status-success',
        'Late' => 'da-status-warning',
        'Not Checked In' => 'da-status-danger',
        'Missing Punch' => 'da-status-danger',
        'Approved Leave' => 'da-status-info',
        'Weekend / Off-day' => 'da-status-secondary',
        'Occasion / Holiday' => 'da-status-primary',
        'Absent' => 'da-status-danger',
    ];

    return $classes[$status] ?? 'da-status-secondary';
};
$query = http_build_query(array_filter($filters, static fn($value) => $value !== ''));
?>
<div class="daily-attendance-page">
    <section class="da-hero">
        <div>
            <span class="da-eyebrow">Live workforce monitoring</span>
            <h3>Daily Attendance</h3>
            <p>See who is present, late, missing a punch, absent, or on approved leave for the selected day.</p>
        </div>
        <div class="da-hero-actions">

            <span class="da-refresh">
                <i class="ti ti-refresh"></i>
                Generated <span id="generated-at">--</span>
            </span>

            <a id="export-csv"
                class="btn da-btn-light"
                href="#">
                <i class="ti ti-file-download"></i>
                Export CSV
            </a>

        </div>
    </section>

    <form id="attendance-filter-form" class="da-filter-card">

        <div class="da-field">
            <label for="da-from-date">From Date</label>
            <input id="da-from-date" type="date" name="from_date">
        </div>

        <div class="da-field">
            <label for="da-to-date">To Date</label>
            <input id="da-to-date" type="date" name="to_date">
        </div>

        <div class="da-field da-search-field">
            <label for="da-search">Employee Search</label>
            <input
                id="da-search"
                type="search"
                name="search"
                placeholder="Number or employee name">
        </div>

        <div class="da-filter-actions">
            <button class="btn da-btn-primary btn-sm" type="submit">
                <i class="ti ti-filter"></i> Apply
            </button>

            <button
                type="button"
                id="btn-reset"
                class="btn da-btn-reset btn-sm">
                <i class="ti ti-refresh"></i> Reset
            </button>
        </div>

    </form>

    <section class="da-kpi-grid">
        <article class="da-kpi da-kpi-blue">
            <span class="da-kpi-icon"><i class="ti ti-users"></i></span>
            <div>
                <small>Scheduled Employees</small>
                <strong id="scheduled-employees">0</strong>
                <p>Employees in the daily timesheet</p>
            </div>
        </article>


        <article class="da-kpi da-kpi-green">
            <span class="da-kpi-icon"><i class="ti ti-user-check"></i></span>
            <div>
                <small>Checked In</small>
                <strong id="checked-in">0</strong>
                <p>
                    <span id="on-time">0</span> arrived on time
                </p>
            </div>
        </article>


        <article class="da-kpi da-kpi-amber">
            <span class="da-kpi-icon"><i class="ti ti-clock-exclamation"></i></span>
            <div>
                <small>Late Arrivals</small>
                <strong id="late-arrivals">0</strong>
                <p>
                    <span id="late-minutes">0</span> total late minutes
                </p>
            </div>
        </article>


        <article class="da-kpi da-kpi-red">
            <span class="da-kpi-icon"><i class="ti ti-user-x"></i></span>
            <div>
                <small>Not Checked In</small>
                <strong id="not-checked-in">0</strong>
                <p>
                    <span id="absent-count">0</span> marked absent
                </p>
            </div>
        </article>


        <article class="da-kpi da-kpi-purple">
            <span class="da-kpi-icon"><i class="ti ti-fingerprint-off"></i></span>
            <div>
                <small>Missing Punch</small>
                <strong id="missing-punch">0</strong>
                <p>Only one punch is available</p>
            </div>
        </article>


        <article class="da-kpi da-kpi-cyan">
            <span class="da-kpi-icon"><i class="ti ti-beach"></i></span>
            <div>
                <small>Approved Leave</small>
                <strong id="approved-leave">0</strong>
                <p>
                    <span id="off-day-count">0</span> off-day or holiday
                </p>
            </div>
        </article>
    </section>

    <section class="da-table-card">
        <header class="da-table-head">
            <div>
                <h2>Daily Employee Roster</h2>
            </div>
            <div class="da-legend"><span><i class="da-dot da-dot-red"></i> Action required</span><span><i class="da-dot da-dot-amber"></i> Late</span><span><i class="da-dot da-dot-green"></i> Good</span></div>
        </header>
        <div class="da-table-scroll">
            <table class="da-table">

                <thead>
                    <tr>
                        <th>#</th>
                        <th>Employee Code</th>
                        <th>Employee Name</th>
                        <th>Attendance Date</th>
                        <th>Clock In</th>
                        <th>Clock Out</th>
                        <th>Work Hours</th>
                    </tr>
                </thead>


                <tbody id="attendance-table-body">

                </tbody>

            </table>
        </div>

    </section>
    <div class="shift-pagination-wrap mt-2">
        <?= renderPaginate('current-page', 'total-pages', 'page-of-pages', 'range-of-records') ?>
    </div>
</div>

<script>
    const BASE_URL = "<?= base_url(); ?>";
</script>

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>