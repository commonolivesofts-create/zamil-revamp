<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Shift_detail_model extends CI_Model
{
    private $headerTable = 'XX_DIGI_SHIFT_PR';
    private $detailTable = 'XX_DIGI_SHIFT_PR_DTL';

    private $weekdays = [
        1 => 'Sunday',
        2 => 'Monday',
        3 => 'Tuesday',
        4 => 'Wednesday',
        5 => 'Thursday',
        6 => 'Friday',
        7 => 'Saturday',
    ];

    private $dayAliases = [
        1 => 'SUN',
        2 => 'MON',
        3 => 'TUE',
        4 => 'WED',
        5 => 'THU',
        6 => 'FRI',
        7 => 'SAT',
    ];

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function get_shift_options()
    {
        $sql = "SELECT
                    ID,
                    UUID,
                    SHIFT_NAME,
                    TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
                    TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
                    STATUS,
                    CHECK_IN,
                    CHECK_OUT
                FROM {$this->headerTable}
                ORDER BY SHIFT_NAME ASC";

        return $this->db->query($sql)->result_array();
    }

    public function find_shift_header_by_uuid($uuid)
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
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                    TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
                FROM {$this->headerTable}
                WHERE UUID = ?";

        return $this->db->query($sql, [$uuid])->row_array();
    }

    public function get_shift_details_list($type = 'list', $limit = 20, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = get_limit_offset($currentPage, $limit);
        $limit = (int) $limit;
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        $shiftName = isset($filters['shift_name']) ? trim((string) $filters['shift_name']) : '';
        $status = isset($filters['status']) ? trim((string) $filters['status']) : '';

        if ($shiftName !== '') {
            $where[] = "UPPER(s.SHIFT_NAME) LIKE ?";
            $binds[] = '%' . strtoupper($shiftName) . '%';
        }

        if ($status !== '') {
            $where[] = "UPPER(s.STATUS) = ?";
            $binds[] = strtoupper($status);
        }

        if ($search !== '') {
            $where[] = "(UPPER(s.SHIFT_NAME) LIKE ? OR UPPER(NVL(s.STATUS, '')) LIKE ?)";
            $binds[] = '%' . strtoupper($search) . '%';
            $binds[] = '%' . strtoupper($search) . '%';
        }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        if ($type === 'total') {
            $countSql = "SELECT COUNT(1) AS TOTAL
                         FROM {$this->headerTable} s
                         {$whereSql}";
            $row = $this->db->query($countSql, $binds)->row_array();

            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $pivotColumns = $this->buildPivotColumns();

        $sql = "SELECT
                    s.ID,
                    s.UUID,
                    s.SHIFT_NAME,
                    s.STATUS,
                    {$pivotColumns}
                FROM {$this->headerTable} s
                LEFT JOIN {$this->detailTable} d
                    ON d.SHIFT_PR_ID = s.ID
                {$whereSql}
                GROUP BY
                    s.ID,
                    s.UUID,
                    s.SHIFT_NAME,
                    s.STATUS
                ORDER BY s.ID DESC";

        if ($limit > 0) {
            $sql = "SELECT * FROM (
                        SELECT q.*, ROWNUM rn
                        FROM ({$sql}) q
                        WHERE ROWNUM <= ?
                    )
                    WHERE rn > ?";

            $binds[] = max(0, $offset) + $limit;
            $binds[] = max(0, $offset);
        }

        return $this->db->query($sql, $binds)->result_array();
    }

    public function get_shift_detail_bundle($shiftUuid)
    {
        $shift = $this->find_shift_header_by_uuid($shiftUuid);

        if (empty($shift)) {
            return [];
        }

        $detailRows = $this->get_detail_rows_by_shift_id((int) $shift['ID']);
        $detailIndexed = [];

        foreach ($detailRows as $row) {
            $dayNo = isset($row['DAY_NO']) ? (int) $row['DAY_NO'] : 0;
            if ($dayNo >= 1 && $dayNo <= 7) {
                $detailIndexed[$dayNo] = $row;
            }
        }

        $rows = [];
        foreach ($this->weekdays as $dayNo => $weekdayName) {
            $existing = isset($detailIndexed[$dayNo]) ? $detailIndexed[$dayNo] : [];

            $rows[] = [
                'day_no' => $dayNo,
                'weekday_name' => $weekdayName,
                'punch_in' => isset($existing['PUNCH_IN']) ? (string) $existing['PUNCH_IN'] : '',
                'punch_out' => isset($existing['PUNCH_OUT']) ? (string) $existing['PUNCH_OUT'] : '',
                'gross_time' => isset($existing['GROSS_TIME']) ? (string) $existing['GROSS_TIME'] : '',
            ];
        }

        return [
            'shift' => $shift,
            'rows' => $rows,
            'has_existing_details' => !empty($detailRows),
        ];
    }

    public function save_shift_details($shiftUuid, $rows)
    {
        $shift = $this->find_shift_header_by_uuid($shiftUuid);

        if (empty($shift)) {
            return [
                'status' => false,
                'message' => 'Selected shift was not found.'
            ];
        }

        $shiftPrId = (int) $shift['ID'];
        $existingRows = $this->get_detail_rows_by_shift_id($shiftPrId);
        $existingByDay = [];

        foreach ($existingRows as $row) {
            $dayNo = isset($row['DAY_NO']) ? (int) $row['DAY_NO'] : 0;
            if ($dayNo >= 1 && $dayNo <= 7) {
                $existingByDay[$dayNo] = $row;
            }
        }

        $this->db->trans_begin();

        foreach ($this->weekdays as $dayNo => $weekdayName) {
            $incoming = $this->findIncomingRow($rows, $dayNo);

            $punchIn = $this->normalizeTime(isset($incoming['punch_in']) ? $incoming['punch_in'] : '');
            $punchOut = $this->normalizeTime(isset($incoming['punch_out']) ? $incoming['punch_out'] : '');
            $grossTime = $this->normalizeTime(isset($incoming['gross_time']) ? $incoming['gross_time'] : '');
            $status = isset($shift['STATUS']) ? trim((string) $shift['STATUS']) : 'ACTIVE';

            if (isset($existingByDay[$dayNo])) {
                $sql = "UPDATE {$this->detailTable}
                        SET
                            WEEKDAY_NAME = ?,
                            PUNCH_IN = ?,
                            PUNCH_OUT = ?,
                            GROSS_TIME = ?,
                            STATUS = ?,
                            UPDATED_AT = SYSTIMESTAMP
                        WHERE SHIFT_PR_ID = ?
                          AND DAY_NO = ?";

                $ok = $this->db->query($sql, [
                    $weekdayName,
                    $punchIn,
                    $punchOut,
                    $grossTime,
                    $status,
                    $shiftPrId,
                    $dayNo,
                ]);
            } else {
                $sql = "INSERT INTO {$this->detailTable} (
                            SHIFT_PR_ID,
                            UUID,
                            DAY_NO,
                            WEEKDAY_NAME,
                            PUNCH_IN,
                            PUNCH_OUT,
                            GROSS_TIME,
                            STATUS,
                            CREATED_AT,
                            UPDATED_AT
                        ) VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            SYSTIMESTAMP,
                            SYSTIMESTAMP
                        )";

                $ok = $this->db->query($sql, [
                    $shiftPrId,
                    $this->generate_uuid_v4(),
                    $dayNo,
                    $weekdayName,
                    $punchIn,
                    $punchOut,
                    $grossTime,
                    $status,
                ]);
            }

            if (!$ok) {
                break;
            }
        }

        if ($this->db->trans_status() === false) {
            $this->db->trans_rollback();

            $dbError = $this->db->error();
            return [
                'status' => false,
                'message' => !empty($dbError['message']) ? $dbError['message'] : 'Failed to save shift details.'
            ];
        }

        $this->db->trans_commit();

        return [
            'status' => true,
            'message' => !empty($existingRows)
                ? 'Shift details updated successfully.'
                : 'Shift details saved successfully.'
        ];
    }

    private function get_detail_rows_by_shift_id($shiftPrId)
    {
        $sql = "SELECT
                    ID,
                    SHIFT_PR_ID,
                    UUID,
                    DAY_NO,
                    WEEKDAY_NAME,
                    PUNCH_IN,
                    PUNCH_OUT,
                    GROSS_TIME,
                    STATUS,
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
                    TO_CHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
                FROM {$this->detailTable}
                WHERE SHIFT_PR_ID = ?
                ORDER BY DAY_NO ASC";

        return $this->db->query($sql, [$shiftPrId])->result_array();
    }

    private function buildPivotColumns()
    {
        $parts = [];

        foreach ($this->dayAliases as $dayNo => $alias) {
            $parts[] = "MAX(CASE WHEN d.DAY_NO = {$dayNo} THEN d.PUNCH_IN END) AS {$alias}_PUNCH_IN";
            $parts[] = "MAX(CASE WHEN d.DAY_NO = {$dayNo} THEN d.PUNCH_OUT END) AS {$alias}_PUNCH_OUT";
            $parts[] = "MAX(CASE WHEN d.DAY_NO = {$dayNo} THEN d.GROSS_TIME END) AS {$alias}_GROSS_TIME";
        }

        return implode(",\n                    ", $parts);
    }

    private function findIncomingRow($rows, $dayNo)
    {
        if (!is_array($rows)) {
            return [];
        }

        foreach ($rows as $row) {
            if ((int) ($row['day_no'] ?? 0) === (int) $dayNo) {
                return is_array($row) ? $row : [];
            }
        }

        return [];
    }

    private function normalizeTime($value)
    {
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }

    private function generate_uuid_v4()
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
