<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Attendance_card_model extends CI_Model
{
    private $table = 'XX_DIGI_ATT_ATT_CARD';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function get_attendance_card_list($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = max(0, (int) get_limit_offset($currentPage, $limit));
        $limit = (int) $limit;
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        $empNo = isset($filters['emp_no']) ? trim((string) $filters['emp_no']) : '';
        $empName = isset($filters['emp_name']) ? trim((string) $filters['emp_name']) : '';
        $attDate = isset($filters['att_date']) ? trim((string) $filters['att_date']) : '';

        if ($empNo !== '') {
            $where[] = "UPPER(NVL(TO_CHAR(a.EMP_NO), '')) LIKE ?";
            $binds[] = '%' . strtoupper($empNo) . '%';
        }

        if ($empName !== '') {
            $where[] = "UPPER(NVL(a.EMP_NAME, '')) LIKE ?";
            $binds[] = '%' . strtoupper($empName) . '%';
        }

        if ($attDate !== '') {
            $where[] = "TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') = ?";
            $binds[] = $attDate;
        }

        if ($search !== '') {
            $like = '%' . strtoupper($search) . '%';
            $where[] = "(UPPER(NVL(TO_CHAR(a.EMP_NO), '')) LIKE ? OR UPPER(NVL(a.EMP_NAME, '')) LIKE ? OR TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') LIKE ?)";
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
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
                    TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') AS ATT_DATE,
                    a.PUNCH_IN AS PUNCH_IN,
                    a.PUNCH_OUT AS PUNCH_OUT
                FROM {$this->table} a
                {$whereSql}
                ORDER BY a.ATT_DATE DESC, a.EMP_NO ASC";

        if ($limit > 0) {
            $sql .= " OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY";
        }

        return $this->db->query($sql, $binds)->result_array();
    }

    public function get_departments()
    {
        $rows = $this->db
            ->select('DISTINCT DEPARTMENT', false)
            ->from('XX_DIGI_EMP_MASTER')
            ->where('DEPARTMENT IS NOT NULL', null, false)
            ->order_by('DEPARTMENT', 'ASC')
            ->get()
            ->result_array();

        $departments = [];
        foreach ($rows as $row) {
            $departments[] = $row['DEPARTMENT'];
        }

        return $departments;
    }

    public function get_employees_by_department($department)
    {
        return $this->db
            ->select('EMPLOYEE_NUMBER, FULL_NAME')
            ->from('XX_DIGI_EMP_MASTER')
            ->where('DEPARTMENT', $department)
            ->order_by('EMPLOYEE_NUMBER', 'ASC')
            ->get()
            ->result_array();
    }

    // PROCESS ATTENDANCE SHEET 
    public function process_attendance_sheet(array $params)
    {
        $employeeNumber = strtoupper(trim((string) $params['employee_number']));
        $month = (int) $params['month'];
        $year = (int) $params['year'];
        $weekendDays = isset($params['weekend_days']) ? (int) $params['weekend_days'] : 2;

        if (!in_array($weekendDays, [1, 2], true)) {
            $weekendDays = 2;
        }

        $startDate = DateTime::createFromFormat('Y-n-j', $year . '-' . $month . '-1');
        if (!$startDate) {
            throw new Exception('Invalid processing start date.');
        }

        $endDate = clone $startDate;
        $endDate->modify('last day of this month');

        $employees = $this->get_target_employees($employeeNumber);

        if (empty($employees)) {
            throw new Exception('No employees found for processing.');
        }

        $summary = [
            'month' => str_pad((string) $month, 2, '0', STR_PAD_LEFT),
            'year' => (string) $year,
            'date_from' => $startDate->format('Y-m-d'),
            'date_to' => $endDate->format('Y-m-d'),
            'total_employees' => count($employees),
            'total_days_in_month' => (int) $endDate->format('j'),
            'processed_rows' => 0,
            'inserted_rows' => 0,
            'updated_rows' => 0,
            'skipped_weekend_rows' => 0,
            'error_rows' => 0,
            'employee_errors' => [],
            'row_errors' => [],
        ];

        foreach ($employees as $employee) {
            $empNo = isset($employee['EMPLOYEE_NUMBER']) ? trim((string) $employee['EMPLOYEE_NUMBER']) : '';
            $empName = isset($employee['FULL_NAME']) ? trim((string) $employee['FULL_NAME']) : '';

            if ($empNo === '') {
                $summary['error_rows']++;
                $summary['employee_errors'][] = 'Skipped one employee because EMPLOYEE_NUMBER is empty.';
                continue;
            }

            $dateCursor = clone $startDate;

            while ($dateCursor <= $endDate) {
                $attendanceDate = $dateCursor->format('Y-m-d');
                $summary['processed_rows']++;

                try {
                    if ($this->is_weekend_date($dateCursor, $weekendDays)) {
                        $summary['skipped_weekend_rows']++;
                        $dateCursor->modify('+1 day');
                        continue;
                    }

                    $shiftInfo = $this->get_employee_shift_for_date($empNo, $attendanceDate);
                    $attendanceCard = $this->get_attendance_card_for_date($empNo, $attendanceDate);
                    $absenceInfo = $this->get_employee_approved_absence_for_date($empNo, $attendanceDate);

                    $shiftName = !empty($shiftInfo['SHIFT_NAME']) ? trim((string) $shiftInfo['SHIFT_NAME']) : null;
                    $checkIn = array_key_exists('CHECK_IN', $shiftInfo) ? trim((string) $shiftInfo['CHECK_IN']) : null;
                    $checkOut = array_key_exists('CHECK_OUT', $shiftInfo) ? trim((string) $shiftInfo['CHECK_OUT']) : null;

                    $attendanceCardExists = !empty($attendanceCard);

                    $punchIn = array_key_exists('PUNCH_IN', $attendanceCard) ? trim((string) $attendanceCard['PUNCH_IN']) : null;
                    $punchOut = array_key_exists('PUNCH_OUT', $attendanceCard) ? trim((string) $attendanceCard['PUNCH_OUT']) : null;

                    $checkIn = ($checkIn === '') ? null : $checkIn;
                    $checkOut = ($checkOut === '') ? null : $checkOut;
                    $punchIn = ($punchIn === '') ? null : $punchIn;
                    $punchOut = ($punchOut === '') ? null : $punchOut;
                    $shiftName = ($shiftName === '') ? null : $shiftName;

                    $absence = null;
                    if (!empty($absenceInfo['LEAVE_TYPE'])) {
                        $absence = trim((string) $absenceInfo['LEAVE_TYPE']);
                    } elseif (!$attendanceCardExists) {
                        $absence = 'Absence without permission';
                    }

                    $timeMetrics = $this->calculate_attendance_metrics($checkIn, $punchIn, $checkOut, $punchOut);

                    $saveData = [
                        'EMP_NO' => $empNo,
                        'EMP_NAME' => $empName,
                        'SHIFT' => $shiftName,
                        'ATT_DATE' => $attendanceDate,
                        'CHECK_IN' => $checkIn,
                        'PUNCH_IN' => $punchIn,
                        'CHECK_OUT' => $checkOut,
                        'PUNCH_OUT' => $punchOut,
                        'TOTAL_MINUTES' => ($timeMetrics['TOTAL_MINUTES'] === '' ? null : $timeMetrics['TOTAL_MINUTES']),
                        'EARLY' => ($timeMetrics['EARLY'] === '' ? null : $timeMetrics['EARLY']),
                        'LATE' => ($timeMetrics['LATE'] === '' ? null : $timeMetrics['LATE']),
                        'OVERTIME' => '0',
                        'ABSENCE' => ($absence === '' ? null : $absence),
                    ];

                    if ($this->attendance_sheet_record_exists($empNo, $attendanceDate)) {
                        $updated = $this->update_attendance_sheet_row($saveData);

                        if ($updated) {
                            $summary['updated_rows']++;
                        } else {
                            $summary['error_rows']++;
                            $summary['row_errors'][] = [
                                'employee_number' => $empNo,
                                'employee_name' => $empName,
                                'attendance_date' => $attendanceDate,
                                'error' => 'Update failed.',
                            ];
                        }
                    } else {
                        $inserted = $this->insert_attendance_sheet_row($saveData);

                        if ($inserted) {
                            $summary['inserted_rows']++;
                        } else {
                            $summary['error_rows']++;
                            $summary['row_errors'][] = [
                                'employee_number' => $empNo,
                                'employee_name' => $empName,
                                'attendance_date' => $attendanceDate,
                                'error' => 'Insert failed.',
                            ];
                        }
                    }
                } catch (Exception $e) {
                    $summary['error_rows']++;
                    $summary['row_errors'][] = [
                        'employee_number' => $empNo,
                        'employee_name' => $empName,
                        'attendance_date' => $attendanceDate,
                        'error' => $e->getMessage(),
                    ];

                    log_message(
                        'error',
                        'Attendance row failed. EMP_NO: ' . $empNo .
                            ' DATE: ' . $attendanceDate .
                            ' ERROR: ' . $e->getMessage()
                    );
                }

                $dateCursor->modify('+1 day');
            }
        }

        return $summary;
    }

    private function get_target_employees($employeeNumber)
    {
        if ($employeeNumber === 'ALL') {
            return $this->db
                ->select('EMPLOYEE_NUMBER, FULL_NAME')
                ->from('XX_DIGI_EMP_MASTER')
                ->where('EMPLOYEE_NUMBER IS NOT NULL', null, false)
                ->where("TRIM(EMPLOYEE_NUMBER) <> ''", null, false)
                ->order_by('EMPLOYEE_NUMBER', 'ASC')
                ->get()
                ->result_array();
        }

        return $this->db
            ->select('EMPLOYEE_NUMBER, FULL_NAME')
            ->from('XX_DIGI_EMP_MASTER')
            ->where('EMPLOYEE_NUMBER', $employeeNumber)
            ->order_by('EMPLOYEE_NUMBER', 'ASC')
            ->get()
            ->result_array();
    }

    private function is_weekend_date(DateTime $date, $weekendDays = 2)
    {
        $dayName = strtoupper($date->format('D'));

        if ((int) $weekendDays === 1) {
            return $dayName === 'FRI';
        }

        return in_array($dayName, ['FRI', 'SAT'], true);
    }

    private function attendance_sheet_record_exists($empNo, $attendanceDate)
    {
        $row = $this->db
            ->select('COUNT(1) AS TOTAL_COUNT', false)
            ->from('XX_DIGI_ATT_ATT_SHEET')
            ->where('EMP_NO', $empNo)
            ->where('ATT_DATE = TO_DATE(\'' . $attendanceDate . '\', \'YYYY-MM-DD\')', null, false)
            ->get()
            ->row_array();

        return !empty($row) && (int) $row['TOTAL_COUNT'] > 0;
    }

    private function get_employee_shift_for_date($empNo, $attendanceDate)
    {
        $sql = "
        SELECT *
        FROM (
            SELECT
                sp.SHIFT_NAME,
                sp.CHECK_IN,
                sp.CHECK_OUT
            FROM XX_DIGI_TIMETABLE_PR tp
            LEFT JOIN XX_DIGI_SHIFT_PR sp
                   ON sp.ID = tp.SHIFT_ID
            WHERE tp.EMP_NO = ?
              AND tp.STATUS = 'ACTIVE'
              AND (
                    tp.START_DATE IS NULL
                    OR TRUNC(tp.START_DATE) <= TO_DATE(?, 'YYYY-MM-DD')
                  )
              AND (
                    tp.END_DATE IS NULL
                    OR TRUNC(tp.END_DATE) >= TO_DATE(?, 'YYYY-MM-DD')
                  )
              AND (
                    sp.STATUS = 'ACTIVE'
                    OR sp.STATUS IS NULL
                  )
            ORDER BY tp.START_DATE DESC NULLS LAST
        )
        WHERE ROWNUM = 1
    ";

        $row = $this->db->query($sql, [$empNo, $attendanceDate, $attendanceDate])->row_array();
        return is_array($row) ? $row : [];
    }

    private function get_attendance_card_for_date($empNo, $attendanceDate)
    {
        $sql = "
            SELECT *
            FROM (
                SELECT
                    EMP_NO,
                    EMP_NAME,
                    PUNCH_IN,
                    PUNCH_OUT
                FROM XX_DIGI_ATT_ATT_CARD
                WHERE EMP_NO = ?
                AND TRUNC(ATT_DATE) = TO_DATE(?, 'YYYY-MM-DD')
                ORDER BY ATT_DATE ASC
            )
            WHERE ROWNUM = 1
            ";

        $row = $this->db->query($sql, [$empNo, $attendanceDate])->row_array();
        return is_array($row) ? $row : [];
    }

    private function get_employee_approved_absence_for_date($empNo, $attendanceDate)
    {
        $sql = "
        SELECT *
        FROM (
            SELECT
                LEAVE_TYPE,
                LEAVE_START_DATE,
                LEAVE_END_DATE,
                TOTAL_DAYS
            FROM XX_DIGI_EMP_ABSENCE_TYPE
            WHERE EMP_NO = ?
              AND APPROVAL_STATUS = 'APPROVED'
              AND TO_DATE(?, 'YYYY-MM-DD') BETWEEN
                    CASE
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{4}-\d{2}-\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_START_DATE), 'YYYY-MM-DD')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{4}/\d{2}/\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_START_DATE), 'YYYY/MM/DD')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}-\d{2}-\d{4}$')
                            THEN TO_DATE(TRIM(LEAVE_START_DATE), 'DD-MM-YYYY')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}/\d{2}/\d{4}$')
                            THEN TO_DATE(TRIM(LEAVE_START_DATE), 'DD/MM/YYYY')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}-\d{2}-\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_START_DATE), 'DD-MM-RR')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}/\d{2}/\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_START_DATE), 'DD/MM/RR')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}-[A-Z]{3}-\d{4}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_START_DATE)), 'DD-MON-YYYY', 'NLS_DATE_LANGUAGE=ENGLISH')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}-[A-Z]{3}-\d{2}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_START_DATE)), 'DD-MON-RR', 'NLS_DATE_LANGUAGE=ENGLISH')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}-[A-Z]+-\d{4}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_START_DATE)), 'DD-MONTH-YYYY', 'NLS_DATE_LANGUAGE=ENGLISH')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_START_DATE), '^\d{2}-[A-Z]+-\d{2}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_START_DATE)), 'DD-MONTH-RR', 'NLS_DATE_LANGUAGE=ENGLISH')
                        ELSE NULL
                    END
                AND
                    CASE
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{4}-\d{2}-\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_END_DATE), 'YYYY-MM-DD')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{4}/\d{2}/\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_END_DATE), 'YYYY/MM/DD')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}-\d{2}-\d{4}$')
                            THEN TO_DATE(TRIM(LEAVE_END_DATE), 'DD-MM-YYYY')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}/\d{2}/\d{4}$')
                            THEN TO_DATE(TRIM(LEAVE_END_DATE), 'DD/MM/YYYY')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}-\d{2}-\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_END_DATE), 'DD-MM-RR')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}/\d{2}/\d{2}$')
                            THEN TO_DATE(TRIM(LEAVE_END_DATE), 'DD/MM/RR')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}-[A-Z]{3}-\d{4}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_END_DATE)), 'DD-MON-YYYY', 'NLS_DATE_LANGUAGE=ENGLISH')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}-[A-Z]{3}-\d{2}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_END_DATE)), 'DD-MON-RR', 'NLS_DATE_LANGUAGE=ENGLISH')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}-[A-Z]+-\d{4}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_END_DATE)), 'DD-MONTH-YYYY', 'NLS_DATE_LANGUAGE=ENGLISH')
                        WHEN REGEXP_LIKE(TRIM(LEAVE_END_DATE), '^\d{2}-[A-Z]+-\d{2}$', 'i')
                            THEN TO_DATE(UPPER(TRIM(LEAVE_END_DATE)), 'DD-MONTH-RR', 'NLS_DATE_LANGUAGE=ENGLISH')
                        ELSE NULL
                    END
            ORDER BY LEAVE_START_DATE DESC NULLS LAST
        )
        WHERE ROWNUM = 1
        ";

        $row = $this->db->query($sql, [$empNo, $attendanceDate])->row_array();
        return is_array($row) ? $row : [];
    }

    private function insert_attendance_sheet_row(array $data)
    {
        $sql = "
        INSERT INTO XX_DIGI_ATT_ATT_SHEET
        (
            EMP_NO,
            EMP_NAME,
            SHIFT,
            ATT_DATE,
            CHECK_IN,
            PUNCH_IN,
            CHECK_OUT,
            PUNCH_OUT,
            TOTAL_MINUTES,
            EARLY,
            LATE,
            OVERTIME,
            ABSENCE
        )
        VALUES
        (
            ?,
            ?,
            ?,
            TO_DATE(?, 'YYYY-MM-DD'),
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
        )
        ";

        $bindings = [
            isset($data['EMP_NO']) ? $data['EMP_NO'] : null,
            isset($data['EMP_NAME']) ? $data['EMP_NAME'] : null,
            array_key_exists('SHIFT', $data) && $data['SHIFT'] !== '' ? $data['SHIFT'] : null,
            isset($data['ATT_DATE']) ? $data['ATT_DATE'] : null,
            array_key_exists('CHECK_IN', $data) && $data['CHECK_IN'] !== '' ? $data['CHECK_IN'] : null,
            array_key_exists('PUNCH_IN', $data) && $data['PUNCH_IN'] !== '' ? $data['PUNCH_IN'] : null,
            array_key_exists('CHECK_OUT', $data) && $data['CHECK_OUT'] !== '' ? $data['CHECK_OUT'] : null,
            array_key_exists('PUNCH_OUT', $data) && $data['PUNCH_OUT'] !== '' ? $data['PUNCH_OUT'] : null,
            array_key_exists('TOTAL_MINUTES', $data) && $data['TOTAL_MINUTES'] !== '' ? $data['TOTAL_MINUTES'] : null,
            array_key_exists('EARLY', $data) && $data['EARLY'] !== '' ? $data['EARLY'] : null,
            array_key_exists('LATE', $data) && $data['LATE'] !== '' ? $data['LATE'] : null,
            isset($data['OVERTIME']) ? $data['OVERTIME'] : '0',
            array_key_exists('ABSENCE', $data) && $data['ABSENCE'] !== '' ? $data['ABSENCE'] : null,
        ];

        $result = $this->db->query($sql, $bindings);

        if (!$result) {
            $dbError = $this->db->error();

            log_message(
                'error',
                'Attendance insert failed. EMP_NO: ' .
                    (isset($data['EMP_NO']) ? $data['EMP_NO'] : '') .
                    ' DATE: ' .
                    (isset($data['ATT_DATE']) ? $data['ATT_DATE'] : '') .
                    ' ERROR: ' .
                    (!empty($dbError['message']) ? $dbError['message'] : 'Insert failed.')
            );

            return false;
        }

        return true;
    }
    private function update_attendance_sheet_row(array $data)
    {
        $sql = "
            UPDATE XX_DIGI_ATT_ATT_SHEET
            SET
                EMP_NAME = ?,
                SHIFT = ?,
                CHECK_IN = ?,
                PUNCH_IN = ?,
                CHECK_OUT = ?,
                PUNCH_OUT = ?,
                TOTAL_MINUTES = ?,
                EARLY = ?,
                LATE = ?,
                OVERTIME = ?,
                ABSENCE = ?
            WHERE EMP_NO = ?
            AND TRUNC(ATT_DATE) = TO_DATE(?, 'YYYY-MM-DD')
            ";

        $bindings = [
            isset($data['EMP_NAME']) ? $data['EMP_NAME'] : null,
            array_key_exists('SHIFT', $data) && $data['SHIFT'] !== '' ? $data['SHIFT'] : null,
            array_key_exists('CHECK_IN', $data) && $data['CHECK_IN'] !== '' ? $data['CHECK_IN'] : null,
            array_key_exists('PUNCH_IN', $data) && $data['PUNCH_IN'] !== '' ? $data['PUNCH_IN'] : null,
            array_key_exists('CHECK_OUT', $data) && $data['CHECK_OUT'] !== '' ? $data['CHECK_OUT'] : null,
            array_key_exists('PUNCH_OUT', $data) && $data['PUNCH_OUT'] !== '' ? $data['PUNCH_OUT'] : null,
            array_key_exists('TOTAL_MINUTES', $data) && $data['TOTAL_MINUTES'] !== '' ? $data['TOTAL_MINUTES'] : null,
            array_key_exists('EARLY', $data) && $data['EARLY'] !== '' ? $data['EARLY'] : null,
            array_key_exists('LATE', $data) && $data['LATE'] !== '' ? $data['LATE'] : null,
            isset($data['OVERTIME']) ? $data['OVERTIME'] : '0',
            array_key_exists('ABSENCE', $data) && $data['ABSENCE'] !== '' ? $data['ABSENCE'] : null,
            isset($data['EMP_NO']) ? $data['EMP_NO'] : null,
            isset($data['ATT_DATE']) ? $data['ATT_DATE'] : null,
        ];

        $result = $this->db->query($sql, $bindings);

        if (!$result) {
            $dbError = $this->db->error();

            log_message(
                'error',
                'Attendance update failed. EMP_NO: ' .
                    (isset($data['EMP_NO']) ? $data['EMP_NO'] : '') .
                    ' DATE: ' .
                    (isset($data['ATT_DATE']) ? $data['ATT_DATE'] : '') .
                    ' ERROR: ' .
                    (!empty($dbError['message']) ? $dbError['message'] : 'Update failed.')
            );

            return false;
        }

        return true;
    }

    private function calculate_total_minutes($punchIn, $punchOut)
    {
        $metrics = $this->calculate_attendance_metrics('', $punchIn, '', $punchOut);
        return $metrics['TOTAL_MINUTES'];
    }

    private function calculate_late_minutes($checkIn, $punchIn)
    {
        $metrics = $this->calculate_attendance_metrics($checkIn, $punchIn, '', '');
        return $metrics['LATE'];
    }

    private function calculate_early_minutes($checkOut, $punchOut)
    {
        $metrics = $this->calculate_attendance_metrics('', '', $checkOut, $punchOut);
        return $metrics['EARLY'];
    }
    private function calculate_attendance_metrics($checkIn, $punchIn, $checkOut, $punchOut)
    {
        $checkInMinutes = $this->time_to_minutes($checkIn);
        $punchInMinutes = $this->time_to_minutes($punchIn);
        $checkOutMinutes = $this->time_to_minutes($checkOut);
        $punchOutMinutes = $this->time_to_minutes($punchOut);

        $result = [
            'TOTAL_MINUTES' => '',
            'LATE' => '',
            'EARLY' => '',
        ];

        if ($punchInMinutes !== null && $punchOutMinutes !== null) {
            $normalizedWork = $this->resolve_time_range($punchInMinutes, $punchOutMinutes);
            $result['TOTAL_MINUTES'] = (string) max(0, $normalizedWork['end'] - $normalizedWork['start']);
        }

        if ($checkInMinutes !== null && $punchInMinutes !== null) {
            if ($punchInMinutes >= $checkInMinutes) {
                $result['LATE'] = (string) ($punchInMinutes - $checkInMinutes);
            } else {
                if ($checkOutMinutes !== null && $checkOutMinutes <= $checkInMinutes && $punchInMinutes <= $checkOutMinutes) {
                    $result['LATE'] = (string) (($punchInMinutes + 1440) - $checkInMinutes);
                } else {
                    $result['LATE'] = '0';
                }
            }
        }

        if ($checkOutMinutes !== null && $punchOutMinutes !== null) {
            if ($checkInMinutes !== null && $checkOutMinutes <= $checkInMinutes) {
                $scheduledEnd = $checkOutMinutes + 1440;
                $actualOut = ($punchOutMinutes <= $checkOutMinutes) ? ($punchOutMinutes + 1440) : $punchOutMinutes;
                $early = $scheduledEnd - $actualOut;
                $result['EARLY'] = $early > 0 ? (string) $early : '0';
            } else {
                $early = $checkOutMinutes - $punchOutMinutes;
                $result['EARLY'] = $early > 0 ? (string) $early : '0';
            }
        }

        return $result;
    }
    private function normalize_shift_window($startMinutes, $endMinutes)
    {
        if ($startMinutes === null || $endMinutes === null) {
            return null;
        }

        if ($endMinutes < $startMinutes) {
            $endMinutes += 1440;
        }

        return [
            'start' => $startMinutes,
            'end' => $endMinutes,
        ];
    }
    private function resolve_time_range($startMinutes, $endMinutes)
    {
        if ($endMinutes < $startMinutes) {
            $endMinutes += 1440;
        }

        return [
            'start' => $startMinutes,
            'end' => $endMinutes,
        ];
    }

    private function time_to_minutes($timeValue)
    {
        $timeValue = trim((string) $timeValue);

        if ($timeValue === '') {
            return null;
        }

        $timeValue = preg_replace('/\s+/', ' ', strtoupper($timeValue));
        $timeValue = trim($timeValue);

        $formats = [
            'H:i:s',
            'H:i',
            'G:i:s',
            'G:i',
            'h:i:s A',
            'h:i A',
            'g:i:s A',
            'g:i A',
            'h:i:sA',
            'h:iA',
            'g:i:sA',
            'g:iA',
        ];

        foreach ($formats as $format) {
            $dateTime = DateTime::createFromFormat($format, $timeValue);
            if ($dateTime instanceof DateTime) {
                $errors = DateTime::getLastErrors();

                if (
                    is_array($errors) &&
                    isset($errors['warning_count'], $errors['error_count']) &&
                    (int) $errors['warning_count'] === 0 &&
                    (int) $errors['error_count'] === 0
                ) {
                    $hours = (int) $dateTime->format('H');
                    $minutes = (int) $dateTime->format('i');
                    return ($hours * 60) + $minutes;
                }
            }
        }

        if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i', $timeValue, $matches)) {
            $hours = (int) $matches[1];
            $minutes = (int) $matches[2];
            $seconds = isset($matches[3]) && $matches[3] !== '' ? (int) $matches[3] : 0;
            $meridian = isset($matches[4]) ? strtoupper(trim($matches[4])) : '';

            if ($minutes > 59 || $seconds > 59) {
                return null;
            }

            if ($meridian !== '') {
                if ($hours < 1 || $hours > 12) {
                    return null;
                }

                if ($meridian === 'AM') {
                    if ($hours === 12) {
                        $hours = 0;
                    }
                } elseif ($meridian === 'PM') {
                    if ($hours !== 12) {
                        $hours += 12;
                    }
                }
            } else {
                if ($hours < 0 || $hours > 23) {
                    return null;
                }
            }

            return ($hours * 60) + $minutes;
        }

        if (preg_match('/^\d{3,4}$/', $timeValue)) {
            $timeValue = str_pad($timeValue, 4, '0', STR_PAD_LEFT);
            $hours = (int) substr($timeValue, 0, 2);
            $minutes = (int) substr($timeValue, 2, 2);

            if ($hours > 23 || $minutes > 59) {
                return null;
            }

            return ($hours * 60) + $minutes;
        }

        return null;
    }

    // ------------------------------changes------------------------------

    /**
     * Bulk insert/update uploaded attendance records.
     *
     * Unique attendance record:
     * EMP_NO + ATT_DATE
     *
     * Employee name priority:
     * 1. XX_DIGI_EMP_MASTER.FULL_NAME
     * 2. Name received from uploaded file
     *
     * @param array $rows
     * @return array
     * @throws Exception
     */
    public function import_attendance_card_rows(array $rows)
    {
        $summary = [
            'total_rows'          => count($rows),
            'processed_rows'      => 0,
            'inserted_rows'       => 0,
            'updated_rows'        => 0,
            'failed_rows'         => 0,
            'name_matched_rows'   => 0,
            'name_unmatched_rows' => 0,
            'errors'              => [],
        ];

        if (empty($rows)) {
            return $summary;
        }

        /*
     * Prevent:
     * ORA-12838: cannot read/modify an object after modifying it in parallel
     */
        $this->db->query('ALTER SESSION DISABLE PARALLEL DML');
        $this->db->query('ALTER SESSION DISABLE PARALLEL QUERY');

        /*
     * Validate and normalize all records before starting transaction.
     */
        $normalizedRows = [];

        foreach ($rows as $index => $row) {
            $excelRowNumber = isset($row['ROW_NUMBER'])
                ? (int) $row['ROW_NUMBER']
                : $index + 2;

            $empNo = trim((string) ($row['EMP_NO'] ?? ''));
            $empName = trim((string) ($row['EMP_NAME'] ?? ''));
            $attDate = trim((string) ($row['ATT_DATE'] ?? ''));
            $punchIn = trim((string) ($row['PUNCH_IN'] ?? ''));
            $punchOut = trim((string) ($row['PUNCH_OUT'] ?? ''));

            if ($empNo === '') {
                $summary['failed_rows']++;
                $summary['errors'][] = [
                    'row'      => $excelRowNumber,
                    'emp_no'   => '',
                    'message'  => 'Employee number is required.',
                ];

                continue;
            }

            if ($attDate === '') {
                $summary['failed_rows']++;
                $summary['errors'][] = [
                    'row'      => $excelRowNumber,
                    'emp_no'   => $empNo,
                    'message'  => 'Attendance date is required.',
                ];

                continue;
            }

            /*
         * Ensure date is YYYY-MM-DD.
         */
            $dateObject = DateTime::createFromFormat('Y-m-d', $attDate);
            $dateErrors = DateTime::getLastErrors();

            if (
                !$dateObject ||
                (
                    is_array($dateErrors) &&
                    (
                        $dateErrors['warning_count'] > 0 ||
                        $dateErrors['error_count'] > 0
                    )
                ) ||
                $dateObject->format('Y-m-d') !== $attDate
            ) {
                $summary['failed_rows']++;
                $summary['errors'][] = [
                    'row'      => $excelRowNumber,
                    'emp_no'   => $empNo,
                    'message'  => 'Invalid attendance date. Expected YYYY-MM-DD.',
                ];

                continue;
            }

            $normalizedRows[] = [
                'ROW_NUMBER' => $excelRowNumber,
                'EMP_NO'     => $empNo,
                'EMP_NAME'   => $empName,
                'ATT_DATE'   => $attDate,
                'PUNCH_IN'   => $punchIn,
                'PUNCH_OUT'  => $punchOut,
            ];
        }

        if (empty($normalizedRows)) {
            return $summary;
        }

        /*
     * Remove duplicate rows inside the uploaded file.
     * The last occurrence of EMP_NO + ATT_DATE will be used.
     */
        $uniqueRows = [];

        foreach ($normalizedRows as $row) {
            $uniqueKey = $row['EMP_NO'] . '|' . $row['ATT_DATE'];
            $uniqueRows[$uniqueKey] = $row;
        }

        $normalizedRows = array_values($uniqueRows);

        /*
     * Identify existing records before modifying the attendance table.
     * This allows us to provide inserted/updated summary counts without
     * reading the modified table after MERGE.
     */
        $existingRecordKeys = $this->get_existing_attendance_keys(
            $normalizedRows
        );

        /*
     * Resolve employee names before modifying the attendance table.
     */
        // $employeeNames = $this->get_employee_master_names(
        //     $normalizedRows
        // );

        // foreach ($normalizedRows as &$row) {
        //     if (isset($employeeNames[$row['EMP_NO']])) {
        //         $row['EMP_NAME'] = $employeeNames[$row['EMP_NO']];
        //         $summary['name_matched_rows']++;
        //     } else {
        //         $summary['name_unmatched_rows']++;
        //     }

        //     $recordKey = $row['EMP_NO'] . '|' . $row['ATT_DATE'];

        //     if (isset($existingRecordKeys[$recordKey])) {
        //         $summary['updated_rows']++;
        //     } else {
        //         $summary['inserted_rows']++;
        //     }
        // }

        // unset($row);
        $activeEmployees = $this->get_active_employee_master(
            $normalizedRows
        );

        $activeRows = [];

        foreach ($normalizedRows as $row) {

            $empNo = $row['EMP_NO'];

            /*
          * Employee does not exist as ACTIVE in ADW
         */
            if (!isset($activeEmployees[$empNo])) {

                $summary['failed_rows']++;

                $summary['errors'][] = [
                    'row'     => $row['ROW_NUMBER'],
                    'emp_no'  => $empNo,
                    'message' => 'Employee is inactive or not found in XX_DIGI_EMP_MASTER.'
                ];

                continue;
            }

            /*
            * Use employee name from ADW
            */
            $row['EMP_NAME'] = $activeEmployees[$empNo]['EMP_NAME'];

            $summary['name_matched_rows']++;

            $recordKey = $row['EMP_NO'] . '|' . $row['ATT_DATE'];

            if (isset($existingRecordKeys[$recordKey])) {
                $summary['updated_rows']++;
            } else {
                $summary['inserted_rows']++;
            }

            $activeRows[] = $row;
        }

        $normalizedRows = $activeRows;
        /*
     * A smaller batch reduces OCI8 bind pressure and SQL size.
     */
        $batchSize = 200;
        $batches = array_chunk($normalizedRows, $batchSize);

        $this->db->trans_begin();

        try {
            foreach ($batches as $batchIndex => $batch) {
                $selectParts = [];
                $binds = [];

                foreach ($batch as $row) {
                    $selectParts[] = "
                    SELECT
                        ? AS EMP_NO,
                        ? AS EMP_NAME,
                        TO_DATE(?, 'YYYY-MM-DD') AS ATT_DATE,
                        ? AS PUNCH_IN,
                        ? AS PUNCH_OUT
                    FROM DUAL
                ";

                    $binds[] = $row['EMP_NO'];
                    $binds[] = $row['EMP_NAME'];
                    $binds[] = $row['ATT_DATE'];
                    $binds[] = $row['PUNCH_IN'];
                    $binds[] = $row['PUNCH_OUT'];
                }

                $sourceSql = implode(
                    "\nUNION ALL\n",
                    $selectParts
                );

                $mergeSql = "
                MERGE /*+ NO_PARALLEL(target) */ INTO
                    XX_DIGI_ATT_ATT_CARD target
                USING (
                    SELECT /*+ NO_PARALLEL */
                        source_rows.EMP_NO,
                        source_rows.EMP_NAME,
                        source_rows.ATT_DATE,
                        source_rows.PUNCH_IN,
                        source_rows.PUNCH_OUT
                    FROM (
                        {$sourceSql}
                    ) source_rows
                ) source
                ON (
                    TO_CHAR(target.EMP_NO) = source.EMP_NO
                    AND target.ATT_DATE >= source.ATT_DATE
                    AND target.ATT_DATE < source.ATT_DATE + 1
                )
                WHEN MATCHED THEN
                    UPDATE SET
                        target.EMP_NAME = source.EMP_NAME,
                        target.PUNCH_IN = source.PUNCH_IN,
                        target.PUNCH_OUT = source.PUNCH_OUT
                WHEN NOT MATCHED THEN
                    INSERT (
                        EMP_NO,
                        EMP_NAME,
                        ATT_DATE,
                        PUNCH_IN,
                        PUNCH_OUT
                    )
                    VALUES (
                        source.EMP_NO,
                        source.EMP_NAME,
                        source.ATT_DATE,
                        source.PUNCH_IN,
                        source.PUNCH_OUT
                    )
            ";

                $queryResult = $this->db->query(
                    $mergeSql,
                    $binds
                );

                if ($queryResult === false) {
                    $dbError = $this->db->error();

                    $errorMessage = !empty($dbError['message'])
                        ? $dbError['message']
                        : 'Unknown Oracle database error.';

                    throw new Exception(
                        'Attendance import failed in batch ' .
                            ($batchIndex + 1) .
                            '. ' .
                            $errorMessage
                    );
                }

                $summary['processed_rows'] += count($batch);
            }

            if ($this->db->trans_status() === false) {
                throw new Exception(
                    'Attendance import transaction failed.'
                );
            }

            $this->db->trans_commit();

            return $summary;
        } catch (Throwable $exception) {
            $this->db->trans_rollback();

            /*
         * These summary counts must not indicate saved records
         * because the complete transaction was rolled back.
         */
            $summary['failed_rows'] += count($normalizedRows);
            $summary['processed_rows'] = 0;
            $summary['inserted_rows'] = 0;
            $summary['updated_rows'] = 0;

            log_message(
                'error',
                'Attendance upload import failed: ' .
                    $exception->getMessage()
            );

            throw new Exception(
                'Attendance import failed. ' .
                    $exception->getMessage()
            );
        }
    }

    /**
     * Return existing attendance keys before running MERGE.
     *
     * Key format:
     * EMP_NO|YYYY-MM-DD
     *
     * @param array $rows
     * @return array
     */
    private function get_existing_attendance_keys(array $rows)
    {
        $existingKeys = [];

        if (empty($rows)) {
            return $existingKeys;
        }

        /*
     * Group uploaded rows by date to keep the queries smaller.
     */
        $rowsByDate = [];

        foreach ($rows as $row) {
            $date = $row['ATT_DATE'];

            if (!isset($rowsByDate[$date])) {
                $rowsByDate[$date] = [];
            }

            $rowsByDate[$date][$row['EMP_NO']] = true;
        }

        foreach ($rowsByDate as $date => $employeeMap) {
            $employeeNumbers = array_keys($employeeMap);

            foreach (array_chunk($employeeNumbers, 500) as $employeeBatch) {
                $placeholders = implode(
                    ',',
                    array_fill(0, count($employeeBatch), '?')
                );

                $sql = "
                SELECT /*+ NO_PARALLEL(A) */
                    TO_CHAR(A.EMP_NO) AS EMP_NO,
                    TO_CHAR(A.ATT_DATE, 'YYYY-MM-DD') AS ATT_DATE
                FROM XX_DIGI_ATT_ATT_CARD A
                WHERE A.ATT_DATE >= TO_DATE(?, 'YYYY-MM-DD')
                  AND A.ATT_DATE < TO_DATE(?, 'YYYY-MM-DD') + 1
                  AND TO_CHAR(A.EMP_NO) IN ({$placeholders})
            ";

                $binds = [
                    $date,
                    $date,
                ];

                foreach ($employeeBatch as $empNo) {
                    $binds[] = $empNo;
                }

                $result = $this->db
                    ->query($sql, $binds)
                    ->result_array();

                foreach ($result as $record) {
                    $key = trim((string) $record['EMP_NO']) .
                        '|' .
                        trim((string) $record['ATT_DATE']);

                    $existingKeys[$key] = true;
                }
            }
        }

        return $existingKeys;
    }

    /**
     * Fetch employee names from XX_DIGI_EMP_MASTER.
     *
     * @param array $rows
     * @return array
     */
    // private function get_employee_master_names(array $rows)
    // {
    //     $employeeNames = [];

    //     if (empty($rows)) {
    //         return $employeeNames;
    //     }

    //     $employeeNumbers = [];

    //     foreach ($rows as $row) {
    //         $empNo = trim((string) $row['EMP_NO']);

    //         if ($empNo !== '') {
    //             $employeeNumbers[$empNo] = true;
    //         }
    //     }

    //     $employeeNumbers = array_keys($employeeNumbers);

    //     foreach (array_chunk($employeeNumbers, 500) as $employeeBatch) {
    //         $placeholders = implode(
    //             ',',
    //             array_fill(0, count($employeeBatch), '?')
    //         );

    //         $sql = "
    //         SELECT /*+ NO_PARALLEL(B) */
    //             TO_CHAR(B.EMPLOYEE_NUMBER) AS EMP_NO,
    //             MAX(B.FULL_NAME) AS FULL_NAME
    //         FROM XX_DIGI_EMP_MASTER B
    //         WHERE TO_CHAR(B.EMPLOYEE_NUMBER) IN ({$placeholders})
    //         GROUP BY TO_CHAR(B.EMPLOYEE_NUMBER)
    //     ";

    //         $result = $this->db
    //             ->query($sql, $employeeBatch)
    //             ->result_array();

    //         foreach ($result as $record) {
    //             $empNo = trim((string) $record['EMP_NO']);
    //             $fullName = trim((string) $record['FULL_NAME']);

    //             if ($empNo !== '' && $fullName !== '') {
    //                 $employeeNames[$empNo] = $fullName;
    //             }
    //         }
    //     }

    //     return $employeeNames;
    // }
    private function get_active_employee_master(array $rows)
    {
        $employees = [];

        if (empty($rows)) {
            return $employees;
        }

        $employeeNumbers = [];

        foreach ($rows as $row) {
            $empNo = trim((string) ($row['EMP_NO'] ?? ''));

            if ($empNo !== '') {
                $employeeNumbers[$empNo] = true;
            }
        }

        $employeeNumbers = array_keys($employeeNumbers);

        foreach (array_chunk($employeeNumbers, 500) as $employeeBatch) {

            $placeholders = implode(
                ',',
                array_fill(0, count($employeeBatch), '?')
            );

            $sql = "
            SELECT
                TO_CHAR(B.EMPLOYEE_NUMBER) AS EMP_NO,
                MAX(B.FULL_NAME) AS FULL_NAME
            FROM XX_DIGI_EMP_MASTER B
            WHERE TO_CHAR(B.EMPLOYEE_NUMBER) IN ({$placeholders})
              AND UPPER(TRIM(NVL(B.CURRENT_EMP_FLAG, 'N'))) = 'Y'
            GROUP BY TO_CHAR(B.EMPLOYEE_NUMBER)
         ";

            $result = $this->db
                ->query($sql, $employeeBatch)
                ->result_array();

            foreach ($result as $record) {

                $empNo = trim((string) $record['EMP_NO']);
                $fullName = trim((string) $record['FULL_NAME']);

                if ($empNo !== '') {
                    $employees[$empNo] = [
                        'EMP_NO'   => $empNo,
                        'EMP_NAME' => $fullName
                    ];
                }
            }
        }

        return $employees;
    }


    // for log Employee numbers that are active in ADW but not present in the uploaded attendance data, 
    // private function get_active_employee_master(array $rows)
    // {
    //     $employees = [];

    //     if (empty($rows)) {
    //         return $employees;
    //     }

    //     $employeeNumbers = [];

    //     foreach ($rows as $row) {
    //         $empNo = trim((string) ($row['EMP_NO'] ?? ''));

    //         if ($empNo !== '') {
    //             $employeeNumbers[$empNo] = true;
    //         }
    //     }

    //     $employeeNumbers = array_keys($employeeNumbers);

    //     // foreach (array_chunk($employeeNumbers, 500) as $employeeBatch) {

    //     //     $placeholders = implode(
    //     //         ',',
    //     //         array_fill(0, count($employeeBatch), '?')
    //     //     );

    //     //     $sql = "
    //     //     SELECT
    //     //         TO_CHAR(B.EMPLOYEE_NUMBER) AS EMP_NO,
    //     //         MAX(B.FULL_NAME) AS FULL_NAME
    //     //     FROM XX_DIGI_EMP_MASTER B
    //     //     WHERE TO_CHAR(B.EMPLOYEE_NUMBER) IN ({$placeholders})
    //     //       AND UPPER(TRIM(NVL(B.CURRENT_EMP_FLAG, 'N'))) = 'Y'
    //     //     GROUP BY TO_CHAR(B.EMPLOYEE_NUMBER)
    //     //  ";

    //     //     $result = $this->db
    //     //         ->query($sql, $employeeBatch)
    //     //         ->result_array();

    //     //     foreach ($result as $record) {

    //     //         $empNo = trim((string) $record['EMP_NO']);
    //     //         $fullName = trim((string) $record['FULL_NAME']);

    //     //         if ($empNo !== '') {
    //     //             $employees[$empNo] = [
    //     //                 'EMP_NO'   => $empNo,
    //     //                 'EMP_NAME' => $fullName
    //     //             ];
    //     //         }
    //     //     }
    //     // }

    //     // return $employees;
    //     foreach (array_chunk($employeeNumbers, 500) as $employeeBatch) {

    //         $placeholders = implode(
    //             ',',
    //             array_fill(0, count($employeeBatch), '?')
    //         );

    //         $sql = "
    //         SELECT
    //             TO_CHAR(B.EMPLOYEE_NUMBER) AS EMP_NO,
    //             MAX(B.FULL_NAME) AS FULL_NAME
    //         FROM XX_DIGI_EMP_MASTER B
    //         WHERE TO_CHAR(B.EMPLOYEE_NUMBER) IN ({$placeholders})
    //           AND UPPER(TRIM(NVL(B.CURRENT_EMP_FLAG, 'N'))) = 'Y'
    //         GROUP BY TO_CHAR(B.EMPLOYEE_NUMBER)
    //          ";

    //         $result = $this->db
    //             ->query($sql, $employeeBatch)
    //             ->result_array();

    //         foreach ($result as $record) {

    //             $empNo = trim((string) $record['EMP_NO']);


    //             $fullName = trim(
    //                 (string)($record['FULL_NAME'] ?? '')
    //             );

    //             if ($empNo !== '') {
    //                 $employees[$empNo] = [
    //                     'EMP_NO'   => $empNo,
    //                     'EMP_NAME' => $fullName
    //                 ];
    //             }
    //         }
    //     }


    //                 /*
    //         |--------------------------------------------------------------------------
    //         | DEBUG: Active ADW employees that are NOT in EBS upload
    //         |--------------------------------------------------------------------------
    //         */
    //     // DEBUG
    //     //         $activeAdwEmployees = $this->db->query("
    //     //     SELECT DISTINCT TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO
    //     //     FROM XX_DIGI_EMP_MASTER
    //     //        WHERE UPPER(TRIM(NVL(CURRENT_EMP_FLAG, 'N'))) = 'Y'
    //     //       ")->result_array();

    //     // $uploadedEmployeeMap = array_fill_keys($employeeNumbers, true);

    //     // $activeNotInEbs = [];

    //     // foreach ($activeAdwEmployees as $record) {

    //     //     $empNo = trim((string)($record['EMP_NO'] ?? ''));

    //     //     if ($empNo !== '' && !isset($uploadedEmployeeMap[$empNo])) {
    //     //         $activeNotInEbs[] = $empNo;
    //     //     }
    //     // }

    //     // log_message(
    //     //     'error',
    //     //     'ATTENDANCE DEBUG - Active ADW employees NOT in EBS: ' .
    //     //         implode(', ', $activeNotInEbs)
    //     // );

    //     // log_message(
    //     //     'error',
    //     //     'ATTENDANCE DEBUG - Count active ADW employees NOT in EBS: ' .
    //     //         count($activeNotInEbs)
    //     // );

    //     return $employees;
    // }
}
