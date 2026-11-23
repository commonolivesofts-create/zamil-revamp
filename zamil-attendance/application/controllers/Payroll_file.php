<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Payroll_file extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Payroll_file_model', 'payrollFileModel');
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/payroll_file/list',
            'title' => 'Zamil Payroll Management System - Payroll File',
            'heading' => '',
            'active-link' => 'payroll_file',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/payroll_file/list.js'],
            'data' => []
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

        $total = $this->payrollFileModel->get_payroll_file_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->payrollFileModel->get_payroll_file_list('list', $limit, $currentPage, $filters, $search);
        
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
                'payroll_files' => $serialized,
            ]));
    }

    public function export_payroll_file()
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

        $rows = $this->payrollFileModel->get_payroll_file_list('list', 0, 1, $filters, $search);
        if (empty($rows)) {
            show_error('No payroll file data found to export.', 404);
            return;
        }

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeRow($row);
        }

        $filename = 'payroll_file_data_' . date('Ymd_His') . '.csv';
        header('Content-Type: text/csv');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");

        $output = fopen('php://output', 'w');
        fputcsv($output, ['Emp No', 'Emp Name', 'Late', 'Early', 'Total Delay', 'Overtime Hours', 'Absence WO']);

        foreach ($serialized as $row) {
            fputcsv($output, [
                $row['emp_no'],
                $row['emp_name'],
                $row['late'],
                $row['early'],
                $row['tot_delay'],
                $row['overtime_hrs'],
                $row['absence_wo'],
            ]);
        }

        fclose($output);
        exit;
    }

    public function save_adjustment()
    {
        if (!$this->input->is_ajax_request()) {
            show_404();
        }

        if (strtolower($this->input->method()) !== 'post') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $empNo = trim((string) $this->input->post('emp_no', true));
        $empName = trim((string) $this->input->post('emp_name', true));
        $fromDate = trim((string) $this->input->post('from_date', true));
        $toDate = trim((string) $this->input->post('to_date', true));
        $late = trim((string) $this->input->post('late', true));
        $early = trim((string) $this->input->post('early', true));
        $totDelay = trim((string) $this->input->post('tot_delay', true));
        $overtimeHrs = trim((string) $this->input->post('overtime_hrs', true));
        $absenceWo = trim((string) $this->input->post('absence_wo', true));

        $errors = [];

        if ($empNo === '') {
            $errors['emp_no'] = 'Employee Number is required.';
        }

        if (!$this->isValidDateFilter($fromDate)) {
            $errors['from_date'] = 'Valid From Date is required.';
        }

        if (!$this->isValidDateFilter($toDate)) {
            $errors['to_date'] = 'Valid To Date is required.';
        }

        if ($this->isValidDateFilter($fromDate) && $this->isValidDateFilter($toDate) && $fromDate > $toDate) {
            $errors['to_date'] = 'To Date must be on or after From Date.';
        }

        if (!$this->isValidEditableDecimal($late)) {
            $errors['late'] = 'Late must be a valid number.';
        }

        if (!$this->isValidEditableDecimal($early)) {
            $errors['early'] = 'Early must be a valid number.';
        }

        if (!$this->isValidEditableDecimal($totDelay)) {
            $errors['tot_delay'] = 'Total Delay must be a valid number.';
        }

        if (!$this->isValidEditableDecimal($overtimeHrs)) {
            $errors['overtime_hrs'] = 'Overtime Hours must be a valid number.';
        }

        if (!$this->isValidEditableInteger($absenceWo)) {
            $errors['absence_wo'] = 'Absence WO must be a whole number.';
        }

        if (!empty($errors)) {
            return $this->jsonResponse(false, 'Validation failed.', ['errors' => $errors], 422);
        }

        $saved = $this->payrollFileModel->save_payroll_adjustment([
            'emp_no' => $empNo,
            'emp_name' => $empName,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'late' => $late,
            'early' => $early,
            'tot_delay' => $totDelay,
            'overtime_hrs' => $overtimeHrs,
            'absence_wo' => $absenceWo,
        ]);

        if (!$saved) {
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to save payroll adjustment.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        return $this->jsonResponse(true, 'Payroll adjustment saved successfully.');
    }

    private function isValidEditableDecimal($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return false;
        }

        return (bool) preg_match('/^\d+(\.\d{1,2})?$/', $value);
    }

    private function isValidEditableInteger($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return false;
        }

        return (bool) preg_match('/^\d+$/', $value);
    }

    private function jsonResponse($status, $message, $data = [], $httpStatus = 200)
    {
        $tokenName = $this->security->get_csrf_token_name();
        $tokenHash = $this->security->get_csrf_hash();

        return $this->output
            ->set_status_header($httpStatus)
            ->set_content_type('application/json')
            ->set_output(json_encode([
                'status' => (bool) $status,
                'message' => $message,
                'data' => $data,
                'csrf' => [
                    'name' => $tokenName,
                    'hash' => $tokenHash
                ]
            ]));
    }

    private function normalizeFilters($filters)
    {
        if (!is_array($filters)) {
            return [];
        }

        $normalized = [];
        foreach (['emp_no', 'emp_name', 'from_date', 'to_date'] as $key) {
            if (!array_key_exists($key, $filters) || !is_scalar($filters[$key])) {
                continue;
            }

            $value = trim((string) $filters[$key]);
            if ($value !== '' && in_array($key, ['from_date', 'to_date'], true) && !$this->isValidDateFilter($value)) {
                continue;
            }

            if ($value !== '') {
                $normalized[$key] = $value;
            }
        }

        return $normalized;
    }

    private function isValidDateFilter($value)
    {
        $date = DateTime::createFromFormat('Y-m-d', $value);
        return $date instanceof DateTime && $date->format('Y-m-d') === $value;
    }

    private function serializeRow($row)
    {
        $clean = function ($value) {
            if ($value === null || $value === '') {
                return null;
            }

            return trim((string) $value);
        };

        return [
            'emp_no' => $clean(isset($row['EMP_NO']) ? $row['EMP_NO'] : null),
            'emp_name' => $clean(isset($row['EMP_NAME']) ? $row['EMP_NAME'] : null),
            'late' => $clean(isset($row['LATE']) ? $row['LATE'] : null),
            'early' => $clean(isset($row['EARLY']) ? $row['EARLY'] : null),
            'tot_delay' => $clean(isset($row['TOT_DELAY']) ? $row['TOT_DELAY'] : null),
            'overtime_hrs' => $clean(isset($row['OVERTIME_HRS']) ? $row['OVERTIME_HRS'] : null),
            'absence_wo' => $clean(isset($row['ABSENCE_WO']) ? $row['ABSENCE_WO'] : null),
        ];
    }
}
