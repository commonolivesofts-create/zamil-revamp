<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Timesheet_model extends CI_Model
{
    private $table = 'XX_DIGI_ATT_ATT_SHEET';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function get_timesheet_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = max(0, (int) get_limit_offset($currentPage, $limit));
        $limit = (int) $limit;
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        $empNo = isset($filters['emp_no']) ? trim((string) $filters['emp_no']) : '';
        $empName = isset($filters['emp_name']) ? trim((string) $filters['emp_name']) : '';
        $shift = isset($filters['shift']) ? trim((string) $filters['shift']) : '';
        $attDate = isset($filters['att_date']) ? trim((string) $filters['att_date']) : '';
        $attDateStart = isset($filters['att_date_start']) ? trim((string) $filters['att_date_start']) : '';
        $attDateEnd = isset($filters['att_date_end']) ? trim((string) $filters['att_date_end']) : '';

        if ($empNo !== '') {
            $where[] = "UPPER(NVL(a.EMP_NO, '')) LIKE ?";
            $binds[] = '%' . strtoupper($empNo) . '%';
        }

        if ($empName !== '') {
            $where[] = "UPPER(NVL(a.EMP_NAME, '')) LIKE ?";
            $binds[] = '%' . strtoupper($empName) . '%';
        }

        if ($shift !== '') {
            $where[] = "UPPER(TRIM(NVL(a.SHIFT, ''))) = ?";
            $binds[] = strtoupper(trim($shift));
        }

        if ($attDate !== '') {
            $where[] = "TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') = ?";
            $binds[] = $attDate;
        }

        if ($attDateStart !== '') {
            $where[] = "TRUNC(a.ATT_DATE) >= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = $attDateStart;
        }

        if ($attDateEnd !== '') {
            $where[] = "TRUNC(a.ATT_DATE) <= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = $attDateEnd;
        }

        if ($search !== '') {
            $like = '%' . strtoupper($search) . '%';

            $where[] = "(
            UPPER(NVL(a.EMP_NO, '')) LIKE ?
            OR UPPER(NVL(a.EMP_NAME, '')) LIKE ?
            OR UPPER(NVL(a.SHIFT, '')) LIKE ?
            OR TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') LIKE ?
            OR UPPER(NVL(a.CHECK_IN, '')) LIKE ?
            OR UPPER(NVL(a.PUNCH_IN, '')) LIKE ?
            OR UPPER(NVL(a.CHECK_OUT, '')) LIKE ?
            OR UPPER(NVL(a.PUNCH_OUT, '')) LIKE ?
            OR UPPER(NVL(a.TOTAL_MINUTES, '')) LIKE ?
            OR UPPER(NVL(a.EARLY, '')) LIKE ?
            OR UPPER(NVL(a.LATE, '')) LIKE ?
            OR UPPER(NVL(a.OVERTIME, '')) LIKE ?
            OR UPPER(NVL(a.ABSENCE, '')) LIKE ?
        )";

            for ($i = 0; $i < 13; $i++) {
                $binds[] = $like;
            }
        }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        if ($type !== 'list') {
            $countSql = "SELECT COUNT(1) AS TOTAL FROM {$this->table} a{$whereSql}";
            $row = $this->db->query($countSql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $sql = "SELECT
                a.EMP_NO,
                a.EMP_NAME,
                a.SHIFT,
                TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') AS ATT_DATE,
                a.CHECK_IN,
                a.PUNCH_IN,
                a.CHECK_OUT,
                a.PUNCH_OUT,
                a.TOTAL_MINUTES,
                a.EARLY,
                a.LATE,
                a.OVERTIME,
                a.ABSENCE,
                 /* Total Delay */
            (
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
           (
                CASE
                    WHEN (NVL(a.OVERTIME,0)*60)-(a.late) >=0 
                    THEN Round(((NVL(OVERTIME,0)*60)-(a.LATE))/60,2)
                    --TO_NUMBER(a.OVERTIME)
                    ELSE 0
                END
            ) AS OVERTIME_HRS
            FROM {$this->table} a
            {$whereSql}
            ORDER BY a.ATT_DATE DESC, a.EMP_NO ASC";

        if ($limit > 0) {
            $sql .= " OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY";
        }

        return $this->db->query($sql, $binds)->result_array();
    }
}
