<?php
defined('BASEPATH') or exit('No direct script access allowed');


class Contractor_model extends CI_Model
{
    private $table = 'XXZP.XX_CONTRACTOR_INFO';

    public function __construct()
    {
        parent::__construct();
        $this->ebs = $this->load->database('ebs', true);
    }

    /**
     * Paginated / filtered / searchable list, mirrors Shift_model::get_shift_list().
     *
     * @param string $type       'list' or 'total'
     * @param int    $limit
     * @param int    $currentPage
     * @param array  $filters    con_number, con_name, status, start_date, end_date
     * @param string $search
     */
    public function get_contractor_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = get_limit_offset($currentPage, $limit);
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        if (!empty($filters['con_number'])) {
            $where[] = "UPPER(TRIM(CON_NUMBER)) = UPPER(TRIM(?))";
            $binds[] = (string) $filters['con_number'];
        }

        if (!empty($filters['con_name'])) {
            $where[] = "UPPER(CON_NAME) LIKE ?";
            $binds[] = '%' . strtoupper(trim((string) $filters['con_name'])) . '%';
        }

        if (!empty($filters['status'])) {
            $where[] = "UPPER(TRIM(STATUS)) = UPPER(TRIM(?))";
            $binds[] = (string) $filters['status'];
        }

        if ($search !== '') {
            $searchUpper = '%' . strtoupper($search) . '%';

            $where[] = "(
                UPPER(TO_CHAR(CON_NUMBER)) LIKE ?
                OR UPPER(CON_NAME) LIKE ?
                OR UPPER(STATUS) LIKE ?
            )";
            $binds[] = $searchUpper;
            $binds[] = $searchUpper;
            $binds[] = $searchUpper;
        }

        $whereSql = empty($where) ? '' : ' WHERE ' . implode(' AND ', $where);

        if ($type === 'total') {
            $sql = "SELECT COUNT(1) AS TOTAL FROM {$this->table}{$whereSql}";
            $row = $this->ebs->query($sql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $sql = "SELECT
                    CON_ID,
                    CON_NUMBER,
                    CON_NAME,
                    RATE,
                    STATUS,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    CREATEB_BY,
                    CREATION_DATE,
                    UPDATED_BY,
                    UPDATED_DATE
                FROM {$this->table}
                {$whereSql}
                ORDER BY CON_ID DESC";

        if ($limit > 0) {
            $sql = "SELECT * FROM (
                        SELECT q.*, ROWNUM rn
                        FROM ({$sql}) q
                        WHERE ROWNUM <= ?
                    )
                    WHERE rn > ?";
            $binds[] = ($offset > 0 ? $offset : 0) + $limit;
            $binds[] = ($offset > 0 ? $offset : 0);
        }

        return $this->ebs->query($sql, $binds)->result_array();
    }

    public function find_by_id($id)
    {
        $sql = "SELECT
                    CON_ID,
                    CON_NUMBER,
                    CON_NAME,
                    RATE,
                    STATUS,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    CREATEB_BY,
                    CREATION_DATE,
                    UPDATED_BY,
                    UPDATED_DATE
                FROM {$this->table}
                WHERE CON_ID = ?";

        return $this->ebs->query($sql, [(int) $id])->row_array();
    }

    /**
     * Looks a contractor up by CON_NUMBER — used for autofill (replaces the
     * original Contractor::contractor_detail()).
     */
    public function find_by_number($conNumber)
    {
        $sql = "SELECT
                    CON_ID,
                    CON_NUMBER,
                    CON_NAME,
                    RATE,
                    STATUS,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE
                FROM {$this->table}
                WHERE CON_NUMBER = ?";

        return $this->ebs->query($sql, [(string) $conNumber])->row_array();
    }

    public function con_number_exists($conNumber, $excludeId = null)
    {
        $conNumber = trim((string) $conNumber);
        if ($conNumber === '') {
            return false;
        }

        $sql = "SELECT COUNT(1) AS TOTAL FROM {$this->table} WHERE UPPER(TRIM(CON_NUMBER)) = UPPER(TRIM(?))";
        $binds = [$conNumber];

        if (!empty($excludeId)) {
            $sql .= " AND CON_ID <> ?";
            $binds[] = (int) $excludeId;
        }

        $row = $this->ebs->query($sql, $binds)->row_array();
        return isset($row['TOTAL']) && (int) $row['TOTAL'] > 0;
    }

  
    public function insert_contractor(array $data, $userId)
    {
        $this->ebs->trans_begin();

        $nextId = $this->ebs->query("SELECT NVL(MAX(CON_ID), 0) + 1 AS ID FROM {$this->table}")->row_array();
        $conId = isset($nextId['ID']) ? (int) $nextId['ID'] : 1;

        $today = strtoupper(date('d-M-Y'));

        $sql = "INSERT INTO {$this->table} (
                    CON_ID,
                    CON_NUMBER,
                    CON_NAME,
                    RATE,
                    STATUS,
                    START_DATE,
                    END_DATE,
                    CREATEB_BY,
                    CREATION_DATE
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END,
                    CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END,
                    ?, ?
                )";

        $startDate = $this->normalize_date($data['start_date'] ?? null);
        $endDate = $this->normalize_date($data['end_date'] ?? null);

        $ok = $this->ebs->query($sql, [
            $conId,
            trim((string) ($data['con_number'] ?? '')),
            trim((string) ($data['con_name'] ?? '')),
            isset($data['rate']) && $data['rate'] !== '' ? (float) $data['rate'] : null,
            trim((string) ($data['status'] ?? '')),
            $startDate,
            $startDate,
            $endDate,
            $endDate,
            $userId,
            $today,
        ]);

        if (!$ok) {
            $this->ebs->trans_rollback();
            return false;
        }

        $this->ebs->trans_commit();
        return $conId;
    }

    /**
     * Updates a contractor company, writing only the columns that changed
     * (same diff pattern as Shift_model::update_shift()).
     */
    public function update_contractor($id, array $data, $userId)
    {
        $current = $this->find_by_id($id);
        if (empty($current)) {
            return [
                'status' => false,
                'message' => 'Contractor not found.',
                'changed' => false,
            ];
        }

        $incoming = [
            'CON_NUMBER' => trim((string) ($data['con_number'] ?? '')),
            'CON_NAME'   => trim((string) ($data['con_name'] ?? '')),
            'RATE'       => isset($data['rate']) && $data['rate'] !== '' ? (float) $data['rate'] : null,
            'STATUS'     => trim((string) ($data['status'] ?? '')),
            'START_DATE' => $this->normalize_date($data['start_date'] ?? null),
            'END_DATE'   => $this->normalize_date($data['end_date'] ?? null),
        ];

        $currentComparable = [
            'CON_NUMBER' => trim((string) ($current['CON_NUMBER'] ?? '')),
            'CON_NAME'   => trim((string) ($current['CON_NAME'] ?? '')),
            'RATE'       => isset($current['RATE']) && $current['RATE'] !== null ? (float) $current['RATE'] : null,
            'STATUS'     => trim((string) ($current['STATUS'] ?? '')),
            'START_DATE' => $this->normalize_date($current['START_DATE'] ?? null),
            'END_DATE'   => $this->normalize_date($current['END_DATE'] ?? null),
        ];

        $changes = [];
        foreach ($incoming as $key => $value) {
            if ($currentComparable[$key] !== $value) {
                $changes[$key] = $value;
            }
        }

        if (empty($changes)) {
            return [
                'status' => true,
                'message' => 'No changes detected.',
                'changed' => false,
            ];
        }

        $setSql = [];
        $binds = [];

        foreach ($changes as $column => $value) {
            if ($column === 'START_DATE' || $column === 'END_DATE') {
                $setSql[] = "{$column} = CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END";
                $binds[] = $value;
                $binds[] = $value;
            } else {
                $setSql[] = "{$column} = ?";
                $binds[] = $value;
            }
        }

        $setSql[] = "UPDATED_BY = ?";
        $binds[] = $userId;
        $setSql[] = "UPDATED_DATE = ?";
        $binds[] = strtoupper(date('d-M-Y'));

        $binds[] = (int) $id;

        $sql = "UPDATE {$this->table} SET " . implode(', ', $setSql) . " WHERE CON_ID = ?";

        $ok = $this->ebs->query($sql, $binds);

        return [
            'status' => (bool) $ok,
            'message' => $ok ? 'Contractor updated successfully.' : 'Failed to update contractor.',
            'changed' => (bool) $ok,
        ];
    }

    public function delete_contractor($id)
    {
        return $this->ebs->query("DELETE FROM {$this->table} WHERE CON_ID = ?", [(int) $id]);
    }

    private function normalize_date($value)
    {
        $value = trim((string) $value);
        if ($value === '' || $value === '0000-00-00') {
            return null;
        }

        // Accepts YYYY-MM-DD (from <input type="date">) or DD/MM/YYYY.
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            $date = DateTime::createFromFormat('Y-m-d', $value);
            return ($date && $date->format('Y-m-d') === $value) ? $value : null;
        }

        if (preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $value)) {
            $date = DateTime::createFromFormat('d/m/Y', $value);
            return ($date && $date->format('d/m/Y') === $value) ? $date->format('Y-m-d') : null;
        }

        $timestamp = strtotime($value);
        return $timestamp ? date('Y-m-d', $timestamp) : null;
    }

    // =================================================================
    // Summary report (hours & cost) — legacy fetch_summary / _stats / _report
    // =================================================================

    public function get_summary_department_options()
    {
        return $this->ebs->query("SELECT DISTINCT DEPARTMENT FROM XXZP.XX_CON_EMPLOYEE_INFO ORDER BY 1")->result_array();
    }

    public function get_summary_contractor_options()
    {
        return $this->ebs->query("SELECT DISTINCT CON_NAME FROM {$this->table} ORDER BY 1")->result_array();
    }

    /** Summary
     * Per-employee hours & cost summary for a date range (legacy fetch_summary).
     */
    public function get_summary($from, $to, $dept, $cont, $div)
    {
        [$fromFmt, $toFmt] = $this->normalize_summary_range($from, $to);

        $sql = "SELECT * FROM (
            SELECT
                DECODE(CE.DIVISION, 'IBM', 'IPP BU', 'Z3P', 'FPP BU') AS DIVISION,
                CO.CON_NUMBER AS CON_NO,
                CO.CON_NAME AS CON_NAME,
                (
                    SELECT DISTINCT NAME
                    FROM HR_ORGANIZATION_UNITS
                    WHERE ORGANIZATION_ID = CASE
                        WHEN REGEXP_LIKE(CE.PROD_DEP, '^[0-9]+$')
                        THEN TO_NUMBER(CE.PROD_DEP)
                        ELSE NULL
                    END
                ) AS DEP,
                (
                    SELECT DISTINCT NAME
                    FROM PER_JOBS_TL
                    WHERE JOB_ID = CE.JOB
                ) AS JOB_NM,
                CE.EMPLOYEE_NUMBER AS EMPLOYEE_NUMBER,
                CE.EMPLOYEE_NAME,
                CE.IQAMAH,
                CE.RATE,
                NVL(SUM(X.HRS), 0) AS TOT_HRS,
                (CE.RATE * NVL(SUM(X.HRS), 0)) AS TOT_COST
            FROM
                XXZP.XX_CON_EMPLOYEE_INFO CE
                JOIN {$this->table} CO
                    ON CE.CON_NUMBER = CO.CON_NUMBER
                LEFT JOIN (
                    SELECT
                        TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))) AS EMP_CODE,
                        TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR')) AS T_DATE,
                        ROUND(
                            NVL(
                                TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) +
                                TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60,
                                0
                            )
                            - NVL(
                                TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) +
                                TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60,
                                0
                            ),
                        2) AS HRS
                    FROM ZPI.ICLOCK_TRANSACTION T
                    WHERE REGEXP_LIKE(TRIM(T.EMP_CODE), '^[0-9]+$')
                    GROUP BY
                        TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))),
                        TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR'))
                ) X
                    ON CE.EMPLOYEE_NUMBER = X.EMP_CODE
                   AND X.T_DATE BETWEEN TO_DATE(?, 'DD-MON-RR') AND TO_DATE(?, 'DD-MON-RR')
            WHERE
                UPPER(TRIM(CO.STATUS)) = 'ACTIVE' AND UPPER(TRIM(CE.STATUS)) = 'ACTIVE'
            GROUP BY
                CE.DIVISION, CO.CON_NUMBER, CO.CON_NAME, CE.EMPLOYEE_NUMBER,
                CE.EMPLOYEE_NAME, CE.RATE, CE.PROD_DEP, CE.JOB, CE.IQAMAH
        )";

        $binds = [$fromFmt, $toFmt];

        $where = [];
        if ($div !== '' && strtoupper($div) !== 'ALL') {
            $where[] = "DIVISION = ?";
            $binds[] = (string) $div;
        }
        if ($dept !== '') {
            $where[] = "DEP = ?";
            $binds[] = (string) $dept;
        }
        if ($cont !== '') {
            $where[] = "CON_NAME = ?";
            $binds[] = (string) $cont;
        }

        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $sql .= ' ORDER BY CON_NO, EMPLOYEE_NUMBER';

        return $this->ebs->query($sql, $binds)->result_array();
    }

    /** Summary Group Wise
     * Per-contractor rollup: employee count + total cost (legacy fetch_summary_stats). 
     */
    public function get_summary_stats($from, $to, $dept, $cont, $div)
    {
        [$fromFmt, $toFmt] = $this->normalize_summary_range($from, $to);

        $sql = "SELECT
                    CON_NO,
                    CON_NAME,
                    COUNT(DISTINCT EMP_CODE) AS TOTAL_EMP,
                    SUM(TOTAL_COST) AS TOTAL_COST
                FROM (
                    SELECT
                        CE.DIVISION AS DIVISION,
                        CO.CON_NUMBER AS CON_NO,
                        CO.CON_NAME AS CON_NAME,
                        (
                            SELECT DISTINCT NAME
                            FROM HR_ORGANIZATION_UNITS
                            WHERE ORGANIZATION_ID = CASE
                                WHEN REGEXP_LIKE(CE.PROD_DEP, '^[0-9]+$')
                                THEN TO_NUMBER(CE.PROD_DEP)
                                ELSE NULL
                            END
                        ) AS DEP,
                        CE.EMPLOYEE_NUMBER AS EMP_CODE,
                        CE.EMPLOYEE_NAME,
                        CE.RATE,
                        NVL(SUM(X.HRS), 0) AS TOT_HRS,
                        (CE.RATE * NVL(SUM(X.HRS), 0)) AS TOTAL_COST
                    FROM
                        XXZP.XX_CON_EMPLOYEE_INFO CE
                        JOIN {$this->table} CO
                            ON CE.CON_NUMBER = CO.CON_NUMBER
                        LEFT JOIN (
                            SELECT
                                TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))) AS EMP_CODE,
                                TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR')) AS T_DATE,
                                ROUND(
                                    NVL(
                                        TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) +
                                        TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60,
                                        0
                                    )
                                    - NVL(
                                        TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) +
                                        TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60,
                                        0
                                    ),
                                2) AS HRS
                            FROM ZPI.ICLOCK_TRANSACTION T
                            WHERE REGEXP_LIKE(TRIM(T.EMP_CODE), '^[0-9]+$')
                            GROUP BY
                                TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))),
                                TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR'))
                        ) X
                            ON CE.EMPLOYEE_NUMBER = X.EMP_CODE
                           AND X.T_DATE BETWEEN TO_DATE(?, 'DD-MON-RR') AND TO_DATE(?, 'DD-MON-RR')
                    WHERE
                        UPPER(TRIM(CO.STATUS)) = 'ACTIVE' AND UPPER(TRIM(CE.STATUS)) = 'ACTIVE'";

        $binds = [$fromFmt, $toFmt];

        if ($div !== '' && strtoupper($div) !== 'ALL') {
            $sql .= " AND CE.DIVISION = ?";
            $binds[] = (string) $div;
        }

        $sql .= " GROUP BY
                        CE.DIVISION, CO.CON_NUMBER, CO.CON_NAME, CE.EMPLOYEE_NUMBER,
                        CE.EMPLOYEE_NAME, CE.RATE, CE.PROD_DEP, CE.JOB, CE.IQAMAH
                )";

        // DEP / CON_NAME are aliases produced inside the subquery above, so
        // they have to be filtered in this outer WHERE, same as the legacy
        // query did.
        $where = [];
        if ($dept !== '') {
            $where[] = "DEP = ?";
            $binds[] = (string) $dept;
        }
        if ($cont !== '') {
            $where[] = "CON_NAME = ?";
            $binds[] = (string) $cont;
        }
        if (!empty($where)) {
            $sql = "SELECT * FROM ({$sql}) WHERE " . implode(' AND ', $where);
        }

        $sql .= " GROUP BY CON_NO, CON_NAME ORDER BY CON_NO";

        return $this->ebs->query($sql, $binds)->result_array();
    }

    //Report
    public function get_summary_detail($from, $to, $dept, $cont, $div)
    {
        [$fromFmt, $toFmt] = $this->normalize_summary_range($from, $to);

        $sql = "SELECT * FROM (
            SELECT
                TRUNC(X.T_DATE) AS T_DATE,
                DECODE(CE.DIVISION, 'IBM', 'IPP BU', 'Z3P', 'FPP BU') AS DIVISION,
                CO.CON_NUMBER AS CON_NO,
                CO.CON_NAME AS CON_NAME,
                CE.PROD_DEP AS DEP_ID,
                (
                    SELECT DISTINCT NAME
                    FROM HR_ORGANIZATION_UNITS
                    WHERE ORGANIZATION_ID = CASE
                        WHEN REGEXP_LIKE(CE.PROD_DEP, '^[0-9]+$')
                        THEN TO_NUMBER(CE.PROD_DEP)
                        ELSE NULL
                    END
                ) AS DEP,
                CE.EMPLOYEE_NUMBER AS EMP_NO,
                CE.EMPLOYEE_NAME,
                X.INN_P_IN,
                X.OUTT_P_OUT,
                CASE
                    WHEN X.HRS < 0 THEN 0
                    WHEN X.HRS > 11.5 THEN 11.5
                    ELSE X.HRS
                END AS ACT_HRS
            FROM (
                SELECT
                    TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))) AS EMP_CODE,
                    TRUNC(TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR'), 'DD-MON-RR')) AS T_DATE,
                    MIN(TO_CHAR(T.PUNCH_TIME, 'HH24:MI:SS')) AS INN_P_IN,
                    MAX(TO_CHAR(T.PUNCH_TIME, 'HH24:MI:SS')) AS OUTT_P_OUT,
                    ROUND(
                        NVL(
                            TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) +
                            TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60,
                            0
                        )
                        - NVL(
                            TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) +
                            TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60,
                            0
                        ),
                    2) AS HRS
                FROM ZPI.ICLOCK_TRANSACTION T
                WHERE REGEXP_LIKE(TRIM(T.EMP_CODE), '^[0-9]+$')
                GROUP BY
                    TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))),
                    TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR')
            ) X
            JOIN XXZP.XX_CON_EMPLOYEE_INFO CE
                ON CE.EMPLOYEE_NUMBER = X.EMP_CODE
            JOIN {$this->table} CO
                ON CE.CON_NUMBER = CO.CON_NUMBER
            WHERE
                UPPER(TRIM(CO.STATUS)) = 'ACTIVE' AND UPPER(TRIM(CE.STATUS)) = 'ACTIVE'
                AND TRUNC(X.T_DATE) BETWEEN TRUNC(TO_DATE(?, 'DD-MON-RR'))
                                        AND TRUNC(TO_DATE(?, 'DD-MON-RR'))";

        $binds = [$fromFmt, $toFmt];

        if ($div !== '' && strtoupper($div) !== 'ALL') {
            $sql .= " AND CE.DIVISION = ?";
            $binds[] = (string) $div;
        }
        if ($dept !== '') {
            $sql .= " AND DEP = ?";
            $binds[] = (string) $dept;
        }
        if ($cont !== '') {
            $sql .= " AND CO.CON_NAME = ?";
            $binds[] = (string) $cont;
        }

        $sql .= " ORDER BY CO.CON_NUMBER, CE.EMPLOYEE_NUMBER)";

        return $this->ebs->query($sql, $binds)->result_array();
    }

    /**
     * Accepts 'YYYY-MM-DD' or an already-formatted date string and returns
     * a ['DD-MON-RR', 'DD-MON-RR'] pair for TO_DATE(..., 'DD-MON-RR').
     */
    private function normalize_summary_range($from, $to)
    {
        return [
            strtoupper(date('d-M-y', strtotime((string) $from))),
            strtoupper(date('d-M-y', strtotime((string) $to))),
        ];
    }
}
