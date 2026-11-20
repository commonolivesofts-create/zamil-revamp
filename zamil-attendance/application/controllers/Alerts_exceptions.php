<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Alerts_exceptions extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();

        $this->load->model(
            'Alerts_exceptions_model',
            'alertsModel'
        );

        $this->load->helper([
            'url',
            'form'
        ]);
    }

    public function index()
    {
        $filters = $this->readFilters();

        if ($this->input->is_ajax_request()) {
            return $this->ajaxResponse($filters);
        }

        $currentPage = max(
            1,
            (int) $this->input->get('currentPage')
        );

        $limit = max(
            1,
            (int) $this->input->get('limit')
        );

        if ($limit <= 0) {
            $limit = 15;
        }

        $offset = ($currentPage - 1) * $limit;

        $totalRecords = $this->alertsModel
            ->count_rows($filters);

        $layoutConfig = [
            'view' =>
                'pages/alerts_exception/index',

            'title' =>
                'Zamil Attendance - Alerts & Exceptions',

            'heading' => '',

            'active-link' =>
                'alerts-exceptions',

            'css' => [
                [
                    'href' =>
                        'assets/css/alerts-exceptions.css'
                ],
            ],

            'scripts' => [
                [
                    'src' =>
                        'assets/js/pages/alerts_exception/list.js'
                ],
            ],

            'data' => [
                'filters' => $filters,

                'summary' =>
                    $this->alertsModel
                        ->get_summary($filters),

                'rows' =>
                    $this->alertsModel
                        ->get_rows(
                            $filters,
                            $limit,
                            $offset
                        ),

                'currentPage' => $currentPage,
                'limit' => $limit,
                'totalRecords' => $totalRecords,

                'departmentOptions' =>
                    $this->alertsModel
                        ->get_department_options(),

                'generatedAt' =>
                    date('d M Y, h:i A'),
            ],
        ];

        $this->load->view(
            'layout',
            $layoutConfig
        );
    }

    public function export()
    {
        $filters = $this->readFilters();

        $rows = $this->alertsModel
            ->get_rows(
                $filters,
                0,
                0
            );

        $filename =
            'attendance_exceptions_' .
            date('Ymd_His') .
            '.csv';

        header(
            'Content-Type: text/csv; charset=UTF-8'
        );

        header(
            'Content-Disposition: attachment; filename="' .
            $filename .
            '"'
        );

        $output = fopen(
            'php://output',
            'w'
        );

        fwrite(
            $output,
            "\xEF\xBB\xBF"
        );

        fputcsv($output, [
            'Exception Type',
            'Severity',
            'Employee Number',
            'Employee Name',
            'Department',
            'Shift',
            'Attendance Date',
            'Punch In',
            'Punch Out',
            'Overtime',
            'Absence',
            'Details'
        ]);

        foreach ($rows as $row) {
            fputcsv($output, [
                $row['EXCEPTION_LABEL'] ?? '',
                $row['SEVERITY'] ?? '',
                $row['EMP_NO'] ?? '',
                $row['EMP_NAME'] ?? '',
                $row['DEPARTMENT'] ?? '',
                $row['SHIFT'] ?? '',
                $row['ATT_DATE_DISPLAY'] ?? '',
                $row['PUNCH_IN'] ?? '',
                $row['PUNCH_OUT'] ?? '',
                $row['OVERTIME'] ?? '',
                $row['ABSENCE'] ?? '',
                $row['DETAILS'] ?? '',
            ]);
        }

        fclose($output);
        exit;
    }

    private function ajaxResponse(
        array $filters
    ) {
        $page = max(
            1,
            (int) $this->input->get('currentPage')
        );

        $limit = max(
            1,
            (int) $this->input->get('limit')
        );

        if ($limit <= 0) {
            $limit = 15;
        }

        $offset = ($page - 1) * $limit;

        $summary = $this->alertsModel
            ->get_summary($filters);

        $rows = $this->alertsModel
            ->get_rows(
                $filters,
                $limit,
                $offset
            );

        $totalRecords = $this->alertsModel
            ->count_rows($filters);

        $totalPages = $totalRecords > 0
            ? (int) ceil(
                $totalRecords / $limit
            )
            : 1;

        $html = $this->load->view(
            'pages/alerts_exception/_results',
            [
                'rows' => $rows,
                'filters' => $filters,
                'currentPage' => $page,
                'limit' => $limit
            ],
            true
        );

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode([
                'status' => 'success',

                'summary' => $summary,

                'html' => $html,

                'count' => count($rows),

                'generated_at' =>
                    date('d M Y, h:i A'),

                'pagination' => [
                    'total_records' =>
                        $totalRecords,

                    'total_pages' =>
                        $totalPages,

                    'current_page' =>
                        $page,

                    'limit' =>
                        $limit
                ]
            ]));
    }

    private function readFilters()
    {
        $fromDate = $this->normalizeDate(
            $this->input->get(
                'from_date',
                true
            )
        );

        $toDate = $this->normalizeDate(
            $this->input->get(
                'to_date',
                true
            )
        );

        if (!$fromDate) {
            $fromDate = date('Y-m-01');
        }

        if (!$toDate) {
            $toDate = date('Y-m-d');
        }

        if ($fromDate > $toDate) {
            [$fromDate, $toDate] = [
                $toDate,
                $fromDate
            ];
        }

        $allowedTypes = [
            'missing_punch',
            'same_punch',
            'missing_shift',
            'missing_occasion',
            'high_overtime',
            'missing_timetable'
        ];

        $allowedSeverities = [
            'high',
            'medium',
            'low'
        ];

        $type = strtolower(
            trim(
                (string) $this->input->get(
                    'type',
                    true
                )
            )
        );

        $severity = strtolower(
            trim(
                (string) $this->input->get(
                    'severity',
                    true
                )
            )
        );

        $overtimeThreshold = (int) (
            $this->input->get(
                'overtime_threshold',
                true
            ) ?: 120
        );

        return [
            'from_date' => $fromDate,
            'to_date' => $toDate,

            'type' => in_array(
                $type,
                $allowedTypes,
                true
            )
                ? $type
                : '',

            'severity' => in_array(
                $severity,
                $allowedSeverities,
                true
            )
                ? $severity
                : '',

            'department' => trim(
                (string) $this->input->get(
                    'department',
                    true
                )
            ),

            'search' => trim(
                (string) $this->input->get(
                    'search',
                    true
                )
            ),

            'overtime_threshold' =>
                max(
                    0,
                    $overtimeThreshold
                ),
        ];
    }

    private function normalizeDate($value)
    {
        $value = trim(
            (string) $value
        );

        $date = DateTime::createFromFormat(
            'Y-m-d',
            $value
        );

        return $date &&
            $date->format('Y-m-d') === $value
                ? $value
                : null;
    }
}