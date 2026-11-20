<?php
defined('BASEPATH') or exit('No direct script access allowed');

$payload = is_array($dashboardPayload ?? null) ? $dashboardPayload : [];
// print_r($payload);
$period = $payload['period'] ?? [];
$overview = $payload['overview'] ?? [];
$attendance = $payload['attendance_summary'] ?? [];
// print_r($attendance);
$exceptions = $payload['exceptions'] ?? [];
$readiness = $payload['readiness'] ?? [];
$process = $payload['process_status'] ?? [];
$quickActions = $payload['quick_actions'] ?? [];
$proposedKpis = $payload['proposed_kpis'] ?? [];

$number = static function ($value) {
    return number_format((float) ($value ?? 0));
};
$decimal = static function ($value) {
    return number_format((float) ($value ?? 0), 1);
};
$currency = static function ($value) {
    return number_format((float) ($value ?? 0), 2);
};
$coverage = max(0, min(100, (int) ($process['coverage'] ?? 0)));
?>
<style>
    .dashboard-vbar-chart {
        display: flex;
        align-items: flex-end;
        height: 330px;
        padding: 20px 0px 10px;
        overflow-x: auto;
        overflow-y: hidden;
        border-top: 1px solid #f0f1f5;
    }

    .dashboard-vbar-col {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;

        min-width: 72px;
        height: 90%;

        flex-shrink: 0;
    }

    .dashboard-vbar-count {
        font-size: 13px;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 8px;
        min-height: 18px;

        transition: transform 0.25s ease;
    }

    .dashboard-vbar-track {
        position: relative;

        width: 38px;
        height: 190px;

        display: flex;
        align-items: flex-end;

        background: #f3f4f6;

        border-radius: 10px 10px 4px 4px;

        overflow: hidden;
    }

    .dashboard-vbar-fill {
        width: 100%;
        height: 0%;

        border-radius: 10px 10px 4px 4px;

        transition:
            height 0.7s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.25s ease,
            filter 0.25s ease;

        position: relative;
    }

    /* Highlight on top of bar */
    .dashboard-vbar-fill::before {
        content: "";

        position: absolute;

        top: 0;
        left: 0;
        right: 0;

        height: 3px;

        background: rgba(255, 255, 255, 0.65);
    }

    /* Hover */
    .dashboard-vbar-col:hover .dashboard-vbar-fill {
        filter: brightness(1.08);
        transform: scaleX(1.08);
    }

    .dashboard-vbar-col:hover .dashboard-vbar-count {
        transform: translateY(-2px);
    }

    .dashboard-vbar-label {
        margin-top: 10px;
        font-size: 10px;
        font-weight: 600;
        color: #6b7280;
        text-align: center;
        max-width: 90px;
        /* white-space: nowrap; */
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color 0.2s ease;
    }

    .dashboard-vbar-col:hover .dashboard-vbar-label {
        color: #111827;
    }

    /* Scrollbar */
    .dashboard-vbar-chart::-webkit-scrollbar {
        height: 6px;
    }

    .dashboard-vbar-chart::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 10px;
    }

    .dashboard-vbar-chart::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 10px;
    }

    .dashboard-vbar-chart::-webkit-scrollbar-thumb:hover {
        background: #9ca3af;
    }
</style>
<div class="dashboard-enhanced">
    <section class="de-hero">
        <div class="de-hero-content">
            <div class="de-eyebrow">Zamil Plastic Industries · Attendance & Payroll</div>
            <h4>Attendance & Payroll Overview</h4>
            <p>Live operational view of employee coverage, attendance processing, payroll readiness, overtime exposure and exceptions requiring action.</p>
            <div class="de-period">
                <i class="ti ti-calendar-event"></i>
                Payroll Period: <?= html_escape($period['from_label'] ?? '-') ?> – <?= html_escape($period['to_label'] ?? '-') ?>
                <span class="opacity-75">· Updated <?= html_escape($period['generated_at'] ?? '-') ?></span>
            </div>
        </div>
    </section>

    <div class="de-section-head">
        <div>
            <h2>Executive KPIs</h2>
            <p>Decision-grade figures calculated from the current payroll period.</p>
        </div>
        <span class="de-status-pill<?= $coverage < 95 ? ' warning' : '' ?>">
            <i class="ti ti-circle-check"></i><?= html_escape($process['status_text'] ?? 'Status unavailable') ?>
        </span>
    </div>

    <section class="de-kpi-grid">
        <article class="de-kpi" style="--de-accent:#0fa894">
            <div class="de-kpi-top">
                <p class="de-kpi-label">Payroll Readiness</p><span class="de-kpi-icon"><i class="ti ti-progress-check"></i></span>
            </div>
            <div class="de-kpi-value"><?= $coverage ?>%</div>
            <p class="de-kpi-note"><?= $number($process['processed_employees'] ?? 0) ?> of <?= $number($process['assigned_employees'] ?? 0) ?> assigned employees processed</p>
        </article>
        <article class="de-kpi" style="--de-accent:#173451">
            <div class="de-kpi-top">
                <p class="de-kpi-label">Total Employees</p><span class="de-kpi-icon"><i class="ti ti-users"></i></span>
            </div>
            <div class="de-kpi-value"><?= $number($overview['total_employees'] ?? 0) ?></div>
            <!-- <p class="de-kpi-note"><?= $number($readiness['employees_with_timetable'] ?? 0) ?> with active timetable</p> -->
        </article>
        <article class="de-kpi" style="--de-accent:#e15b4d">
            <div class="de-kpi-top">
                <p class="de-kpi-label">Missing Timetable</p><span class="de-kpi-icon"><i class="ti ti-calendar-exclamation"></i></span>
            </div>
            <div class="de-kpi-value"><?= $number($exceptions['missing_timetable_employees'] ?? 0) ?></div>
            <!-- <p class="de-kpi-note">Employees requiring shift assignment</p> -->
        </article>
        <article class="de-kpi" style="--de-accent:#e8a23d">
            <div class="de-kpi-top">
                <p class="de-kpi-label">Blank Punch Employees</p><span class="de-kpi-icon"><i class="ti ti-fingerprint-off"></i></span>
            </div>
            <div class="de-kpi-value"><?= $number($exceptions['blank_punch_employees'] ?? 0) ?></div>
        </article>
        <article class="de-kpi" style="--de-accent:#6c63c9">
            <div class="de-kpi-top">
                <p class="de-kpi-label">Overtime Hours</p><span class="de-kpi-icon"><i class="ti ti-clock-plus"></i></span>
            </div>
            <div class="de-kpi-value"><?= $decimal($attendance['overtime_hours'] ?? 0) ?></div>
            <p class="de-kpi-note"><?= $number($attendance['employees_with_overtime'] ?? 0) ?> employees with overtime</p>
        </article>

    </section>





    <section class="">
        <article class="de-card">
            <div class="de-card-head">
                <div>
                    <h3>Department Snapshot</h3>
                    <p>Employee headcount by department.</p>
                </div>
            </div>
            <div id="dashboardDepartmentVerticalBars" class="dashboard-vbar-chart"></div>
        </article>


    </section>


</div>

<script>
    window.dashboardPayload = <?= json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
</script>