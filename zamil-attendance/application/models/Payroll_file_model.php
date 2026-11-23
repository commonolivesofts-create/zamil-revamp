<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Payroll_file_model extends CI_Model
{
    private $table = 'XX_DIGI_ATT_ATT_SHEET';
    private $adjustmentTable = 'XX_DIGI_ATT_PYRL_FILE_ADJ';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    /**
     * Get payroll list or count
     */
    public function get_payroll_file_list_old($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $empNo = !empty($filters['emp_no']) ? trim($filters['emp_no']) : null;
        $emp_name = !empty($filters['emp_name']) ? trim($filters['emp_name']) : null;
        $fromDate = !empty($filters['from_date']) ? trim($filters['from_date']) : null;
        $toDate = !empty($filters['to_date']) ? trim($filters['to_date']) : null;
        $search = trim((string) $search);

        $offset = max(0, ($currentPage - 1) * $limit);

        $where = [];
        $binds = [];

        if ($empNo !== null && $empNo !== '') {
            $where[] = "a.EMP_NO = ?";
            $binds[] = $empNo;
        }

        if ($fromDate !== null && $fromDate !== '') {
            $where[] = "a.ATT_DATE >= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = $fromDate;
        }

        if ($toDate !== null && $toDate !== '') {
            $where[] = "a.ATT_DATE < TO_DATE(?, 'YYYY-MM-DD') + 1";
            $binds[] = $toDate;
        }

        if ($emp_name !== null && $emp_name !== '') {
            $where[] = "UPPER(a.EMP_NAME) LIKE ?";
            $binds[] = '%' . strtoupper($emp_name) . '%';
        }

        if ($search !== '') {
            $where[] = "(
            UPPER(a.EMP_NO) LIKE ?
            OR UPPER(a.EMP_NAME) LIKE ?
        )";
            $binds[] = '%' . strtoupper($search) . '%';
            $binds[] = '%' . strtoupper($search) . '%';
        }

        $whereSql = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

        if ($type !== 'list') {
            $countSql = "
            SELECT COUNT(1) AS TOTAL
            FROM (
                SELECT a.EMP_NO
                FROM {$this->table} a
                {$whereSql}
                GROUP BY a.EMP_NO, a.EMP_NAME
            )
        ";

            $row = $this->db->query($countSql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $sql = "
            SELECT
                a.EMP_NO,
                a.EMP_NAME,

                SUM(
                    CASE
                        WHEN TRIM(a.LATE) IS NOT NULL THEN TO_NUMBER(a.LATE)
                        ELSE 0
                    END
                ) AS LATE,

                SUM(
                    CASE
                        WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY)
                        ELSE 0
                    END
                ) AS EARLY,

                SUM(
                    CASE
                        WHEN TRIM(a.LATE) IS NOT NULL THEN TO_NUMBER(a.LATE)
                        ELSE 0
                    END
                    +
                    CASE
                        WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY)
                        ELSE 0
                    END
                ) AS TOT_DELAY,

                SUM(
                    CASE
                        WHEN TRIM(a.OVERTIME) IS NOT NULL THEN TO_NUMBER(a.OVERTIME)
                        ELSE 0
                    END
                ) AS OVERTIME_HRS,

                SUM(
                    CASE
                        WHEN UPPER(TRIM(a.ABSENCE)) = 'ABSENCE WITHOUT PERMISSION'
                        THEN 1
                        ELSE 0
                    END
                ) AS ABSENCE_WO

            FROM {$this->table} a
            {$whereSql}
            GROUP BY a.EMP_NO, a.EMP_NAME
            ORDER BY a.EMP_NO
            OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY
        ";

        return $this->db->query($sql, $binds)->result_array();
    }

    // public function get_payroll_file_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    // {
    //     $empNo = !empty($filters['emp_no']) ? trim($filters['emp_no']) : null;
    //     $emp_name = !empty($filters['emp_name']) ? trim($filters['emp_name']) : null;
    //     $fromDate = !empty($filters['from_date']) ? trim($filters['from_date']) : null;
    //     $toDate = !empty($filters['to_date']) ? trim($filters['to_date']) : null;
    //     $search = trim((string) $search);

    //     $offset = max(0, ($currentPage - 1) * $limit);

    //     $where = [];
    //     $binds = [];

    //     if ($empNo !== null && $empNo !== '') {
    //         $where[] = "a.EMP_NO = ?";
    //         $binds[] = $empNo;
    //     }

    //     if ($fromDate !== null && $fromDate !== '') {
    //         $where[] = "a.ATT_DATE >= TO_DATE(?, 'YYYY-MM-DD')";
    //         $binds[] = $fromDate;
    //     }

    //     if ($toDate !== null && $toDate !== '') {
    //         $where[] = "a.ATT_DATE < TO_DATE(?, 'YYYY-MM-DD') + 1";
    //         $binds[] = $toDate;
    //     }

    //     if ($emp_name !== null && $emp_name !== '') {
    //         $where[] = "UPPER(a.EMP_NAME) LIKE ?";
    //         $binds[] = '%' . strtoupper($emp_name) . '%';
    //     }

    //     if ($search !== '') {
    //         $where[] = "(
    //         UPPER(TO_CHAR(a.EMP_NO)) LIKE ?
    //         OR UPPER(a.EMP_NAME) LIKE ?
    //     )";
    //         $binds[] = '%' . strtoupper($search) . '%';
    //         $binds[] = '%' . strtoupper($search) . '%';
    //     }

    //     $whereSql = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

    //     $baseSql = "
    //     SELECT
    //         a.EMP_NO,
    //         a.EMP_NAME,

    //         SUM(
    //             CASE
    //                 WHEN TRIM(a.LATE) IS NOT NULL THEN TO_NUMBER(a.LATE)
    //                 ELSE 0
    //             END
    //         ) AS LATE,

    //         SUM(
    //             CASE
    //                 WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY)
    //                 ELSE 0
    //             END
    //         ) AS EARLY,

    //         SUM(
    //             CASE
    //                 WHEN TRIM(a.LATE) IS NOT NULL THEN TO_NUMBER(a.LATE)
    //                 ELSE 0
    //             END
    //             +
    //             CASE
    //                 WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY)
    //                 ELSE 0
    //             END
    //         ) AS TOT_DELAY,

    //         SUM(
    //             CASE
    //                 WHEN TRIM(a.OVERTIME) IS NOT NULL THEN TO_NUMBER(a.OVERTIME)
    //                 ELSE 0
    //             END
    //         ) AS OVERTIME_HRS,

    //         SUM(
    //             CASE
    //                 WHEN UPPER(TRIM(a.ABSENCE)) = 'ABSENCE WITHOUT PERMISSION'
    //                 THEN 1
    //                 ELSE 0
    //             END
    //         ) AS ABSENCE_WO

    //     FROM {$this->table} a
    //     {$whereSql}
    //     GROUP BY a.EMP_NO, a.EMP_NAME
    //     ";

    //     if ($type !== 'list') {
    //         $countSql = "SELECT COUNT(1) AS TOTAL FROM ({$baseSql}) x";
    //         $row = $this->db->query($countSql, $binds)->row_array();
    //         return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
    //     }

    //     $listBinds = $binds;

    //     if ($fromDate !== null && $fromDate !== '' && $toDate !== null && $toDate !== '') {
    //         $sql = "
    //         SELECT
    //             b.EMP_NO,
    //             NVL(adj.EMP_NAME, b.EMP_NAME) AS EMP_NAME,
    //             COALESCE(adj.LATE, TO_CHAR(b.LATE)) AS LATE,
    //             COALESCE(adj.EARLY, TO_CHAR(b.EARLY)) AS EARLY,
    //             COALESCE(adj.TOT_DELAY, TO_CHAR(b.TOT_DELAY)) AS TOT_DELAY,
    //             COALESCE(adj.OVERTIME_HRS, TO_CHAR(b.OVERTIME_HRS)) AS OVERTIME_HRS,
    //             COALESCE(adj.ABSENCE_WO, TO_CHAR(b.ABSENCE_WO)) AS ABSENCE_WO
    //         FROM ({$baseSql}) b
    //         LEFT JOIN {$this->adjustmentTable} adj
    //                ON adj.EMP_NO = b.EMP_NO
    //               AND TRUNC(adj.FROM_DATE) = TO_DATE(?, 'YYYY-MM-DD')
    //               AND TRUNC(adj.TO_DATE) = TO_DATE(?, 'YYYY-MM-DD')
    //         ORDER BY b.EMP_NO
    //     ";

    //         $listBinds[] = $fromDate;
    //         $listBinds[] = $toDate;
    //     } else {
    //         $sql = "
    //         SELECT
    //             b.EMP_NO,
    //             b.EMP_NAME,
    //             TO_CHAR(b.LATE) AS LATE,
    //             TO_CHAR(b.EARLY) AS EARLY,
    //             TO_CHAR(b.TOT_DELAY) AS TOT_DELAY,
    //             TO_CHAR(b.OVERTIME_HRS) AS OVERTIME_HRS,
    //             TO_CHAR(b.ABSENCE_WO) AS ABSENCE_WO
    //         FROM ({$baseSql}) b
    //         ORDER BY b.EMP_NO
    //     ";
    //     }

    //     if ($limit > 0) {
    //         $sql .= " OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY";
    //     }

    //     return $this->db->query($sql, $listBinds)->result_array();
    // }

    public function get_payroll_file_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $empNo = !empty($filters['emp_no']) ? trim($filters['emp_no']) : null;
        $emp_name = !empty($filters['emp_name']) ? trim($filters['emp_name']) : null;
        $fromDate = !empty($filters['from_date']) ? trim($filters['from_date']) : null;
        $toDate = !empty($filters['to_date']) ? trim($filters['to_date']) : null;
        $search = trim((string) $search);

        $offset = max(0, ($currentPage - 1) * $limit);

        $where = [];
        $binds = [];


        if ($empNo !== null && $empNo !== '') {
            $where[] = "a.EMP_NO = ?";
            $binds[] = $empNo;
        }


        if ($fromDate !== null && $fromDate !== '') {
            $where[] = "a.ATT_DATE >= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = $fromDate;
        }


        if ($toDate !== null && $toDate !== '') {
            $where[] = "a.ATT_DATE < TO_DATE(?, 'YYYY-MM-DD') + 1";
            $binds[] = $toDate;
        }


        if ($emp_name !== null && $emp_name !== '') {
            $where[] = "UPPER(a.EMP_NAME) LIKE ?";
            $binds[] = '%' . strtoupper($emp_name) . '%';
        }

        if ($search !== '') {
            $where[] = "(
            UPPER(TO_CHAR(a.EMP_NO)) LIKE ?
            OR UPPER(a.EMP_NAME) LIKE ?
        )";

            $binds[] = '%' . strtoupper($search) . '%';
            $binds[] = '%' . strtoupper($search) . '%';
        }

        $whereSql = !empty($where)
            ? 'WHERE ' . implode(' AND ', $where)
            : '';

        /*
     * Base employee-wise summary
     */
        $baseSql = "
        SELECT
            a.EMP_NO,
            a.EMP_NAME,

            /* Total Late Minutes */
           
            SUM(
                CASE
                    WHEN TRIM(a.LATE) IS NOT NULL and ((NVL(OVERTIME,0)*60)-(a.LATE)) < 0
                    THEN ABS((NVL(OVERTIME,0)*60)-(a.LATE))---TO_NUMBER(a.LATE)
                    ELSE 0
                END
            ) AS LATE,

            /* Total Early Minutes */
            SUM(
                CASE
                    WHEN TRIM(a.EARLY) IS NOT NULL
                    THEN TO_NUMBER(a.EARLY)
                    ELSE 0
                END
            ) AS EARLY,

            /* Total Delay */
            SUM(
                CASE
                    WHEN TRIM(a.LATE) IS NOT NULL and ((NVL(OVERTIME,0)*60)-(a.LATE)) < 0
                    THEN ABS((NVL(OVERTIME,0)*60)-(a.LATE))---TO_NUMBER(a.LATE)
                    ELSE 0
                END
                +
                CASE
                    WHEN TRIM(a.EARLY) IS NOT NULL
                    THEN TO_NUMBER(a.EARLY)
                    ELSE 0
                END
            ) AS TOT_DELAY,

            /* Total Overtime Hours */
            SUM(
                CASE
                    WHEN (NVL(a.OVERTIME,0)*60)-(a.late) >=0 
                    THEN Round(((NVL(OVERTIME,0)*60)-(a.LATE))/60,2)
                    --TO_NUMBER(a.OVERTIME)
                    ELSE 0
                END
            ) AS OVERTIME_HRS,

            /* Absence Without Permission */
            SUM(
                CASE
                    WHEN UPPER(TRIM(a.ABSENCE)) = 'ABSENCE WITHOUT PERMISSION'
                    THEN 1
                    ELSE 0
                END
            ) AS ABSENCE_WO

        FROM {$this->table} a
        {$whereSql}

        GROUP BY
            a.EMP_NO,
            a.EMP_NAME
     ";

        if ($type !== 'list') {

            $countSql = "
            SELECT COUNT(1) AS TOTAL
            FROM ({$baseSql}) x
        ";

            $row = $this->db
                ->query($countSql, $binds)
                ->row_array();

            return isset($row['TOTAL'])
                ? (int) $row['TOTAL']
                : 0;
        }

        $listBinds = $binds;

        /*
     * Date range is available
     */
        if ($fromDate !== null && $fromDate !== '' && $toDate !== null && $toDate !== '') {
            $sql = "
            SELECT
                b.EMP_NO,

                NVL(
                    adj.EMP_NAME,
                    b.EMP_NAME
                ) AS EMP_NAME,

            
                CASE
                    WHEN (
                        NVL(
                            TO_NUMBER(adj.OVERTIME_HRS),
                            b.OVERTIME_HRS
                        ) * 60
                        -
                        NVL(
                            TO_NUMBER(adj.LATE),
                            b.LATE
                        )
                    ) >= 0
                    THEN 0

                    ELSE ABS(
                        (
                            NVL(
                                TO_NUMBER(adj.OVERTIME_HRS),
                                b.OVERTIME_HRS
                            ) * 60
                            -
                            NVL(
                                TO_NUMBER(adj.LATE),
                                b.LATE
                            )
                        )
                    )
                END AS LATE,

                /*
                 * Early remains unchanged
                 */
                NVL(
                    TO_NUMBER(adj.EARLY),
                    b.EARLY
                ) AS EARLY,

                /*
                 * Total Delay
                 *
                 * New Late + Early
                 */
                CASE
                    WHEN (
                        NVL(
                            TO_NUMBER(adj.OVERTIME_HRS),
                            b.OVERTIME_HRS
                        ) * 60
                        -
                        NVL(
                            TO_NUMBER(adj.LATE),
                            b.LATE
                        )
                    ) >= 0
                    THEN 0

                    ELSE ABS(
                        (
                            NVL(
                                TO_NUMBER(adj.OVERTIME_HRS),
                                b.OVERTIME_HRS
                            ) * 60
                            -
                            NVL(
                                TO_NUMBER(adj.LATE),
                                b.LATE
                            )
                        )
                    )
                END
                +
                NVL(
                    TO_NUMBER(adj.EARLY),
                    b.EARLY
                ) AS TOT_DELAY,

                /*
                 * New Overtime
                 *
                 * If Net >= 0:
                 *     New OT = Net / 60
                 *
                 * If Net < 0:
                 *     New OT = 0
                 */
                CASE
                    WHEN (
                        NVL(
                            TO_NUMBER(adj.OVERTIME_HRS),
                            b.OVERTIME_HRS
                        ) * 60
                        -
                        NVL(
                            TO_NUMBER(adj.LATE),
                            b.LATE
                        )
                    ) >= 0
                    THEN (
                        NVL(
                            TO_NUMBER(adj.OVERTIME_HRS),
                            b.OVERTIME_HRS
                        ) * 60
                        -
                        NVL(
                            TO_NUMBER(adj.LATE),
                            b.LATE
                        )
                    ) / 60

                    ELSE 0
                END AS OVERTIME_HRS,

                /*
                 * Absence
                 */
                NVL(
                    TO_NUMBER(adj.ABSENCE_WO),
                    b.ABSENCE_WO
                ) AS ABSENCE_WO

            FROM ({$baseSql}) b

            LEFT JOIN {$this->adjustmentTable} adj
                ON adj.EMP_NO = b.EMP_NO
                AND TRUNC(adj.FROM_DATE) =
                    TO_DATE(?, 'YYYY-MM-DD')
                AND TRUNC(adj.TO_DATE) =
                    TO_DATE(?, 'YYYY-MM-DD')

            ORDER BY b.EMP_NO
        ";

            $listBinds[] = $fromDate;
            $listBinds[] = $toDate;
        } else {

            /*
         * No adjustment/date range
         */
            $sql = "
            SELECT
                b.EMP_NO,
                b.EMP_NAME,

                /*
                 * New Late
                 */
                CASE
                    WHEN (
                        b.OVERTIME_HRS * 60
                        - b.LATE
                    ) >= 0
                    THEN 0

                    ELSE ABS(
                        b.OVERTIME_HRS * 60
                        - b.LATE
                    )
                END AS LATE,

                b.EARLY,

                /*
                 * New Total Delay
                 */
                CASE
                    WHEN (
                        b.OVERTIME_HRS * 60
                        - b.LATE
                    ) >= 0
                    THEN 0

                    ELSE ABS(
                        b.OVERTIME_HRS * 60
                        - b.LATE
                    )
                END
                + b.EARLY AS TOT_DELAY,

                /*
                 * New Overtime
                 */
                CASE
                    WHEN (
                        b.OVERTIME_HRS * 60
                        - b.LATE
                    ) >= 0
                    THEN (
                        b.OVERTIME_HRS * 60
                        - b.LATE
                    ) / 60

                    ELSE 0
                END AS OVERTIME_HRS,

                b.ABSENCE_WO

            FROM ({$baseSql}) b

            ORDER BY b.EMP_NO
        ";
        }

        /*
     * Pagination
     */
        if ($limit > 0) {
            $sql .= "
            OFFSET {$offset} ROWS
            FETCH NEXT {$limit} ROWS ONLY
        ";
        }

        return $this->db
            ->query($sql, $listBinds)
            ->result_array();
    }

    public function save_payroll_adjustment(array $data)
    {
        $empNo = isset($data['emp_no']) ? trim((string) $data['emp_no']) : '';
        $empName = isset($data['emp_name']) ? trim((string) $data['emp_name']) : null;
        $fromDate = isset($data['from_date']) ? trim((string) $data['from_date']) : '';
        $toDate = isset($data['to_date']) ? trim((string) $data['to_date']) : '';
        $late = isset($data['late']) ? trim((string) $data['late']) : null;
        $early = isset($data['early']) ? trim((string) $data['early']) : null;
        $totDelay = isset($data['tot_delay']) ? trim((string) $data['tot_delay']) : null;
        $overtimeHrs = isset($data['overtime_hrs']) ? trim((string) $data['overtime_hrs']) : null;
        $absenceWo = isset($data['absence_wo']) ? trim((string) $data['absence_wo']) : null;

        $sql = "
        MERGE INTO {$this->adjustmentTable} t
        USING (
            SELECT
                ? AS EMP_NO,
                ? AS EMP_NAME,
                TO_DATE(?, 'YYYY-MM-DD') AS FROM_DATE,
                TO_DATE(?, 'YYYY-MM-DD') AS TO_DATE,
                ? AS LATE,
                ? AS EARLY,
                ? AS TOT_DELAY,
                ? AS OVERTIME_HRS,
                ? AS ABSENCE_WO
            FROM DUAL
        ) s
        ON (
            t.EMP_NO = s.EMP_NO
            AND TRUNC(t.FROM_DATE) = s.FROM_DATE
            AND TRUNC(t.TO_DATE) = s.TO_DATE
        )
        WHEN MATCHED THEN
            UPDATE SET
                t.EMP_NAME = s.EMP_NAME,
                t.LATE = s.LATE,
                t.EARLY = s.EARLY,
                t.TOT_DELAY = s.TOT_DELAY,
                t.OVERTIME_HRS = s.OVERTIME_HRS,
                t.ABSENCE_WO = s.ABSENCE_WO,
                t.UPDATED_AT = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
            INSERT (
                EMP_NO,
                EMP_NAME,
                FROM_DATE,
                TO_DATE,
                LATE,
                EARLY,
                TOT_DELAY,
                OVERTIME_HRS,
                ABSENCE_WO,
                CREATED_AT,
                UPDATED_AT
            )
            VALUES (
                s.EMP_NO,
                s.EMP_NAME,
                s.FROM_DATE,
                s.TO_DATE,
                s.LATE,
                s.EARLY,
                s.TOT_DELAY,
                s.OVERTIME_HRS,
                s.ABSENCE_WO,
                SYSTIMESTAMP,
                SYSTIMESTAMP
            )
    ";

        return $this->db->query($sql, [
            $empNo,
            $empName,
            $fromDate,
            $toDate,
            $late,
            $early,
            $totDelay,
            $overtimeHrs,
            $absenceWo
        ]);
    }
}
