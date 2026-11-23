<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Alerts_exceptions_model extends CI_Model
{
    private $timesheetTable =
    'XX_DIGI_ATT_ATT_SHEET';

    private $attendanceCardTable =
    'XX_DIGI_ATT_ATT_CARD';

    private $employeeTable =
    'XX_DIGI_EMP_MASTER';

    private $timetableTable =
    'XX_DIGI_TIMETABLE_PR';

    private $occasionTable =
    'XX_DIGI_ATT_OCCASIONS';

    public function __construct()
    {
        parent::__construct();

        $this->load->database();
    }

    public function get_summary(
        array $filters
    ) {
        [$sql, $binds] =
            $this->build_query(
                $filters,
                false
            );

        $summarySql = "
            SELECT
                COUNT(1) AS TOTAL,

                NVL(
                    SUM(
                        CASE
                            WHEN SEVERITY = 'High'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS HIGH_COUNT,

                NVL(
                    SUM(
                        CASE
                            WHEN SEVERITY = 'Medium'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS MEDIUM_COUNT,

                NVL(
                    SUM(
                        CASE
                            WHEN SEVERITY = 'Low'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS LOW_COUNT,

                NVL(
                    SUM(
                        CASE
                            WHEN EXCEPTION_TYPE =
                                 'missing_punch'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS MISSING_PUNCH,

                NVL(
                    SUM(
                        CASE
                            WHEN EXCEPTION_TYPE =
                                 'same_punch'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS SAME_PUNCH,

                NVL(
                    SUM(
                        CASE
                            WHEN EXCEPTION_TYPE =
                                 'missing_shift'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS MISSING_SHIFT,

                NVL(
                    SUM(
                        CASE
                            WHEN EXCEPTION_TYPE =
                                 'missing_occasion'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS MISSING_OCCASION,

                NVL(
                    SUM(
                        CASE
                            WHEN EXCEPTION_TYPE =
                                 'high_overtime'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS HIGH_OVERTIME,

                NVL(
                    SUM(
                        CASE
                            WHEN EXCEPTION_TYPE =
                                 'missing_timetable'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS MISSING_TIMETABLE

            FROM ({$sql}) exception_data
        ";

        $row = $this->db
            ->query(
                $summarySql,
                $binds
            )
            ->row_array() ?: [];

        return [
            'total' =>
            (int) ($row['TOTAL'] ?? 0),

            'high' =>
            (int) ($row['HIGH_COUNT'] ?? 0),

            'medium' =>
            (int) ($row['MEDIUM_COUNT'] ?? 0),

            'low' =>
            (int) ($row['LOW_COUNT'] ?? 0),

            'missing_punch' =>
            (int) (
                $row['MISSING_PUNCH'] ?? 0
            ),

            'same_punch' =>
            (int) (
                $row['SAME_PUNCH'] ?? 0
            ),

            'missing_shift' =>
            (int) (
                $row['MISSING_SHIFT'] ?? 0
            ),

            'missing_occasion' =>
            (int) (
                $row['MISSING_OCCASION'] ?? 0
            ),

            'high_overtime' =>
            (int) (
                $row['HIGH_OVERTIME'] ?? 0
            ),

            'missing_timetable' =>
            (int) (
                $row['MISSING_TIMETABLE'] ?? 0
            ),
        ];
    }

    public function get_rows(
        array $filters,
        $limit = null,
        $offset = 0
    ) {
        [$sql, $binds] =
            $this->build_query(
                $filters,
                true
            );

        $sql = "
            SELECT *
            FROM ({$sql}) exception_data
            ORDER BY
                SEVERITY_SORT,
                ATT_DATE_VALUE DESC,
                EMP_NAME,
                EMP_NO
        ";

        if ((int) $limit > 0) {
            $sql .= "
                OFFSET " . (int) $offset . " ROWS
                FETCH NEXT " . (int) $limit . " ROWS ONLY
            ";
        }

        return $this->db
            ->query(
                $sql,
                $binds
            )
            ->result_array();
    }

    public function count_rows(
        array $filters
    ) {
        [$sql, $binds] =
            $this->build_query(
                $filters,
                true
            );

        $countSql = "
            SELECT COUNT(1) AS CNT
            FROM ({$sql}) exception_count
        ";

        $row = $this->db
            ->query(
                $countSql,
                $binds
            )
            ->row_array();

        return (int) (
            $row['CNT'] ?? 0
        );
    }

    public function get_department_options()
    {
        $sql = "
            SELECT DISTINCT
                TRIM(DEPARTMENT) AS DEPARTMENT
            FROM {$this->employeeTable}
            WHERE TRIM(DEPARTMENT) IS NOT NULL
            ORDER BY TRIM(DEPARTMENT)
        ";

        return $this->db
            ->query($sql)
            ->result_array();
    }

    private function build_query(
        array $filters,
        $applyDetailedFilters
    ) {
        $fromDate =
            $filters['from_date'];

        $toDate =
            $filters['to_date'];

        $overtimeThreshold =
            (int) (
                $filters['overtime_threshold'] ?? 120
            );

        $numericOvertime = "
            CASE
                WHEN REGEXP_LIKE(
                    TRIM(
                        NVL(
                            s.OVERTIME,
                            '0'
                        )
                    ),
                    '^-{0,1}[0-9]+(\.[0-9]+){0,1}$'
                )
                THEN TO_NUMBER(
                    TRIM(s.OVERTIME)
                )
                ELSE 0
            END
        ";

        /*
         * All UNION branches must return the same
         * columns in the same order.
         */
        $baseSql = "

            /* 1. Missing Punch */
            SELECT
                'missing_punch'
                    AS EXCEPTION_TYPE,

                'Missing Punch'
                    AS EXCEPTION_LABEL,

                'High'
                    AS SEVERITY,

                1
                    AS SEVERITY_SORT,

                s.HEADER_ID
                    AS SOURCE_ID,

                TO_CHAR(s.EMP_NO)
                    AS EMP_NO,

                NVL(
                    TRIM(s.EMP_NAME),
                    TRIM(e.FULL_NAME)
                ) AS EMP_NAME,

                NVL(
                    TRIM(e.DEPARTMENT),
                    'Not Assigned'
                ) AS DEPARTMENT,

                NVL(
                    TRIM(s.SHIFT),
                    '-'
                ) AS SHIFT,

                TRUNC(s.ATT_DATE)
                    AS ATT_DATE_VALUE,

                TO_CHAR(
                    TRUNC(s.ATT_DATE),
                    'DD Mon YYYY'
                ) AS ATT_DATE_DISPLAY,

                s.PUNCH_IN,
                s.PUNCH_OUT,
                s.LATE,
                s.OVERTIME,
                s.ABSENCE,

                'Only one attendance punch is available.'
                    AS DETAILS

            FROM {$this->timesheetTable} s

            LEFT JOIN {$this->employeeTable} e
                ON TO_CHAR(e.EMPLOYEE_NUMBER) =
                   TO_CHAR(s.EMP_NO)

            WHERE TRUNC(s.ATT_DATE)
                  BETWEEN TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )
                  AND TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )

              AND (
                    (
                        s.PUNCH_IN IS NULL
                        AND s.PUNCH_OUT IS NOT NULL
                    )
                    OR
                    (
                        s.PUNCH_IN IS NOT NULL
                        AND s.PUNCH_OUT IS NULL
                    )
                  )

            UNION ALL

            /* 2. Same Punch */
            SELECT
                'same_punch',
                'Same Punch',
                'Medium',
                2,

                s.HEADER_ID,
                TO_CHAR(s.EMP_NO),

                NVL(
                    TRIM(s.EMP_NAME),
                    TRIM(e.FULL_NAME)
                ),

                NVL(
                    TRIM(e.DEPARTMENT),
                    'Not Assigned'
                ),

                NVL(
                    TRIM(s.SHIFT),
                    '-'
                ),

                TRUNC(s.ATT_DATE),

                TO_CHAR(
                    TRUNC(s.ATT_DATE),
                    'DD Mon YYYY'
                ),

                s.PUNCH_IN,
                s.PUNCH_OUT,
                s.LATE,
                s.OVERTIME,
                s.ABSENCE,

                'Punch-in and punch-out contain the same time.'

            FROM {$this->timesheetTable} s

            LEFT JOIN {$this->employeeTable} e
                ON TO_CHAR(e.EMPLOYEE_NUMBER) =
                   TO_CHAR(s.EMP_NO)

            WHERE TRUNC(s.ATT_DATE)
                  BETWEEN TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )
                  AND TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )

              AND s.PUNCH_IN IS NOT NULL

              AND s.PUNCH_OUT IS NOT NULL

              AND TRIM(s.PUNCH_IN) =
                  TRIM(s.PUNCH_OUT)

            UNION ALL

            /* 3. Missing Shift */
            SELECT
                'missing_shift',
                'Missing Shift',
                'High',
                1,

                s.HEADER_ID,
                TO_CHAR(s.EMP_NO),

                NVL(
                    TRIM(s.EMP_NAME),
                    TRIM(e.FULL_NAME)
                ),

                NVL(
                    TRIM(e.DEPARTMENT),
                    'Not Assigned'
                ),

                '-' AS SHIFT,

                TRUNC(s.ATT_DATE),

                TO_CHAR(
                    TRUNC(s.ATT_DATE),
                    'DD Mon YYYY'
                ),

                s.PUNCH_IN,
                s.PUNCH_OUT,
                s.LATE,
                s.OVERTIME,
                s.ABSENCE,

                'Attendance row does not contain a shift.'

            FROM {$this->timesheetTable} s

            LEFT JOIN {$this->employeeTable} e
                ON TO_CHAR(e.EMPLOYEE_NUMBER) =
                   TO_CHAR(s.EMP_NO)

            WHERE TRUNC(s.ATT_DATE)
                  BETWEEN TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )
                  AND TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )

              AND (
                    s.SHIFT IS NULL
                    OR TRIM(s.SHIFT) IS NULL
                  )

            UNION ALL

            /* 4. Missing Occasion */
            SELECT
                'missing_occasion',
                'Missing Occasion',
                'High',
                1,

                s.HEADER_ID,
                TO_CHAR(s.EMP_NO),

                NVL(
                    TRIM(s.EMP_NAME),
                    TRIM(e.FULL_NAME)
                ),

                NVL(
                    TRIM(e.DEPARTMENT),
                    'Not Assigned'
                ),

                NVL(
                    TRIM(s.SHIFT),
                    '-'
                ),

                TRUNC(s.ATT_DATE),

                TO_CHAR(
                    TRUNC(s.ATT_DATE),
                    'DD Mon YYYY'
                ),

                s.PUNCH_IN,
                s.PUNCH_OUT,
                s.LATE,
                s.OVERTIME,
                s.ABSENCE,

                'Attendance is marked as holiday or occasion, '
                || 'but no active occasion covers this date.'

            FROM {$this->timesheetTable} s

            LEFT JOIN {$this->employeeTable} e
                ON TO_CHAR(e.EMPLOYEE_NUMBER) =
                   TO_CHAR(s.EMP_NO)

            WHERE TRUNC(s.ATT_DATE)
                  BETWEEN TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )
                  AND TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )

              AND (
                    UPPER(
                        TRIM(s.ABSENCE)
                    ) LIKE '%OCCASION%'

                    OR

                    UPPER(
                        TRIM(s.ABSENCE)
                    ) LIKE '%HOLIDAY%'
                  )

              AND NOT EXISTS
              (
                  SELECT 1

                  FROM {$this->occasionTable} o

                  WHERE UPPER(
                            TRIM(
                                NVL(
                                    o.IS_ACTIVE,
                                    'N'
                                )
                            )
                        ) = 'Y'

                    AND TRUNC(s.ATT_DATE)
                        BETWEEN TRUNC(o.FROM_DATE)
                            AND TRUNC(o.TO_DATE)
              )

            UNION ALL

            /* 5. High Overtime */
            SELECT
                'high_overtime',
                'High Overtime',
                'Medium',
                2,

                s.HEADER_ID,
                TO_CHAR(s.EMP_NO),

                NVL(
                    TRIM(s.EMP_NAME),
                    TRIM(e.FULL_NAME)
                ),

                NVL(
                    TRIM(e.DEPARTMENT),
                    'Not Assigned'
                ),

                NVL(
                    TRIM(s.SHIFT),
                    '-'
                ),

                TRUNC(s.ATT_DATE),

                TO_CHAR(
                    TRUNC(s.ATT_DATE),
                    'DD Mon YYYY'
                ),

                s.PUNCH_IN,
                s.PUNCH_OUT,
                s.LATE,
                s.OVERTIME,
                s.ABSENCE,

                'Overtime is '
                || TO_CHAR(
                    {$numericOvertime}
                )
                || ' minute(s).'

            FROM {$this->timesheetTable} s

            LEFT JOIN {$this->employeeTable} e
                ON TO_CHAR(e.EMPLOYEE_NUMBER) =
                   TO_CHAR(s.EMP_NO)

            WHERE TRUNC(s.ATT_DATE)
                  BETWEEN TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )
                  AND TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )

              AND {$numericOvertime} >= ?

            UNION ALL

            /* 6. Missing Timetable */
            SELECT
                'missing_timetable',
                'Missing Timetable',
                'High',
                1,

                a.HEADER_ID,
                TO_CHAR(a.EMP_NO),

                NVL(
                    TRIM(a.EMP_NAME),
                    TRIM(e.FULL_NAME)
                ),

                NVL(
                    TRIM(e.DEPARTMENT),
                    'Not Assigned'
                ),

                '-' AS SHIFT,

                TRUNC(a.ATT_DATE),

                TO_CHAR(
                    TRUNC(a.ATT_DATE),
                    'DD Mon YYYY'
                ),

                a.PUNCH_IN,
                a.PUNCH_OUT,

                NULL AS LATE,
                NULL AS OVERTIME,
                NULL AS ABSENCE,

                'No active timetable assignment exists '
                || 'for this employee and attendance date.'

            FROM {$this->attendanceCardTable} a

            LEFT JOIN {$this->employeeTable} e
                ON TO_CHAR(e.EMPLOYEE_NUMBER) =
                   TO_CHAR(a.EMP_NO)

            WHERE TRUNC(a.ATT_DATE)
                  BETWEEN TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )
                  AND TO_DATE(
                      ?,
                      'YYYY-MM-DD'
                  )

              AND NOT EXISTS
              (
                  SELECT 1

                  FROM {$this->timetableTable} t

                  WHERE TO_CHAR(t.EMP_NO) =
                        TO_CHAR(a.EMP_NO)

                    AND UPPER(
                            TRIM(
                                NVL(
                                    t.STATUS,
                                    'ACTIVE'
                                )
                            )
                        ) = 'ACTIVE'

                    AND (
                        t.START_DATE IS NULL
                        OR TRUNC(t.START_DATE) <=
                           TRUNC(a.ATT_DATE)
                    )

                    AND (
                        t.END_DATE IS NULL
                        OR TRUNC(t.END_DATE) >=
                           TRUNC(a.ATT_DATE)
                    )
              )
        ";

        $binds = [
            // Missing Punch
            $fromDate,
            $toDate,

            // Same Punch
            $fromDate,
            $toDate,

            // Missing Shift
            $fromDate,
            $toDate,

            // Missing Occasion
            $fromDate,
            $toDate,

            // High Overtime
            $fromDate,
            $toDate,
            $overtimeThreshold,

            // Missing Timetable
            $fromDate,
            $toDate,
        ];

        $outerWhere = [];

        if ($applyDetailedFilters) {
            $type = trim(
                (string) (
                    $filters['type'] ?? ''
                )
            );

            $severity = trim(
                (string) (
                    $filters['severity'] ?? ''
                )
            );

            $department = trim(
                (string) (
                    $filters['department'] ?? ''
                )
            );

            $search = trim(
                (string) (
                    $filters['search'] ?? ''
                )
            );

            if ($type !== '') {
                $outerWhere[] =
                    'EXCEPTION_TYPE = ?';

                $binds[] =
                    $type;
            }

            if ($severity !== '') {
                $outerWhere[] =
                    'UPPER(SEVERITY) = ?';

                $binds[] =
                    strtoupper($severity);
            }

            if ($department !== '') {
                $outerWhere[] =
                    'UPPER(TRIM(DEPARTMENT)) = ?';

                $binds[] =
                    strtoupper($department);
            }

            if ($search !== '') {
                $like =
                    '%' .
                    strtoupper($search) .
                    '%';

                $outerWhere[] = "
                    (
                        UPPER(EMP_NO) LIKE ?
                        OR UPPER(EMP_NAME) LIKE ?
                        OR UPPER(DEPARTMENT) LIKE ?
                        OR UPPER(DETAILS) LIKE ?
                    )
                ";

                $binds[] = $like;
                $binds[] = $like;
                $binds[] = $like;
                $binds[] = $like;
            }
        }

        if (!empty($outerWhere)) {
            $baseSql = "
                SELECT *
                FROM ({$baseSql}) all_exceptions
                WHERE " .
                implode(
                    ' AND ',
                    $outerWhere
                );
        }

        return [
            $baseSql,
            $binds
        ];
    }
}
