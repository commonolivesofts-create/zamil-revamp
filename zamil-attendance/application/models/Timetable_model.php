<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Timetable_model extends CI_Model
{
    private $table = 'XX_DIGI_TIMETABLE_PR';
    private $shiftTable = 'XX_DIGI_SHIFT_PR';
    private $employeeMasterTable = 'XX_DIGI_EMP_MASTER';
    private $columnExistsCache = [];

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function get_all()
    {
        $joinShift = $this->can_join_shift();

        $selects = [
            $this->timetable_select('t', 'ID'),
            $this->timetable_select('t', 'UUID'),
            $this->timetable_select('t', 'EMP_NO'),
            $this->timetable_select('t', 'EMP_NAME'),
            $this->timetable_select('t', 'SHIFT_ID'),
            $this->shift_select('s', 'SHIFT_NAME'),
            $this->shift_select('s', 'CHECK_IN'),
            $this->shift_select('s', 'CHECK_OUT'),
            $this->timetable_select('t', 'START_DATE'),
            $this->timetable_select('t', 'EXCLUDE_TIMESHEET'),
            $this->timetable_select('t', 'OVERTIME_ALLOWED'),
            $this->timetable_select('t', 'END_DATE'),
            "NULL AS STATUS",
            "NULL AS CREATED_AT",
            "NULL AS UPDATED_AT",
        ];

        $sql = "SELECT
                    " . implode(",\n                    ", $selects) . "
                FROM {$this->table} t";

        if ($joinShift) {
            $sql .= "
                LEFT JOIN {$this->shiftTable} s
                    ON {$this->shift_join_condition()}";
        }

        if ($this->has_timetable_column('ID')) {
            $sql .= "
                ORDER BY t.ID DESC";
        }

        return $this->db->query($sql)->result_array();
    }

    public function deactivate_by_uuid($uuid)
    {
        if (!$this->has_timetable_column('UUID') || !$this->has_timetable_column('STATUS')) {
            return false;
        }

        $this->db->where('UUID', $uuid);
        return $this->db->update($this->table, [
            'STATUS' => 'INACTIVE'
        ]);
    }

    public function deactivate_active_assignments($empNo, $shiftId, $excludeUuid = null)
    {
        if (
            $empNo === null ||
            $shiftId === null ||
            !$this->has_timetable_column('EMP_NO') ||
            !$this->has_timetable_column('SHIFT_ID') ||
            !$this->has_timetable_column('STATUS')
        ) {
            return false;
        }

        $sql = "UPDATE {$this->table}
                SET STATUS = 'INACTIVE'
                WHERE EMP_NO = ?
                  AND TRIM(CAST(SHIFT_ID AS VARCHAR2(50))) = ?
                  AND UPPER(NVL(STATUS, '')) = 'ACTIVE'";
        $binds = [(int) $empNo, trim((string) $shiftId)];

        if (!empty($excludeUuid) && $this->has_timetable_column('UUID')) {
            $sql .= " AND UUID <> ?";
            $binds[] = $excludeUuid;
        }

        return $this->db->query($sql, $binds);
    }

    public function get_timetable_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = max(0, (int) get_limit_offset($currentPage, $limit));
        $limit = (int) $limit;
        $joinShift = $this->can_join_shift();

        $select = [
            $this->timetable_select('t', 'ID'),
            $this->timetable_select('t', 'UUID'),
            $this->timetable_select('t', 'EMP_NO'),
            $this->timetable_select('t', 'EMP_NAME'),
            $this->timetable_select('t', 'SHIFT_ID'),
            $this->shift_select('s', 'SHIFT_NAME'),
            $this->shift_select_raw('s', 'CHECK_IN'),
            $this->shift_select_raw('s', 'CHECK_OUT'),
            $this->timetable_select('t', 'START_DATE'),
            $this->timetable_select('t', 'END_DATE'),
            $this->timetable_select('t', 'EXCLUDE_TIMESHEET'),
            $this->timetable_select('t', 'OVERTIME_ALLOWED'),
            $this->timetable_select('t', 'STATUS'),
            $this->timetable_select('t', 'CREATED_AT'),
            $this->timetable_select('t', 'UPDATED_AT'),
        ];

        $sql = "SELECT " . implode(", ", $select) . "
        FROM {$this->table} t";

        if ($joinShift) {
            $sql .= " LEFT JOIN {$this->shiftTable} s ON {$this->shift_join_condition()}";
        }
        // $sql .= " INNER JOIN XX_DIGI_EMP_MASTER e
        //       ON TRIM(CAST(e.EMPLOYEE_NUMBER AS VARCHAR2(50)))
        //        = TRIM(CAST(t.EMP_NO AS VARCHAR2(50)))";

        $where = [];
        $binds = [];
    
         // Only current/active employees
     
        // $where[] = "UPPER(NVL(e.CURRENT_EMP_FLAG, 'N')) = 'Y'";


        if (!empty($filters) && is_array($filters)) {
            $empName = isset($filters['emp_name']) ? trim((string) $filters['emp_name']) : '';
            $empNo = isset($filters['emp_no']) ? trim((string) $filters['emp_no']) : '';
            $shiftName = isset($filters['shift_name']) ? trim((string) $filters['shift_name']) : '';
            $startDate = isset($filters['start_date']) ? trim((string) $filters['start_date']) : '';
            $endDate = isset($filters['end_date']) ? trim((string) $filters['end_date']) : '';
            $status = isset($filters['status']) ? trim((string) $filters['status']) : '';
            $shiftId = isset($filters['shift_id']) ? trim((string) $filters['shift_id']) : '';

            if ($empName !== '' && $this->has_timetable_column('EMP_NAME')) {
                $where[] = "UPPER(NVL(t.EMP_NAME, '')) LIKE ?";
                $binds[] = '%' . strtoupper($empName) . '%';
            }

            if ($empNo !== '' && $this->has_timetable_column('EMP_NO')) {
                $where[] = "UPPER(NVL(CAST(t.EMP_NO AS VARCHAR2(50)), '')) LIKE ?";
                $binds[] = '%' . strtoupper($empNo) . '%';
            }

            if ($shiftName !== '' && $joinShift && $this->has_shift_column('SHIFT_NAME')) {
                $where[] = "UPPER(NVL(s.SHIFT_NAME, '')) LIKE ?";
                $binds[] = '%' . strtoupper($shiftName) . '%';
            }

            if ($startDate !== '' && $this->has_timetable_column('START_DATE')) {
                $where[] = "TRUNC(t.START_DATE) = TO_DATE(?, 'YYYY-MM-DD')";
                $binds[] = $startDate;
            }

            if ($endDate !== '' && $this->has_timetable_column('END_DATE')) {
                $where[] = "TRUNC(t.END_DATE) = TO_DATE(?, 'YYYY-MM-DD')";
                $binds[] = $endDate;
            }

            if ($status !== '' && $this->has_timetable_column('STATUS')) {
                $where[] = "UPPER(NVL(t.STATUS, '')) = ?";
                $binds[] = strtoupper($status);
            }

            if ($shiftId !== '' && $this->has_timetable_column('SHIFT_ID')) {
                $where[] = "TRIM(CAST(t.SHIFT_ID AS VARCHAR2(50))) = ?";
                $binds[] = $shiftId;
            }
        }

        $search = trim((string) $search);
        if ($search !== '') {
            $searchParts = [];
            $likeValue = '%' . strtoupper($search) . '%';

            if ($this->has_timetable_column('EMP_NAME')) {
                $searchParts[] = "UPPER(NVL(t.EMP_NAME, '')) LIKE ?";
                $binds[] = $likeValue;
            }

            if ($this->has_timetable_column('EMP_NO')) {
                $searchParts[] = "UPPER(NVL(CAST(t.EMP_NO AS VARCHAR2(50)), '')) LIKE ?";
                $binds[] = $likeValue;
            }

            if ($joinShift && $this->has_shift_column('SHIFT_NAME')) {
                $searchParts[] = "UPPER(NVL(s.SHIFT_NAME, '')) LIKE ?";
                $binds[] = $likeValue;
            }

            if ($this->has_timetable_column('STATUS')) {
                $searchParts[] = "UPPER(NVL(t.STATUS, '')) LIKE ?";
                $binds[] = $likeValue;
            }

            if (!empty($searchParts)) {
                $where[] = '(' . implode(' OR ', $searchParts) . ')';
            }
        }

        if (!empty($where)) {
            $sql .= " WHERE " . implode(' AND ', $where);
        }

        if ($type !== 'list') {
            $countSql = "SELECT COUNT(1) AS TOTAL FROM ({$sql}) q";
            $row = $this->db->query($countSql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        if ($this->has_timetable_column('ID')) {
            $sql .= " ORDER BY t.ID DESC";
        }

        if ($limit > 0) {
            $sql .= " OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY";
        }

        return $this->db->query($sql, $binds)->result_array();
    }
    private function shift_select_raw($alias, $column)
    {
        $aliasName = strtoupper($column);

        if ($this->has_shift_column($column)) {
            return "{$alias}.{$aliasName} AS {$aliasName}";
        }

        return "NULL AS {$aliasName}";
    }

    public function get_shift_options()
    {
        $selects = [
            $this->shift_select('s', 'ID'),
            $this->shift_select('s', 'SHIFT_NAME'),
            $this->shift_select_raw('s', 'CHECK_IN'),
            $this->shift_select_raw('s', 'CHECK_OUT'),
            $this->shift_select('s', 'STATUS'),
        ];

        $sql = "SELECT
                " . implode(",\n                ", $selects) . "
            FROM {$this->shiftTable} s";

        if ($this->has_shift_column('SHIFT_NAME')) {
            $sql .= "
            ORDER BY s.SHIFT_NAME ASC";
        }

        return $this->db->query($sql)->result_array();
    }

    public function insert_timetable($data)
    {
        $uuid = isset($data['uuid']) && !empty($data['uuid'])
            ? $data['uuid']
            : $this->generate_uuid_v4();

        $empNo = isset($data['emp_no']) && $data['emp_no'] !== '' ? (int) $data['emp_no'] : null;
        $empName = isset($data['emp_name']) ? trim($data['emp_name']) : '';
        $shiftId = isset($data['shift_id']) && $data['shift_id'] !== '' ? (int) $data['shift_id'] : null;
        $startDate = $this->normalize_date(isset($data['start_date']) ? $data['start_date'] : null);
        $endDate = $this->normalize_date(isset($data['end_date']) ? $data['end_date'] : null);
        $status = isset($data['status']) ? trim($data['status']) : 'ACTIVE';



        $columns = [];
        $values = [];
        $binds = [];

        if ($this->has_timetable_column('UUID')) {
            $columns[] = 'UUID';
            $values[] = '?';
            $binds[] = $uuid;
        }
        if ($this->has_timetable_column('EMP_NO')) {
            $columns[] = 'EMP_NO';
            $values[] = '?';
            $binds[] = $empNo;
        }
        if ($this->has_timetable_column('EMP_NAME')) {
            $columns[] = 'EMP_NAME';
            $values[] = '?';
            $binds[] = $empName;
        }
        if ($this->has_timetable_column('SHIFT_ID')) {
            $columns[] = 'SHIFT_ID';
            $values[] = '?';
            $binds[] = $shiftId;
        }
        if ($this->has_timetable_column('START_DATE')) {
            $columns[] = 'START_DATE';
            $values[] = "CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END";
            $binds[] = $startDate;
            $binds[] = $startDate;
        }
        if ($this->has_timetable_column('END_DATE')) {
            $columns[] = 'END_DATE';
            $values[] = "CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END";
            $binds[] = $endDate;
            $binds[] = $endDate;
        }
        if ($this->has_timetable_column('STATUS')) {
            $columns[] = 'STATUS';
            $values[] = '?';
            $binds[] = $status;
        }
        if (empty($columns)) {
            return false;
        }

        $sql = "INSERT INTO {$this->table} (
                    " . implode(",\n                    ", $columns) . "
                ) VALUES (
                    " . implode(",\n                    ", $values) . "
                )";

        $ok = $this->db->query($sql, $binds);

        return $ok ? $uuid : false;
    }

    public function find_by_uuid($uuid)
    {
        $sql = "
        SELECT
            t.ID,
            t.UUID,
            t.EMP_NO,
            t.EMP_NAME,
            t.SHIFT_ID,
            s.SHIFT_NAME,
            s.CHECK_IN,
            s.CHECK_OUT,
            t.START_DATE,
            t.END_DATE,
            t.STATUS,
            t.CREATED_AT,
            t.UPDATED_AT,
            t.OVERTIME_ALLOWED, 
            t.EXCLUDE_TIMESHEET
        FROM XX_DIGI_TIMETABLE_PR t
        LEFT JOIN XX_DIGI_SHIFT_PR s
            ON " . $this->shift_join_condition() . "
        WHERE t.UUID = ?
        ORDER BY CASE WHEN UPPER(NVL(t.STATUS, '')) = 'ACTIVE' THEN 0 ELSE 1 END,
                 t.ID DESC
    ";

        return $this->db->query($sql, [$uuid])->row_array();
    }

    public function find_by_id($id)
    {
        if (!$this->has_timetable_column('ID')) {
            return [];
        }

        $joinShift = $this->can_join_shift();

        $selects = [
            $this->timetable_select('t', 'ID'),
            $this->timetable_select('t', 'UUID'),
            $this->timetable_select('t', 'EMP_NO'),
            $this->timetable_select('t', 'EMP_NAME'),
            $this->timetable_select('t', 'SHIFT_ID'),
            $this->shift_select('s', 'SHIFT_NAME'),
            $this->shift_select('s', 'CHECK_IN'),
            $this->shift_select('s', 'CHECK_OUT'),
            $this->timetable_select('t', 'START_DATE'),
            $this->timetable_select('t', 'END_DATE'),
            "NULL AS STATUS",
            "NULL AS CREATED_AT",
            "NULL AS UPDATED_AT",
        ];

        $sql = "SELECT
                    " . implode(",\n                    ", $selects) . "
                FROM {$this->table} t";

        if ($joinShift) {
            $sql .= "
                LEFT JOIN {$this->shiftTable} s
                    ON {$this->shift_join_condition()}";
        }

        $sql .= "
                WHERE t.ID = ?";

        return $this->db->query($sql, [$id])->row_array();
    }

    public function update_timetable($uuid, $data)
    {
        if (!$this->has_timetable_column('UUID')) {
            return [
                'status' => false,
                'message' => 'UUID column not found in timetable table.',
                'changed' => false
            ];
        }

        $current = $this->find_by_uuid($uuid);
        if (empty($current)) {
            return [
                'status' => false,
                'message' => 'Timetable not found.',
                'changed' => false
            ];
        }

        $incoming = [];
        if ($this->has_timetable_column('EMP_NO')) {
            $incoming['EMP_NO'] = isset($data['emp_no']) && $data['emp_no'] !== '' ? (int) $data['emp_no'] : null;
        }
        if ($this->has_timetable_column('EMP_NAME')) {
            $incoming['EMP_NAME'] = isset($data['emp_name']) ? trim($data['emp_name']) : '';
        }
        if ($this->has_timetable_column('SHIFT_ID')) {
            $incoming['SHIFT_ID'] = isset($data['shift_id']) && $data['shift_id'] !== '' ? (int) $data['shift_id'] : null;
        }
        if ($this->has_timetable_column('START_DATE')) {
            $incoming['START_DATE'] = $this->normalize_date(isset($data['start_date']) ? $data['start_date'] : null);
        }
        if ($this->has_timetable_column('END_DATE')) {
            $incoming['END_DATE'] = $this->normalize_date(isset($data['end_date']) ? $data['end_date'] : null);
        }
        if ($this->has_timetable_column('STATUS')) {
            $incoming['STATUS'] = isset($data['status']) && $data['status'] !== ''
                ? trim($data['status'])
                : null;
        }
        if (empty($incoming)) {
            return [
                'status' => true,
                'message' => 'No updatable columns available.',
                'changed' => false
            ];
        }

        $currentComparable = [];
        foreach ($incoming as $key => $value) {
            if ($key === 'EMP_NO' || $key === 'SHIFT_ID') {
                $currentComparable[$key] = isset($current[$key]) && $current[$key] !== '' ? (int) $current[$key] : null;
            } elseif ($key === 'START_DATE' || $key === 'END_DATE') {
                $currentComparable[$key] = $this->normalize_date(isset($current[$key]) ? $current[$key] : null);
            } else {
                $currentComparable[$key] = isset($current[$key]) ? trim((string) $current[$key]) : '';
            }
        }

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
                'changed' => false
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

        if (empty($setSql)) {
            return [
                'status' => true,
                'message' => 'No changes detected.',
                'changed' => false
            ];
        }

        $binds[] = $uuid;

        $sql = "UPDATE {$this->table}
                SET " . implode(', ', $setSql) . "
                WHERE UUID = ?";

        $ok = $this->db->query($sql, $binds);

        return [
            'status' => $ok,
            'message' => $ok ? 'Timetable updated successfully.' : 'Failed to update timetable.',
            'changed' => true
        ];
    }

    public function delete_timetable($uuid)
    {
        if (!$this->has_timetable_column('UUID')) {
            return false;
        }

        $sql = "DELETE FROM {$this->table} WHERE UUID = ?";
        return $this->db->query($sql, [$uuid]);
    }

    public function delete_timetable_by_id($id)
    {
        if (!$this->has_timetable_column('ID')) {
            return false;
        }

        $sql = "DELETE FROM {$this->table} WHERE ID = ?";
        return $this->db->query($sql, [(int) $id]);
    }

    public function assignment_exists($empNo, $shiftId, $startDate, $excludeUuid = null)
    {
        $startDate = $this->normalize_date($startDate);

        if (
            $empNo === null ||
            $shiftId === null ||
            $startDate === null ||
            !$this->has_timetable_column('EMP_NO') ||
            !$this->has_timetable_column('SHIFT_ID') ||
            !$this->has_timetable_column('START_DATE')
        ) {
            return false;
        }

        $sql = "SELECT COUNT(1) AS TOTAL
                FROM {$this->table}
                WHERE EMP_NO = ?
                  AND TRIM(CAST(SHIFT_ID AS VARCHAR2(50))) = ?
                  AND START_DATE = TO_DATE(?, 'YYYY-MM-DD')";
        $binds = [(int) $empNo, trim((string) $shiftId), $startDate];

        if (!empty($excludeUuid) && $this->has_timetable_column('UUID')) {
            $sql .= " AND UUID <> ?";
            $binds[] = $excludeUuid;
        }

        $row = $this->db->query($sql, $binds)->row_array();
        $total = isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;

        return $total > 0;
    }

    public function find_employee_master_by_number($employeeNumber)
    {
        $employeeNumber = trim((string) $employeeNumber);
        if ($employeeNumber === '') {
            return [];
        }

        $sql = "SELECT DISTINCT
                    EMPLOYEE_NUMBER,
                    FULL_NAME,
                    EMAIL_ADDRESS
                FROM {$this->employeeMasterTable}
                WHERE EMPLOYEE_NUMBER = ?";

        return $this->db->query($sql, [$employeeNumber])->row_array();
    }

    private function normalize_date($value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        $timestamp = strtotime($value);
        return $timestamp ? date('Y-m-d', $timestamp) : null;
    }

    private function can_join_shift()
    {
        return $this->has_timetable_column('SHIFT_ID') && $this->has_shift_column('ID');
    }

    private function shift_join_condition()
    {
        return "TRIM(CAST(s.ID AS VARCHAR2(50))) = TRIM(CAST(t.SHIFT_ID AS VARCHAR2(50)))";
    }

    private function timetable_select($alias, $column, $format = null)
    {
        return $this->safe_select($alias, $this->table, $column, $format);
    }

    private function shift_select($alias, $column, $format = null)
    {
        return $this->safe_select($alias, $this->shiftTable, $column, $format);
    }

    private function safe_select($alias, $tableName, $column, $format = null)
    {
        $aliasName = strtoupper($column);
        if ($this->has_column($tableName, $column)) {
            return "{$alias}.{$aliasName} AS {$aliasName}";
        }

        return "NULL AS {$aliasName}";
    }

    private function has_timetable_column($columnName)
    {
        return $this->has_column($this->table, $columnName);
    }

    private function has_shift_column($columnName)
    {
        return $this->has_column($this->shiftTable, $columnName);
    }

    private function has_column($tableName, $columnName)
    {
        $tableName = strtoupper(trim((string) $tableName));
        $columnName = strtoupper(trim((string) $columnName));

        if ($tableName === '' || $columnName === '') {
            return false;
        }

        $tableCacheKey = '__TABLE_FIELDS__:' . $tableName;
        if (!array_key_exists($tableCacheKey, $this->columnExistsCache)) {
            $originalDebug = isset($this->db->db_debug) ? $this->db->db_debug : false;
            $this->db->db_debug = false;
            $fields = $this->db->list_fields($tableName);
            $this->db->db_debug = $originalDebug;

            $normalized = [];
            if (is_array($fields)) {
                foreach ($fields as $field) {
                    $normalized[] = strtoupper((string) $field);
                }
            }

            $this->columnExistsCache[$tableCacheKey] = $normalized;
        }

        return in_array($columnName, $this->columnExistsCache[$tableCacheKey], true);
    }

    private function generate_uuid_v4()
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
