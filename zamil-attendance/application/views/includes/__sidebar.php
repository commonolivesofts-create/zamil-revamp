<!-- SIDEBAR -->
<?php
$CI = &get_instance();
$activeLink = (string) ($CI->load->get_var('active-link') ?? '');
$currentPath = trim($CI->uri->uri_string(), '/');

$isActive = function ($keys, $paths = []) use ($activeLink, $currentPath) {
    foreach ((array) $keys as $key) {
        if ($activeLink !== '' && $activeLink === $key) {
            return ' active';
        }
    }

    foreach ((array) $paths as $path) {
        if ($currentPath === trim($path, '/')) {
            return ' active';
        }
    }

    return '';
};
?>
<aside id="sidebar" class="sidebar">
    <div class="logo-area">
        <a href="<?= base_url() ?>" class="d-inline-flex">
            <span class="logo-text ms-2"> <img src="<?= base_url() ?>assets/images/zamil-attendance-logo.png" alt="" style="width: 160px;"></span>
        </a>
    </div>
    <ul class="nav flex-column">

        <li class="px-4 py-2"><small class="nav-text">Main</small></li>

        <li>
            <a class="nav-link<?= $isActive(['home', 'dashboard'], ['', 'dashboard']) ?>" data-active-link="home" href="<?= base_url() ?>">
                <i class="ti ti-home"></i>
                <span class="nav-text">Dashboard</span>
            </a>
        </li>
        <li>
            <a class="nav-link<?= $isActive('manager', 'manager') ?>" data-active-link="manager" href="<?= base_url() ?>manager">
                <i class="ti ti-users"></i>
                <span class="nav-text">Manager View</span>
            </a>
        </li>
        <li>
            <a class="nav-link<?= $isActive('leave-requests', 'leave-requests') ?>" data-active-link="leave-requests" href="<?= base_url() ?>leave-requests">
                <i class="ti ti-calendar-event"></i>
                <span class="nav-text">Leave & Requests</span>
            </a>
        </li>
        <li>
            <a class="nav-link<?= $isActive('shifts', 'shifts') ?>" data-active-link="shifts" href="<?= base_url() ?>shifts">
                <i class="ti ti-clock-hour-4"></i>
                <span class="nav-text">Shifts</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('shift-details', 'shift-details') ?>" data-active-link="shift-details" href="<?= base_url() ?>shift-details">
                <i class="ti ti-calendar-week"></i>
                <span class="nav-text">Sub Shifts</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('timetable', 'timetable') ?>" data-active-link="timetable" href="<?= base_url() ?>timetable">
                <i class="ti ti-calendar-event"></i>
                <span class="nav-text">TimeTable</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('occasion', 'occasion') ?>" data-active-link="occasion" href="<?= base_url() ?>occasion">
                <i class="ti ti-gift"></i> <span class="nav-text">Occasion</span>
            </a>
        </li>

        <li class="px-4 py-2"><small class="nav-text">Reports</small></li>
        <li>
            <a class="nav-link<?= $isActive('daily-attendance', 'daily-attendance') ?>" data-active-link="daily-attendance" href="<?= base_url('daily-attendance') ?>">
                <i class="ti ti-calendar-time"></i>
                <span class="nav-text">Daily Attendance</span>
            </a>
        </li>
        <li>
            <a class="nav-link<?= $isActive('alerts-exceptions', 'alerts-exceptions') ?>" data-active-link="alerts-exceptions" href="<?= base_url('alerts-exceptions') ?>">
                <i class="ti ti-alert-triangle"></i>
                <span class="nav-text">Alerts & Exceptions</span>
            </a>
        </li>
        <li>
            <a class="nav-link<?= $isActive('employee_details', 'report/employee-details') ?>" data-active-link="employee_details" href="<?= base_url() ?>report/employee-details">
                <i class="ti ti-id-badge"></i>
                <span class="nav-text">Employee Details</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('absence_details', 'report/absence') ?>" data-active-link="absence_details" href="<?= base_url() ?>report/absence">
                <i class="ti ti-calendar-off"></i>
                <span class="nav-text">Absence</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('attendance_card', 'report/attendance-card') ?>" data-active-link="attendance_card" href="<?= base_url() ?>report/attendance-card">
                <i class="ti ti-id"></i>
                <span class="nav-text">Attendance Card</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('timesheet', 'report/timesheet') ?>" data-active-link="timesheet" href="<?= base_url() ?>report/timesheet">
                <i class="ti ti-file-time"></i>
                <span class="nav-text">Timesheet</span>
            </a>
        </li>

        <li>
            <a class="nav-link<?= $isActive('payroll_file', 'report/payroll-file') ?>" data-active-link="payroll_file" href="<?= base_url() ?>report/payroll-file">
                <i class="ti ti-file-dollar"></i>
                <span class="nav-text">Payroll File</span>
            </a>
        </li>
<li class="px-4 py-2"><small class="nav-text">Contractors</small></li>

<li>
    <a class="nav-link<?= $isActive('contractor', 'contractor') ?>" data-active-link="contractor" href="<?= base_url() ?>contractor">
        <i class="ti ti-building"></i>
        <span class="nav-text">Contractors</span>
    </a>
</li>

<li>
    <a class="nav-link<?= $isActive('con_employee', 'contractor/employees') ?>" data-active-link="con_employee" href="<?= base_url() ?>contractor/employees">
        <i class="ti ti-users"></i>
        <span class="nav-text">Contractor Employees</span>
    </a>
</li>

<li>
    <a class="nav-link<?= $isActive('contractor_summary', 'report/contractor-summary') ?>" data-active-link="contractor_summary" href="<?= base_url() ?>report/contractor-summary">
        <i class="ti ti-report-money"></i>
        <span class="nav-text">Contractor Summary</span>
    </a>
</li>
        <li class="px-4 pt-4 pb-2"><small class="nav-text">Interface & Jobs</small></li>

        <li>
            <a class="nav-link<?= $isActive('attendance_interface', 'interface') ?>" data-active-link="attendance_interface" href="<?= base_url('interface') ?>">
                <i class="ti ti-layout-dashboard"></i>
                <span class="nav-text">Attendance Interface</span>
            </a>
        </li>

        <li class="px-4 pt-4 pb-2"><small class="nav-text">Planning</small></li>

        <li>
            <a class="nav-link<?= $isActive('function_feature', 'function_feature') ?>" data-active-link="function_feature" href="<?= base_url() ?>function_feature">
                <i class="ti ti-bulb"></i>
                <span class="nav-text">Function & Feature</span>
            </a>
        </li>

       

    </ul>

</aside>