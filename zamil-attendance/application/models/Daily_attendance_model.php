<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Daily_attendance_model extends CI_Model
{
    public $ebs;

    private $timesheetTable = 'XX_DIGI_ATT_ATT_SHEET';
    private $employeeTable = 'XX_DIGI_EMP_MASTER';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->ebs = $this->load->database('ebs', true);
    }

    // public function get_summary(array $filters)
    // {
    //     [$baseSql, $binds] = $this->build_base_query($filters, false);

    //     $sql = "
    //         SELECT
    //             COUNT(1) AS TOTAL_ROWS,
    //             COUNT(DISTINCT EMP_NO) AS SCHEDULED_EMPLOYEES,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS IN ('On Time', 'Late')
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS CHECKED_IN,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'On Time'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS ON_TIME,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Late'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS LATE,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Not Checked In'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS NOT_CHECKED_IN,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Missing Punch'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS MISSING_PUNCH,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Approved Leave'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS APPROVED_LEAVE,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Weekend / Off-day'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS WEEKEND,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Occasion / Holiday'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS OCCASION,

    //             SUM(
    //                 CASE
    //                     WHEN ATTENDANCE_STATUS = 'Absent'
    //                     THEN 1
    //                     ELSE 0
    //                 END
    //             ) AS ABSENT,

    //             NVL(SUM(LATE_MINUTES), 0) AS TOTAL_LATE_MINUTES

    //         FROM ({$baseSql}) daily_data
    //     ";

    //     $row = $this->db->query($sql, $binds)->row_array() ?: [];

    //     return [
    //         'scheduled_employees' =>
    //         (int) ($row['SCHEDULED_EMPLOYEES'] ?? 0),

    //         'checked_in' =>
    //         (int) ($row['CHECKED_IN'] ?? 0),

    //         'on_time' =>
    //         (int) ($row['ON_TIME'] ?? 0),

    //         'late' =>
    //         (int) ($row['LATE'] ?? 0),

    //         'not_checked_in' =>
    //         (int) ($row['NOT_CHECKED_IN'] ?? 0),

    //         'missing_punch' =>
    //         (int) ($row['MISSING_PUNCH'] ?? 0),

    //         'approved_leave' =>
    //         (int) ($row['APPROVED_LEAVE'] ?? 0),

    //         'weekend' =>
    //         (int) ($row['WEEKEND'] ?? 0),

    //         'occasion' =>
    //         (int) ($row['OCCASION'] ?? 0),

    //         'absent' =>
    //         (int) ($row['ABSENT'] ?? 0),

    //         'total_late_minutes' =>
    //         (float) ($row['TOTAL_LATE_MINUTES'] ?? 0),
    //     ];
    // }
    public function get_summary(array $filters = [])
    {
        $rows = $this->get_daily_attendance(
            'list',
            $filters,
            999999,
            1
        );

        $checkedIn = count($rows);

        $missingPunch = 0;

        foreach ($rows as $row) {

            if (
                !empty($row['PUNCH_IN']) &&
                $row['PUNCH_IN'] === $row['PUNCH_OUT']
            ) {
                $missingPunch++;
            }
        }

        $scheduled = $this->ebs->query(
            "
        SELECT COUNT(DISTINCT EMP_CODE) AS CNT
        FROM ZPI.XX_TIMETABLE
        "
        )->row_array();

        $scheduledEmployees = (int) ($scheduled['CNT'] ?? 0);

        return [
            'scheduled_employees' => $scheduledEmployees,
            'checked_in'          => $checkedIn,
            'on_time'             => $checkedIn,
            'late'                => 0,
            'total_late_minutes'  => 0,
            'not_checked_in'      => max(
                0,
                $scheduledEmployees - $checkedIn
            ),
            'absent'              => 0,
            'missing_punch'       => $missingPunch,
            'approved_leave'      => 0,
            'weekend'             => 0,
            'occasion'            => 0,
        ];
    }

    public function get_daily_attendance($type = 'list', array $filters = [], $limit = 10, $currentPage = 1)
    {
        $fromDate = $filters['from_date'] ?? date('Y-m-d');
        $toDate   = $filters['to_date'] ?? $fromDate;
        $search   = trim((string) ($filters['search'] ?? ''));

        $currentPage = max(1, (int) $currentPage);
        $limit = max(1, (int) $limit);
        $offset = ($currentPage - 1) * $limit;

        $sql = "
        SELECT
            EMP_CODE AS EMP_NO,
            NAME AS EMP_NAME,
            TO_CHAR(TDATE, 'DD-MON-YYYY') AS ATT_DATE_DISPLAY,
            MIN(TIME) AS PUNCH_IN,
            MAX(TIME) AS PUNCH_OUT,
            WORK_TIME
        FROM
        (
            SELECT DISTINCT
                ICT.EMP_CODE,
                (
                    SELECT FIRST_NAME || ' ' || LAST_NAME
                    FROM ZPI.PERSONNEL_EMPLOYEE
                    WHERE EMP_CODE = ICT.EMP_CODE
                ) AS NAME,
                TRUNC(ICT.PUNCH_TIME) AS TDATE,
                TO_CHAR(ICT.PUNCH_TIME, 'HH24:MI:SS') AS TIME,
                ATP.DUTY_DURATION / 3600 AS WORK_TIME
            FROM ZPI.ICLOCK_TRANSACTION ICT
            JOIN ZPI.PERSONNEL_EMPLOYEE PE
                ON ICT.EMP_CODE = PE.EMP_CODE
            LEFT JOIN ZPI.XX_TIMETABLE XTM
                ON PE.EMP_CODE = XTM.EMP_CODE
            LEFT JOIN ZPI.ATT_PAYLOADBASE ATP
                ON PE.ID = ATP.EMP_ID
                AND TO_CHAR(ICT.PUNCH_TIME, 'DD-MON-YY') = ATP.ATT_DATE
        )
        WHERE TDATE BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')
     ";

        $binds = [$fromDate, $toDate];

        if ($search !== '') {
            $sql .= " AND (UPPER(NAME) LIKE UPPER(?) OR TO_CHAR(EMP_CODE) = ?) ";
            $binds[] = '%' . $search . '%';
            $binds[] = $search;
        }

        $sql .= "
        GROUP BY EMP_CODE, NAME, TDATE, WORK_TIME
        ORDER BY TDATE ASC, EMP_CODE ASC
        ";

        if ($type === 'total') {
            $countSql = "SELECT COUNT(*) AS TOTAL FROM ({$sql})";
            $row = $this->ebs->query($countSql, $binds)->row_array();
            return (int) ($row['TOTAL'] ?? 0);
        }

        // Export mode: return every matching row, no pagination
        if ($type === 'export') {
            return $this->ebs->query($sql, $binds)->result_array();
        }

        // Default 'list' mode: paginate
        $sql = "
        SELECT * FROM (
            SELECT q.*, ROWNUM rn FROM ({$sql}) q WHERE ROWNUM <= ?
        )
        WHERE rn > ?
       ";
        $binds[] = $offset + $limit;
        $binds[] = $offset;

        return $this->ebs->query($sql, $binds)->result_array();
    }

    // public function get_daily_attendance(
    //     $type = 'list',
    //     array $filters = [],
    //     $limit = 10,
    //     $currentPage = 1
    // ) {
    //     $fromDate = $filters['from_date'] ?? date('Y-m-d');
    //     $toDate   = $filters['to_date'] ?? $fromDate;

    //     $search = trim((string) ($filters['search'] ?? ''));

    //     $currentPage = max(1, (int) $currentPage);
    //     $limit = max(1, (int) $limit);

    //     $offset = ($currentPage - 1) * $limit;

    //     $sql = "
    //     SELECT
    //         EMP_CODE AS EMP_NO,
    //         NAME AS EMP_NAME,
    //         TO_CHAR(TDATE, 'DD-MON-YYYY') AS ATT_DATE_DISPLAY,
    //         MIN(TIME) AS PUNCH_IN,
    //         MAX(TIME) AS PUNCH_OUT,
    //         WORK_TIME

    //     FROM
    //     (
    //         SELECT DISTINCT

    //             ICT.EMP_CODE,

    //             (
    //                 SELECT FIRST_NAME || ' ' || LAST_NAME
    //                 FROM ZPI.PERSONNEL_EMPLOYEE
    //                 WHERE EMP_CODE = ICT.EMP_CODE
    //             ) AS NAME,

    //             TRUNC(ICT.PUNCH_TIME) AS TDATE,

    //             TO_CHAR(
    //                 ICT.PUNCH_TIME,
    //                 'HH24:MI:SS'
    //             ) AS TIME,

    //             ATP.DUTY_DURATION / 3600 AS WORK_TIME

    //         FROM ZPI.ICLOCK_TRANSACTION ICT

    //         JOIN ZPI.PERSONNEL_EMPLOYEE PE
    //             ON ICT.EMP_CODE = PE.EMP_CODE

    //         LEFT JOIN ZPI.XX_TIMETABLE XTM
    //             ON PE.EMP_CODE = XTM.EMP_CODE

    //         LEFT JOIN ZPI.ATT_PAYLOADBASE ATP
    //             ON PE.ID = ATP.EMP_ID

    //             AND TO_CHAR(
    //                 ICT.PUNCH_TIME,
    //                 'DD-MON-YY'
    //             ) = ATP.ATT_DATE
    //     )

    //     WHERE TDATE BETWEEN
    //         TO_DATE(?, 'YYYY-MM-DD')
    //         AND TO_DATE(?, 'YYYY-MM-DD')
    //  ";

    //     $binds = [
    //         $fromDate,
    //         $toDate
    //     ];

    //     /*
    //  * Employee Search
    //  */
    //     if ($search !== '') {

    //         $sql .= "
    //         AND (
    //             UPPER(NAME) LIKE UPPER(?)
    //             OR TO_CHAR(EMP_CODE) = ?
    //         )
    //     ";

    //         $binds[] = '%' . $search . '%';
    //         $binds[] = $search;
    //     }

    //     $sql .= "
    //     GROUP BY
    //         EMP_CODE,
    //         NAME,
    //         TDATE,
    //         WORK_TIME

    //     ORDER BY
    //         TDATE ASC,
    //         EMP_CODE ASC
    //    ";

    //     /*
    //  * TOTAL
    //  */
    //     if ($type === 'total') {

    //         $countSql = "
    //         SELECT COUNT(*) AS TOTAL
    //         FROM ({$sql})
    //     ";

    //         $row = $this->ebs
    //             ->query($countSql, $binds)
    //             ->row_array();

    //         return (int) ($row['TOTAL'] ?? 0);
    //     }

    //     /*
    //  * PAGINATION
    //  */
    //     $sql = "
    //     SELECT *
    //     FROM (
    //         SELECT
    //             q.*,
    //             ROWNUM rn
    //         FROM (
    //             {$sql}
    //         ) q
    //         WHERE ROWNUM <= ?
    //     )
    //     WHERE rn > ?
    //  ";

    //     $binds[] = $offset + $limit;
    //     $binds[] = $offset;

    //     return $this->ebs
    //         ->query($sql, $binds)
    //         ->result_array();
    // }
 

   

    // private function build_base_query(array $filters)
    // {
    //     /*
    //  * Read filter values.
    //  */
    //     $date = $filters['date'] ?? date('Y-m-d');
    //     $department = trim((string) ($filters['department'] ?? ''));
    //     $shift = trim((string) ($filters['shift'] ?? ''));
    //     $status = trim((string) ($filters['status'] ?? ''));
    //     $search = trim((string) ($filters['search'] ?? ''));

    //     /*
    //  * Conditions used inside the main attendance query.
    //  */
    //     $where = [
    //         "TRUNC(a.ATT_DATE) = TO_DATE(?, 'YYYY-MM-DD')"
    //     ];

    //     $binds = [$date];

    //     /*
    //  * Department filter.
    //  */
    //     if ($department !== '') {
    //         $where[] = "UPPER(TRIM(e.DEPARTMENT)) = ?";
    //         $binds[] = strtoupper($department);
    //     }

    //     /*
    //  * Shift filter.
    //  */
    //     if ($shift !== '') {
    //         $where[] = "UPPER(TRIM(a.SHIFT)) = ?";
    //         $binds[] = strtoupper($shift);
    //     }

    //     /*
    //  * Convert the LATE column safely into a number.
    //  *
    //  * If LATE contains an invalid value, it returns zero.
    //  */
    //     $lateMinutes = "
    //     CASE
    //         WHEN REGEXP_LIKE(
    //             TRIM(NVL(a.LATE, '0')),
    //             '^[0-9]+(\.[0-9]+){0,1}$'
    //         )
    //         THEN TO_NUMBER(TRIM(a.LATE))
    //         ELSE 0
    //     END
    //  ";

    //     /*
    //  * Calculate attendance status from the available columns.
    //  *
    //  * ATTENDANCE_STATUS is not a physical table column.
    //  * It is created by this SQL query.
    //  */
    //     $attendanceStatus = "
    //     CASE
    //         WHEN UPPER(TRIM(a.ABSENCE)) LIKE '%LEAVE%'
    //           OR UPPER(TRIM(a.ABSENCE)) LIKE '%VACATION%'
    //         THEN 'Approved Leave'

    //         WHEN UPPER(TRIM(a.ABSENCE)) LIKE '%WEEKEND%'
    //           OR UPPER(TRIM(a.ABSENCE)) LIKE '%OFF DAY%'
    //           OR UPPER(TRIM(a.ABSENCE)) LIKE '%OFF-DAY%'
    //         THEN 'Weekend / Off-day'

    //         WHEN UPPER(TRIM(a.ABSENCE)) LIKE '%OCCASION%'
    //           OR UPPER(TRIM(a.ABSENCE)) LIKE '%HOLIDAY%'
    //         THEN 'Occasion / Holiday'

    //         WHEN a.ABSENCE IS NOT NULL
    //           AND TRIM(a.ABSENCE) IS NOT NULL
    //           AND UPPER(TRIM(a.ABSENCE)) NOT IN ('PRESENT', 'P')
    //         THEN 'Absent'

    //         WHEN a.PUNCH_IN IS NULL
    //          AND a.PUNCH_OUT IS NULL
    //         THEN 'Not Checked In'

    //         WHEN a.PUNCH_IN IS NULL
    //           OR a.PUNCH_OUT IS NULL
    //         THEN 'Missing Punch'

    //         WHEN {$lateMinutes} > 0
    //         THEN 'Late'

    //         ELSE 'On Time'
    //     END
    //  ";

    //     /*
    //  * First query:
    //  * Read attendance data and calculate the attendance status.
    //  */
    //     $innerSql = "
    //     SELECT
    //         a.HEADER_ID,
    //         TO_CHAR(a.EMP_NO) AS EMP_NO,

    //         NVL(
    //             TRIM(a.EMP_NAME),
    //             TRIM(e.FULL_NAME)
    //         ) AS EMP_NAME,

    //         NVL(
    //             TRIM(e.DEPARTMENT),
    //             'Not Assigned'
    //         ) AS DEPARTMENT,

    //         NVL(
    //             TRIM(a.SHIFT),
    //             '-'
    //         ) AS SHIFT,

    //         TO_CHAR(
    //             TRUNC(a.ATT_DATE),
    //             'YYYY-MM-DD'
    //         ) AS ATT_DATE,

    //         TO_CHAR(
    //             TRUNC(a.ATT_DATE),
    //             'DD Mon YYYY'
    //         ) AS ATT_DATE_DISPLAY,

    //         a.CHECK_IN,
    //         a.PUNCH_IN,
    //         a.CHECK_OUT,
    //         a.PUNCH_OUT,
    //         a.TOTAL_MINUTES,
    //         a.EARLY,
    //         a.LATE,
    //         a.OVERTIME,
    //         a.ABSENCE,

    //         {$lateMinutes} AS LATE_MINUTES,
    //         {$attendanceStatus} AS ATTENDANCE_STATUS

    //     FROM {$this->timesheetTable} a

    //     LEFT JOIN {$this->employeeTable} e
    //         ON TO_CHAR(e.EMPLOYEE_NUMBER) =
    //            TO_CHAR(a.EMP_NO)

    //     WHERE " . implode(' AND ', $where);

    //     /*
    //  * Outer query:
    //  * Apply status and employee search filters.
    //  */
    //     $outerWhere = [];

    //     if ($status !== '') {
    //         $statusMap = [
    //             'on_time' => 'On Time',
    //             'late' => 'Late',
    //             'not_checked_in' => 'Not Checked In',
    //             'missing_punch' => 'Missing Punch',
    //             'approved_leave' => 'Approved Leave',
    //             'weekend' => 'Weekend / Off-day',
    //             'occasion' => 'Occasion / Holiday',
    //             'absent' => 'Absent',
    //         ];

    //         $selectedStatus = $statusMap[$status] ?? $status;

    //         $outerWhere[] = "ATTENDANCE_STATUS = ?";
    //         $binds[] = $selectedStatus;
    //     }

    //     if ($search !== '') {
    //         $like = '%' . strtoupper($search) . '%';

    //         $outerWhere[] = "
    //         (
    //             UPPER(EMP_NO) LIKE ?
    //             OR UPPER(EMP_NAME) LIKE ?
    //             OR UPPER(DEPARTMENT) LIKE ?
    //             OR UPPER(SHIFT) LIKE ?
    //         )
    //     ";

    //         $binds[] = $like;
    //         $binds[] = $like;
    //         $binds[] = $like;
    //         $binds[] = $like;
    //     }

    //     /*
    //  * Final query.
    //  */
    //     $sql = "
    //     SELECT *
    //     FROM ({$innerSql}) daily_data
    //     ";

    //     if (!empty($outerWhere)) {
    //         $sql .= "
    //         WHERE " . implode(' AND ', $outerWhere);
    //     }

    //     /*
    //  * Show important attendance problems first.
    //  */
    //     $sql .= "
    //     ORDER BY
    //         CASE ATTENDANCE_STATUS
    //             WHEN 'Absent' THEN 1
    //             WHEN 'Not Checked In' THEN 2
    //             WHEN 'Missing Punch' THEN 3
    //             WHEN 'Late' THEN 4
    //             WHEN 'Approved Leave' THEN 5
    //             WHEN 'Occasion / Holiday' THEN 6
    //             WHEN 'Weekend / Off-day' THEN 7
    //             ELSE 8
    //         END,
    //         EMP_NAME,
    //         EMP_NO
    // ";

    //     return [$sql, $binds];
    // }
}
