<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Con_employee_model extends CI_Model
{
    private $table = 'XXZP.XX_CON_EMPLOYEE_INFO';

    public function __construct()
    {
        parent::__construct();
        $this->ebs = $this->load->database('ebs', true);
    }

    

    public function get_job_title_options()
    {
        $sql = "SELECT DISTINCT JOB_ID, NAME FROM PER_JOBS_TL WHERE LANGUAGE = 'US' ORDER BY 1";
        return $this->ebs->query($sql)->result_array();
    }

   
    public function get_boss_options()
    {
        $sql = "SELECT DISTINCT PERSON_ID, FULL_NAME
                FROM PER_PEOPLE_X
                WHERE PERSON_ID IN (
                    SELECT PERSON_ID FROM PER_ASSIGNMENTS_X
                    WHERE ORGANIZATION_ID IN (
                        SELECT ORGANIZATION_ID FROM HR_ORGANIZATION_UNITS WHERE NAME LIKE '%Prod%'
                    )
                    AND PAYROLL_ID IN (21, 22, 61)
                    AND ASSIGNMENT_STATUS_TYPE_ID = 1
                )
                UNION SELECT 1190, 'AL ESSA, SAAD' FROM DUAL
                UNION SELECT 2519, 'ALGHAMDI, TURKY' FROM DUAL
                ORDER BY 1";

        return $this->ebs->query($sql)->result_array();
    }

    public function get_department_lookup_options()
    {
        $sql = "SELECT DISTINCT ORGANIZATION_ID, NAME FROM HR_ORGANIZATION_UNITS WHERE TYPE = 'SEC' ORDER BY 1";
        return $this->ebs->query($sql)->result_array();
    }

 
    public function get_department_filter_options()
    {
        $sql = "SELECT DISTINCT DEPARTMENT FROM {$this->table} WHERE DEPARTMENT IS NOT NULL
                UNION SELECT 'ALL' FROM DUAL
                ORDER BY 1";
        return $this->ebs->query($sql)->result_array();
    }

    public function find_by_id($id)
    {
        $sql = "SELECT
                    EMP_ID, DIVISION, CON_NUMBER, CON_NAME, EMPLOYEE_NUMBER, EMPLOYEE_NAME,
                    IQAMAH, DEPARTMENT, PROD_DEP, DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE,
                    PLACE, REPLACEMENT, RATE,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    STATUS, AJEER, SFDA, BLACKLIST, REMARK,
                    CREATEB_BY, CREATION_DATE, UPDATED_BY, UPDATED_DATE
                FROM {$this->table}
                WHERE EMP_ID = ?";

        return $this->ebs->query($sql, [(int) $id])->row_array();
    }

    
    public function get_employee_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = get_limit_offset($currentPage, $limit);
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        if (!empty($filters['division']) && strtoupper($filters['division']) !== 'ALL') {
            $where[] = "DIVISION = ?";
            $binds[] = (string) $filters['division'];
        }

        if (!empty($filters['department']) && strtoupper($filters['department']) !== 'ALL') {
            $where[] = "DEPARTMENT = ?";
            $binds[] = (string) $filters['department'];
        }

        if (!empty($filters['status']) && strtoupper($filters['status']) !== 'ALL') {
            $where[] = "UPPER(TRIM(STATUS)) = UPPER(TRIM(?))";
            $binds[] = (string) $filters['status'];
        }

        if (!empty($filters['con_number'])) {
            $where[] = "CON_NUMBER = ?";
            $binds[] = (string) $filters['con_number'];
        }

        // Legacy semantics: 'from' <= START_DATE and 'to' >= END_DATE.
        if (!empty($filters['start_date'])) {
            $where[] = "START_DATE >= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = $this->normalize_date($filters['start_date']);
        }

        if (!empty($filters['end_date'])) {
            $where[] = "END_DATE <= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = $this->normalize_date($filters['end_date']);
        }

        if ($search !== '') {
            $searchUpper = '%' . strtoupper($search) . '%';
            $where[] = "(
                UPPER(EMPLOYEE_NAME) LIKE ?
                OR UPPER(TO_CHAR(EMPLOYEE_NUMBER)) LIKE ?
                OR UPPER(CON_NAME) LIKE ?
                OR UPPER(DEPARTMENT) LIKE ?
            )";
            $binds[] = $searchUpper;
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
                    EMP_ID,
                    DECODE(DIVISION, 'IBM', 'IPP', 'Z3P', 'FPP', DIVISION) AS DIVISION,
                    CON_NUMBER, CON_NAME, EMPLOYEE_NUMBER, EMPLOYEE_NAME, IQAMAH,
                    DEPARTMENT, PROD_DEP, DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE,
                    PLACE, REPLACEMENT, RATE,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    STATUS, AJEER, SFDA, BLACKLIST, REMARK,
                    CREATEB_BY, CREATION_DATE, UPDATED_BY, UPDATED_DATE
                FROM {$this->table}
                {$whereSql}
                ORDER BY EMP_ID DESC";

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

   
    public function insert_con_employee(array $data, $userId)
    {
        $this->ebs->trans_begin();

        $conNumber = trim((string) ($data['con_number'] ?? ''));

        $nextEmpId = $this->ebs->query("SELECT NVL(MAX(EMP_ID), 0) + 1 AS ID FROM {$this->table}")->row_array();
        $empId = isset($nextEmpId['ID']) ? (int) $nextEmpId['ID'] : 1;

        $nextEmpNumber = $this->ebs->query(
            "SELECT NVL(MAX(EMPLOYEE_NUMBER) + 1, ?) AS NUM FROM {$this->table} WHERE CON_NUMBER = ?",
            [$conNumber, $conNumber]
        )->row_array();
        $employeeNumber = isset($nextEmpNumber['NUM']) ? $nextEmpNumber['NUM'] : $conNumber;

        $today = strtoupper(date('d-M-Y'));
        $startDate = $this->normalize_date($data['start_date'] ?? null);
        $endDate = $this->normalize_date($data['end_date'] ?? null);

        $sql = "INSERT INTO {$this->table} (
                    EMP_ID, DIVISION, CON_NUMBER, CON_NAME, EMPLOYEE_NUMBER, EMPLOYEE_NAME,
                    IQAMAH, DEPARTMENT, PROD_DEP, DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE,
                    PLACE, REPLACEMENT, RATE, START_DATE, END_DATE, STATUS, AJEER, SFDA,
                    BLACKLIST, REMARK, CREATEB_BY, CREATION_DATE
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END,
                    CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END,
                    ?, ?, ?, ?, ?, ?, ?
                )";

        $ok = $this->ebs->query($sql, [
            $empId,
            $data['division'] ?? null,
            $conNumber,
            $data['con_name'] ?? null,
            $employeeNumber,
            $data['employee_name'] ?? null,
            $data['iqamah'] ?? null,
            $data['department'] ?? null,
            $data['prod_dep'] ?? null,
            $data['direct_boss'] ?? null,
            $data['direct_boss_id'] ?? null,
            $data['job'] ?? null,
            $data['job_title'] ?? null,
            $data['place'] ?? null,
            $data['replacement'] ?? null,
            isset($data['rate']) && $data['rate'] !== '' ? (float) $data['rate'] : null,
            $startDate,
            $startDate,
            $endDate,
            $endDate,
            $data['status'] ?? null,
            $data['ajeer'] ?? null,
            $data['sfda'] ?? null,
            $data['blacklist'] ?? null,
            $data['remark'] ?? null,
            $userId,
            $today,
        ]);

        if (!$ok) {
            $this->ebs->trans_rollback();
            return false;
        }

        $this->ebs->trans_commit();
        return $empId;
    }

    
    public function update_con_employee($id, array $data, $userId)
    {
        $current = $this->find_by_id($id);
        if (empty($current)) {
            return [
                'status' => false,
                'message' => 'Employee not found.',
                'changed' => false,
            ];
        }

        $columnMap = [
            'DIVISION' => $data['division'] ?? null,
            'EMPLOYEE_NUMBER' => $data['employee_number'] ?? null,
            'EMPLOYEE_NAME' => $data['employee_name'] ?? null,
            'IQAMAH' => $data['iqamah'] ?? null,
            'DEPARTMENT' => $data['department'] ?? null,
            'PROD_DEP' => $data['prod_dep'] ?? null,
            'DIRECT_BOSS' => $data['direct_boss'] ?? null,
            'DIRECT_BOSS_ID' => $data['direct_boss_id'] ?? null,
            'JOB' => $data['job'] ?? null,
            'JOB_TITLE' => $data['job_title'] ?? null,
            'PLACE' => $data['place'] ?? null,
            'REPLACEMENT' => $data['replacement'] ?? null,
            'RATE' => isset($data['rate']) && $data['rate'] !== '' ? (float) $data['rate'] : null,
            'START_DATE' => $this->normalize_date($data['start_date'] ?? null),
            'END_DATE' => $this->normalize_date($data['end_date'] ?? null),
            'STATUS' => $data['status'] ?? null,
            'AJEER' => $data['ajeer'] ?? null,
            'SFDA' => $data['sfda'] ?? null,
            'BLACKLIST' => $data['blacklist'] ?? null,
            'REMARK' => $data['remark'] ?? null,
        ];

        $currentComparable = [
            'DIVISION' => $current['DIVISION'] ?? null,
            'EMPLOYEE_NUMBER' => $current['EMPLOYEE_NUMBER'] ?? null,
            'EMPLOYEE_NAME' => $current['EMPLOYEE_NAME'] ?? null,
            'IQAMAH' => $current['IQAMAH'] ?? null,
            'DEPARTMENT' => $current['DEPARTMENT'] ?? null,
            'PROD_DEP' => $current['PROD_DEP'] ?? null,
            'DIRECT_BOSS' => $current['DIRECT_BOSS'] ?? null,
            'DIRECT_BOSS_ID' => $current['DIRECT_BOSS_ID'] ?? null,
            'JOB' => $current['JOB'] ?? null,
            'JOB_TITLE' => $current['JOB_TITLE'] ?? null,
            'PLACE' => $current['PLACE'] ?? null,
            'REPLACEMENT' => $current['REPLACEMENT'] ?? null,
            'RATE' => isset($current['RATE']) && $current['RATE'] !== null ? (float) $current['RATE'] : null,
            'START_DATE' => $this->normalize_date($current['START_DATE'] ?? null),
            'END_DATE' => $this->normalize_date($current['END_DATE'] ?? null),
            'STATUS' => $current['STATUS'] ?? null,
            'AJEER' => $current['AJEER'] ?? null,
            'SFDA' => $current['SFDA'] ?? null,
            'BLACKLIST' => $current['BLACKLIST'] ?? null,
            'REMARK' => $current['REMARK'] ?? null,
        ];

        $changes = [];
        foreach ($columnMap as $column => $value) {
            $existing = $currentComparable[$column];
            $same = is_string($value) && is_string($existing)
                ? trim($value) === trim($existing)
                : $value === $existing;

            if (!$same) {
                $changes[$column] = $value;
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

        $sql = "UPDATE {$this->table} SET " . implode(', ', $setSql) . " WHERE EMP_ID = ?";
        $ok = $this->ebs->query($sql, $binds);

        return [
            'status' => (bool) $ok,
            'message' => $ok ? 'Employee updated successfully.' : 'Failed to update employee.',
            'changed' => (bool) $ok,
        ];
    }

    public function delete_con_employee($id)
    {
        return $this->ebs->query("DELETE FROM {$this->table} WHERE EMP_ID = ?", [(int) $id]);
    }

    private function normalize_date($value)
    {
        $value = trim((string) $value);
        if ($value === '' || $value === '0000-00-00') {
            return null;
        }

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
}
