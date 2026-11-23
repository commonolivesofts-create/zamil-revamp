<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Dashboard_model extends CI_Model
{
    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    private function normalize_emp_no($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return '';
        }

        // If employee number is numeric, remove leading zeros
        if (ctype_digit($value)) {
            return (string) ((int) $value);
        }

        return strtoupper($value);
    }
    public function get_dashboard_payload()
    {
        $period = $this->build_current_payroll_period();
        $fromDate = $period['from_date'];
        $toDate = $period['to_date'];

        $timesheetRows = $this->get_timesheet_rows($fromDate, $toDate);
        $occasionRows = $this->get_active_occasions($fromDate, $toDate);
        $occasionDateMap = $this->build_occasion_date_map($occasionRows);
        $employeeDepartmentMap = $this->get_employee_department_map();

        $overview = $this->get_overview_cards($fromDate, $toDate);
        $attendanceSummary = $this->build_attendance_summary($timesheetRows, $occasionDateMap);

        $dailyTrend = $this->build_daily_trend($timesheetRows, $occasionDateMap, $fromDate, $toDate);
        $departmentSummary = $this->build_department_summary($timesheetRows, $employeeDepartmentMap, $occasionDateMap);
        $departmentEmployeeList = $this->build_department_employee_list($employeeDepartmentMap);
        $exceptions = $this->get_exception_summary($fromDate, $toDate, $timesheetRows, $occasionDateMap);
        $readiness = $this->get_readiness_summary($fromDate, $toDate, $overview, $exceptions);
        $proposedKpis = $this->get_proposed_kpis(
            $fromDate,
            $toDate,
            $attendanceSummary,
            $overview,
            $exceptions,
            $readiness
        );
        $processStatus = $this->build_process_status($overview, $readiness, $timesheetRows, $fromDate, $toDate);
        $quickActions = $this->get_quick_actions();

        return [
            'period' => $period,
            'overview' => $overview,
            'attendance_summary' => $attendanceSummary,
            'process_status' => $processStatus,
            'daily_trend' => $dailyTrend,
            'department_summary' => $departmentSummary,
            'department_employee_list' => $departmentEmployeeList,
            'exceptions' => $exceptions,
            'current_occasions' => $occasionRows,
            'readiness' => $readiness,
            'proposed_kpis' => $proposedKpis,
            'quick_actions' => $quickActions,
        ];
    }
    // private function build_current_payroll_period()
    // {
    //     $today = new DateTime('today');

    //     $day = (int) $today->format('d');

    //     if ($day >= 21) {

    //         // Current payroll period:
    //         // 21st of current month -> 20th of next month
    //         $start = new DateTime($today->format('Y-m-21'));

    //         $end = new DateTime($today->format('Y-m-01'));
    //         $end->modify('+1 month');
    //         $end->setDate(
    //             (int) $end->format('Y'),
    //             (int) $end->format('m'),
    //             20
    //         );
    //     } else {

    //         // Current payroll period:
    //         // 21st of previous month -> 20th of current month
    //         $start = new DateTime($today->format('Y-m-01'));
    //         $start->modify('-1 month');
    //         $start->setDate(
    //             (int) $start->format('Y'),
    //             (int) $start->format('m'),
    //             21
    //         );

    //         $end = new DateTime($today->format('Y-m-20'));
    //     }

    //     return [
    //         'from_date' => $start->format('Y-m-d'),
    //         'to_date' => $end->format('Y-m-d'),
    //         'from_label' => $start->format('d M Y'),
    //         'to_label' => $end->format('d M Y'),
    //         'days_in_period' => (int) $start->diff($end)->format('%a') + 1,
    //         'generated_at' => date('d M Y, h:i A'),
    //     ];
    // }

    private function build_current_payroll_period()
    {
        $row = $this->db->query("
        SELECT TO_CHAR(MAX(TRUNC(ATT_DATE)), 'YYYY-MM-DD') AS MAX_DATE
        FROM XX_DIGI_ATT_ATT_SHEET
     ")->row_array();

        $maxDateValue = trim((string) ($row['MAX_DATE'] ?? ''));

        if ($maxDateValue === '') {
            return [
                'from_date' => '',
                'to_date' => '',
                'from_label' => '-',
                'to_label' => '-',
                'days_in_period' => 0,
                'generated_at' => date('d M Y, h:i A'),
            ];
        }

        $end = new DateTime($maxDateValue);

        $start = clone $end;
        $start->modify('-1 month');
        $start->setDate(
            (int) $start->format('Y'),
            (int) $start->format('m'),
            21
        );

        return [
            'from_date' => $start->format('Y-m-d'),
            'to_date' => $end->format('Y-m-d'),
            'from_label' => $start->format('d M Y'),
            'to_label' => $end->format('d M Y'),
            'days_in_period' => (int) $start->diff($end)->format('%a') + 1,
            'generated_at' => date('d M Y, h:i A'),
        ];
    }

    // private function build_current_payroll_period()  OLD
    // {
    //     $today = new DateTime('today');
    //     $start = new DateTime($today->format('Y-m-01'));
    //     $start->modify('-1 month');
    //     $start->setDate((int) $start->format('Y'), (int) $start->format('m'), 21);

    //     $end = new DateTime($today->format('Y-m-01'));
    //     $end->setDate((int) $end->format('Y'), (int) $end->format('m'), 20);

    //     return [
    //         'from_date' => $start->format('Y-m-d'),
    //         'to_date' => $end->format('Y-m-d'),
    //         'from_label' => $start->format('d M Y'),
    //         'to_label' => $end->format('d M Y'),
    //         'days_in_period' => (int) $start->diff($end)->format('%a') + 1,
    //         'generated_at' => date('d M Y, h:i A'),
    //     ];
    // }

    private function get_overview_cards($fromDate, $toDate)
    {
        $totalEmployees = $this->scalar_value("SELECT COUNT(1) AS TOTAL FROM XX_DIGI_EMP_MASTER where CURRENT_EMP_FLAG='Y'");
        $activeShifts = $this->scalar_value("SELECT COUNT(1) AS TOTAL FROM XX_DIGI_SHIFT_PR WHERE UPPER(TRIM(NVL(STATUS, 'ACTIVE'))) = 'ACTIVE'");
        $timetableLines = $this->scalar_value(
            "SELECT COUNT(1) AS TOTAL
             FROM XX_DIGI_TIMETABLE_PR
             WHERE UPPER(TRIM(NVL(STATUS, 'ACTIVE'))) = 'ACTIVE'
               AND (START_DATE IS NULL OR TRUNC(START_DATE) <= TO_DATE(?, 'YYYY-MM-DD'))
               AND (END_DATE IS NULL OR TRUNC(END_DATE) >= TO_DATE(?, 'YYYY-MM-DD'))",
            [$toDate, $fromDate]
        );
        $attendanceCards = $this->scalar_value(
            "SELECT COUNT(1) AS TOTAL
             FROM XX_DIGI_ATT_ATT_CARD
             WHERE TRUNC(ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')",
            [$fromDate, $toDate]
        );
        $timesheetRows = $this->scalar_value(
            "SELECT COUNT(1) AS TOTAL
             FROM XX_DIGI_ATT_ATT_SHEET
             WHERE TRUNC(ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')",
            [$fromDate, $toDate]
        );
        $payrollEmployees = $this->scalar_value(
            "SELECT COUNT(DISTINCT EMP_NO) AS TOTAL
             FROM XX_DIGI_ATT_ATT_SHEET
             WHERE TRUNC(ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')",
            [$fromDate, $toDate]
        );
        $activeOccasions = $this->scalar_value(
            "SELECT COUNT(1) AS TOTAL
             FROM XX_DIGI_ATT_OCCASIONS
             WHERE UPPER(TRIM(NVL(IS_ACTIVE, 'N'))) = 'Y'
               AND TRUNC(FROM_DATE) <= TO_DATE(?, 'YYYY-MM-DD')
               AND TRUNC(TO_DATE) >= TO_DATE(?, 'YYYY-MM-DD')",
            [$toDate, $fromDate]
        );

        return [
            'total_employees' => $totalEmployees,
            'active_shifts' => $activeShifts,
            'timetable_lines' => $timetableLines,
            'attendance_cards' => $attendanceCards,
            'timesheet_rows' => $timesheetRows,
            'payroll_employees' => $payrollEmployees,
            'active_occasions' => $activeOccasions,
        ];
    }

    private function get_timesheet_rows($fromDate, $toDate)
    {
        $sql = "
            SELECT
                TO_CHAR(EMP_NO) AS EMP_NO,
                EMP_NAME,
                TO_CHAR(TRUNC(ATT_DATE), 'YYYY-MM-DD') AS ATT_DATE,
                PUNCH_IN,
                PUNCH_OUT,
                ABSENCE,
                LATE,
                EARLY,
                OVERTIME
            FROM XX_DIGI_ATT_ATT_SHEET
            WHERE TRUNC(ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')
            ORDER BY ATT_DATE ASC, EMP_NO ASC
        ";

        return $this->db->query($sql, [$fromDate, $toDate])->result_array();
    }

    private function get_active_occasions($fromDate, $toDate)
    {
        $sql = "
            SELECT
                OCCASION_ID,
                OCCASION_NAME,
                TO_CHAR(TRUNC(FROM_DATE), 'YYYY-MM-DD') AS FROM_DATE,
                TO_CHAR(TRUNC(TO_DATE), 'YYYY-MM-DD') AS TO_DATE,
                OCCASION_TYPE,
                COUNT_AS_PRESENT,
                PAID_HOLIDAY,
                REMARKS
            FROM XX_DIGI_ATT_OCCASIONS
            WHERE UPPER(TRIM(NVL(IS_ACTIVE, 'N'))) = 'Y'
              AND TRUNC(FROM_DATE) <= TO_DATE(?, 'YYYY-MM-DD')
              AND TRUNC(TO_DATE) >= TO_DATE(?, 'YYYY-MM-DD')
            ORDER BY FROM_DATE ASC, OCCASION_ID ASC
        ";

        return $this->db->query($sql, [$toDate, $fromDate])->result_array();
    }

    private function build_occasion_date_map(array $occasionRows)
    {
        $map = [];

        foreach ($occasionRows as $occasion) {
            $start = DateTime::createFromFormat('Y-m-d', (string) ($occasion['FROM_DATE'] ?? ''));
            $end = DateTime::createFromFormat('Y-m-d', (string) ($occasion['TO_DATE'] ?? ''));
            $name = trim((string) ($occasion['OCCASION_NAME'] ?? ''));

            if (!$start || !$end || $name === '') {
                continue;
            }

            $cursor = clone $start;
            while ($cursor <= $end) {
                $dateKey = $cursor->format('Y-m-d');
                if (!isset($map[$dateKey])) {
                    $map[$dateKey] = [];
                }
                $map[$dateKey][] = $name;
                $cursor->modify('+1 day');
            }
        }

        return $map;
    }

    private function get_employee_department_map()
    {
        $rows = $this->db->query(
            "
        SELECT
            TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO,
            FULL_NAME,
            DEPARTMENT
        FROM XX_DIGI_EMP_MASTER
        WHERE CURRENT_EMP_FLAG = 'Y'
        "
        )->result_array();

        $map = [];

        foreach ($rows as $row) {

            $empNo = $this->normalize_emp_no(
                $row['EMP_NO'] ?? ''
            );

            if ($empNo === '') {
                continue;
            }

            $department = trim(
                (string) ($row['DEPARTMENT'] ?? '')
            );

            $map[$empNo] = [
                'full_name' => trim(
                    (string) ($row['FULL_NAME'] ?? '')
                ),

                'department' => $department !== ''
                    ? $department
                    : 'Unassigned',
            ];
        }

        return $map;
    }

    private function build_attendance_summary(array $timesheetRows, array $occasionDateMap)
    {
        $summary = [
            'present_days' => 0,
            'leave_days' => 0,
            'weekend_days' => 0,
            'occasion_days' => 0,
            'awi_days' => 0,
            'blank_punch_rows' => 0,
            'overtime_hours' => 0.0,
            'late_minutes' => 0.0,
            'early_minutes' => 0.0,
            'processed_employees' => 0,
            'employees_with_overtime' => 0,
        ];

        $employeeTracker = [];
        $overtimeEmployees = [];

        foreach ($timesheetRows as $row) {
            $empNo = trim((string) ($row['EMP_NO'] ?? ''));
            $attDate = trim((string) ($row['ATT_DATE'] ?? ''));
            $absence = trim((string) ($row['ABSENCE'] ?? ''));
            $punchIn = trim((string) ($row['PUNCH_IN'] ?? ''));
            $punchOut = trim((string) ($row['PUNCH_OUT'] ?? ''));

            if ($empNo !== '') {
                $employeeTracker[$empNo] = true;
            }

            if ($punchIn === '' && $punchOut === '') {
                $summary['blank_punch_rows']++;
            }

            $summary['overtime_hours'] += $this->safe_numeric($row['OVERTIME'] ?? 0);
            $summary['late_minutes'] += $this->safe_numeric($row['LATE'] ?? 0);
            $summary['early_minutes'] += $this->safe_numeric($row['EARLY'] ?? 0);

            if ($this->safe_numeric($row['OVERTIME'] ?? 0) > 0 && $empNo !== '') {
                $overtimeEmployees[$empNo] = true;
            }

            $category = $this->resolve_row_category($absence, $attDate, $occasionDateMap);
            switch ($category) {
                case 'occasion':
                    $summary['occasion_days']++;
                    break;
                case 'weekend':
                    $summary['weekend_days']++;
                    break;
                case 'awi':
                    $summary['awi_days']++;
                    break;
                case 'leave':
                    $summary['leave_days']++;
                    break;
                default:
                    $summary['present_days']++;
                    break;
            }
        }

        $summary['processed_employees'] = count($employeeTracker);
        $summary['employees_with_overtime'] = count($overtimeEmployees);
        $summary['overtime_hours'] = $this->format_decimal($summary['overtime_hours']);
        $summary['late_minutes'] = $this->format_decimal($summary['late_minutes']);
        $summary['early_minutes'] = $this->format_decimal($summary['early_minutes']);

        return $summary;
    }

    private function build_daily_trend(array $timesheetRows, array $occasionDateMap, $fromDate, $toDate)
    {
        $trend = [];
        $cursor = DateTime::createFromFormat('Y-m-d', $fromDate);
        $end = DateTime::createFromFormat('Y-m-d', $toDate);

        while ($cursor && $end && $cursor <= $end) {
            $key = $cursor->format('Y-m-d');
            $trend[$key] = [
                'date' => $key,
                'label' => $cursor->format('d M'),
                'present' => 0,
                'leave' => 0,
                'weekend' => 0,
                'occasion' => 0,
                'awi' => 0,
                'overtime' => 0.0,
            ];
            $cursor->modify('+1 day');
        }

        foreach ($timesheetRows as $row) {
            $date = trim((string) ($row['ATT_DATE'] ?? ''));
            if (!isset($trend[$date])) {
                continue;
            }

            $category = $this->resolve_row_category(trim((string) ($row['ABSENCE'] ?? '')), $date, $occasionDateMap);
            $trend[$date][$category]++;
            $trend[$date]['overtime'] += $this->safe_numeric($row['OVERTIME'] ?? 0);
        }

        $result = array_values($trend);
        foreach ($result as &$day) {
            $day['overtime'] = $this->format_decimal($day['overtime']);
            $day['total'] = $day['present'] + $day['leave'] + $day['weekend'] + $day['occasion'] + $day['awi'];
        }
        unset($day);

        return $result;
    }

    /**
     * Groups all active employees (from the employee master map) by department.
     *
     * @return array [
     *     ['department' => 'Finance', 'employee_count' => 12, 'employee_numbers' => ['1001','1002', ...]],
     *     ...
     * ]
     */
    private function build_department_employee_list(array $employeeDepartmentMap)
    {
        $departments = [];

        foreach ($employeeDepartmentMap as $empNo => $info) {
            $department = trim((string) ($info['department'] ?? ''));

            if ($department === '') {
                $department = 'Unassigned';
            }

            if (!isset($departments[$department])) {
                $departments[$department] = [];
            }

            $departments[$department][] = $empNo;
        }

        $result = [];

        foreach ($departments as $department => $employeeNumbers) {
            sort($employeeNumbers);

            $result[] = [
                'department'       => $department,
                'employee_count'   => count($employeeNumbers),
                'employee_numbers' => $employeeNumbers,
            ];
        }

        usort($result, function ($a, $b) {
            return $b['employee_count'] <=> $a['employee_count'];
        });

        return $result;
    }

    
    private function build_department_summary(array $timesheetRows, array $employeeDepartmentMap, array $occasionDateMap)
    {
        $summary = [];

        foreach ($timesheetRows as $row) {

            $empNo = $this->normalize_emp_no($row['EMP_NO'] ?? '');

            $date = trim((string) ($row['ATT_DATE'] ?? ''));

            /*
         * Get department from employee master map.
         */
            if (
                $empNo !== '' && isset($employeeDepartmentMap[$empNo])
            ) {
                $department = trim((string) ($employeeDepartmentMap[$empNo]['department'] ?? ''));
            } else {
                $department = '';
            }

            if ($department === '') {
                $department = 'Unassigned';
            }

            if (!isset($summary[$department])) {
                $summary[$department] = [
                    'department' => $department,
                    'employees' => [],
                    'processed_rows' => 0,
                    'present_rows' => 0,
                    'leave_rows' => 0,
                    'weekend_rows' => 0,
                    'occasion_rows' => 0,
                    'awi_rows' => 0,
                    'overtime_hours' => 0.0,
                ];
            }

            if ($empNo !== '') {
                $summary[$department]['employees'][$empNo] = true;
            }

            $summary[$department]['processed_rows']++;

            $summary[$department]['overtime_hours'] +=
                $this->safe_numeric(
                    $row['OVERTIME'] ?? 0
                );

            $category = $this->resolve_row_category(trim((string) ($row['ABSENCE'] ?? '')), $date, $occasionDateMap);

            switch ($category) {

                case 'occasion':
                    $summary[$department]['occasion_rows']++;
                    break;

                case 'weekend':
                    $summary[$department]['weekend_rows']++;
                    break;

                case 'awi':
                    $summary[$department]['awi_rows']++;
                    break;

                case 'leave':
                    $summary[$department]['leave_rows']++;
                    break;

                default:
                    $summary[$department]['present_rows']++;
                    break;
            }
        }

        $rows = array_values($summary);

        foreach ($rows as &$row) {

            $row['employee_count'] = count($row['employees']);

            unset($row['employees']);

            $row['overtime_hours'] = $this->format_decimal($row['overtime_hours']);
        }

        unset($row);

        usort(
            $rows,
            function ($a, $b) {
                return $b['processed_rows']
                    <=> $a['processed_rows'];
            }
        );

        return array_slice($rows, 0, 8);
    }

    private function get_exception_summary($fromDate, $toDate, array $timesheetRows, array $occasionDateMap)
    {
        $awiEmployees = [];
        $blankPunchEmployees = [];
        $samePunchRows = 0;
        $weekendWorkRows = 0;
        $occasionWorkRows = 0;

        foreach ($timesheetRows as $row) {
            $empNo = trim((string) ($row['EMP_NO'] ?? ''));
            $date = trim((string) ($row['ATT_DATE'] ?? ''));
            $absence = trim((string) ($row['ABSENCE'] ?? ''));
            $punchIn = trim((string) ($row['PUNCH_IN'] ?? ''));
            $punchOut = trim((string) ($row['PUNCH_OUT'] ?? ''));

            if ($punchIn === '' && $punchOut === '' && $empNo !== '') {
                $blankPunchEmployees[$empNo] = true;
            }

            if ($punchIn !== '' && $punchOut !== '' && $punchIn === $punchOut) {
                $samePunchRows++;
            }

            $category = $this->resolve_row_category($absence, $date, $occasionDateMap);
            if ($category === 'awi' && $empNo !== '') {
                $awiEmployees[$empNo] = true;
            }

            if ($category === 'weekend' && $punchIn !== '' && $punchOut !== '') {
                $weekendWorkRows++;
            }

            if ($category === 'occasion' && $punchIn !== '' && $punchOut !== '') {
                $occasionWorkRows++;
            }
        }
        $supervisorNameforBlanckPunch = $this->scalar_value(
            "SELECT COUNT(DISTINCT SUPERVISOR_NAME) AS TOTAL
                FROM XX_DIGI_EMP_MASTER
                WHERE CURRENT_EMP_FLAG = 'Y'
                  AND SUPERVISOR_NAME IS NOT NULL"
        );
        $overtimeNotAllowedRows = $this->scalar_value(
            "SELECT COUNT(1) AS TOTAL
             FROM XX_DIGI_ATT_ATT_SHEET s
             JOIN XX_DIGI_TIMETABLE_PR t
               ON TO_CHAR(t.EMP_NO) = TO_CHAR(s.EMP_NO)
              AND UPPER(TRIM(NVL(t.STATUS, 'ACTIVE'))) = 'ACTIVE'
              AND (t.START_DATE IS NULL OR TRUNC(t.START_DATE) <= TRUNC(s.ATT_DATE))
              AND (t.END_DATE IS NULL OR TRUNC(t.END_DATE) >= TRUNC(s.ATT_DATE))
             WHERE TRUNC(s.ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')
               AND UPPER(TRIM(NVL(t.OVERTIME_ALLOWED, 'N'))) = 'N'
               AND CASE
                    WHEN REGEXP_LIKE(TRIM(NVL(s.OVERTIME, '0')), '^-{0,1}[0-9]+(\.[0-9]+){0,1}$')
                    THEN TO_NUMBER(TRIM(s.OVERTIME))
                    ELSE 0
                   END > 0",
            [$fromDate, $toDate]
        );

        $missingTimetableEmployees = $this->scalar_value(
            "SELECT COUNT(*) AS TOTAL
FROM XX_DIGI_EMP_MASTER e
WHERE e.CURRENT_EMP_FLAG = 'Y'
  AND NOT EXISTS (
      SELECT 1
      FROM XX_DIGI_TIMETABLE_PR t
      WHERE TO_CHAR(t.EMP_NO) = TO_CHAR(e.EMPLOYEE_NUMBER)
        AND UPPER(TRIM(NVL(t.STATUS, 'ACTIVE'))) = 'ACTIVE'
  )"
        );
        // $missingTimetableEmployees = $this->scalar_value(
        //     "SELECT COUNT(DISTINCT TO_CHAR(a.EMP_NO)) AS TOTAL
        //      FROM XX_DIGI_ATT_ATT_CARD a
        //      WHERE TRUNC(a.ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')
        //        AND NOT EXISTS (
        //             SELECT 1
        //             FROM XX_DIGI_TIMETABLE_PR t
        //             WHERE TO_CHAR(t.EMP_NO) = TO_CHAR(a.EMP_NO)
        //               AND UPPER(TRIM(NVL(t.STATUS, 'ACTIVE'))) = 'ACTIVE'
        //               AND (t.START_DATE IS NULL OR TRUNC(t.START_DATE) <= TRUNC(a.ATT_DATE))
        //               AND (t.END_DATE IS NULL OR TRUNC(t.END_DATE) >= TRUNC(a.ATT_DATE))
        //        )",
        //     [$fromDate, $toDate]
        // );

        return [
            'awi_employees' => count($awiEmployees),
            'blank_punch_employees' => $supervisorNameforBlanckPunch,
            'same_punch_rows' => $samePunchRows,
            'weekend_work_rows' => $weekendWorkRows,
            'occasion_work_rows' => $occasionWorkRows,
            'overtime_not_allowed_rows' => $overtimeNotAllowedRows,
            'missing_timetable_employees' => $missingTimetableEmployees,
        ];
    }

    private function get_readiness_summary($fromDate, $toDate, array $overview, array $exceptions)
    {
        // $employeesWithTimetable = $this->scalar_value(
        //     "SELECT COUNT(DISTINCT TO_CHAR(EMP_NO)) AS TOTAL
        //      FROM XX_DIGI_TIMETABLE_PR
        //      WHERE UPPER(TRIM(NVL(STATUS, 'ACTIVE'))) = 'ACTIVE'
        //        AND (START_DATE IS NULL OR TRUNC(START_DATE) <= TO_DATE(?, 'YYYY-MM-DD'))
        //        AND (END_DATE IS NULL OR TRUNC(END_DATE) >= TO_DATE(?, 'YYYY-MM-DD'))",
        //     [$toDate, $fromDate]
        // );
        $employeesWithTimetable= $this->scalar_value(
            "SELECT COUNT(DISTINCT TO_CHAR(EMPLOYEE_NUMBER)) AS TOTAL
             FROM XX_DIGI_EMP_MASTER
             WHERE CURRENT_EMP_FLAG='Y'"
        );

        $shiftDetailLines = $this->scalar_value(
            "SELECT COUNT(1) AS TOTAL
             FROM XX_DIGI_SHIFT_PR_DTL
             WHERE UPPER(TRIM(NVL(STATUS, 'ACTIVE'))) = 'ACTIVE'"
        );

        $excludedEmployees = $this->scalar_value(
            "SELECT COUNT(DISTINCT TO_CHAR(EMP_NO)) AS TOTAL
             FROM XX_DIGI_TIMETABLE_PR
             WHERE UPPER(TRIM(NVL(STATUS, 'ACTIVE'))) = 'ACTIVE'
               AND UPPER(TRIM(NVL(EXCLUDE_TIMESHEET, 'N'))) = 'Y'
               AND (START_DATE IS NULL OR TRUNC(START_DATE) <= TO_DATE(?, 'YYYY-MM-DD'))
               AND (END_DATE IS NULL OR TRUNC(END_DATE) >= TO_DATE(?, 'YYYY-MM-DD'))",
            [$toDate, $fromDate]
        );

        return [
            'employees_with_timetable' => $employeesWithTimetable,
            'shift_detail_lines' => $shiftDetailLines,
            'excluded_timesheet_employees' => $excludedEmployees,
            'missing_timetable_employees' => $exceptions['missing_timetable_employees'],
            'is_setup_ready' => ($overview['active_shifts'] > 0 && $shiftDetailLines > 0 && $employeesWithTimetable > 0),
        ];
    }

    private function build_process_status(array $overview, array $readiness, array $timesheetRows, $fromDate, $toDate)
    {
        $latestAttendanceDate = $this->scalar_string(
            "SELECT TO_CHAR(MAX(TRUNC(ATT_DATE)), 'DD Mon YYYY') AS VALUE_TEXT
             FROM XX_DIGI_ATT_ATT_CARD
             WHERE TRUNC(ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')",
            [$fromDate, $toDate]
        );

        $latestTimesheetDate = $this->scalar_string(
            "SELECT TO_CHAR(MAX(TRUNC(ATT_DATE)), 'DD Mon YYYY') AS VALUE_TEXT
             FROM XX_DIGI_ATT_ATT_SHEET
             WHERE TRUNC(ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')",
            [$fromDate, $toDate]
        );

        $processedEmployees = [];
        foreach ($timesheetRows as $row) {
            $empNo = trim((string) ($row['EMP_NO'] ?? ''));
            if ($empNo !== '') {
                $processedEmployees[$empNo] = true;
            }
        }

        $assigned = max(1, (int) $readiness['employees_with_timetable']);
        $coverage = min(100, round((count($processedEmployees) / $assigned) * 100));

        return [
            'latest_attendance_date' => $latestAttendanceDate !== '' ? $latestAttendanceDate : 'Not available',
            'latest_timesheet_date' => $latestTimesheetDate !== '' ? $latestTimesheetDate : 'Not available',
            'coverage' => $coverage,
            'coverage_label' => $coverage . '%',
            'assigned_employees' => (int) $readiness['employees_with_timetable'],
            'processed_employees' => count($processedEmployees),
            'status_text' => $coverage >= 95 ? 'Ready for payroll review' : 'Processing attention required',
        ];
    }

    private function get_proposed_kpis(
        $fromDate,
        $toDate,
        array $attendanceSummary,
        array $overview,
        array $exceptions,
        array $readiness
    ) {
        /*
            * Set this rate when the approved overtime cost per hour is known.
            *
            * Example:
            * $overtimeHourlyRate = 25;
            *
            * Keep it 0 until an official rate or employee-specific salary
            * calculation is available.
            */
        $overtimeHourlyRate = 0;

        $overtimeHours = (float) (
            $attendanceSummary['overtime_hours'] ?? 0
        );

        $estimatedOvertimeCost = round(
            $overtimeHours * $overtimeHourlyRate,
            2
        );

        /*
     * Count employees having late minutes today.
     *
     * LATE is stored as text in the current attendance sheet,
     * therefore REGEXP_LIKE is used before TO_NUMBER.
     */
        $lateArrivalsToday = $this->scalar_value(
            "
        SELECT COUNT(DISTINCT TO_CHAR(EMP_NO)) AS TOTAL
        FROM XX_DIGI_ATT_ATT_SHEET
        WHERE TRUNC(ATT_DATE) = TRUNC(SYSDATE)
          AND CASE
                WHEN REGEXP_LIKE(
                    TRIM(NVL(LATE, '0')),
                    '^-{0,1}[0-9]+(\.[0-9]+){0,1}$'
                )
                THEN TO_NUMBER(TRIM(LATE))
                ELSE 0
              END > 0
        "
        );

        /*
     * Count employees who are repeatedly late during the current
     * payroll period. Repeated means late on 3 or more dates.
     */
        $repeatLateEmployees = $this->scalar_value(
            "
        SELECT COUNT(1) AS TOTAL
        FROM (
            SELECT TO_CHAR(EMP_NO) AS EMP_NO
            FROM XX_DIGI_ATT_ATT_SHEET
            WHERE TRUNC(ATT_DATE)
                  BETWEEN TO_DATE(?, 'YYYY-MM-DD')
                      AND TO_DATE(?, 'YYYY-MM-DD')
              AND CASE
                    WHEN REGEXP_LIKE(
                        TRIM(NVL(LATE, '0')),
                        '^-{0,1}[0-9]+(\.[0-9]+){0,1}$'
                    )
                    THEN TO_NUMBER(TRIM(LATE))
                    ELSE 0
                  END > 0
            GROUP BY TO_CHAR(EMP_NO)
            HAVING COUNT(DISTINCT TRUNC(ATT_DATE)) >= 3
        )
        ",
            [$fromDate, $toDate]
        );

        /*
     * Count active shifts that currently have no employee assigned.
     *
     * This assumes:
     * XX_DIGI_TIMETABLE_PR.SHIFT_ID
     * refers to XX_DIGI_SHIFT_PR.ID.
     *
     * This relationship is already used by the timetable module.
     */
        $uncoveredShiftsToday = $this->scalar_value(
            "
        SELECT COUNT(1) AS TOTAL
        FROM XX_DIGI_SHIFT_PR s
        WHERE UPPER(TRIM(NVL(s.STATUS, 'ACTIVE'))) = 'ACTIVE'
          AND NOT EXISTS (
              SELECT 1
              FROM XX_DIGI_TIMETABLE_PR t
              WHERE TO_CHAR(t.SHIFT_ID) = TO_CHAR(s.ID)
                AND UPPER(
                    TRIM(NVL(t.STATUS, 'ACTIVE'))
                ) = 'ACTIVE'
                AND (
                    t.START_DATE IS NULL
                    OR TRUNC(t.START_DATE) <= TRUNC(SYSDATE)
                )
                AND (
                    t.END_DATE IS NULL
                    OR TRUNC(t.END_DATE) >= TRUNC(SYSDATE)
                )
          )
        "
        );

        /*
     * The present application does not contain a confirmed manager
     * approval table. Keep this at zero until the approval module
     * and its database table are implemented.
     */
        $pendingManagerApprovals = 0;

        /*
     * The current employee table usage does not confirm Iqama,
     * medical, licence, or document-expiry columns.
     *
     * Keep this at zero until the document table is confirmed.
     */
        $expiringDocuments = 0;

        $totalEmployees = max(1, (int) ($overview['total_employees'] ?? 0));

        $missingTimetable = (int) ($exceptions['missing_timetable_employees'] ?? 0);

        $blankPunchEmployees = (int) ($exceptions['blank_punch_employees'] ?? 0);

        $awiEmployees = (int) ($exceptions['awi_employees'] ?? 0);

        /*
     * Compliance calculation:
     *
     * 100 minus the percentage of employees affected by major
     * attendance/setup exceptions.
     *
     * The result is restricted to 0–100.
     */
        $exceptionEmployees = $missingTimetable +  $blankPunchEmployees + $awiEmployees;

        $attendanceComplianceScore = round(100 - (($exceptionEmployees / $totalEmployees) * 100), 1);

        $attendanceComplianceScore = max(0, min(100, $attendanceComplianceScore));

        return [
            'estimated_overtime_cost' => $estimatedOvertimeCost,
            'overtime_hourly_rate' => $overtimeHourlyRate,
            'overtime_rate_configured' => $overtimeHourlyRate > 0,

            'late_arrivals_today' => $lateArrivalsToday,
            'repeat_late_employees' => $repeatLateEmployees,

            'uncovered_shifts_today' => $uncoveredShiftsToday,

            'pending_manager_approvals' => $pendingManagerApprovals,
            'manager_approval_configured' => false,

            'expiring_documents' => $expiringDocuments,
            'document_expiry_configured' => false,

            'attendance_compliance_score' =>
            $attendanceComplianceScore,

            'employees_with_timetable' => (int) (
                $readiness['employees_with_timetable'] ?? 0
            ),
        ];
    }

    private function get_quick_actions()
    {
        return [
            ['title' => 'Process Attendance', 'subtitle' => 'Run current payroll period attendance calculation', 'url' => base_url('interface'), 'icon' => 'ti ti-player-play', 'theme' => 'success'],
            ['title' => 'Attendance Card', 'subtitle' => 'Review raw punch records', 'url' => base_url('report/attendance-card'), 'icon' => 'ti ti-id', 'theme' => 'primary'],
            ['title' => 'Timesheet', 'subtitle' => 'Review calculated daily attendance rows', 'url' => base_url('report/timesheet'), 'icon' => 'ti ti-file-time', 'theme' => 'info'],
            ['title' => 'Payroll File', 'subtitle' => 'Review payroll summary and adjustments', 'url' => base_url('report/payroll-file'), 'icon' => 'ti ti-file-dollar', 'theme' => 'warning'],
            ['title' => 'Manage Shifts', 'subtitle' => 'Maintain shift master and daily timing', 'url' => base_url('shifts'), 'icon' => 'ti ti-clock-hour-4', 'theme' => 'secondary'],
            ['title' => 'Occasions', 'subtitle' => 'Maintain public holidays and paid occasions', 'url' => base_url('occasion'), 'icon' => 'ti ti-calendar-event', 'theme' => 'danger'],
        ];
    }

    private function resolve_row_category($absence, $attendanceDate, array $occasionDateMap)
    {
        $absence = trim((string) $absence);
        $upperAbsence = strtoupper($absence);

        if ($absence === '') {
            return 'present';
        }

        if ($upperAbsence === 'WEEKEND') {
            return 'weekend';
        }

        if ($upperAbsence === 'ABSENCE WITHOUT PERMISSION') {
            return 'awi';
        }

        if ($this->is_occasion_absence($absence, $attendanceDate, $occasionDateMap)) {
            return 'occasion';
        }

        return 'leave';
    }

    private function is_occasion_absence($absence, $attendanceDate, array $occasionDateMap)
    {
        if ($absence === '' || !isset($occasionDateMap[$attendanceDate])) {
            return false;
        }

        $target = strtoupper(trim($absence));
        foreach ($occasionDateMap[$attendanceDate] as $occasionName) {
            if ($target === strtoupper(trim((string) $occasionName))) {
                return true;
            }
        }

        return false;
    }

    private function scalar_value($sql, array $binds = [])
    {
        $row = $this->db->query($sql, $binds)->row_array();
        if (!$row) {
            return 0;
        }

        $value = reset($row);
        return (int) $value;
    }

    private function scalar_string($sql, array $binds = [])
    {
        $row = $this->db->query($sql, $binds)->row_array();
        if (!$row) {
            return '';
        }

        $value = reset($row);
        return trim((string) $value);
    }

    private function safe_numeric($value)
    {
        $value = trim((string) $value);
        if ($value === '' || !preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            return 0.0;
        }

        return (float) $value;
    }

    private function format_decimal($value)
    {
        $text = number_format((float) $value, 2, '.', '');
        return rtrim(rtrim($text, '0'), '.');
    }
}
