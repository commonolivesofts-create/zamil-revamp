<?php
defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Manager_model
 *
 * Backs the "Manager View" screen: a department-scoped read of the
 * existing attendance data (XX_DIGI_EMP_MASTER / XX_DIGI_ATT_ATT_SHEET /
 * XX_DIGI_EMP_ABSENCE_TYPE) plus a small write path so a manager can
 * approve or deny a pending leave request without touching the master
 * Absence Details screen.
 *
 * There is no dedicated "manager/supervisor" column in the schema today,
 * so scoping is done the same way the rest of the app already groups
 * people: by the DEPARTMENT field on XX_DIGI_EMP_MASTER.
 */
class Manager_model extends CI_Model
{
    protected $employeeTable = 'XX_DIGI_EMP_MASTER';
    protected $timesheetTable = 'XX_DIGI_ATT_ATT_SHEET';
    protected $absenceTable = 'XX_DIGI_EMP_ABSENCE_TYPE';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        // EBS
        $this->ebs = $this->load->database('ebs', true);
    }

    /**
     * Current payroll cycle (21st -> 20th), same convention used by the
     * main Dashboard so "This Period" figures line up across the app.
     */
    public function build_current_payroll_period()
    {
        $today = new DateTime('today');

        $start = new DateTime($today->format('Y-m-01'));
        $start->modify('-1 month');
        $start->setDate((int) $start->format('Y'), (int) $start->format('m'), 21);

        $end = new DateTime($today->format('Y-m-01'));
        $end->setDate((int) $end->format('Y'), (int) $end->format('m'), 20);

        return [
            'from_date' => $start->format('Y-m-d'),
            'to_date' => $end->format('Y-m-d'),
            'from_label' => $start->format('d M Y'),
            'to_label' => $end->format('d M Y'),
            'today_date' => $today->format('Y-m-d'),
            'today_label' => $today->format('d M Y'),
        ];
    }

    public function get_departments()
    {
        $rows = $this->db->query(
            "SELECT DISTINCT DEPARTMENT
             FROM {$this->employeeTable}
             WHERE DEPARTMENT IS NOT NULL AND TRIM(DEPARTMENT) <> ''
             ORDER BY DEPARTMENT"
        )->result_array();

        $departments = [];
        foreach ($rows as $row) {
            $value = trim((string) ($row['DEPARTMENT'] ?? ''));
            if ($value !== '') {
                $departments[] = $value;
            }
        }

        return $departments;
    }

    /**
     * Looks up the department for a given employee number, used to default
     * the Manager View to the signed-in user's own team when possible.
     */
    public function get_department_for_employee($employeeNumber)
    {
        $employeeNumber = trim((string) $employeeNumber);
        if ($employeeNumber === '') {
            return '';
        }

        $row = $this->db->query(
            "SELECT DEPARTMENT
             FROM {$this->employeeTable}
             WHERE TO_CHAR(EMPLOYEE_NUMBER) = ?",
            [$employeeNumber]
        )->row_array();

        return $row ? trim((string) ($row['DEPARTMENT'] ?? '')) : '';
    }

    /**
     * Full payload for the Manager View: the roster, today's status per
     * employee, this-period rollups, and the pending-approvals queue.
     */
    // public function get_team_overview($userID, $fromDate, $toDate, $todayDate)
    // {
    //     $userID = trim((string)$userID);

    //     $result = [
    //         'employees' => [],
    //         'approvals' => [],
    //         'summary' => [
    //             'team_size' => 0,
    //             'present_today' => 0,
    //             'late_today' => 0,
    //             'absent_today' => 0,
    //             'on_leave_today' => 0,
    //             'pending_approvals' => 0,
    //         ],
    //     ];

    //     if ($userID == '') {
    //         return $result;
    //     }


    //     /*
    //  * Get Manager Team From ADW
    //  */
    //     $roster = $this->db->query(
    //         "
    //     SELECT
    //         TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO,
    //         FULL_NAME,
    //         JOB_TITLE,
    //         DEPARTMENT
    //     FROM {$this->employeeTable}
    //     WHERE SUPERVISOR_ID IN
    //     (
    //         SELECT DISTINCT EMPLOYEE_ID
    //         FROM {$this->employeeTable}
    //         WHERE USER_ID = ?
    //     ) AND CURRENT_EMP_FLAG = 'Y'
    //     ORDER BY FULL_NAME
    //     ",
    //         [$userID]
    //     )->result_array();


    //     if (empty($roster)) {
    //         return $result;
    //     }


    //     /*
    //  * Employee Codes
    //  * EBS EMP_CODE is NVARCHAR2
    //  */
    //     $empNumbers = [];

    //     foreach ($roster as $row) {

    //         $empNo = trim((string)$row['EMP_NO']);

    //         if ($empNo != '') {
    //             $empNumbers[] = $empNo;
    //         }
    //     }


    //     $quotedEmpNumbers = array_map(function ($empNo) {

    //         return "'" . str_replace("'", "''", $empNo) . "'";
    //     }, $empNumbers);


    //     $inPlaceholders = implode(',', $quotedEmpNumbers);



    //     /*
    //  * TODAY ATTENDANCE FROM EBS
    //  */
    //     $todayRows = $this->ebs->query(
    //         "
    //     SELECT
    //         EMP_CODE AS EMP_NO,
    //         NAME,
    //         MIN(TIME) AS PUNCH_IN,
    //         MAX(TIME) AS PUNCH_OUT
    //     FROM
    //     (
    //         SELECT

    //             ICT.EMP_CODE,

    //             PE.FIRST_NAME || ' ' || PE.LAST_NAME AS NAME,

    //             TO_CHAR(ICT.PUNCH_TIME,'HH24:MI:SS') AS TIME

    //         FROM ZPI.ICLOCK_TRANSACTION ICT

    //         JOIN ZPI.PERSONNEL_EMPLOYEE PE
    //             ON PE.EMP_CODE = ICT.EMP_CODE

    //         WHERE ICT.PUNCH_TIME >= TO_DATE(?,'YYYY-MM-DD')
    //           AND ICT.PUNCH_TIME < TO_DATE(?,'YYYY-MM-DD') + 1

    //           AND ICT.EMP_CODE IN ($inPlaceholders)
    //     )

    //     GROUP BY
    //         EMP_CODE,
    //         NAME
    //     ",
    //         [
    //             $todayDate,
    //             $todayDate
    //         ]
    //     )->result_array();



    //     $todayByEmp = [];

    //     foreach ($todayRows as $row) {

    //         $empNo = trim($row['EMP_NO']);

    //         $todayByEmp[$empNo] = [
    //             'PUNCH_IN'  => $row['PUNCH_IN'],
    //             'PUNCH_OUT' => $row['PUNCH_OUT'],
    //             'ABSENCE'   => '',
    //             'LATE'      => 0,
    //             'EARLY'     => 0
    //         ];
    //     }




    //     /*
    //  * PERIOD ATTENDANCE FROM EBS
    //  */
    //     $periodRows = $this->ebs->query(
    //         "
    //     SELECT

    //         PE.EMP_CODE AS EMP_NO,

    //         ATP.ATT_DATE,

    //         ATP.CLOCK_IN,
    //         ATP.CLOCK_OUT,

    //         NVL(ATP.LATE,0) AS LATE,

    //         NVL(ATP.ABSENT,0) AS ABSENT,

    //         NVL(ATP.LEAVE,0) AS LEAVE,

    //         NVL(ATP.DUTY_DURATION,0) AS DUTY_DURATION,

    //         NVL(ATP.TOTAL_WORKED,0) AS TOTAL_WORKED


    //     FROM ZPI.ATT_PAYLOADBASE ATP


    //     JOIN ZPI.PERSONNEL_EMPLOYEE PE
    //         ON PE.ID = ATP.EMP_ID


    //     WHERE ATP.ATT_DATE BETWEEN
    //           TO_DATE(?,'YYYY-MM-DD')
    //       AND TO_DATE(?,'YYYY-MM-DD')


    //     AND PE.EMP_CODE IN ($inPlaceholders)


    //     ORDER BY
    //         PE.EMP_CODE,
    //         ATP.ATT_DATE
    //     ",
    //         [
    //             $fromDate,
    //             $toDate
    //         ]
    //     )->result_array();



    //     $periodByEmp = [];


    //     foreach ($periodRows as $row) {


    //         $empNo = trim($row['EMP_NO']);


    //         if (!isset($periodByEmp[$empNo])) {

    //             $periodByEmp[$empNo] = [

    //                 'absence_days' => 0,

    //                 'late_days' => 0,

    //                 'overtime_hours' => 0,

    //                 'present_days' => 0
    //             ];
    //         }


    //         if (
    //             (int)$row['ABSENT'] > 0 ||
    //             (int)$row['LEAVE'] > 0
    //         ) {

    //             $periodByEmp[$empNo]['absence_days']++;
    //         } else {

    //             $periodByEmp[$empNo]['present_days']++;
    //         }



    //         if ((int)$row['LATE'] > 0) {

    //             $periodByEmp[$empNo]['late_days']++;
    //         }



    //         $worked = (float)$row['TOTAL_WORKED'];

    //         $duty = (float)$row['DUTY_DURATION'];


    //         if ($worked > $duty) {

    //             $periodByEmp[$empNo]['overtime_hours']
    //                 += ($worked - $duty) / 3600;
    //         }
    //     }




    //     /*
    //  * Pending Approval
    //  */
    //     $approvalRows = $this->db->query(
    //         "
    //              SELECT 
    //         a.EMP_NO,
    //         e.FULL_NAME,
    //         a.LEAVE_TYPE,
    //         a.LEAVE_START_DATE,
    //         a.LEAVE_END_DATE,
    //         a.TOTAL_DAYS,
    //         a.APPROVAL_STATUS
    //     FROM XX_DIGI_EMP_MASTER e
    //     JOIN XX_DIGI_EMP_ABSENCE_TYPE a
    //         ON e.EMPLOYEE_NUMBER = a.EMP_NO
    //     WHERE e.SUPERVISOR_ID IN (
    //         SELECT EMPLOYEE_ID
    //         FROM XX_DIGI_EMP_MASTER
    //         WHERE USER_ID = ?
    //     )
    //     AND UPPER(a.APPROVAL_STATUS) = 'AWAITING'
    //     ORDER BY a.LEAVE_START_DATE ASC
    //                 ",
    //                 [$userID]
    //     )->result_array();





    //     $pendingByEmp = [];

    //     foreach ($approvalRows as $row) {

    //         $empNo = trim($row['EMP_NO']);

    //         $pendingByEmp[$empNo] =
    //             ($pendingByEmp[$empNo] ?? 0) + 1;
    //     }




    //     /*
    //  * Final Employee Response
    //  */

    //     $employees = [];

    //     $presentToday = 0;
    //     $lateToday = 0;
    //     $absentToday = 0;
    //     $leaveToday = 0;



    //     foreach ($roster as $row) {


    //         $empNo = trim($row['EMP_NO']);


    //         $todayStatus =
    //             $this->resolve_today_status(
    //                 $todayByEmp[$empNo] ?? null
    //             );


    //         switch ($todayStatus['key']) {

    //             case 'present':
    //                 $presentToday++;
    //                 break;

    //             case 'late':
    //                 $lateToday++;
    //                 break;

    //             case 'absent':
    //                 $absentToday++;
    //                 break;

    //             case 'leave':
    //                 $leaveToday++;
    //                 break;
    //         }



    //         $period =
    //             $periodByEmp[$empNo] ??
    //             [
    //                 'absence_days' => 0,
    //                 'late_days' => 0,
    //                 'overtime_hours' => 0
    //             ];



    //         $employees[] = [

    //             'emp_no' => $empNo,

    //             'full_name' => $row['FULL_NAME'],

    //             'job_title' => $row['JOB_TITLE'],

    //             'today_status' => $todayStatus,

    //             'period_absence_days' => $period['absence_days'],

    //             'period_late_days' => $period['late_days'],

    //             'period_overtime_hours' =>
    //             $this->format_decimal(
    //                 $period['overtime_hours']
    //             ),

    //             'pending_count' =>
    //             $pendingByEmp[$empNo] ?? 0
    //         ];
    //     }



    //     $result['employees'] = $employees;

    //     $result['approvals'] = $approvalRows;


    //     $result['summary'] = [

    //         'team_size' => count($employees),

    //         'present_today' => $presentToday,

    //         'late_today' => $lateToday,

    //         'absent_today' => $absentToday,

    //         'on_leave_today' => $leaveToday,

    //         'pending_approvals' => count($approvalRows)

    //     ];


    //     return $result;
    // }

    public function get_team_overview($userID, $fromDate, $toDate, $todayDate)
    {
        $userID = trim((string)$userID);

        $result = [
            'employees' => [],
            'approvals' => [],
            'summary' => [
                'team_size' => 0,
                'present_today' => 0,
                'late_today' => 0,
                'absent_today' => 0,
                'on_leave_today' => 0,
                'pending_approvals' => 0,
            ],
        ];

        if ($userID == '') {
            return $result;
        }

        /*
     * ============================================================
     * GET MANAGER TEAM FROM ADW
     * ============================================================
     */
        $roster = $this->db->query(
            "
        SELECT
            TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO,
            FULL_NAME,
            JOB_TITLE,
            DEPARTMENT
        FROM {$this->employeeTable}
        WHERE SUPERVISOR_ID IN
        (
            SELECT DISTINCT EMPLOYEE_ID
            FROM {$this->employeeTable}
            WHERE USER_ID = ?
        )
        AND CURRENT_EMP_FLAG = 'Y'
        ORDER BY FULL_NAME
        ",
            [$userID]
        )->result_array();

        if (empty($roster)) {
            return $result;
        }

        /*
     * ============================================================
     * EMPLOYEE CODES
     * ============================================================
     */
        $empNumbers = [];

        foreach ($roster as $row) {

            $empNo = trim((string)$row['EMP_NO']);

            if ($empNo != '') {
                $empNumbers[] = $empNo;
            }
        }

        if (empty($empNumbers)) {
            return $result;
        }

        $quotedEmpNumbers = array_map(function ($empNo) {
            return "'" . str_replace("'", "''", $empNo) . "'";
        }, $empNumbers);

        $inPlaceholders = implode(',', $quotedEmpNumbers);


        /*
     * ============================================================
     * TODAY ATTENDANCE FROM EBS
     * ============================================================
     */
        $todayRows = $this->ebs->query(
            "
        SELECT
            EMP_CODE AS EMP_NO,
            NAME,
            MIN(TIME) AS PUNCH_IN,
            MAX(TIME) AS PUNCH_OUT
        FROM
        (
            SELECT
                ICT.EMP_CODE,

                PE.FIRST_NAME || ' ' || PE.LAST_NAME AS NAME,

                TO_CHAR(
                    ICT.PUNCH_TIME,
                    'HH24:MI:SS'
                ) AS TIME

            FROM ZPI.ICLOCK_TRANSACTION ICT

            JOIN ZPI.PERSONNEL_EMPLOYEE PE
                ON PE.EMP_CODE = ICT.EMP_CODE

            WHERE ICT.PUNCH_TIME >= TO_DATE(?, 'YYYY-MM-DD')
              AND ICT.PUNCH_TIME < TO_DATE(?, 'YYYY-MM-DD') + 1

              AND ICT.EMP_CODE IN ($inPlaceholders)
        )

        GROUP BY
            EMP_CODE,
            NAME
        ",
            [
                $todayDate,
                $todayDate
            ]
        )->result_array();


        $todayByEmp = [];

        foreach ($todayRows as $row) {

            $empNo = trim((string)$row['EMP_NO']);

            $todayByEmp[$empNo] = [
                'PUNCH_IN'  => $row['PUNCH_IN'],
                'PUNCH_OUT' => $row['PUNCH_OUT'],
                'ABSENCE'   => '',
                'LATE'      => 0,
                'EARLY'     => 0
            ];
        }


        /*
     * ============================================================
     * PERIOD ATTENDANCE FROM EBS
     *
     * EBS is now used only for:
     * - Late
     * - Overtime
     *
     * ABSENT / LEAVE removed from EBS
     * ============================================================
     */
        $periodRows = $this->ebs->query(
            "
        SELECT
            PE.EMP_CODE AS EMP_NO,

            ATP.ATT_DATE,

            ATP.CLOCK_IN,
            ATP.CLOCK_OUT,

            NVL(ATP.LATE, 0) AS LATE,

            NVL(ATP.DUTY_DURATION, 0) AS DUTY_DURATION,

            NVL(ATP.TOTAL_WORKED, 0) AS TOTAL_WORKED

        FROM ZPI.ATT_PAYLOADBASE ATP

        JOIN ZPI.PERSONNEL_EMPLOYEE PE
            ON PE.ID = ATP.EMP_ID

        WHERE ATP.ATT_DATE BETWEEN
              TO_DATE(?, 'YYYY-MM-DD')
          AND TO_DATE(?, 'YYYY-MM-DD')

        AND PE.EMP_CODE IN ($inPlaceholders)

        ORDER BY
            PE.EMP_CODE,
            ATP.ATT_DATE
        ",
            [
                $fromDate,
                $toDate
            ]
        )->result_array();


        $periodByEmp = [];

        foreach ($periodRows as $row) {

            $empNo = trim((string)$row['EMP_NO']);

            if (!isset($periodByEmp[$empNo])) {

                $periodByEmp[$empNo] = [
                    'absence_days'    => 0,
                    'late_days'       => 0,
                    'overtime_hours'  => 0,
                    'present_days'    => 0
                ];
            }


            /*
         * Late
         */
            if ((int)$row['LATE'] > 0) {

                $periodByEmp[$empNo]['late_days']++;
            }


            /*
         * Overtime
         */
            $worked = (float)$row['TOTAL_WORKED'];

            $duty = (float)$row['DUTY_DURATION'];

            if ($worked > $duty) {

                $periodByEmp[$empNo]['overtime_hours']
                    += ($worked - $duty) / 3600;
            }
        }


        /*
     * ============================================================
     * ABSENCE / LEAVE FROM ADW
     *
     * Source:
     * XX_DIGI_EMP_ABSENCE_TYPE
     *
     * Uses TOTAL_DAYS
     *
     * Date range:
     * $fromDate -> $toDate
     * ============================================================
     */
        $absenceRows = $this->db->query(
            "
        SELECT
            a.EMP_NO,

            SUM(
                NVL(a.TOTAL_DAYS, 0)
            ) AS ABSENCE_DAYS

        FROM XX_DIGI_EMP_ABSENCE_TYPE a

        JOIN XX_DIGI_EMP_MASTER e
            ON e.EMPLOYEE_NUMBER = a.EMP_NO

        WHERE e.SUPERVISOR_ID IN
        (
            SELECT EMPLOYEE_ID
            FROM XX_DIGI_EMP_MASTER
            WHERE USER_ID = ?
        )

        AND UPPER(TRIM(a.APPROVAL_STATUS)) = 'APPROVED'

        /*
         * Leave overlaps selected period
         */
        AND TO_DATE(a.LEAVE_START_DATE, 'DD-MM-RR')
            <= TO_DATE(?, 'YYYY-MM-DD')

        AND TO_DATE(a.LEAVE_END_DATE, 'DD-MM-RR')
            >= TO_DATE(?, 'YYYY-MM-DD')

        AND a.EMP_NO IN ($inPlaceholders)

        GROUP BY
            a.EMP_NO
        ",
            [
                $userID,
                $toDate,
                $fromDate
            ]
        )->result_array();


        /*
     * Create employee absence map
     */
        $absenceByEmp = [];

        foreach ($absenceRows as $row) {

            $empNo = trim((string)$row['EMP_NO']);

            if ($empNo === '') {
                continue;
            }

            $absenceByEmp[$empNo] =
                (float)$row['ABSENCE_DAYS'];
        }


        /*
     * ============================================================
     * PUT ADW ABSENCE INTO PERIOD DATA
     * ============================================================
     */
        foreach ($absenceByEmp as $empNo => $absenceDays) {

            if (!isset($periodByEmp[$empNo])) {

                $periodByEmp[$empNo] = [
                    'absence_days'   => 0,
                    'late_days'      => 0,
                    'overtime_hours' => 0,
                    'present_days'   => 0
                ];
            }

            $periodByEmp[$empNo]['absence_days'] =
                $absenceDays;
        }


        /*
     * ============================================================
     * PENDING APPROVAL
     * ============================================================
     */
        $approvalRows = $this->db->query(
            "
        SELECT
            a.EMP_NO,
            e.FULL_NAME,
            a.LEAVE_TYPE,
            a.LEAVE_START_DATE,
            a.LEAVE_END_DATE,
            a.TOTAL_DAYS,
            a.APPROVAL_STATUS

        FROM XX_DIGI_EMP_MASTER e

        JOIN XX_DIGI_EMP_ABSENCE_TYPE a
            ON e.EMPLOYEE_NUMBER = a.EMP_NO

        WHERE e.SUPERVISOR_ID IN
        (
            SELECT EMPLOYEE_ID
            FROM XX_DIGI_EMP_MASTER
            WHERE USER_ID = ?
        )

        AND UPPER(a.APPROVAL_STATUS) = 'AWAITING'

        ORDER BY
            a.LEAVE_START_DATE ASC
        ",
            [$userID]
        )->result_array();


        $pendingByEmp = [];

        foreach ($approvalRows as $row) {

            $empNo = trim((string)$row['EMP_NO']);

            $pendingByEmp[$empNo] =
                ($pendingByEmp[$empNo] ?? 0) + 1;
        }


        /*
     * ============================================================
     * FINAL EMPLOYEE RESPONSE
     * ============================================================
     */
        $employees = [];

        $presentToday = 0;
        $lateToday = 0;
        $absentToday = 0;
        $leaveToday = 0;


        foreach ($roster as $row) {

            $empNo = trim((string)$row['EMP_NO']);


            /*
         * Today's status
         */
            $todayStatus =
                $this->resolve_today_status(
                    $todayByEmp[$empNo] ?? null
                );


            switch ($todayStatus['key']) {

                case 'present':
                    $presentToday++;
                    break;

                case 'late':
                    $lateToday++;
                    break;

                case 'absent':
                    $absentToday++;
                    break;

                case 'leave':
                    $leaveToday++;
                    break;
            }


            /*
         * Period data
         */
            $period =
                $periodByEmp[$empNo] ??
                [
                    'absence_days'   => 0,
                    'late_days'      => 0,
                    'overtime_hours' => 0
                ];


            $employees[] = [

                'emp_no' =>
                $empNo,

                'full_name' =>
                $row['FULL_NAME'],

                'job_title' =>
                $row['JOB_TITLE'],

                'today_status' =>
                $todayStatus,

                /*
             * ABSENCE NOW COMES FROM ADW
             */
                'period_absence_days' =>
                $period['absence_days'],

                /*
             * LATE COMES FROM EBS
             */
                'period_late_days' =>
                $period['late_days'],

                /*
             * OVERTIME COMES FROM EBS
             */
                'period_overtime_hours' =>
                $this->format_decimal(
                    $period['overtime_hours']
                ),

                /*
             * Pending approval
             */
                'pending_count' =>
                $pendingByEmp[$empNo] ?? 0
            ];
        }


        /*
     * ============================================================
     * FINAL RESULT
     * ============================================================
     */
        $result['employees'] = $employees;

        $result['approvals'] = $approvalRows;

        $result['summary'] = [

            'team_size' => count($employees),
            'present_today' => $presentToday,
            'late_today' => $lateToday,
            'absent_today' => $absentToday,
            'on_leave_today' => $leaveToday,
            'pending_approvals' => count($approvalRows)
        ];


        return $result;
    }

    /**
     * Writes a manager decision straight back into XX_DIGI_EMP_ABSENCE_TYPE.
     * The table has no surrogate key exposed anywhere in the app today, so
     * the pending row is matched the same way it is displayed: by employee
     * number plus the exact leave start/end date strings shown on screen.
     */
    public function update_absence_approval($empNo, $leaveStartDate, $leaveEndDate, $status)
    {
        $empNo = trim((string) $empNo);
        $leaveStartDate = trim((string) $leaveStartDate);
        $leaveEndDate = trim((string) $leaveEndDate);
        $status = trim((string) $status);

        if ($empNo === '' || $leaveStartDate === '' || $leaveEndDate === '' || $status === '') {
            return false;
        }

        $this->db->query(
            "UPDATE {$this->absenceTable}
             SET APPROVAL_STATUS = ?
             WHERE TRIM(EMP_NO) = ?
               AND TRIM(LEAVE_START_DATE) = ?
               AND TRIM(LEAVE_END_DATE) = ?",
            [$status, $empNo, $leaveStartDate, $leaveEndDate]
        );

        return $this->db->affected_rows() > 0;
    }

    private function resolve_today_status($row)
    {
        if (!$row) {
            return [
                'key'   => 'absent',
                'label' => 'Absent'
            ];
        }

        $punchIn  = trim((string)($row['PUNCH_IN'] ?? ''));
        $punchOut = trim((string)($row['PUNCH_OUT'] ?? ''));

        if ($punchIn == '' && $punchOut == '') {
            return [
                'key'   => 'absent',
                'label' => 'Absent'
            ];
        }

        return [
            'key'   => 'present',
            'label' => 'Present'
        ];
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
