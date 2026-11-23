<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Occasion_model extends CI_Model
{
    private $table = 'XX_DIGI_ATT_OCCASIONS';

    public function __construct()
    {
        parent::__construct();
    }

    // public function get_occasion_list($type = 'list', $limit = 0, $currentPage = 1, $filters = [], $search = '')
    // {
    //     $where = [];
    //     $binds = [];

    //     if (!empty($search)) {
    //         $where[] = "UPPER(OCCASION_NAME) LIKE UPPER(?)";
    //         $binds[] = '%' . trim($search) . '%';
    //     }

    //     if (!empty($filters['occasion_name'])) {
    //         $where[] = "UPPER(OCCASION_NAME) LIKE UPPER(?)";
    //         $binds[] = '%' . trim($filters['occasion_name']) . '%';
    //     }

    //     if (!empty($filters['from_date'])) {
    //         $where[] = "TRUNC(FROM_DATE) >= TO_DATE(?, 'YYYY-MM-DD')";
    //         $binds[] = trim($filters['from_date']);
    //     }

    //     if (!empty($filters['to_date'])) {
    //         $where[] = "TRUNC(TO_DATE) <= TO_DATE(?, 'YYYY-MM-DD')";
    //         $binds[] = trim($filters['to_date']);
    //     }

    //     if (!empty($filters['occasion_type'])) {
    //         $where[] = "UPPER(OCCASION_TYPE) LIKE UPPER(?)";
    //         $binds[] = '%' . trim($filters['occasion_type']) . '%';
    //     }

    //     if (!empty($filters['count_as_present'])) {
    //         $where[] = "COUNT_AS_PRESENT = ?";
    //         $binds[] = trim($filters['count_as_present']);
    //     }

    //     if (!empty($filters['paid_holiday'])) {
    //         $where[] = "PAID_HOLIDAY = ?";
    //         $binds[] = trim($filters['paid_holiday']);
    //     }

    //     if (!empty($filters['is_active'])) {
    //         $where[] = "IS_ACTIVE = ?";
    //         $binds[] = trim($filters['is_active']);
    //     }

    //     $whereSql = '';
    //     if (!empty($where)) {
    //         $whereSql = ' WHERE ' . implode(' AND ', $where);
    //     }

    //     if ($type === 'total') {
    //         $sql = "SELECT COUNT(*) AS TOTAL_ROWS FROM {$this->table} {$whereSql}";
    //         $row = $this->db->query($sql, $binds)->row_array();
    //         return isset($row['TOTAL_ROWS']) ? (int) $row['TOTAL_ROWS'] : 0;
    //     }

    //     $offset = max(0, ($currentPage - 1) * $limit);

    //     $sql = "
    //     SELECT *
    //     FROM (
    //         SELECT
    //             q.*,
    //             ROW_NUMBER() OVER (ORDER BY q.FROM_DATE_RAW DESC, q.OCCASION_ID DESC) AS RN
    //         FROM (
    //             SELECT
    //                 OCCASION_ID,
    //                 OCCASION_NAME,
    //                 FROM_DATE AS FROM_DATE_RAW,
    //                 TO_CHAR(FROM_DATE, 'YYYY-MM-DD') AS FROM_DATE,
    //                 TO_CHAR(TO_DATE, 'YYYY-MM-DD') AS TO_DATE,
    //                 OCCASION_TYPE,
    //                 COUNT_AS_PRESENT,
    //                 PAID_HOLIDAY,
    //                 IS_ACTIVE,
    //                 REMARKS,
    //                 CREATED_BY,
    //                 TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
    //                 UPDATED_BY,
    //                 TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
    //             FROM {$this->table}
    //             {$whereSql}
    //         ) q
    //     )
    //  ";

    //     if ((int) $limit > 0) {
    //         $start = $offset + 1;
    //         $end = $offset + $limit;
    //         $sql .= " WHERE RN BETWEEN {$start} AND {$end}";
    //     }

    //     return $this->db->query($sql, $binds)->result_array();
    // }
    public function get_occasion_list($type = 'list', $limit = 0, $currentPage = 1, $filters = [], $search = '')
    {
        $where = [];
        $binds = [];

        if (!empty($search)) {
            $where[] = "UPPER(a.OCCASION_NAME) LIKE UPPER(?)";
            $binds[] = '%' . trim($search) . '%';
        }

        if (!empty($filters['occasion_name'])) {
            $where[] = "UPPER(a.OCCASION_NAME) LIKE UPPER(?)";
            $binds[] = '%' . trim($filters['occasion_name']) . '%';
        }

        if (!empty($filters['from_date'])) {
            $where[] = "TRUNC(a.FROM_DATE) >= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = trim($filters['from_date']);
        }

        if (!empty($filters['to_date'])) {
            $where[] = "TRUNC(a.TO_DATE) <= TO_DATE(?, 'YYYY-MM-DD')";
            $binds[] = trim($filters['to_date']);
        }

        if (!empty($filters['occasion_type'])) {
            $where[] = "UPPER(a.OCCASION_TYPE) LIKE UPPER(?)";
            $binds[] = '%' . trim($filters['occasion_type']) . '%';
        }

        if (!empty($filters['count_as_present'])) {
            $where[] = "a.COUNT_AS_PRESENT = ?";
            $binds[] = trim($filters['count_as_present']);
        }

        if (!empty($filters['paid_holiday'])) {
            $where[] = "a.PAID_HOLIDAY = ?";
            $binds[] = trim($filters['paid_holiday']);
        }

        if (!empty($filters['is_active'])) {
            $where[] = "a.IS_ACTIVE = ?";
            $binds[] = trim($filters['is_active']);
        }

        if (!empty($filters['shift_id'])) {
            $where[] = "INSTR(',' || a.SHIFT_ID || ',', ',' || ? || ',') > 0";
            $binds[] = trim($filters['shift_id']);
        }

        $whereSql = '';
        if (!empty($where)) {
            $whereSql = ' WHERE ' . implode(' AND ', $where);
        }

        if ($type === 'total') {
            $sql = "
            SELECT COUNT(*) AS TOTAL_ROWS
            FROM {$this->table} a
            {$whereSql}
        ";

            $row = $this->db->query($sql, $binds)->row_array();

            return isset($row['TOTAL_ROWS']) ? (int) $row['TOTAL_ROWS'] : 0;
        }

        $offset = max(0, ($currentPage - 1) * $limit);

        $sql = "
        SELECT *
        FROM (
            SELECT
                q.*,
                ROW_NUMBER() OVER (ORDER BY q.FROM_DATE_RAW DESC, q.OCCASION_ID DESC) AS RN
            FROM (
                SELECT
                    a.OCCASION_ID,
                    a.OCCASION_NAME,
                    a.FROM_DATE AS FROM_DATE_RAW,
                    TO_CHAR(a.FROM_DATE, 'YYYY-MM-DD') AS FROM_DATE,
                    TO_CHAR(a.TO_DATE, 'YYYY-MM-DD') AS TO_DATE,
                    a.OCCASION_TYPE,
                    a.SHIFT_ID,

                    (
                        SELECT LISTAGG(s.SHIFT_NAME, ', ') WITHIN GROUP (ORDER BY s.SHIFT_NAME)
                        FROM XX_DIGI_SHIFT_PR s
                        WHERE INSTR(',' || a.SHIFT_ID || ',', ',' || s.ID || ',') > 0
                    ) AS SHIFT_NAMES,

                    a.COUNT_AS_PRESENT,
                    a.PAID_HOLIDAY,
                    a.IS_ACTIVE,
                    a.REMARKS,
                    a.CREATED_BY,
                    TO_CHAR(a.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                    a.UPDATED_BY,
                    TO_CHAR(a.UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
                FROM {$this->table} a
                {$whereSql}
            ) q
        )
      ";

        if ((int) $limit > 0) {
            $start = $offset + 1;
            $end = $offset + $limit;
            $sql .= " WHERE RN BETWEEN {$start} AND {$end}";
        }

        return $this->db->query($sql, $binds)->result_array();
    }


    public function getOccasionById($id)
    {
        $sql = "
        SELECT
            a.OCCASION_ID,
            a.OCCASION_NAME,
            TO_CHAR(a.FROM_DATE, 'YYYY-MM-DD') AS FROM_DATE,
            TO_CHAR(a.TO_DATE, 'YYYY-MM-DD') AS TO_DATE,
            a.OCCASION_TYPE,
            a.SHIFT_ID,

            (
                SELECT LISTAGG(s.SHIFT_NAME, ', ') WITHIN GROUP (ORDER BY s.SHIFT_NAME)
                FROM XX_DIGI_SHIFT_PR s
                WHERE INSTR(',' || a.SHIFT_ID || ',', ',' || s.ID || ',') > 0
            ) AS SHIFT_NAMES,
            a.COUNT_AS_PRESENT,
            a.PAID_HOLIDAY,
            a.IS_ACTIVE,
            a.REMARKS,
            a.CREATED_BY,
            TO_CHAR(a.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
            a.UPDATED_BY,
            TO_CHAR(a.UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
        FROM {$this->table} a
        WHERE a.OCCASION_ID = ?
    ";

        return $this->db->query($sql, [(int) $id])->row_array();
    }

    // public function getOccasionById($id)
    // {
    //     $sql = "
    //         SELECT
    //             OCCASION_ID,
    //             OCCASION_NAME,
    //             TO_CHAR(FROM_DATE, 'YYYY-MM-DD') AS FROM_DATE,
    //             TO_CHAR(TO_DATE, 'YYYY-MM-DD') AS TO_DATE,
    //             OCCASION_TYPE,
    //             COUNT_AS_PRESENT,
    //             PAID_HOLIDAY,
    //             IS_ACTIVE,
    //             REMARKS,
    //             CREATED_BY,
    //             TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
    //             UPDATED_BY,
    //             TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT,

    //         FROM {$this->table}
    //         WHERE OCCASION_ID = ?
    //     ";

    //     return $this->db->query($sql, [(int) $id])->row_array();
    // }
        public function insertOccasion($data)
        {
            $conn = $this->db->conn_id;

            $sql = "
            INSERT INTO {$this->table}
            (
                OCCASION_NAME,
                FROM_DATE,
                TO_DATE,
                OCCASION_TYPE,
                SHIFT_ID,
                COUNT_AS_PRESENT,
                PAID_HOLIDAY,
                IS_ACTIVE,
                REMARKS,
                CREATED_BY,
                CREATED_AT,
                UPDATED_BY,
                UPDATED_AT
            )
            VALUES
            (
                :OCCASION_NAME,
                TO_DATE(:FROM_DATE, 'YYYY-MM-DD'),
                TO_DATE(:TO_DATE, 'YYYY-MM-DD'),
                :OCCASION_TYPE,
                :SHIFT_ID,
                :COUNT_AS_PRESENT,
                :PAID_HOLIDAY,
                :IS_ACTIVE,
                :REMARKS,
                :CREATED_BY,
                CURRENT_TIMESTAMP,
                :UPDATED_BY,
                CURRENT_TIMESTAMP
            )
            RETURNING OCCASION_ID INTO :NEW_ID
        ";

            $stmt = oci_parse($conn, $sql);

            $occasionName = $this->nullIfEmpty($data['OCCASION_NAME'] ?? null);
            $fromDate = $this->nullIfEmpty($data['FROM_DATE'] ?? null);
            $toDate = $this->nullIfEmpty($data['TO_DATE'] ?? null);
            $occasionType = $this->nullIfEmpty($data['OCCASION_TYPE'] ?? null);
            $shiftId = $this->normalizeShiftIds($data['SHIFT_ID'] ?? null);

            $countAsPresent = $this->normalizeYN($data['COUNT_AS_PRESENT'] ?? 'Y');
            $paidHoliday = $this->normalizeYN($data['PAID_HOLIDAY'] ?? 'Y');
            $isActive = $this->normalizeYN($data['IS_ACTIVE'] ?? 'Y');
            $remarks = $this->nullIfEmpty($data['REMARKS'] ?? null);
            $createdBy = $this->nullIfEmpty($data['CREATED_BY'] ?? null);
            $updatedBy = $this->nullIfEmpty($data['UPDATED_BY'] ?? null);
            $newId = null;

            oci_bind_by_name($stmt, ':OCCASION_NAME', $occasionName, 255);
            oci_bind_by_name($stmt, ':FROM_DATE', $fromDate, 20);
            oci_bind_by_name($stmt, ':TO_DATE', $toDate, 20);
            oci_bind_by_name($stmt, ':OCCASION_TYPE', $occasionType, 100);
            oci_bind_by_name($stmt, ':SHIFT_ID', $shiftId, 1000);
            oci_bind_by_name($stmt, ':COUNT_AS_PRESENT', $countAsPresent, 1);
            oci_bind_by_name($stmt, ':PAID_HOLIDAY', $paidHoliday, 1);
            oci_bind_by_name($stmt, ':IS_ACTIVE', $isActive, 1);
            oci_bind_by_name($stmt, ':REMARKS', $remarks, 500);
            oci_bind_by_name($stmt, ':CREATED_BY', $createdBy, 50);
            oci_bind_by_name($stmt, ':UPDATED_BY', $updatedBy, 50);
            oci_bind_by_name($stmt, ':NEW_ID', $newId, 20);

            $executed = oci_execute($stmt, OCI_NO_AUTO_COMMIT);

            if (!$executed) {
                oci_rollback($conn);
                oci_free_statement($stmt);
                return false;
            }

            oci_commit($conn);
            oci_free_statement($stmt);

            return $newId;
        }

    public function updateOccasion($id, $data)
    {
        $conn = $this->db->conn_id;

        $sql = "
        UPDATE {$this->table}
        SET
            OCCASION_NAME = :OCCASION_NAME,
            FROM_DATE = TO_DATE(:FROM_DATE, 'YYYY-MM-DD'),
            TO_DATE = TO_DATE(:TO_DATE, 'YYYY-MM-DD'),
            OCCASION_TYPE = :OCCASION_TYPE,
            SHIFT_ID = :SHIFT_ID,
            COUNT_AS_PRESENT = :COUNT_AS_PRESENT,
            PAID_HOLIDAY = :PAID_HOLIDAY,
            IS_ACTIVE = :IS_ACTIVE,
            REMARKS = :REMARKS,
            UPDATED_BY = :UPDATED_BY,
            UPDATED_AT = CURRENT_TIMESTAMP
        WHERE OCCASION_ID = :OCCASION_ID
    ";

        $stmt = oci_parse($conn, $sql);

        $occasionId = (int) $id;
        $occasionName = $this->nullIfEmpty($data['OCCASION_NAME'] ?? null);
        $fromDate = $this->nullIfEmpty($data['FROM_DATE'] ?? null);
        $toDate = $this->nullIfEmpty($data['TO_DATE'] ?? null);
        $occasionType = $this->nullIfEmpty($data['OCCASION_TYPE'] ?? null);
        $shiftId = $this->normalizeShiftIds($data['SHIFT_ID'] ?? null);

        $countAsPresent = $this->normalizeYN($data['COUNT_AS_PRESENT'] ?? 'Y');
        $paidHoliday = $this->normalizeYN($data['PAID_HOLIDAY'] ?? 'Y');
        $isActive = $this->normalizeYN($data['IS_ACTIVE'] ?? 'Y');
        $remarks = $this->nullIfEmpty($data['REMARKS'] ?? null);
        $updatedBy = $this->nullIfEmpty($data['UPDATED_BY'] ?? null);

        oci_bind_by_name($stmt, ':OCCASION_ID', $occasionId, 20);
        oci_bind_by_name($stmt, ':OCCASION_NAME', $occasionName, 255);
        oci_bind_by_name($stmt, ':FROM_DATE', $fromDate, 20);
        oci_bind_by_name($stmt, ':TO_DATE', $toDate, 20);
        oci_bind_by_name($stmt, ':OCCASION_TYPE', $occasionType, 100);
        oci_bind_by_name($stmt, ':SHIFT_ID', $shiftId, 1000);
        oci_bind_by_name($stmt, ':COUNT_AS_PRESENT', $countAsPresent, 1);
        oci_bind_by_name($stmt, ':PAID_HOLIDAY', $paidHoliday, 1);
        oci_bind_by_name($stmt, ':IS_ACTIVE', $isActive, 1);
        oci_bind_by_name($stmt, ':REMARKS', $remarks, 500);
        oci_bind_by_name($stmt, ':UPDATED_BY', $updatedBy, 50);

        $executed = oci_execute($stmt, OCI_NO_AUTO_COMMIT);

        if (!$executed) {
            oci_rollback($conn);
            oci_free_statement($stmt);
            return false;
        }

        $affectedRows = oci_num_rows($stmt);

        oci_commit($conn);
        oci_free_statement($stmt);

        return $affectedRows > 0;
    }
    // public function insertOccasion($data)
    // {
    //     $conn = $this->db->conn_id;

    //     $sql = "
    //         INSERT INTO {$this->table}
    //         (
    //             OCCASION_NAME,
    //             FROM_DATE,
    //             TO_DATE,
    //             OCCASION_TYPE,
    //             COUNT_AS_PRESENT,
    //             PAID_HOLIDAY,
    //             IS_ACTIVE,
    //             REMARKS,
    //             CREATED_BY,
    //             CREATED_AT,
    //             UPDATED_BY,
    //             UPDATED_AT
    //         )
    //         VALUES
    //         (
    //             :OCCASION_NAME,
    //             TO_DATE(:FROM_DATE, 'YYYY-MM-DD'),
    //             TO_DATE(:TO_DATE, 'YYYY-MM-DD'),
    //             :OCCASION_TYPE,
    //             :COUNT_AS_PRESENT,
    //             :PAID_HOLIDAY,
    //             :IS_ACTIVE,
    //             :REMARKS,
    //             :CREATED_BY,
    //             CURRENT_TIMESTAMP,
    //             :UPDATED_BY,
    //             CURRENT_TIMESTAMP
    //         )
    //         RETURNING OCCASION_ID INTO :NEW_ID
    //     ";

    //     $stmt = oci_parse($conn, $sql);

    //     $occasionName = $this->nullIfEmpty($data['OCCASION_NAME'] ?? null);
    //     $fromDate = $this->nullIfEmpty($data['FROM_DATE'] ?? null);
    //     $toDate = $this->nullIfEmpty($data['TO_DATE'] ?? null);
    //     $occasionType = $this->nullIfEmpty($data['OCCASION_TYPE'] ?? null);
    //     $countAsPresent = $this->normalizeYN($data['COUNT_AS_PRESENT'] ?? 'Y');
    //     $paidHoliday = $this->normalizeYN($data['PAID_HOLIDAY'] ?? 'Y');
    //     $isActive = $this->normalizeYN($data['IS_ACTIVE'] ?? 'Y');
    //     $remarks = $this->nullIfEmpty($data['REMARKS'] ?? null);
    //     $createdBy = $this->nullIfEmpty($data['CREATED_BY'] ?? null);
    //     $updatedBy = $this->nullIfEmpty($data['UPDATED_BY'] ?? null);
    //     $newId = null;

    //     oci_bind_by_name($stmt, ':OCCASION_NAME', $occasionName, 255);
    //     oci_bind_by_name($stmt, ':FROM_DATE', $fromDate, 20);
    //     oci_bind_by_name($stmt, ':TO_DATE', $toDate, 20);
    //     oci_bind_by_name($stmt, ':OCCASION_TYPE', $occasionType, 100);
    //     oci_bind_by_name($stmt, ':COUNT_AS_PRESENT', $countAsPresent, 1);
    //     oci_bind_by_name($stmt, ':PAID_HOLIDAY', $paidHoliday, 1);
    //     oci_bind_by_name($stmt, ':IS_ACTIVE', $isActive, 1);
    //     oci_bind_by_name($stmt, ':REMARKS', $remarks, 500);
    //     oci_bind_by_name($stmt, ':CREATED_BY', $createdBy, 50);
    //     oci_bind_by_name($stmt, ':UPDATED_BY', $updatedBy, 50);
    //     oci_bind_by_name($stmt, ':NEW_ID', $newId, 20);

    //     $executed = oci_execute($stmt, OCI_NO_AUTO_COMMIT);

    //     if (!$executed) {
    //         oci_rollback($conn);
    //         oci_free_statement($stmt);
    //         return false;
    //     }

    //     oci_commit($conn);
    //     oci_free_statement($stmt);

    //     return $newId;
    // }

    // public function updateOccasion($id, $data)
    // {
    //     $conn = $this->db->conn_id;

    //     $sql = "
    //         UPDATE {$this->table}
    //         SET
    //             OCCASION_NAME = :OCCASION_NAME,
    //             FROM_DATE = TO_DATE(:FROM_DATE, 'YYYY-MM-DD'),
    //             TO_DATE = TO_DATE(:TO_DATE, 'YYYY-MM-DD'),
    //             OCCASION_TYPE = :OCCASION_TYPE,
    //             COUNT_AS_PRESENT = :COUNT_AS_PRESENT,
    //             PAID_HOLIDAY = :PAID_HOLIDAY,
    //             IS_ACTIVE = :IS_ACTIVE,
    //             REMARKS = :REMARKS,
    //             UPDATED_BY = :UPDATED_BY,
    //             UPDATED_AT = CURRENT_TIMESTAMP
    //         WHERE OCCASION_ID = :OCCASION_ID
    //     ";

    //     $stmt = oci_parse($conn, $sql);

    //     $occasionId = (int) $id;
    //     $occasionName = $this->nullIfEmpty($data['OCCASION_NAME'] ?? null);
    //     $fromDate = $this->nullIfEmpty($data['FROM_DATE'] ?? null);
    //     $toDate = $this->nullIfEmpty($data['TO_DATE'] ?? null);
    //     $occasionType = $this->nullIfEmpty($data['OCCASION_TYPE'] ?? null);
    //     $countAsPresent = $this->normalizeYN($data['COUNT_AS_PRESENT'] ?? 'Y');
    //     $paidHoliday = $this->normalizeYN($data['PAID_HOLIDAY'] ?? 'Y');
    //     $isActive = $this->normalizeYN($data['IS_ACTIVE'] ?? 'Y');
    //     $remarks = $this->nullIfEmpty($data['REMARKS'] ?? null);
    //     $updatedBy = $this->nullIfEmpty($data['UPDATED_BY'] ?? null);

    //     oci_bind_by_name($stmt, ':OCCASION_ID', $occasionId, 20);
    //     oci_bind_by_name($stmt, ':OCCASION_NAME', $occasionName, 255);
    //     oci_bind_by_name($stmt, ':FROM_DATE', $fromDate, 20);
    //     oci_bind_by_name($stmt, ':TO_DATE', $toDate, 20);
    //     oci_bind_by_name($stmt, ':OCCASION_TYPE', $occasionType, 100);
    //     oci_bind_by_name($stmt, ':COUNT_AS_PRESENT', $countAsPresent, 1);
    //     oci_bind_by_name($stmt, ':PAID_HOLIDAY', $paidHoliday, 1);
    //     oci_bind_by_name($stmt, ':IS_ACTIVE', $isActive, 1);
    //     oci_bind_by_name($stmt, ':REMARKS', $remarks, 500);
    //     oci_bind_by_name($stmt, ':UPDATED_BY', $updatedBy, 50);

    //     $executed = oci_execute($stmt, OCI_NO_AUTO_COMMIT);

    //     if (!$executed) {
    //         oci_rollback($conn);
    //         oci_free_statement($stmt);
    //         return false;
    //     }

    //     $affectedRows = oci_num_rows($stmt);

    //     oci_commit($conn);
    //     oci_free_statement($stmt);

    //     return $affectedRows > 0;
    // }

    public function deleteOccasion($id)
    {
        $conn = $this->db->conn_id;

        $sql = "DELETE FROM {$this->table} WHERE OCCASION_ID = :OCCASION_ID";
        $stmt = oci_parse($conn, $sql);

        $occasionId = (int) $id;
        oci_bind_by_name($stmt, ':OCCASION_ID', $occasionId, 20);

        $executed = oci_execute($stmt, OCI_NO_AUTO_COMMIT);

        if (!$executed) {
            oci_rollback($conn);
            oci_free_statement($stmt);
            return false;
        }

        $affectedRows = oci_num_rows($stmt);

        oci_commit($conn);
        oci_free_statement($stmt);

        return $affectedRows > 0;
    }

    private function normalizeYN($value)
    {
        $value = strtoupper(trim((string) $value));
        return in_array($value, ['Y', 'N'], true) ? $value : 'Y';
    }

    private function nullIfEmpty($value)
    {
        if ($value === null) {
            return null;
        }

        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }

    public function getShiftList()
    {
        $conn = $this->db->conn_id;

        $sql = "
        SELECT
            ID,
            SHIFT_NAME
        FROM XX_DIGI_SHIFT_PR
        WHERE SHIFT_NAME IS NOT NULL
        ORDER BY SHIFT_NAME
    ";

        $stmt = oci_parse($conn, $sql);
        oci_execute($stmt);

        $rows = [];

        while (($row = oci_fetch_assoc($stmt)) !== false) {
            $rows[] = $row;
        }

        oci_free_statement($stmt);

        return $rows;
    }

    private function normalizeShiftIds($shiftIds)
    {
        if (is_array($shiftIds)) {
            $items = $shiftIds;
        } else {
            $items = explode(',', (string) $shiftIds);
        }

        $clean = [];

        foreach ($items as $item) {
            $item = trim($item);

            if ($item !== '') {
                $clean[] = $item;
            }
        }

        $clean = array_values(array_unique($clean));

        if (empty($clean)) {
            return null;
        }

        return implode(',', $clean);
    }
}
