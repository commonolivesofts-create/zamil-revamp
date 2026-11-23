<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Shift_model extends CI_Model
{
    private $table = 'XX_DIGI_SHIFT_PR';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function get_all()
    {
        $sql = "SELECT
                    ID,
                    UUID,
                    SHIFT_NAME,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    STATUS,
                    TO_CHAR(CHECK_IN, 'HH24:MI') AS CHECK_IN,
                    TO_CHAR(CHECK_OUT, 'HH24:MI') AS CHECK_OUT,
                    WEEKDAY_OVRTM_CAP,
                    WEEKEND_OVRTM_CAP,
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                    TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
                FROM {$this->table}
                ORDER BY ID DESC";

        return $this->db->query($sql)->result_array();
    }

    public function get_shift_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = get_limit_offset($currentPage, $limit);
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        if (!empty($filters['shift_name'])) {
            $where[] = "UPPER(SHIFT_NAME) LIKE ?";
            $binds[] = '%' . strtoupper(trim((string) $filters['shift_name'])) . '%';
        }

        if (!empty($filters['status'])) {
            $where[] = "UPPER(STATUS) = ?";
            $binds[] = strtoupper(trim((string) $filters['status']));
        }

        if (!empty($filters['start_date'])) {
            $where[] = "TO_CHAR(START_DATE, 'YYYY-MM-DD') = ?";
            $binds[] = trim((string) $filters['start_date']);
        }

        if (!empty($filters['end_date'])) {
            $where[] = "TO_CHAR(END_DATE, 'YYYY-MM-DD') = ?";
            $binds[] = trim((string) $filters['end_date']);
        }

        if (!empty($filters['check_in'])) {
            $where[] = "CHECK_IN = ?";
            $binds[] = trim((string) $filters['check_in']);
        }

        if (!empty($filters['check_out'])) {
            $where[] = "CHECK_OUT = ?";
            $binds[] = trim((string) $filters['check_out']);
        }

        if ($search !== '') {
            $searchUpper = '%' . strtoupper($search) . '%';
            $searchLike = '%' . $search . '%';

            $where[] = "(
            UPPER(SHIFT_NAME) LIKE ?
            OR UPPER(STATUS) LIKE ?
            OR TO_CHAR(START_DATE, 'YYYY-MM-DD') LIKE ?
            OR TO_CHAR(END_DATE, 'YYYY-MM-DD') LIKE ?
            OR CHECK_IN LIKE ?
            OR CHECK_OUT LIKE ?
        )";

            $binds[] = $searchUpper;
            $binds[] = $searchUpper;
            $binds[] = $searchLike;
            $binds[] = $searchLike;
            $binds[] = $searchLike;
            $binds[] = $searchLike;
        }

        $whereSql = empty($where) ? '' : ' WHERE ' . implode(' AND ', $where);

        if ($type === 'total') {
            $sql = "SELECT COUNT(1) AS TOTAL FROM {$this->table}{$whereSql}";
            $row = $this->db->query($sql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $sql = "SELECT
                ID,
                UUID,
                SHIFT_NAME,
                TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                STATUS,
                CHECK_IN,
                CHECK_OUT,
                WEEKDAY_OVRTM_CAP,
                WEEKEND_OVRTM_CAP,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
            FROM {$this->table}
            {$whereSql}
            ORDER BY ID DESC";

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

        return $this->db->query($sql, $binds)->result_array();
    }

    public function insert_shift($data)
    {
        $uuid = $this->generate_uuid_v4();

        $shiftName = isset($data['shift_name']) ? trim($data['shift_name']) : '';
        $startDate = $this->normalize_date(isset($data['start_date']) ? $data['start_date'] : null);
        $endDate   = $this->normalize_date(isset($data['end_date']) ? $data['end_date'] : null);
        $status    = isset($data['status']) ? trim($data['status']) : null;
        $checkIn   = $this->normalize_time(isset($data['check_in']) ? $data['check_in'] : null);
        $checkOut  = $this->normalize_time(isset($data['check_out']) ? $data['check_out'] : null);
        $weekdayOvrtmCap = isset($data['weekday_ovrtm_cap']) ? trim($data['weekday_ovrtm_cap']) : null;
        $weekendOvrtmCap = isset($data['weekend_ovrtm_cap']) ? trim($data['weekend_ovrtm_cap']) : null;
        $sql = "INSERT INTO {$this->table} (
                UUID,
                SHIFT_NAME,
                START_DATE,
                END_DATE,
                STATUS,
                CHECK_IN,
                CHECK_OUT,
                CREATED_AT,
                UPDATED_AT,
                WEEKDAY_OVRTM_CAP,
                WEEKEND_OVRTM_CAP
            ) VALUES (
                ?,
                ?,
                CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END,
                CASE WHEN ? IS NULL THEN NULL ELSE TO_DATE(?, 'YYYY-MM-DD') END,
                ?,
                ?,
                ?,
                SYSTIMESTAMP,
                SYSTIMESTAMP,
                ?,
                ?
            )";

        $ok = $this->db->query($sql, [
            $uuid,
            $shiftName,
            $startDate,
            $startDate,
            $endDate,
            $endDate,
            $status,
            $checkIn,
            $checkOut,
            $weekdayOvrtmCap,
            $weekendOvrtmCap
        ]);

        return $ok ? $uuid : false;
    }

    public function find_by_uuid($uuid)
    {
        $sql = "SELECT
                ID,
                UUID,
                SHIFT_NAME,
                TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                STATUS,
                CHECK_IN,
                CHECK_OUT,
                WEEKDAY_OVRTM_CAP,
                WEEKEND_OVRTM_CAP,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
            FROM {$this->table}
            WHERE UUID = ?";

        return $this->db->query($sql, [$uuid])->row_array();
    }

    public function find_by_id($id)
    {
        $sql = "SELECT
                    ID,
                    UUID,
                    SHIFT_NAME,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    STATUS,
                    CHECK_IN,
                    CHECK_OUT,
                    WEEKDAY_OVRTM_CAP,
                    WEEKEND_OVRTM_CAP,
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                    TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
                FROM {$this->table}
                WHERE ID = ?";

        return $this->db->query($sql, [$id])->row_array();
    }

    public function shift_name_exists($shiftName, $excludeUuid = null)
    {
        $shiftName = trim((string) $shiftName);
        if ($shiftName === '') {
            return false;
        }

        $sql = "SELECT COUNT(1) AS TOTAL
                FROM {$this->table}
                WHERE UPPER(TRIM(SHIFT_NAME)) = UPPER(TRIM(?))";
        $binds = [$shiftName];

        if (!empty($excludeUuid)) {
            $sql .= " AND UUID <> ?";
            $binds[] = $excludeUuid;
        }

        $row = $this->db->query($sql, $binds)->row_array();
        $total = isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;

        return $total > 0;
    }

    public function update_shift($uuid, $data)
    {
        $current = $this->find_by_uuid($uuid);
        if (empty($current)) {
            return [
                'status' => false,
                'message' => 'Shift not found.',
                'changed' => false
            ];
        }

        $incoming = [
            'SHIFT_NAME' => isset($data['shift_name']) ? trim($data['shift_name']) : '',
            'START_DATE' => $this->normalize_date(isset($data['start_date']) ? $data['start_date'] : null),
            'END_DATE'   => $this->normalize_date(isset($data['end_date']) ? $data['end_date'] : null),
            'STATUS'     => isset($data['status']) ? trim($data['status']) : null,
            'CHECK_IN'   => $this->normalize_time(isset($data['check_in']) ? $data['check_in'] : null),
            'CHECK_OUT'  => $this->normalize_time(isset($data['check_out']) ? $data['check_out'] : null),
            'WEEKDAY_OVRTM_CAP' => isset($data['weekday_ovrtm_cap']) ? trim($data['weekday_ovrtm_cap']) : null,
            'WEEKEND_OVRTM_CAP' => isset($data['weekend_ovrtm_cap']) ? trim($data['weekend_ovrtm_cap']) : null,
        ];

        $currentComparable = [
            'SHIFT_NAME' => isset($current['SHIFT_NAME']) ? trim((string) $current['SHIFT_NAME']) : '',
            'START_DATE' => $this->normalize_date(isset($current['START_DATE']) ? $current['START_DATE'] : null),
            'END_DATE'   => $this->normalize_date(isset($current['END_DATE']) ? $current['END_DATE'] : null),
            'STATUS'     => isset($current['STATUS']) ? trim((string) $current['STATUS']) : null,
            'CHECK_IN'   => $this->normalize_time(isset($current['CHECK_IN']) ? $current['CHECK_IN'] : null),
            'CHECK_OUT'  => $this->normalize_time(isset($current['CHECK_OUT']) ? $current['CHECK_OUT'] : null),
            'WEEKDAY_OVRTM_CAP' => isset($current['WEEKDAY_OVRTM_CAP']) ? trim((string) $current['WEEKDAY_OVRTM_CAP']) : null,
            'WEEKEND_OVRTM_CAP' => isset($current['WEEKEND_OVRTM_CAP']) ? trim((string) $current['WEEKEND_OVRTM_CAP']) : null,
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

        $setSql[] = "UPDATED_AT = SYSTIMESTAMP";
        $binds[] = $uuid;

        $sql = "UPDATE {$this->table}
            SET " . implode(', ', $setSql) . "
            WHERE UUID = ?";

        $ok = $this->db->query($sql, $binds);

        return [
            'status' => $ok,
            'message' => $ok ? 'Shift updated successfully.' : 'Failed to update shift.',
            'changed' => true
        ];
    }

    public function delete_shift($uuid)
    {
        $sql = "DELETE FROM {$this->table} WHERE UUID = ?";
        return $this->db->query($sql, [$uuid]);
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

    private function normalize_time($value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        $timestamp = strtotime($value);
        return $timestamp ? date('H:i', $timestamp) : null;
    }

    private function generate_uuid_v4()
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
