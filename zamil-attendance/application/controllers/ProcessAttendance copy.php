<?php
defined('BASEPATH') or exit('No direct script access allowed');

class ProcessAttendance extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('ProcessAttendanceModel', 'processAttendanceModel');
        $this->load->helper(['url', 'form']);
        set_time_limit(0);
        ini_set('max_execution_time', 0);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/attendance_card/att_interface',
            'title' => 'Zamil Payroll Management System - Process Attendance',
            'heading' => '',
            'active-link' => 'process_attendance',
            'css' => [],
            'scripts' => [
                'src' => '',
            ],
            'data' => [
                'departmentOptions' => $this->processAttendanceModel->get_departments(),
            ],
        ];

        $this->load->view('layout', $layoutConfig);
    }

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
                    'data' => [],
                ]));
        }

        if (strtoupper($department) === 'ALL') {
            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => true,
                    'message' => 'ALL departments selected.',
                    'data' => [],
                ]));
        }

        $employees = $this->processAttendanceModel->get_employees_by_department($department);

        return $this->output
            ->set_content_type('application/json')
            ->set_output(json_encode([
                'success' => true,
                'message' => 'Employee list fetched successfully.',
                'data' => $employees,
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

        $department = isset($payload['department']) ? trim((string) $payload['department']) : '';
        $employeeNumber = isset($payload['employee_number']) ? trim((string) $payload['employee_number']) : '';
        $fromDate = isset($payload['from_date']) ? trim((string) $payload['from_date']) : '';
        $toDate = isset($payload['to_date']) ? trim((string) $payload['to_date']) : '';

        $validationErrors = [];

        if ($department === '') {
            $validationErrors[] = 'Department is required.';
        }

        if (!$this->is_valid_iso_date($fromDate)) {
            $validationErrors[] = 'Valid from date is required.';
        }

        if (!$this->is_valid_iso_date($toDate)) {
            $validationErrors[] = 'Valid to date is required.';
        }

        if ($this->is_valid_iso_date($fromDate) && $this->is_valid_iso_date($toDate) && $fromDate > $toDate) {
            $validationErrors[] = 'From date must be less than or equal to to date.';
        }

        if (strtoupper($department) === 'ALL') {
            $employeeNumber = 'ALL';
        } elseif ($employeeNumber === '') {
            $validationErrors[] = 'Employee is required.';
        }

        if (strtoupper($department) === 'ALL' && strtoupper($employeeNumber) !== 'ALL') {
            $validationErrors[] = 'When ALL departments is selected, employee must be ALL.';
        }

        if (!empty($validationErrors)) {
            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => false,
                    'message' => implode(' ', $validationErrors),
                    'data' => [],
                ]));
        }

        try {
            $result = $this->processAttendanceModel->process_attendance_range([
                'department' => $department,
                'employee_number' => $employeeNumber,
                'from_date' => $fromDate,
                'to_date' => $toDate,
            ]);

            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => true,
                    'message' => 'Attendance process completed.',
                    'data' => $result,
                ]));
        } catch (Exception $e) {
            log_message('error', 'Process attendance failed: ' . $e->getMessage());

            return $this->output
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => false,
                    'message' => 'Attendance process failed.',
                    'data' => [
                        'error' => $e->getMessage(),
                    ],
                ]));
        }
    }

    private function is_valid_iso_date($value)
    {
        if (!is_string($value) || trim($value) === '') {
            return false;
        }

        $date = DateTime::createFromFormat('Y-m-d', $value);

        return $date instanceof DateTime && $date->format('Y-m-d') === $value;
    }
}
