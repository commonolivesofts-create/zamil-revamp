<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Timesheet extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Timesheet_model', 'timesheetModel');
        $this->load->model('Timetable_model', 'timetableModel');
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/timesheet/list',
            'title' => 'Zamil Payroll Management System - Timesheet',
            'heading' => '',
            'active-link' => 'timesheet',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/timesheet/list.js'],
            'data' => [
                'shiftOptions' => $this->timetableModel->get_shift_options()
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

        $total = $this->timesheetModel->get_timesheet_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->timesheetModel->get_timesheet_list('list', $limit, $currentPage, $filters, $search);

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
                'timesheets' => $serialized,
            ]));
    }

    public function export_timesheet()
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

        $rows = $this->timesheetModel->get_timesheet_list('list', 0, 1, $filters, $search);
        if (empty($rows)) {
            show_error('No timesheet data found to export.', 404);
            return;
        }

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeRow($row);
        }

        $filename = 'timesheet_data_' . date('Ymd_His') . '.csv';
        header('Content-Type: text/csv');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");

        $output = fopen('php://output', 'w');
        fputcsv($output, [
            'Employee Number',
            'Employee Name',
            'Shift',
            'Attendance Date',
            'Check In',
            'Punch In',
            'Check Out',
            'Punch Out',
            'Total Minutes',
            'Early',
            'Late',
            'Overtime',
            'Absence',
        ]);

        foreach ($serialized as $row) {
            fputcsv($output, [
                $row['emp_no'],
                $row['emp_name'],
                $row['shift'],
                $row['att_date_display'],
                $row['check_in'],
                $row['punch_in'],
                $row['check_out'],
                $row['punch_out'],
                $row['total_minutes'],
                $row['early'],
                $row['late'],
                $row['overtime'],
                $row['absence'],
            ]);
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
        foreach (['emp_no', 'emp_name', 'shift', 'att_date', 'att_date_start', 'att_date_end'] as $key) {
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

        $clean = function ($value) {
            if ($value === null || $value === '') {
                return null;
            }

            return trim((string) $value);
        };

        return [
            'emp_no' => $clean(isset($row['EMP_NO']) ? $row['EMP_NO'] : null),
            'emp_name' => $clean(isset($row['EMP_NAME']) ? $row['EMP_NAME'] : null),
            'shift' => $clean(isset($row['SHIFT']) ? $row['SHIFT'] : null),
            'att_date' => $formatDate(isset($row['ATT_DATE']) ? $row['ATT_DATE'] : null, 'Y-m-d'),
            'att_date_display' => $formatDate(isset($row['ATT_DATE']) ? $row['ATT_DATE'] : null, 'd M Y') ?: '-',
            'check_in' => $clean(isset($row['CHECK_IN']) ? $row['CHECK_IN'] : null),
            'punch_in' => $clean(isset($row['PUNCH_IN']) ? $row['PUNCH_IN'] : null),
            'check_out' => $clean(isset($row['CHECK_OUT']) ? $row['CHECK_OUT'] : null),
            'punch_out' => $clean(isset($row['PUNCH_OUT']) ? $row['PUNCH_OUT'] : null),
            'total_minutes' => $clean(isset($row['TOTAL_MINUTES']) ? $row['TOTAL_MINUTES'] : null),
            'early' => $clean(isset($row['EARLY']) ? $row['EARLY'] : null),
            'late' => $clean(isset($row['LATE']) ? $row['LATE'] : null),
            'overtime' => $clean(isset($row['OVERTIME']) ? $row['OVERTIME'] : null),
            'absence' => $clean(isset($row['ABSENCE']) ? $row['ABSENCE'] : null),
            'tot_delay' => $clean(isset($row['TOT_DELAY']) ? $row['TOT_DELAY'] : null),
            'overtime_hrs' => $clean(isset($row['OVERTIME_HRS']) ? $row['OVERTIME_HRS'] : null),
        ];
    }
}
