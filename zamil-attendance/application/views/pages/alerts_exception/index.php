<?php
$filters = is_array($filters ?? null)
    ? $filters
    : [];

$summary = is_array($summary ?? null)
    ? $summary
    : [];

$rows = is_array($rows ?? null)
    ? $rows
    : [];



$e = static function ($value) {
    return htmlspecialchars(
        (string) ($value ?? ''),
        ENT_QUOTES,
        'UTF-8'
    );
};

$n = static function ($value) {
    return number_format(
        (float) ($value ?? 0)
    );
};

$query = http_build_query(
    array_filter(
        $filters,
        static function ($value) {
            return $value !== '';
        }
    )
);
?>

<div
    class="ae-page"
    data-page-url="<?= base_url('alerts-exceptions') ?>">
    <section class="ae-hero">
        <div>
            <span class="ae-eyebrow">
                Attendance control centre
            </span>

            <h1>
                Alerts &amp; Exceptions
            </h1>

            <p>
                Review attendance setup and processing problems
                requiring HR, payroll or attendance-team action.
            </p>
        </div>

        <div class="ae-hero-actions">
            <span id="ae-generated-at">
                <i class="ti ti-refresh"></i>

                Generated
                <?= $e($generatedAt ?? '') ?>
            </span>

            <a
                id="ae-export-link"
                class="btn ae-btn-light"
                href="<?= base_url(
                            'alerts-exceptions/export?' .
                                $query
                        ) ?>">
                <i class="ti ti-file-download"></i>
                Export CSV
            </a>
        </div>
    </section>

    <form
        id="ae-filter-form"
        class="ae-filter-card"
        method="get"
        action="<?= base_url('alerts-exceptions') ?>">
        <div class="ae-field">
            <label>From Date</label>

            <input
                type="date"
                name="from_date"
                value="<?= $e(
                            $filters['from_date'] ?? ''
                        ) ?>">
        </div>

        <div class="ae-field">
            <label>To Date</label>

            <input
                type="date"
                name="to_date"
                value="<?= $e(
                            $filters['to_date'] ?? ''
                        ) ?>">
        </div>

        <div class="ae-field">
            <label>Exception Type</label>

            <select name="type">
                <option value="">
                    All Types
                </option>

                <?php
                $types = [
                    'missing_punch' =>
                    'Missing Punch',

                    'same_punch' =>
                    'Same Punch',

                    'missing_shift' =>
                    'Missing Shift',

                    'missing_occasion' =>
                    'Missing Occasion',

                    'high_overtime' =>
                    'High Overtime',

                    'missing_timetable' =>
                    'Missing Timetable'
                ];
                ?>

                <?php foreach (
                    $types as $value => $label
                ): ?>
                    <option
                        value="<?= $e($value) ?>"
                        <?= (
                            $filters['type'] ?? ''
                        ) === $value
                            ? 'selected'
                            : '' ?>>
                        <?= $e($label) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>

        <div class="ae-field">
            <label>Severity</label>

            <select name="severity">
                <option value="">
                    All Severities
                </option>

                <?php foreach (
                    [
                        'high' => 'High',
                        'medium' => 'Medium',
                        'low' => 'Low'
                    ] as $value => $label
                ): ?>
                    <option
                        value="<?= $e($value) ?>"
                        <?= (
                            $filters['severity'] ?? ''
                        ) === $value
                            ? 'selected'
                            : '' ?>>
                        <?= $e($label) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>

      

        <div class="ae-filter-actions">
            <button
                class="btn ae-btn-primary btn-sm"
                type="submit">
                <i class="ti ti-filter"></i>
                Apply
            </button>

            <button
                class="btn ae-btn-reset btn-sm"
                type="button"
                id="ae-reset">
                <i class="ti ti-refresh"></i>
                Reset
            </button>
        </div>
    </form>

    <section class="ae-kpi-grid">
        <article class="ae-kpi ae-kpi-dark">
            <small>Total Exceptions</small>

            <strong data-summary="total">
                <?= $n($summary['total'] ?? 0) ?>
            </strong>

            <p>All detected issues</p>
        </article>

        <article class="ae-kpi ae-kpi-red">
            <small>High Severity</small>

            <strong data-summary="high">
                <?= $n($summary['high'] ?? 0) ?>
            </strong>

            <p>Immediate action required</p>
        </article>

        <article class="ae-kpi ae-kpi-amber">
            <small>Missing Punch</small>

            <strong data-summary="missing_punch">
                <?= $n(
                    $summary['missing_punch'] ?? 0
                ) ?>
            </strong>

            <p>Only one punch available</p>
        </article>

        <article class="ae-kpi ae-kpi-purple">
            <small>Same Punch</small>

            <strong data-summary="same_punch">
                <?= $n(
                    $summary['same_punch'] ?? 0
                ) ?>
            </strong>

            <p>In and out times match</p>
        </article>

        <article class="ae-kpi ae-kpi-blue">
            <small>Missing Shift</small>

            <strong data-summary="missing_shift">
                <?= $n(
                    $summary['missing_shift'] ?? 0
                ) ?>
            </strong>

            <p>Attendance has no shift</p>
        </article>

        <article class="ae-kpi ae-kpi-cyan">
            <small>Missing Occasion</small>

            <strong data-summary="missing_occasion">
                <?= $n(
                    $summary['missing_occasion'] ?? 0
                ) ?>
            </strong>

            <p>No active occasion found</p>
        </article>

        <article class="ae-kpi ae-kpi-dark">
            <small>Missing Timetable</small>

            <strong data-summary="missing_timetable">
                <?= $n(
                    $summary['missing_timetable'] ?? 0
                ) ?>
            </strong>

            <p>No active assignment</p>
        </article>
    </section>

    <div id="ae-results">
        <?php
        $this->load->view(
            'pages/alerts_exception/_results',
            [
                'rows' => $rows,
                'filters' => $filters,
                'currentPage' =>
                $currentPage ?? 1,
                'limit' =>
                $limit ?? 15
            ]
        );
        ?>
    </div>

    <div class="shift-pagination-wrap mt-2">
        <?= renderPaginate(
            'current-page',
            'total-pages',
            'page-of-pages',
            'range-of-records'
        ) ?>
    </div>
</div>