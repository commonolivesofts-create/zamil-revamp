<?php
defined('BASEPATH') or exit('No direct script access allowed');

class ProcessAttendanceModel extends CI_Model
{
    private $attendanceCardTable = 'XX_DIGI_ATT_ATT_CARD';
    private $attendanceSheetTable = 'XX_DIGI_ATT_ATT_SHEET';

    private $sharedServiceShift = [
        [
            'id' => 75,
            'name' => 'H.Office Shift',
        ],
    ];

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    public function get_departments()
    {
        $rows = $this->db
            ->select('DISTINCT DEPARTMENT', false)
            ->from('XX_DIGI_EMP_MASTER')
            ->where('DEPARTMENT IS NOT NULL', null, false)
            ->where("TRIM(DEPARTMENT) <> ''", null, false)
            ->order_by('DEPARTMENT', 'ASC')
            ->get()
            ->result_array();

        $departments = [];
        foreach ($rows as $row) {
            if (!empty($row['DEPARTMENT'])) {
                $departments[] = $row['DEPARTMENT'];
            }
        }

        return $departments;
    }

    public function get_employees_by_department($department)
    {
        $sql = "
            SELECT
                TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER,
                FULL_NAME
            FROM XX_DIGI_EMP_MASTER
            WHERE DEPARTMENT = ?
              AND EMPLOYEE_NUMBER IS NOT NULL
            ORDER BY EMPLOYEE_NUMBER ASC
        ";

        return $this->db->query($sql, [$department])->result_array();
    }

    public function process_attendance_range(array $params)
    {
        $department = isset($params['department']) ? trim((string) $params['department']) : '';
        $employeeNumber = isset($params['employee_number']) ? strtoupper(trim((string) $params['employee_number'])) : '';
        $fromDate = isset($params['from_date']) ? trim((string) $params['from_date']) : '';
        $toDate = isset($params['to_date']) ? trim((string) $params['to_date']) : '';

        $startDate = DateTime::createFromFormat('Y-m-d', $fromDate);
        $endDate = DateTime::createFromFormat('Y-m-d', $toDate);

        if (!$startDate || !$endDate) {
            throw new Exception('Invalid date range.');
        }

        if ($startDate > $endDate) {
            throw new Exception('From date must be less than or equal to to date.');
        }

        $employees = $this->get_target_employees($department, $employeeNumber, $fromDate, $toDate);

        if (empty($employees)) {
            throw new Exception('No employees found for processing.');
        }

        $summary = [
            'department' => $department,
            'employee_number' => $employeeNumber,
            'date_from' => $fromDate,
            'date_to' => $toDate,
            'total_employees' => count($employees),
            'processed_rows' => 0,
            'inserted_rows' => 0,
            'updated_rows' => 0,
            'present_rows' => 0,
            'weekly_holiday_rows' => 0,
            'leave_rows' => 0,
            'absence_without_permission_rows' => 0,
            'blank_punch_rows' => 0,
            'error_rows' => 0,
            'employee_errors' => [],
            'row_errors' => [],
        ];

        foreach ($employees as $employee) {
            $empNo = isset($employee['EMPLOYEE_NUMBER']) ? trim((string) $employee['EMPLOYEE_NUMBER']) : '';
            $masterName = isset($employee['FULL_NAME']) ? trim((string) $employee['FULL_NAME']) : '';
            $masterDepartment = isset($employee['DEPARTMENT']) ? trim((string) $employee['DEPARTMENT']) : '';

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
                    $shiftInfo = $this->get_employee_shift_for_date($empNo, $attendanceDate);
                    $shiftId = array_key_exists('SHIFT_ID', $shiftInfo) ? (int) $shiftInfo['SHIFT_ID'] : 0;

                    $attendanceCard = $this->get_attendance_card_for_date($empNo, $attendanceDate);
                    $absenceInfo = $this->get_employee_approved_absence_for_date($empNo, $attendanceDate);
                    $occasionInfo = $this->get_active_occasion_for_date($attendanceDate, $shiftId);

                    $attendanceCardExists = !empty($attendanceCard);
                    $weekendDays = $this->get_weekend_days_for_shift($shiftId);

                    $isWeekend = $this->is_weekend_date($dateCursor, $weekendDays);

                    $isShiftOffDay = array_key_exists('IS_OFF_DAY', $shiftInfo)
                        && strtoupper(trim((string) $shiftInfo['IS_OFF_DAY'])) === 'Y';

                    if (!$isWeekend && $isShiftOffDay) {
                        $isWeekend = true;
                    }

                    $isOccasion = !empty($occasionInfo['OCCASION_NAME']);

                    $employeeName = $masterName;
                    if ($employeeName === '' && !empty($attendanceCard['EMP_NAME'])) {
                        $employeeName = trim((string) $attendanceCard['EMP_NAME']);
                    }

                    if ($employeeName === '') {
                        $profile = $this->get_employee_profile($empNo);
                        $employeeName = isset($profile['FULL_NAME']) ? trim((string) $profile['FULL_NAME']) : '';
                        if ($masterDepartment === '' && isset($profile['DEPARTMENT'])) {
                            $masterDepartment = trim((string) $profile['DEPARTMENT']);
                        }
                    }

                    $shiftName = !empty($shiftInfo['SHIFT_NAME']) ? trim((string) $shiftInfo['SHIFT_NAME']) : null;
                    $checkIn = array_key_exists('CHECK_IN', $shiftInfo) ? $this->normalize_nullable_string($shiftInfo['CHECK_IN']) : null;
                    $checkOut = array_key_exists('CHECK_OUT', $shiftInfo) ? $this->normalize_nullable_string($shiftInfo['CHECK_OUT']) : null;
                    $grossTime = array_key_exists('GROSS_TIME', $shiftInfo) ? $this->normalize_nullable_string($shiftInfo['GROSS_TIME']) : null;
                    $excludeTimesheet = array_key_exists('EXCLUDE_TIMESHEET', $shiftInfo)
                        ? strtoupper(trim((string) $shiftInfo['EXCLUDE_TIMESHEET']))
                        : 'N';
                    $overtimeAllowed = array_key_exists('OVERTIME_ALLOWED', $shiftInfo)
                        ? strtoupper(trim((string) $shiftInfo['OVERTIME_ALLOWED']))
                        : 'N';
                    $weekdayOvertimeCap = array_key_exists('WEEKDAY_OVRTM_CAP', $shiftInfo)
                        ? $this->normalize_nullable_string($shiftInfo['WEEKDAY_OVRTM_CAP'])
                        : null;
                    $weekendOvertimeCap = array_key_exists('WEEKEND_OVRTM_CAP', $shiftInfo)
                        ? $this->normalize_nullable_string($shiftInfo['WEEKEND_OVRTM_CAP'])
                        : null;

                    $punchIn = array_key_exists('PUNCH_IN', $attendanceCard) ? $this->normalize_nullable_string($attendanceCard['PUNCH_IN']) : null;
                    $punchOut = array_key_exists('PUNCH_OUT', $attendanceCard) ? $this->normalize_nullable_string($attendanceCard['PUNCH_OUT']) : null;

                    $absence = null;

                    if (!empty($absenceInfo['LEAVE_TYPE'])) {
                        $absence = trim((string) $absenceInfo['LEAVE_TYPE']);
                        $summary['leave_rows']++;
                    } elseif ($isOccasion) {
                        $absence = trim((string) $occasionInfo['OCCASION_NAME']);

                        if ($punchIn !== null && $punchOut !== null) {
                            $summary['present_rows']++;
                        }
                    } elseif ($isWeekend) {
                        $absence = 'Weekend';

                        if ($punchIn !== null && $punchOut !== null) {
                            $summary['present_rows']++;
                        } else {
                            $summary['weekly_holiday_rows']++;
                        }
                    } elseif (!$attendanceCardExists) {
                        $absence = 'Absence without permission';
                        $summary['absence_without_permission_rows']++;
                    } elseif ($punchIn === null && $punchOut === null) {
                        $summary['blank_punch_rows']++;

                        if ($excludeTimesheet === 'Y') {
                            $summary['present_rows']++;
                        } else {
                            $absence = 'Absence without permission';
                            $summary['absence_without_permission_rows']++;
                        }
                    } else {
                        $summary['present_rows']++;
                    }

                    $timeMetrics = $this->calculate_attendance_metrics(
                        $checkIn,
                        $grossTime,
                        $punchIn,
                        $checkOut,
                        $punchOut,
                        $isWeekend,
                        $weekdayOvertimeCap,
                        $weekendOvertimeCap,
                        $isOccasion,
                        $overtimeAllowed,
                        $shiftId,
                        $shiftName
                    );

                    $saveData = [
                        'EMP_NO' => $empNo,
                        'EMP_NAME' => ($employeeName !== '' ? $employeeName : null),
                        'SHIFT' => $shiftName,
                        'ATT_DATE' => $attendanceDate,
                        'CHECK_IN' => $checkIn,
                        'PUNCH_IN' => $punchIn,
                        'CHECK_OUT' => $checkOut,
                        'PUNCH_OUT' => $punchOut,
                        'TOTAL_MINUTES' => ($timeMetrics['TOTAL_MINUTES'] === '' ? null : $timeMetrics['TOTAL_MINUTES']),
                        'EARLY' => ($timeMetrics['EARLY'] === '' ? null : $timeMetrics['EARLY']),
                        'LATE' => ($timeMetrics['LATE'] === '' ? null : $timeMetrics['LATE']),
                        'OVERTIME' => ($timeMetrics['OVERTIME'] === '' ? null : $timeMetrics['OVERTIME']),
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
                                'employee_name' => $employeeName,
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
                                'employee_name' => $employeeName,
                                'attendance_date' => $attendanceDate,
                                'error' => 'Insert failed.',
                            ];
                        }
                    }
                } catch (Exception $e) {
                    $summary['error_rows']++;
                    $summary['row_errors'][] = [
                        'employee_number' => $empNo,
                        'employee_name' => $masterName,
                        'attendance_date' => $attendanceDate,
                        'error' => $e->getMessage(),
                    ];

                    log_message(
                        'error',
                        'Process attendance row failed. EMP_NO: ' . $empNo .
                            ' DATE: ' . $attendanceDate .
                            ' ERROR: ' . $e->getMessage()
                    );
                }

                $dateCursor->modify('+1 day');
            }
        }

        return $summary;
    }

    private function get_target_employees($department, $employeeNumber, $fromDate, $toDate)
    {
        $departmentFlag = strtoupper(trim((string) $department));
        $employeeFlag = strtoupper(trim((string) $employeeNumber));

        if ($departmentFlag === 'ALL' && $employeeFlag === 'ALL') {
            return $this->get_employees_from_attendance_range($fromDate, $toDate);
        }

        if ($departmentFlag !== 'ALL' && $employeeFlag === 'ALL') {
            return $this->get_employees_from_department($department);
        }

        if ($departmentFlag !== 'ALL' && $employeeFlag !== '') {
            return $this->get_selected_employee_from_department($department, $employeeNumber);
        }

        return [];
    }

    private function get_employees_from_attendance_range($fromDate, $toDate)
    {
        $sql = "
            SELECT
                TO_CHAR(a.EMP_NO) AS EMPLOYEE_NUMBER,
                NVL(MAX(m.FULL_NAME), MAX(a.EMP_NAME)) AS FULL_NAME,
                MAX(m.DEPARTMENT) AS DEPARTMENT
            FROM XX_DIGI_ATT_ATT_CARD a
            LEFT JOIN XX_DIGI_EMP_MASTER m
                   ON TO_CHAR(m.EMPLOYEE_NUMBER) = TO_CHAR(a.EMP_NO)
            WHERE a.EMP_NO IS NOT NULL
              AND TRUNC(a.ATT_DATE) BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')
            GROUP BY TO_CHAR(a.EMP_NO)
            ORDER BY TO_CHAR(a.EMP_NO) ASC
        ";

        return $this->db->query($sql, [$fromDate, $toDate])->result_array();
    }

    private function get_employees_from_department($department)
    {
        $sql = "
            SELECT
                TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER,
                FULL_NAME,
                DEPARTMENT
            FROM XX_DIGI_EMP_MASTER
            WHERE DEPARTMENT = ?
              AND EMPLOYEE_NUMBER IS NOT NULL
            ORDER BY EMPLOYEE_NUMBER ASC
        ";

        return $this->db->query($sql, [$department])->result_array();
    }

    private function get_selected_employee_from_department($department, $employeeNumber)
    {
        $sql = "
            SELECT
                TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER,
                FULL_NAME,
                DEPARTMENT
            FROM XX_DIGI_EMP_MASTER
            WHERE DEPARTMENT = ?
              AND TO_CHAR(EMPLOYEE_NUMBER) = ?
        ";

        return $this->db->query($sql, [$department, (string) $employeeNumber])->result_array();
    }

    private function get_employee_profile($empNo)
    {
        $sql = "
            SELECT
                TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER,
                FULL_NAME,
                DEPARTMENT
            FROM XX_DIGI_EMP_MASTER
            WHERE TO_CHAR(EMPLOYEE_NUMBER) = ?
        ";

        $row = $this->db->query($sql, [(string) $empNo])->row_array();

        return is_array($row) ? $row : [];
    }

    private function is_weekend_date(DateTime $date, $weekendDays = 0)
    {
        $dayName = strtoupper($date->format('D'));

        if ((int) $weekendDays === 1) {
            return $dayName === 'FRI';
        }

        if ((int) $weekendDays >= 2) {
            return in_array($dayName, ['FRI', 'SAT'], true);
        }

        return false;
    }

    private function get_day_no_from_date($attendanceDate)
    {
        $date = DateTime::createFromFormat('Y-m-d', $attendanceDate);

        if (!$date) {
            return null;
        }

        return (int) $date->format('w') + 1;
    }

    private function attendance_sheet_record_exists($empNo, $attendanceDate)
    {
        $sql = "
            SELECT COUNT(1) AS TOTAL_COUNT
            FROM XX_DIGI_ATT_ATT_SHEET
            WHERE EMP_NO = ?
              AND TRUNC(ATT_DATE) = TO_DATE(?, 'YYYY-MM-DD')
        ";

        $row = $this->db->query($sql, [(string) $empNo, $attendanceDate])->row_array();

        return !empty($row) && (int) $row['TOTAL_COUNT'] > 0;
    }

    private function get_employee_shift_for_date($empNo, $attendanceDate)
    {
        $dayNo = $this->get_day_no_from_date($attendanceDate);

        if ($dayNo === null) {
            return [];
        }

        $sql = "
        SELECT *
        FROM (
            SELECT
                sp.ID AS SHIFT_ID,
                sp.SHIFT_NAME,
                sp.WEEKDAY_OVRTM_CAP,
                sp.WEEKEND_OVRTM_CAP,
                tp.OVERTIME_ALLOWED,
                tp.EXCLUDE_TIMESHEET,
                sd.DAY_NO,
                sd.WEEKDAY_NAME,
                sd.PUNCH_IN AS CHECK_IN,
                sd.PUNCH_OUT AS CHECK_OUT,
                sd.GROSS_TIME,
                CASE
                    WHEN (sd.PUNCH_IN IS NULL OR TRIM(sd.PUNCH_IN) IS NULL)
                    AND (sd.PUNCH_OUT IS NULL OR TRIM(sd.PUNCH_OUT) IS NULL)
                    THEN 'Y'
                    ELSE 'N'
                END AS IS_OFF_DAY
            FROM XX_DIGI_TIMETABLE_PR tp
            LEFT JOIN XX_DIGI_SHIFT_PR sp
                ON sp.ID = tp.SHIFT_ID
            LEFT JOIN XX_DIGI_SHIFT_PR_DTL sd
                ON sd.SHIFT_PR_ID = sp.ID
                AND sd.DAY_NO = ?
                AND (sd.STATUS = 'ACTIVE' OR sd.STATUS IS NULL)
            WHERE TO_CHAR(tp.EMP_NO) = ?
            AND tp.STATUS = 'ACTIVE'
            AND (tp.START_DATE IS NULL OR TRUNC(tp.START_DATE) <= TO_DATE(?, 'YYYY-MM-DD'))
            AND (tp.END_DATE IS NULL OR TRUNC(tp.END_DATE) >= TO_DATE(?, 'YYYY-MM-DD'))
            AND (sp.STATUS = 'ACTIVE' OR sp.STATUS IS NULL)
            ORDER BY tp.START_DATE DESC NULLS LAST, tp.ID DESC
        )
        WHERE ROWNUM = 1
        ";

        $row = $this->db->query($sql, [$dayNo, (string) $empNo, $attendanceDate, $attendanceDate])->row_array();

        return is_array($row) ? $row : [];
    }

    private function get_weekend_days_for_shift($shiftId)
    {
        $shiftId = (int) $shiftId;

        if ($shiftId <= 0) {
            return 0;
        }

        $sql = "
            SELECT COUNT(1) AS TOTAL_COUNT
            FROM XX_DIGI_SHIFT_PR_DTL
            WHERE SHIFT_PR_ID = ?
              AND (STATUS = 'ACTIVE' OR STATUS IS NULL)
              AND (PUNCH_IN IS NULL OR TRIM(PUNCH_IN) IS NULL)
              AND (PUNCH_OUT IS NULL OR TRIM(PUNCH_OUT) IS NULL)
        ";

        $row = $this->db->query($sql, [$shiftId])->row_array();
        $count = !empty($row['TOTAL_COUNT']) ? (int) $row['TOTAL_COUNT'] : 0;

        if ($count <= 0) {
            return 0;
        }

        if ($count >= 2) {
            return 2;
        }

        return 1;
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
                WHERE TO_CHAR(EMP_NO) = ?
                  AND TRUNC(ATT_DATE) = TO_DATE(?, 'YYYY-MM-DD')
                ORDER BY ATT_DATE ASC, HEADER_ID ASC
            )
            WHERE ROWNUM = 1
        ";

        $row = $this->db->query($sql, [(string) $empNo, $attendanceDate])->row_array();

        return is_array($row) ? $row : [];
    }

    private function get_employee_approved_absence_for_date($empNo, $attendanceDate)
    {
        $startExpr = $this->build_leave_date_expression('LEAVE_START_DATE');
        $endExpr = $this->build_leave_date_expression('LEAVE_END_DATE');

        $sql = "
            SELECT *
            FROM (
                SELECT
                    LEAVE_TYPE,
                    LEAVE_START_DATE,
                    LEAVE_END_DATE,
                    TOTAL_DAYS,
                    {$startExpr} AS LEAVE_START_DT_CALC
                FROM XX_DIGI_EMP_ABSENCE_TYPE
                WHERE TO_CHAR(EMP_NO) = ?
                  AND APPROVAL_STATUS = 'APPROVED'
                  AND TO_DATE(?, 'YYYY-MM-DD') BETWEEN {$startExpr} AND {$endExpr}
                ORDER BY {$startExpr} DESC NULLS LAST
            )
            WHERE ROWNUM = 1
        ";

        $row = $this->db->query($sql, [(string) $empNo, $attendanceDate])->row_array();

        return is_array($row) ? $row : [];
    }

    private function get_active_occasion_for_date($attendanceDate, $shiftId)
    {
        $shiftId = (int) $shiftId;

        if ($shiftId <= 0) {
            return [];
        }

        $sql = "
                    SELECT *
                    FROM (
                        SELECT
                            OCCASION_ID,
                            OCCASION_NAME,
                            OCCASION_TYPE,
                            COUNT_AS_PRESENT,
                            PAID_HOLIDAY,
                            SHIFT_ID
                        FROM XX_DIGI_ATT_OCCASIONS
                        WHERE UPPER(TRIM(IS_ACTIVE)) = 'Y'
                        AND TO_DATE(?, 'YYYY-MM-DD') BETWEEN TRUNC(FROM_DATE) AND TRUNC(TO_DATE)
                        AND INSTR(
                                ',' || REGEXP_REPLACE(TRIM(SHIFT_ID), '[[:space:]]+', '') || ',',
                                ',' || ? || ','
                            ) > 0
                        ORDER BY FROM_DATE DESC, OCCASION_ID DESC
                    )
                    WHERE ROWNUM = 1
                ";

        $row = $this->db->query($sql, [$attendanceDate, (string) $shiftId])->row_array();

        return is_array($row) ? $row : [];
    }

    private function build_leave_date_expression($columnName)
    {
        return "
            CASE
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{4}-\\d{2}-\\d{2}$')
                    THEN TO_DATE(TRIM({$columnName}), 'YYYY-MM-DD')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{4}/\\d{2}/\\d{2}$')
                    THEN TO_DATE(TRIM({$columnName}), 'YYYY/MM/DD')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}-\\d{2}-\\d{4}$')
                    THEN TO_DATE(TRIM({$columnName}), 'DD-MM-YYYY')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}/\\d{2}/\\d{4}$')
                    THEN TO_DATE(TRIM({$columnName}), 'DD/MM/YYYY')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}-\\d{2}-\\d{2}$')
                    THEN TO_DATE(TRIM({$columnName}), 'DD-MM-RR')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}/\\d{2}/\\d{2}$')
                    THEN TO_DATE(TRIM({$columnName}), 'DD/MM/RR')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}-[A-Z]{3}-\\d{4}$', 'i')
                    THEN TO_DATE(UPPER(TRIM({$columnName})), 'DD-MON-YYYY', 'NLS_DATE_LANGUAGE=ENGLISH')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}-[A-Z]{3}-\\d{2}$', 'i')
                    THEN TO_DATE(UPPER(TRIM({$columnName})), 'DD-MON-RR', 'NLS_DATE_LANGUAGE=ENGLISH')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}-[A-Z]+-\\d{4}$', 'i')
                    THEN TO_DATE(UPPER(TRIM({$columnName})), 'DD-MONTH-YYYY', 'NLS_DATE_LANGUAGE=ENGLISH')
                WHEN REGEXP_LIKE(TRIM({$columnName}), '^\\d{2}-[A-Z]+-\\d{2}$', 'i')
                    THEN TO_DATE(UPPER(TRIM({$columnName})), 'DD-MONTH-RR', 'NLS_DATE_LANGUAGE=ENGLISH')
                ELSE NULL
            END
        ";
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
            array_key_exists('EMP_NO', $data) ? $data['EMP_NO'] : null,
            array_key_exists('EMP_NAME', $data) ? $data['EMP_NAME'] : null,
            array_key_exists('SHIFT', $data) ? $data['SHIFT'] : null,
            array_key_exists('ATT_DATE', $data) ? $data['ATT_DATE'] : null,
            array_key_exists('CHECK_IN', $data) ? $data['CHECK_IN'] : null,
            array_key_exists('PUNCH_IN', $data) ? $data['PUNCH_IN'] : null,
            array_key_exists('CHECK_OUT', $data) ? $data['CHECK_OUT'] : null,
            array_key_exists('PUNCH_OUT', $data) ? $data['PUNCH_OUT'] : null,
            array_key_exists('TOTAL_MINUTES', $data) ? $data['TOTAL_MINUTES'] : null,
            array_key_exists('EARLY', $data) ? $data['EARLY'] : null,
            array_key_exists('LATE', $data) ? $data['LATE'] : null,
            array_key_exists('OVERTIME', $data) ? $data['OVERTIME'] : null,
            array_key_exists('ABSENCE', $data) ? $data['ABSENCE'] : null,
        ];

        $result = $this->db->query($sql, $bindings);

        if (!$result) {
            $dbError = $this->db->error();

            log_message(
                'error',
                'Process attendance insert failed. EMP_NO: ' .
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
            array_key_exists('EMP_NAME', $data) ? $data['EMP_NAME'] : null,
            array_key_exists('SHIFT', $data) ? $data['SHIFT'] : null,
            array_key_exists('CHECK_IN', $data) ? $data['CHECK_IN'] : null,
            array_key_exists('PUNCH_IN', $data) ? $data['PUNCH_IN'] : null,
            array_key_exists('CHECK_OUT', $data) ? $data['CHECK_OUT'] : null,
            array_key_exists('PUNCH_OUT', $data) ? $data['PUNCH_OUT'] : null,
            array_key_exists('TOTAL_MINUTES', $data) ? $data['TOTAL_MINUTES'] : null,
            array_key_exists('EARLY', $data) ? $data['EARLY'] : null,
            array_key_exists('LATE', $data) ? $data['LATE'] : null,
            array_key_exists('OVERTIME', $data) ? $data['OVERTIME'] : null,
            array_key_exists('ABSENCE', $data) ? $data['ABSENCE'] : null,
            array_key_exists('EMP_NO', $data) ? $data['EMP_NO'] : null,
            array_key_exists('ATT_DATE', $data) ? $data['ATT_DATE'] : null,
        ];

        $result = $this->db->query($sql, $bindings);

        if (!$result) {
            $dbError = $this->db->error();

            log_message(
                'error',
                'Process attendance update failed. EMP_NO: ' .
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

    private function calculate_attendance_metrics(
        $checkIn,
        $grossTime,
        $punchIn,
        $checkOut,
        $punchOut,
        $isWeekend = false,
        $weekdayOvertimeCap = null,
        $weekendOvertimeCap = null,
        $isOccasion = false,
        $overtimeAllowed = 'N',
        $shiftId = null,
        $shiftName = null
    ) {
        $checkInMinutes = $this->time_to_minutes($checkIn);
        $grossTimeMinutes = $this->time_to_minutes($grossTime);
        $punchInMinutes = $this->time_to_minutes($punchIn);
        $checkOutMinutes = $this->time_to_minutes($checkOut);
        $punchOutMinutes = $this->time_to_minutes($punchOut);

        $weekdayCapHours = $this->parse_overtime_cap_hours($weekdayOvertimeCap);
        $weekendCapHours = $this->parse_overtime_cap_hours($weekendOvertimeCap);
        $isOvertimeAllowed = strtoupper(trim((string) $overtimeAllowed)) === 'Y';
        $hasSamePunchValues = ($punchIn !== null &&
            $punchOut !== null &&
            trim((string) $punchIn) === trim((string) $punchOut)
        );

        $formatHours = function ($minutes, $maxHours = null) {
            $minutes = max(0, (int) $minutes);
            $hours = round($minutes / 60, 2);

            if ($maxHours !== null && $hours > $maxHours) {
                $hours = $maxHours;
            }

            $hoursText = number_format($hours, 2, '.', '');
            $hoursText = rtrim(rtrim($hoursText, '0'), '.');

            return $hoursText === '' ? '0' : $hoursText;
        };

        $result = [
            'TOTAL_MINUTES' => '',
            'LATE' => '',
            'EARLY' => '',
            'OVERTIME' => '',
        ];

        if ($isWeekend || $isOccasion) {
            if ($punchInMinutes !== null && $punchOutMinutes !== null) {
                $normalizedWork = $this->resolve_time_range($punchInMinutes, $punchOutMinutes);
                $workedMinutes = max(0, $normalizedWork['end'] - $normalizedWork['start']);

                $result['TOTAL_MINUTES'] = '';
                $result['LATE'] = '0';
                $result['EARLY'] = '0';
                $result['OVERTIME'] = $isOvertimeAllowed
                    ? $formatHours($workedMinutes, $weekendCapHours)
                    : '0';
            }

            return $result;
        }

        if ($this->is_shared_service_shift($shiftId, $shiftName)) {
            return $this->calculate_shared_service_shift_metrics(
                $punchInMinutes,
                $punchOutMinutes,
                $checkOutMinutes,
                $weekdayCapHours,
                $isOvertimeAllowed,
                $formatHours
            );
        }

        if ($punchInMinutes !== null && $punchOutMinutes !== null) {
            $normalizedWork = $this->resolve_time_range($punchInMinutes, $punchOutMinutes);
            $result['TOTAL_MINUTES'] = (string) max(0, $normalizedWork['end'] - $normalizedWork['start']);
        }

        if ($checkInMinutes !== null && $punchInMinutes !== null) {
            if ($hasSamePunchValues) {
                $result['LATE'] = '0';
            } else {
                $normalizedCheckIn = $this->normalize_minutes_by_shift_window($checkInMinutes, $checkInMinutes, $checkOutMinutes);
                $normalizedPunchIn = $this->normalize_minutes_by_shift_window($punchInMinutes, $checkInMinutes, $checkOutMinutes);

                $lateThreshold = $normalizedCheckIn;

                if ($grossTimeMinutes !== null) {
                    $normalizedGrossTime = $this->normalize_minutes_by_shift_window($grossTimeMinutes, $checkInMinutes, $checkOutMinutes);
                    $lateThreshold = max($normalizedCheckIn, $normalizedGrossTime);
                }

                if ($normalizedPunchIn > $lateThreshold) {
                    $result['LATE'] = (string) ($normalizedPunchIn - $lateThreshold);
                } else {
                    $result['LATE'] = '0';
                }
            }
        }

        // if ($checkOutMinutes !== null && $punchOutMinutes !== null) {
        if ($checkOutMinutes !== null && $punchOutMinutes !== null && $punchInMinutes !== null) {
        
            if ($checkInMinutes !== null && $checkOutMinutes <= $checkInMinutes) {
                $scheduledEnd = $checkOutMinutes + 1440;

                $actualOut = $punchOutMinutes;

                if ($punchOutMinutes < $checkInMinutes) {
                    $actualOut += 1440;
                }

                $early = $scheduledEnd - $actualOut;
                $overtimeMinutes = $actualOut - $scheduledEnd;

                $result['EARLY'] = $early > 0 ? (string) $early : '0';

                $result['OVERTIME'] = ($isOvertimeAllowed && $overtimeMinutes > 0)
                    ? $formatHours($overtimeMinutes, $weekdayCapHours)
                    : '0';
            } else {
                $early = $checkOutMinutes - $punchOutMinutes;
                $overtimeMinutes = $punchOutMinutes - $checkOutMinutes;

                $result['EARLY'] = $early > 0 ? (string) $early : '0';
                $result['OVERTIME'] = ($isOvertimeAllowed && $overtimeMinutes > 0)
                    ? $formatHours($overtimeMinutes, $weekdayCapHours)
                    : '0';
            }
        }

        return $result;
    }

    private function is_shared_service_shift($shiftId, $shiftName = null)
    {
        $shiftId = (int) $shiftId;
        $shiftName = strtoupper(trim((string) $shiftName));

        foreach ($this->sharedServiceShift as $shift) {
            $configuredId = isset($shift['id']) ? (int) $shift['id'] : 0;
            $configuredName = isset($shift['name']) ? strtoupper(trim((string) $shift['name'])) : '';

            if ($configuredId > 0 && $configuredId === $shiftId) {
                return true;
            }

            if ($configuredName !== '' && $configuredName === $shiftName) {
                return true;
            }
        }

        return false;
    }

    private function calculate_shared_service_shift_metrics(
        $punchInMinutes,
        $punchOutMinutes,
        $checkOutMinutes,
        $weekdayCapHours,
        $isOvertimeAllowed,
        callable $formatHours
    ) {
        $result = [
            'TOTAL_MINUTES' => '',
            'LATE' => '',
            'EARLY' => '',
            'OVERTIME' => '',
        ];

        if ($punchInMinutes === null || $punchOutMinutes === null) {
            return $result;
        }

        $arrivalWindowStart = 8 * 60;   // 08:00 AM
        $arrivalWindowEnd = 9 * 60;     // 09:00 AM
        $departureWindowEnd = 18 * 60;  // 06:00 PM
        $requiredWorkMinutes = 9 * 60;  // 9 hours

        $normalizedWork = $this->resolve_time_range($punchInMinutes, $punchOutMinutes);
        $actualPunchIn = $normalizedWork['start'];
        $actualPunchOut = $normalizedWork['end'];

        $result['TOTAL_MINUTES'] = (string) max(0, $actualPunchOut - $actualPunchIn);

        if ($actualPunchIn < $arrivalWindowStart) {
            $effectiveArrival = $arrivalWindowStart;
        } else {
            $effectiveArrival = $actualPunchIn;
        }

        $lateMinutes = 0;
        if ($actualPunchIn > $arrivalWindowEnd) {
            $lateMinutes = $actualPunchIn - $arrivalWindowEnd;
        }

        $effectiveDeparture = $actualPunchOut;
        if ($effectiveDeparture > $departureWindowEnd) {
            $effectiveDeparture = $departureWindowEnd;
        }

        $requiredDeparture = $effectiveArrival + $requiredWorkMinutes;

        /*
     * Do not count the same missing minutes as both late and early.
     * If arrival is after 09:00, the part after 06:00 is already covered by late.
     */
        $earlyCheckLimit = min($requiredDeparture, $departureWindowEnd);

        $earlyMinutes = 0;
        if ($effectiveDeparture < $earlyCheckLimit) {
            $earlyMinutes = $earlyCheckLimit - $effectiveDeparture;
        }

        $result['LATE'] = (string) max(0, $lateMinutes);
        $result['EARLY'] = (string) max(0, $earlyMinutes);

        /*
     * Keep overtime controlled.
     * Any punch after 06:00 PM is ignored because effective departure is capped at 06:00 PM.
     */
        if ($checkOutMinutes !== null) {
            $overtimeMinutes = $effectiveDeparture - $checkOutMinutes;

            $result['OVERTIME'] = ($isOvertimeAllowed && $overtimeMinutes > 0)
                ? $formatHours($overtimeMinutes, $weekdayCapHours)
                : '0';
        } else {
            $result['OVERTIME'] = '0';
        }

        return $result;
    }

    private function parse_overtime_cap_hours($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return null;
        }

        if (is_numeric($value)) {
            $hours = (float) $value;
            return $hours >= 0 ? $hours : null;
        }

        if (preg_match('/^(\d{1,2}):(\d{2})$/', $value, $matches)) {
            $hours = (int) $matches[1];
            $minutes = (int) $matches[2];

            if ($minutes > 59) {
                return null;
            }

            return $hours + ($minutes / 60);
        }

        return null;
    }

    private function normalize_minutes_by_shift_window($valueMinutes, $shiftStartMinutes, $shiftEndMinutes)
    {
        if ($valueMinutes === null) {
            return null;
        }

        if ($shiftStartMinutes === null || $shiftEndMinutes === null) {
            return $valueMinutes;
        }

        if ($shiftEndMinutes <= $shiftStartMinutes && $valueMinutes <= $shiftEndMinutes) {
            return $valueMinutes + 1440;
        }

        return $valueMinutes;
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

    private function normalize_nullable_string($value)
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
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
}
