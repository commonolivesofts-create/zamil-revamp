<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Function_feature extends MY_Controller
{
    public function index()
    {
        $featureGroups = $this->getFeatureGroups();
        $summary = ['total' => 0, 'existing' => 0, 'new' => 0, 'high' => 0];

        foreach ($featureGroups as $group) {
            foreach ($group['features'] as $feature) {
                $summary['total']++;
                $summary[$feature['status'] === 'existing' ? 'existing' : 'new']++;
                if ($feature['priority'] === 'high') {
                    $summary['high']++;
                }
            }
        }

        $this->load->view('layout', [
            'view'        => 'pages/function_feature/index',
            'title' => 'Zamil Attendance - Functions and Features',
            'heading' => '',
            'active-link' => 'function_feature',
            'css' => [''],
            'scripts' => ['assets/js/pages/function_feature/index.js'],
            'data' => [
                'featureGroups' => $featureGroups,
                'summary' => $summary,
            ],
        ]);
    }

    private function getFeatureGroups()
    {
        return [
            [
                'key' => 'overview',
                'title' => 'Overview & Monitoring',
                'description' => 'Executive visibility and daily operational monitoring.',
                'icon' => 'ti ti-layout-dashboard',
                'features' => [
                    ['title' => 'Executive Dashboard', 'description' => 'Payroll readiness, employee count, missing timetable, blank punches, overtime and AWI indicators.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Gives HR and management one clear operational overview.'],
                    ['title' => 'Tier 2 Proposed KPIs', 'description' => 'Estimated overtime cost, late arrivals today, uncovered shifts, pending approvals, expiring documents and compliance score.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Adds management-level decision and cost indicators.'],
                    ['title' => 'Daily Attendance', 'description' => 'Live roster showing present, late, missing punch and not checked-in employees from the EBS attendance source.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Helps HR and supervisors act on attendance issues during the same day.'],
                    ['title' => 'Manager Team View', 'description' => 'Managers see only their department or direct reports, including attendance, overtime and pending actions.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Moves attendance ownership closer to line managers.'],
                ],
            ],
            [
                'key' => 'setup',
                'title' => 'Setup & Configuration',
                'description' => 'Master data and rules required for correct attendance processing.',
                'icon' => 'ti ti-settings',
                'features' => [
                    ['title' => 'Shift List', 'description' => 'Maintain shift names, validity dates, start time, end time and active status.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Defines the main attendance schedule structure.'],
                    ['title' => 'Sub Shifts', 'description' => 'Maintain weekday-specific check-in and check-out timing for each shift.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Supports different timings across the week.'],
                    ['title' => 'Employee Timetable', 'description' => 'Assign employees to shifts with start date, end date and overtime eligibility.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Connects each employee with the correct working schedule.'],
                    ['title' => 'Occasion & Holiday Calendar', 'description' => 'Maintain holidays, occasions and the shifts covered by each occasion.', 'status' => 'existing', 'priority' => 'medium', 'benefit' => 'Prevents holidays from being counted as absences.'],
                    ['title' => 'Employee Details', 'description' => 'Maintain employee number, name, department, position and reporting information.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Provides employee master information used throughout the system.'],
                    ['title' => 'Document Expiry Setup', 'description' => 'Track Iqama, medical, licence and other employee document expiry dates.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Warns HR before documents expire and affect eligibility.'],
                ],
            ],
            [
                'key' => 'processing',
                'title' => 'Attendance Processing',
                'description' => 'Import, calculate and validate attendance data.',
                'icon' => 'ti ti-arrows-exchange',
                'features' => [
                    ['title' => 'Attendance Interface', 'description' => 'Generate attendance and upload attendance files from approved biometric exports.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Provides the main data-loading entry point.'],
                    ['title' => 'EBS Live Attendance Integration', 'description' => 'Read daily punches from Oracle EBS .', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Shows live attendance directly from the source system.'],
                    ['title' => 'Attendance Card', 'description' => 'Review employee punch-in and punch-out records by date and employee.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Provides the detailed raw attendance record.'],
                    ['title' => 'Timesheet Calculation', 'description' => 'Calculate total time, early minutes, late minutes, overtime and absence.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Converts punch data into payroll-ready attendance values.'],
                    ['title' => 'Automatic Nightly Processing', 'description' => 'Run device sync, attendance generation and timesheet calculation on a schedule.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Reduces manual processing and missed payroll steps.'],
                    ['title' => 'Biometric Device Health', 'description' => 'Show last sync time, connection status and recent device errors for each attendance device.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Detects device problems before attendance data is lost.'],
                ],
            ],
            [
                'key' => 'exceptions',
                'title' => 'Alerts & Exceptions',
                'description' => 'Detect and prioritize attendance problems requiring action.',
                'icon' => 'ti ti-alert-triangle',
                'features' => [
                    ['title' => 'Missing Punch Detection', 'description' => 'Identify rows where punch-in or punch-out is missing.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Prevents incorrect working-hour and overtime calculations.'],
                    ['title' => 'Same Punch Detection', 'description' => 'Identify rows where punch-in and punch-out are the same.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Flags likely biometric or source-data errors.'],
                    ['title' => 'High Overtime Alerts', 'description' => 'Flag employees whose overtime exceeds a configurable threshold.', 'status' => 'existing', 'priority' => 'medium', 'benefit' => 'Controls overtime exposure and unusual payroll cost.'],
                    ['title' => 'Missing Timetable Alert', 'description' => 'Identify active employees without a valid timetable assignment.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Prevents employees from being skipped during attendance generation.'],
                    ['title' => 'Exception Assignment & Resolution', 'description' => 'Assign an exception to HR, payroll, IT or a manager and record resolution notes.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Turns exception counts into a controlled work queue.'],
                ],
            ],
            [
                'key' => 'leave',
                'title' => 'Leave & Employee Services',
                'description' => 'Employee and manager workflows around attendance.',
                'icon' => 'ti ti-user-check',
                'features' => [
                    ['title' => 'Leave Requests', 'description' => 'Employees submit annual, sick, emergency and other leave requests.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Classifies absences before payroll processing.'],
                    ['title' => 'Manager Approval Workflow', 'description' => 'Managers approve or reject leave, overtime and attendance corrections.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Creates clear responsibility and approval history.'],
                    ['title' => 'Employee Self-Service', 'description' => 'Employees view attendance, report missing punches, request leave and download timesheets.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Reduces manual HR queries and improves transparency.'],
                    ['title' => 'Shift Swap Requests', 'description' => 'Employees request shift swaps subject to manager approval.', 'status' => 'new', 'priority' => 'low', 'benefit' => 'Provides controlled flexibility without manual timetable changes.'],
                    ['title' => 'Mobile or Geofenced Punch', 'description' => 'Allow approved field employees to record attendance from authorised locations.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Supports drivers and field roles away from biometric gates.'],
                ],
            ],
            [
                'key' => 'payroll',
                'title' => 'Payroll & Integration',
                'description' => 'Payroll preparation, validation and external integration.',
                'icon' => 'ti ti-cash',
                'features' => [
                    ['title' => 'Payroll File', 'description' => 'Prepare payroll-ready totals for late, early, overtime and absence values.', 'status' => 'existing', 'priority' => 'high', 'benefit' => 'Produces the final attendance output required for payroll.'],
                    ['title' => 'Payroll Readiness Gate', 'description' => 'Block payroll export until critical attendance exceptions are cleared.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Prevents incomplete or inaccurate payroll submission.'],
                    ['title' => 'Oracle Fusion Push', 'description' => 'Send the approved payroll attendance file directly to Oracle Fusion.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Removes manual CSV transfer and reduces upload errors.'],
                    ['title' => 'What-if Payroll Preview', 'description' => 'Estimate cost impact before approving overtime, leave or corrections.', 'status' => 'new', 'priority' => 'low', 'benefit' => 'Helps managers understand payroll impact before approval.'],
                    ['title' => 'Payroll Variance Report', 'description' => 'Compare current payroll attendance values with the previous period.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Highlights unusual changes before payroll submission.'],
                ],
            ],
            [
                'key' => 'reports',
                'title' => 'Reports, Audit & Security',
                'description' => 'Reporting, accountability, access control and compliance.',
                'icon' => 'ti ti-chart-bar',
                'features' => [
                    ['title' => 'Reports & Analytics', 'description' => 'Absenteeism, overtime, lateness, timetable coverage and department performance reports.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Supports HR, finance and operations analysis.'],
                    ['title' => 'Audit Trail', 'description' => 'Record who changed shifts, timetables, absences, payroll values and approvals.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Provides a defensible history for payroll-related changes.'],
                    ['title' => 'Role-based Access', 'description' => 'Separate permissions for employee, manager, HR officer, payroll admin and system admin.', 'status' => 'new', 'priority' => 'high', 'benefit' => 'Limits sensitive data and actions to authorised users.'],
                    ['title' => 'Notification Routing', 'description' => 'Send missed-punch, late, approval and payroll-readiness notifications by user role.', 'status' => 'new', 'priority' => 'medium', 'benefit' => 'Makes sure the correct person receives each action item.']                ],
            ],
        ];
    }
}
