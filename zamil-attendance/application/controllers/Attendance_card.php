<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Attendance_card extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Attendance_card_model', 'attendanceCardModel');
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/attendance_card/list',
            'title' => 'Zamil Payroll Management System - Attendance Card',
            'heading' => '',
            'active-link' => 'attendance_card',
            'css' => [],
            'scripts' => [
                'src' => 'assets/js/pages/attendance_card/list.js',
            ],
            'data' => [
                'departmentOptions' => $this->attendanceCardModel->get_departments(),
            ]
        ];

        $this->load->view('layout', $layoutConfig);
    }



     public function interface()
    {
        $layoutConfig = [
            'view' => 'pages/attendance_card/att_interface',
            'title' => 'Zamil Payroll Management System - Attendance Interface',
            'heading' => '',
            'active-link' => 'attendance_interface',
            'css' => [],
            'scripts' => [
                'src' => '',
            ],
            'data' => [
                'departmentOptions' => $this->attendanceCardModel->get_departments(),
            ]
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function list()
    {
        $data = json_decode($this->input->raw_input_stream, true);
        if (!is_array($data)) {
            return $this->output
                ->set_status_header(400)
                ->set_content_type('application/json')
                ->set_output(json_encode(['message' => 'Invalid JSON input']));
        }

        $limit = isset($data['limit']) ? (int) $data['limit'] : 0;
        $currentPage = isset($data['currentPage']) ? (int) $data['currentPage'] : 1;
        $filters = $this->normalizeFilters(isset($data['filters']) ? $data['filters'] : []);
        $search = (isset($data['search']) && is_scalar($data['search'])) ? trim((string) $data['search']) : '';

        $total = $this->attendanceCardModel->get_attendance_card_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->attendanceCardModel->get_attendance_card_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeRow($row);
        }

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode([
                'pagination' => [
                    'total_records' => $total,
                    'total_pages' => generatePages($total, $limit),
                    'current_page' => $currentPage,
                    'limit' => $limit
                ],
                'attendance_cards' => $serialized,
            ]));
    }

    public function export_attendance_card()
    {
        if (strtolower($this->input->method()) !== 'post') {
            show_error('Method Not Allowed', 405);
            return;
        }

        $fileType = $this->input->post('file_type', true) ?? 'csv';
        if ($fileType !== 'csv') {
            show_error('Only CSV export is enabled right now.', 400);
            return;
        }

        $filtersJson = $this->input->post('filters', true);
        $filters = !empty($filtersJson) ? json_decode($filtersJson, true) : [];
        $filters = $this->normalizeFilters($filters);
        $search = trim((string) ($this->input->post('search', true) ?? ''));

        $rows = $this->attendanceCardModel->get_attendance_card_list('list', 0, 1, $filters, $search);
        if (empty($rows)) {
            show_error('No attendance card data found to export.', 404);
            return;
        }

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeRow($row);
        }

        $filename = 'attendance_card_data_' . date('Ymd_His') . '.csv';
        header('Content-Type: text/csv');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");

        $output = fopen('php://output', 'w');
        fputcsv($output, ['Employee Number', 'Employee Name', 'Attendance Date', 'Punch In', 'Punch Out']);
        foreach ($serialized as $row) {
            fputcsv($output, [$row['emp_no'], $row['emp_name'], $row['att_date_display'], $row['punch_in_display'], $row['punch_out_display']]);
        }
        fclose($output);
        exit;
    }

    private function normalizeFilters($filters)
    {
        if (!is_array($filters)) {
            return [];
        }

        $normalized = [];
        foreach (['emp_no', 'emp_name', 'att_date'] as $key) {
            if (!array_key_exists($key, $filters) || !is_scalar($filters[$key])) {
                continue;
            }

            $value = trim((string) $filters[$key]);
            if ($value !== '') {
                $normalized[$key] = $value;
            }
        }

        return $normalized;
    }

    private function serializeRow($row)
    {
        $formatDate = function ($value, $format) {
            if (empty($value)) {
                return null;
            }

            $ts = strtotime(str_replace('.', ':', (string) $value));
            return $ts ? date($format, $ts) : null;
        };

        $formatTime = function ($value) use ($formatDate) {
            if ($value === null || $value === '') {
                return null;
            }

            $value = trim((string) $value);

            if (preg_match('/^\d{1,2}:\d{2}$/', $value)) {
                return $value;
            }

            if (preg_match('/^\d{3,4}$/', $value)) {
                $value = str_pad($value, 4, '0', STR_PAD_LEFT);
                return substr($value, 0, 2) . ':' . substr($value, 2, 2);
            }

            return $formatDate($value, 'H:i');
        };

        return [
            'emp_no' => isset($row['EMP_NO']) ? $row['EMP_NO'] : null,
            'emp_name' => isset($row['EMP_NAME']) ? $row['EMP_NAME'] : null,
            'att_date' => $formatDate(isset($row['ATT_DATE']) ? $row['ATT_DATE'] : null, 'Y-m-d'),
            'att_date_display' => $formatDate(isset($row['ATT_DATE']) ? $row['ATT_DATE'] : null, 'd M Y') ?: '-',
            'punch_in' => $formatTime(isset($row['PUNCH_IN']) ? $row['PUNCH_IN'] : null),
            'punch_out' => $formatTime(isset($row['PUNCH_OUT']) ? $row['PUNCH_OUT'] : null),
            'punch_in_display' => $formatTime(isset($row['PUNCH_IN']) ? $row['PUNCH_IN'] : null) ?: '-',
            'punch_out_display' => $formatTime(isset($row['PUNCH_OUT']) ? $row['PUNCH_OUT'] : null) ?: '-',
        ];
    }

    // GENERATE ATTENDANCE 
    public function get_employees_by_department()
    {
        if (!$this->input->is_ajax_request()) {
            show_404();
        }

        $department = trim((string) $this->input->get('department', true));

        if ($department === '') {
            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => false,
                    'message' => 'Department is required.',
                    'data' => []
                ]));
        }

        $employees = $this->attendanceCardModel->get_employees_by_department($department);

        return $this->output
            ->set_content_type('application/json')
            ->set_output(json_encode([
                'success' => true,
                'message' => 'Employee list fetched successfully.',
                'data' => $employees
            ]));
    }

    public function process_attendance()
    {
        if (!$this->input->is_ajax_request()) {
            show_404();
        }

        $payload = json_decode($this->input->raw_input_stream, true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $employeeNumber = isset($payload['employee_number']) ? trim((string) $payload['employee_number']) : '';
        $month = isset($payload['month']) ? trim((string) $payload['month']) : '';
        $year = isset($payload['year']) ? trim((string) $payload['year']) : '';

        $validationErrors = [];

        if ($employeeNumber === '') {
            $validationErrors[] = 'Employee is required.';
        }

        if ($month === '' || !ctype_digit($month) || (int) $month < 1 || (int) $month > 12) {
            $validationErrors[] = 'Valid month is required.';
        }

        if ($year === '' || !ctype_digit($year) || strlen($year) !== 4) {
            $validationErrors[] = 'Valid year is required.';
        }

        if (!empty($validationErrors)) {
            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => false,
                    'message' => implode(' ', $validationErrors),
                    'data' => []
                ]));
        }

        try {
            $result = $this->attendanceCardModel->process_attendance_sheet([
                'employee_number' => $employeeNumber,
                'month' => (int) $month,
                'year' => (int) $year,
            ]);

            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => true,
                    'message' => 'Attendance process completed.',
                    'data' => $result
                ]));
        } catch (Exception $e) {
            log_message('error', 'Attendance process failed: ' . $e->getMessage());

            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => false,
                    'message' => 'Attendance process failed.',
                    'data' => [
                        'error' => $e->getMessage()
                    ]
                ]));
        }
    }

       //-------------------------------Changes--------------------------------

    public function upload_attendance_file()
    {
        if (strtolower($this->input->method()) !== 'post') {
            return $this->jsonResponse(false, 'Method not allowed.', [], 405);
        }

        $mode = strtolower(trim((string)$this->input->post('mode', true)));
        if (!in_array($mode, ['preview', 'import'], true)) $mode = 'preview';

        if (empty($_FILES['attendance_file']['tmp_name']) || !is_uploaded_file($_FILES['attendance_file']['tmp_name'])) {
            return $this->jsonResponse(false, 'Please select an attendance CSV or XLSX file.', [], 422);
        }

        $file = $_FILES['attendance_file'];
        if (!empty($file['error'])) return $this->jsonResponse(false, 'File upload failed with error code ' . (int)$file['error'] . '.', [], 422);
        if ((int)$file['size'] > 10 * 1024 * 1024) return $this->jsonResponse(false, 'File size must not exceed 10 MB.', [], 422);

        try {
            $this->load->library('Attendance_file_reader');
            $rawRows = $this->attendance_file_reader->read($file['tmp_name'], $file['name']);
            $parsed = $this->convertAttendanceRows($rawRows);

            if ($mode === 'preview') {
                return $this->jsonResponse(true, 'Attendance file validated successfully.', [
                    'summary' => $parsed['summary'],
                    'rows' => array_slice($parsed['valid_rows'], 0, 100),
                    'errors' => array_slice($parsed['errors'], 0, 100),
                ]);
            }

            if (empty($parsed['valid_rows'])) return $this->jsonResponse(false, 'No valid attendance rows were found.', ['errors' => $parsed['errors']], 422);
            $result = $this->attendanceCardModel->import_attendance_card_rows($parsed['valid_rows']);
            $result['invalid_rows'] = count($parsed['errors']);
            $result['validation_errors'] = array_slice($parsed['errors'], 0, 100);

            return $this->jsonResponse(true, 'Attendance file imported successfully.', $result);
        } catch (Exception $e) {
            log_message('error', 'Attendance upload failed: ' . $e->getMessage());
            return $this->jsonResponse(false, $e->getMessage(), [], 422);
        }
    }

    private function convertAttendanceRows(array $rows)
    {
        if (empty($rows)) throw new Exception('The uploaded file is empty.');
        $headerIndex = null;
        $map = [];
        foreach ($rows as $i => $row) {
            $candidate = [];
            foreach ($row as $idx => $value) $candidate[$this->normalizeHeader($value)] = $idx;
            if (isset($candidate['employee id']) && isset($candidate['date']) && isset($candidate['first punch']) && isset($candidate['last punch'])) {
                $headerIndex = $i;
                $map = $candidate;
                break;
            }
        }
        if ($headerIndex === null) throw new Exception('Required columns not found. Expected: Employee ID, First Name, Date, First Punch and Last Punch.');

        $valid = [];
        $errors = [];
        $seen = [];
        for ($i = $headerIndex + 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            $excelRow = $i + 1;
            $empNo = trim((string)$this->cell($row, $map, 'employee id'));
            $fileName = trim((string)$this->cell($row, $map, 'first name'));
            $date = $this->normalizeAttendanceDate($this->cell($row, $map, 'date'));
            $punchIn = $this->normalizeAttendanceTime($this->cell($row, $map, 'first punch'));
            $punchOut = $this->normalizeAttendanceTime($this->cell($row, $map, 'last punch'));
            if ($empNo === '' && $date === null && $punchIn === null && $punchOut === null) continue;
            $rowErrors = [];
            if ($empNo === '') $rowErrors[] = 'Employee ID is empty';
            if ($date === null) $rowErrors[] = 'Invalid date';
            if ($punchIn === null) $rowErrors[] = 'Invalid First Punch';
            if ($punchOut === null) $rowErrors[] = 'Invalid Last Punch';
            $key = strtoupper($empNo) . '|' . $date;
            if (isset($seen[$key])) $rowErrors[] = 'Duplicate employee/date in uploaded file';
            if (!empty($rowErrors)) {
                $errors[] = ['row' => $excelRow, 'employee_id' => $empNo, 'errors' => implode(', ', $rowErrors)];
                continue;
            }
            $seen[$key] = true;
            $valid[] = ['EMP_NO' => $empNo, 'EMP_NAME' => $fileName, 'ATT_DATE' => $date, 'PUNCH_IN' => $punchIn, 'PUNCH_OUT' => $punchOut, 'SOURCE_ROW' => $excelRow];
        }
        return ['valid_rows' => $valid, 'errors' => $errors, 'summary' => ['total_data_rows' => max(0, count($rows) - $headerIndex - 1), 'valid_rows' => count($valid), 'invalid_rows' => count($errors)]];
    }

    private function cell(array $row, array $map, $name)
    {
        $idx = isset($map[$name]) ? $map[$name] : null;
        return $idx !== null && isset($row[$idx]) ? $row[$idx] : '';
    }
    private function normalizeHeader($value)
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', (string)$value))));
    }

    private function normalizeAttendanceDate($value)
    {
        if ($value === null || trim((string)$value) === '') return null;
        if (is_numeric($value) && (float)$value > 20000) return gmdate('Y-m-d', ((int)$value - 25569) * 86400);
        $value = trim((string)$value);
        foreach (['d/m/Y', 'd-m-Y', 'm/d/Y', 'Y-m-d', 'd M Y', 'd-M-Y'] as $format) {
            $date = DateTime::createFromFormat('!' . $format, $value);
            if ($date && $date->format($format) === $value) return $date->format('Y-m-d');
        }
        $ts = strtotime($value);
        return $ts ? date('Y-m-d', $ts) : null;
    }

    private function normalizeAttendanceTime($value)
    {
        if ($value === null || trim((string)$value) === '') return null;
        if (is_numeric($value)) {
            $fraction = (float)$value - floor((float)$value);
            $seconds = (int)round($fraction * 86400);
            return sprintf('%02d:%02d', floor($seconds / 3600) % 24, floor(($seconds % 3600) / 60));
        }
        $value = trim(str_replace('.', ':', (string)$value));
        foreach (['H:i:s', 'H:i', 'h:i:s A', 'h:i A', 'g:i A'] as $format) {
            $time = DateTime::createFromFormat('!' . $format, strtoupper($value));
            if ($time) return $time->format('H:i');
        }
        $ts = strtotime($value);
        return $ts ? date('H:i', $ts) : null;
    }

    private function jsonResponse($success, $message, array $data = [], $status = 200)
    {
        return $this->output->set_status_header($status)->set_content_type('application/json')->set_output(json_encode(['success' => (bool)$success, 'message' => $message, 'data' => $data]));
    }
}
