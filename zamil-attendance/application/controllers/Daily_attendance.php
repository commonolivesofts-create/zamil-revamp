<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Daily_attendance extends MY_Controller
{
    public function __construct()
    {

        parent::__construct();
        // The model opens the EBS connection it needs; no second one here.
        $this->load->model('Daily_attendance_model', 'dailyAttendanceModel');
        $this->load->helper(['url', 'form']);
    }


    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/daily_attendance/index',
            'title' => 'Zamil Attendance - Daily Attendance',
            'heading' => '',
            'active-link' => 'daily-attendance',
            'css' => [
                ['href' => 'assets/css/daily-attendance.css'],
            ],
            'scripts' => [
                'src' => 'assets/js/pages/daily-attendance/list.js'
            ],
            'data' => []
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function list()
    {
        $input = $this->input->raw_input_stream;
        $data = json_decode($input, true);

        if (!is_array($data)) {
            return $this->output
                ->set_status_header(400)
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'message' => 'Invalid JSON input'
                ]));
        }

        $limit = isset($data['limit'])
            ? (int) $data['limit']
            : 10;

        $currentPage = isset($data['currentPage'])
            ? (int) $data['currentPage']
            : 1;

        $fromDate = $this->normalizeDate($data['from_date'] ?? '');
        $toDate   = $this->normalizeDate($data['to_date'] ?? '');

        // Default date range = today
        if (!$fromDate) {
            $fromDate = date('Y-m-d');
        }

        if (!$toDate) {
            $toDate = $fromDate;
        }

        if ($fromDate > $toDate) {
            return $this->output
                ->set_status_header(400)
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'message' => 'From date must be less than or equal to To date.'
                ]));
        }

        $filters = [
            'from_date' => $fromDate,
            'to_date'   => $toDate,
            'search'    => trim((string) ($data['search'] ?? '')),
            'status'    => strtolower(trim((string) ($data['status'] ?? '')))
        ];

        $totalRecords = $this->dailyAttendanceModel
            ->get_daily_attendance(
                'total',
                $filters
            );

        $rows = $this->dailyAttendanceModel
            ->get_daily_attendance(
                'list',
                $filters,
                $limit,
                $currentPage
            );

        return $this->output
            ->set_content_type('application/json')
            ->set_output(json_encode([
                'summary' => $this->dailyAttendanceModel->get_summary($filters),

                'pagination' => [
                    'total_records' => $totalRecords,
                    'total_pages'   => generatePages($totalRecords, $limit),
                    'current_page'  => $currentPage,
                    'limit'         => $limit
                ],

                'rows' => $rows
            ]));
    }

  
    public function export()
    {
        $fromDate = $this->normalizeDate(
            $this->input->get('from_date', true)
        );

        $toDate = $this->normalizeDate(
            $this->input->get('to_date', true)
        );

        // Default to today if dates are not provided
        if (!$fromDate) {
            $fromDate = date('Y-m-d');
        }

        if (!$toDate) {
            $toDate = $fromDate;
        }

        // Validate date range
        if ($fromDate > $toDate) {
            show_error('From date cannot be greater than To date.', 400);
            return;
        }

        $search = trim(
            (string) $this->input->get('search', true)
        );

        $filters = [
            'from_date' => $fromDate,
            'to_date'   => $toDate,
            'search'    => $search,
        ];

        $rows = $this->dailyAttendanceModel->get_daily_attendance('export', $filters);

        $filename =
            'daily_attendance_' .
            str_replace('-', '', $fromDate) .
            '_to_' .
            str_replace('-', '', $toDate) .
            '.csv';

        header('Content-Type: text/csv; charset=UTF-8');
        header(
            'Content-Disposition: attachment; filename="' .
                $filename .
                '"'
        );

        $output = fopen('php://output', 'w');

        // UTF-8 BOM
        fwrite($output, "\xEF\xBB\xBF");

        fputcsv($output, [
            'Employee ID',
            'First Name',
            'Date',
            'First Punch',
            'Last Punch',
           
        ]);

        foreach ($rows as $row) {

            fputcsv($output, [
                $row['EMP_NO'] ?? '',
                $row['EMP_NAME'] ?? '',
                $row['ATT_DATE_DISPLAY'] ?? '',
                $row['PUNCH_IN'] ?? '',
                $row['PUNCH_OUT'] ?? '',
                
            ]);
        }

        fclose($output);
        exit;
    }

    private function normalizeDate($value)
    {
        $value = trim((string) $value);
        $date = DateTime::createFromFormat('Y-m-d', $value);
        return $date && $date->format('Y-m-d') === $value ? $value : null;
    }
}
