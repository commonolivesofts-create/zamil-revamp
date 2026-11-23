<?php

$period = isset($period) && is_array($period) ? $period : [];
$team = isset($team) && is_array($team) ? $team : [];
$employees = isset($team['employees']) && is_array($team['employees']) ? $team['employees'] : [];
$approvals = isset($team['approvals']) && is_array($team['approvals']) ? $team['approvals'] : [];
$summary = isset($team['summary']) && is_array($team['summary']) ? $team['summary'] : [];

$fmt = static function ($value) {
    return number_format((float) $value, 0, '.', ',');
};

$statusPillClass = static function ($key) {
    switch ($key) {
        case 'present':
            return 'mgr-pill-present';
        case 'late':
            return 'mgr-pill-late';
        case 'absent':
            return 'mgr-pill-absent';
        case 'leave':
            return 'mgr-pill-leave';
        case 'weekend':
            return 'mgr-pill-weekend';
        default:
            return 'mgr-pill-nodata';
    }
};
?>

<style>
    .manager-page .mgr-access-card {
        margin-top: 14px;
    }


    .role-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 15px;
        font-size: 11px;
        font-weight: 600;
    }


    .role-manager {
        background: #eee9ff;
        color: #4c35b8;
    }


    .role-head {
        background: #eee9ff;
        color: #4c35b8;
    }


    .role-hr {
        background: #fff3df;
        color: #b7791f;
    }


    .role-payroll {
        background: #fdeaea;
        color: #c53030;
    }


    .mgr-access-card table td {
        font-size: 12px;
        line-height: 18px;
    }

    .manager-page table.mgr-table tbody td {
        padding: 10px 8px;
        vertical-align: middle;
    }


    .manager-page .mgr-pill {
        padding: 4px 12px;
        font-size: 11px;
    }


    .mgr-pill-present {
        background: #e8f8f2;
        color: #087f5b;
    }


    .mgr-pill-late {
        background: #fff3df;
        color: #b7791f;
    }


    .mgr-pill-absent {
        background: #fdeaea;
        color: #c53030;
    }

    .manager-page {
        --mgr-line: #dbe5dc;
        --mgr-line-soft: #eaf1ea;
        --mgr-text: #0f172a;
        --mgr-muted: #667085;
        --mgr-primary: #16833f;
        --mgr-primary-soft: #eaf6ef;
    }

    .manager-page .mgr-card {
        border: 1px solid var(--mgr-line);
        border-radius: 8px;
        background: #fff;
    }

    .manager-page .mgr-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 4px 4px 14px;
    }

    .manager-page .mgr-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--mgr-text);
    }

    .manager-page .mgr-subtitle {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--mgr-muted);
    }

    .manager-page .mgr-dept-form {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .manager-page .mgr-dept-form select {
        min-width: 220px;
        height: 34px;
        border-radius: 7px;
        border: 1px solid var(--mgr-line);
        font-size: 12.5px;
        padding: 0 10px;
    }

    .manager-page .mgr-tiles {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
    }

    .manager-page .mgr-tile {
        padding: 12px 14px;
    }

    .manager-page .mgr-tile-label {
        margin: 0 0 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--mgr-muted);
        text-transform: uppercase;
        letter-spacing: .3px;
    }

    .manager-page .mgr-tile-value {
        font-size: 22px;
        font-weight: 700;
        color: var(--mgr-text);
    }

    .manager-page .mgr-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 14px;
    }

    .manager-page .mgr-section-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: var(--mgr-text);
    }

    .manager-page .mgr-section-subtitle {
        margin: 2px 0 0;
        font-size: 11px;
        color: var(--mgr-muted);
    }

    .manager-page .mgr-grid2 {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 12px;
        align-items: flex-start;
    }

    .manager-page table.mgr-table {
        width: 100%;
        border-collapse: collapse;
    }

    .manager-page table.mgr-table thead th {
        color: #475467;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .25px;
        text-transform: uppercase;
        padding: 6px 8px;
        border-bottom: 1px solid var(--mgr-line-soft);
        text-align: left;
        white-space: nowrap;
    }

    .manager-page table.mgr-table tbody td {
        font-size: 12.5px;
        color: #344054;
        padding: 7px 8px;
        border-bottom: 1px solid #eff3f8;
        vertical-align: middle;
    }

    .manager-page .mgr-pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid transparent;
        white-space: nowrap;
    }

    .manager-page .mgr-pill-present {
        background: #eafaf0;
        color: #027a48;
        border-color: #86efac;
    }

    .manager-page .mgr-pill-late {
        background: #fff8eb;
        color: #b45309;
        border-color: #fcd34d;
    }

    .manager-page .mgr-pill-absent {
        background: #fef3f2;
        color: #b42318;
        border-color: #fca5a5;
    }

    .manager-page .mgr-pill-leave {
        background: #eef4ff;
        color: #2d4ee0;
        border-color: #c7d7fe;
    }

    .manager-page .mgr-pill-weekend {
        background: #f3f4f6;
        color: #4b5563;
        border-color: #d1d5db;
    }

    .manager-page .mgr-pill-nodata {
        background: #f3f4f6;
        color: #667085;
        border-color: #d1d5db;
    }

    .manager-page .mgr-approval-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--mgr-line-soft);
    }

    .manager-page .mgr-approval-row:last-child {
        border-bottom: 0;
    }

    .manager-page .mgr-approval-t1 {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--mgr-text);
    }

    .manager-page .mgr-approval-t2 {
        font-size: 11px;
        color: var(--mgr-muted);
        margin-top: 2px;
    }

    .manager-page .mgr-approval-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
    }

    .manager-page .mgr-btn {
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        padding: 5px 11px;
        border: 1px solid var(--mgr-line);
        background: #fff;
        color: #344054;
        cursor: pointer;
    }

    .manager-page .mgr-btn-approve {
        background: var(--mgr-primary);
        border-color: var(--mgr-primary);
        color: #fff;
    }

    .manager-page .mgr-btn-deny {
        background: #fff;
        border-color: #fca5a5;
        color: #b42318;
    }

    .manager-page .mgr-empty {
        padding: 18px 14px;
        font-size: 12.5px;
        color: var(--mgr-muted);
        text-align: center;
    }

    @media (max-width: 991.98px) {
        .manager-page .mgr-tiles {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .manager-page .mgr-grid2 {
            grid-template-columns: 1fr;
        }
    }

    .manager-page .mgr-approval-status {
        min-width: 90px;
        text-align: right;
        font-weight: 600;
        font-size: 13px;
    }

    .manager-page .mgr-status-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
        white-space: nowrap;
        min-width: 80px;
        text-align: center;
    }

    /* Pending */
    .manager-page .mgr-status-badge.pending {
        background: #FEF3C7;
        color: #B45309;
    }



    /* Rejected */
    .manager-page .mgr-status-badge.denied {
        background: #FEE2E2;
        color: #B91C1C;
    }

  
</style>

<div class="container-fluid manager-page">
    <div class="mgr-topbar">
        
        <div>
            <h1 class="mgr-title">Manager View</h1>
            <p class="mgr-subtitle">

                Payroll period <?= html_escape($period['from_label'] ?? '') ?> &ndash; <?= html_escape($period['to_label'] ?? '') ?>
                &middot; Today: <?= html_escape($period['today_label'] ?? '') ?>
            </p>
        </div>

    </div>

    <div class="mgr-tiles">
        <div class="mgr-card mgr-tile">
            <p class="mgr-tile-label">Team Size</p>
            <div class="mgr-tile-value"><?= $fmt($summary['team_size'] ?? 0) ?></div>
        </div>
        <div class="mgr-card mgr-tile">
            <p class="mgr-tile-label">Present Today</p>
            <div class="mgr-tile-value"><?= $fmt($summary['present_today'] ?? 0) ?></div>
        </div>
        <div class="mgr-card mgr-tile">
            <p class="mgr-tile-label">Late Today</p>
            <div class="mgr-tile-value"><?= $fmt($summary['late_today'] ?? 0) ?></div>
        </div>
        <div class="mgr-card mgr-tile">
            <p class="mgr-tile-label">Absent Today</p>
            <div class="mgr-tile-value"><?= $fmt($summary['absent_today'] ?? 0) ?></div>
        </div>
        <div class="mgr-card mgr-tile">
            <p class="mgr-tile-label">Pending Approvals</p>
            <div class="mgr-tile-value"><?= $fmt($summary['pending_approvals'] ?? 0) ?></div>
        </div>
    </div>

    <div class="mgr-grid2">
        <div class="mgr-card">
            <div class="mgr-section-head">
                <div>
                    <h2 class="mgr-section-title">My Team</h2>
                    <p class="mgr-section-subtitle">Today's status and this period's rollups, pulled from Timesheet.</p>
                </div>
            </div>

            <?php if (empty($employees)) : ?>
                <div class="mgr-empty">No employees found for this department.</div>
            <?php else : ?>
                <div class="table-responsive">
                    <table class="mgr-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Today</th>
                                <th>This Period</th>
                                <th>Pending</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($employees as $emp) : ?>
                                <tr>
                                    <td>
                                        <div style="display:flex;align-items:center;gap:10px;">

                                            <?php
                                            $name = trim($emp['full_name'] ?? '');

                                            $initials = '';

                                            foreach (explode(' ', $name) as $part) {

                                                if ($part != '') {
                                                    $initials .= strtoupper(substr($part, 0, 1));
                                                }
                                            }

                                            $initials = substr($initials, 0, 2);
                                            ?>

                                            <div style="
                                                width:30px;
                                                height:30px;
                                                border-radius:50%;
                                                background:#19395b;
                                                color:white;
                                                display:flex;
                                                align-items:center;
                                                justify-content:center;
                                                font-size:11px;
                                                font-weight:700;">
                                                <?= html_escape($initials) ?>
                                            </div>


                                            <span>
                                                <?= html_escape($name) ?>
                                            </span>

                                        </div>
                                    </td> <!-- <td><?= html_escape($emp['job_title'] ?: '-') ?></td> -->
                                    <td>
                                        <span class="mgr-pill <?= $statusPillClass($emp['today_status']['key']) ?>">
                                            <?= html_escape($emp['today_status']['label']) ?>
                                        </span>
                                    </td>
                                    <td>
                                        <?php

                                        $absence = (int)($emp['period_absence_days'] ?? 0);
                                        $late = (int)($emp['period_late_days'] ?? 0);
                                        $ot = $emp['period_overtime_hours'] ?? 0;


                                        if ($absence > 0) {

                                            echo $fmt($absence) . ' ' .
                                                ($absence == 1 ? 'absence' : 'absences');
                                        } elseif ($late > 0) {

                                            echo $fmt($late) . ' late days';
                                        } elseif ((float)$ot > 0) {

                                            echo html_escape($ot) . ' OT hrs';
                                        } else {

                                            echo '0';
                                        }

                                        ?>
                                    </td>
                                    <td>
                                        <?php if ((int) $emp['pending_count'] > 0) : ?>
                                            <span class="mgr-pill mgr-pill-late"><?= $fmt($emp['pending_count']) ?> pending</span>
                                        <?php else : ?>
                                            &mdash;
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </div>

        <div class="mgr-card">


            <div class="mgr-section-head">
                <div>
                    <h2 class="mgr-section-title">
                        Approval Queue
                    </h2>

                    <p class="mgr-section-subtitle">
                        Pending leave requests submitted by your team members.
                    </p>
                </div>

            </div>
            <div id="mgrApprovalsList">
                <?php if (empty($approvals)): ?>
                    <div class="mgr-empty">
                        No pending requests for this team.
                    </div>
                <?php else: ?>
                    <?php foreach ($approvals as $approval):

                        $empNo = trim((string)($approval['EMP_NO'] ?? ''));

                        $empName = trim((string)($approval['FULL_NAME'] ?? ''));

                        $leaveType = trim((string)($approval['LEAVE_TYPE'] ?? ''));

                        $startDate = trim((string)($approval['LEAVE_START_DATE'] ?? ''));

                        $endDate = trim((string)($approval['LEAVE_END_DATE'] ?? ''));

                        $totalDays = trim((string)($approval['TOTAL_DAYS'] ?? ''));

                        $approvalStatus = trim((string)($approval['APPROVAL_STATUS'] ?? ''));

                        $rowId = 'mgr-approval-' . md5($empNo . '|' . $startDate . '|' . $endDate);
                    ?>

                        <div class="mgr-approval-row" id="<?= $rowId ?>">
                            <div>
                                <div class="mgr-approval-t1">
                                    <?= html_escape($empName != '' ? $empName : $empNo) ?> -
                                    <?= html_escape($leaveType != '' ? $leaveType : 'Leave') ?>
                                </div>

                                <div class="mgr-approval-t2">
                                    <?= html_escape($startDate) ?> to <?= html_escape($endDate) ?>

                                    <?php if ($totalDays != ''): ?>
                                        &nbsp; | &nbsp;<?= html_escape($totalDays) ?> day(s)
                                    <?php endif; ?>
                                </div>
                            </div>

                            <span class="mgr-status-badge <?= strtolower($approvalStatus) ?>">
                                <?= html_escape($approvalStatus) ?>
                            </span>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <div class="mgr-card mgr-access-card">

        <div class="mgr-section-head">
            <div>
                <h2 class="mgr-section-title">Access Model</h2>
                <p class="mgr-section-subtitle">
                    How the scoping would work against the existing Employee Details table
                </p>
            </div>
        </div>


        <div class="table-responsive">

            <table class="mgr-table">

                <thead>
                    <tr>
                        <th>Role</th>
                        <th>Sees</th>
                        <th>Can Do</th>
                    </tr>
                </thead>


                <tbody>

                    <tr>
                        <td>
                            <span class="role-pill role-manager">
                                Line Manager
                            </span>
                        </td>

                        <td>
                            Own department / direct reports
                            (via existing "Department" field)
                        </td>

                        <td>
                            Approve leave & OT, view timesheet,
                            flag exceptions
                        </td>
                    </tr>


                    <tr>
                        <td>
                            <span class="role-pill role-head">
                                Department Head
                            </span>
                        </td>

                        <td>
                            All employees under their department tree
                        </td>

                        <td>
                            Above + reassign shifts,
                            view payroll summary (no salary detail)
                        </td>
                    </tr>


                    <tr>
                        <td>
                            <span class="role-pill role-hr">
                                HR Officer
                            </span>
                        </td>

                        <td>
                            All employees
                        </td>

                        <td>
                            Full attendance admin,
                            no payroll amount edit
                        </td>
                    </tr>


                    <tr>
                        <td>
                            <span class="role-pill role-payroll">
                                Payroll Admin
                            </span>
                        </td>

                        <td>
                            All employees
                        </td>

                        <td>
                            Full access incl.
                            Payroll File export to Oracle Fusion
                        </td>
                    </tr>


                </tbody>

            </table>

        </div>

    </div>