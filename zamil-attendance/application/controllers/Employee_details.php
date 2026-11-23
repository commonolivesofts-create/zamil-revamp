<?php
defined('BASEPATH') or exit('No direct script access allowed');

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class Employee_details extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/employee_details/list',
            'title' => 'Zamil Payroll Management System - Employee Details',
            'heading' => 'Employee Details',
            'active-link' => 'employee_details',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/employee_details/list.js'],
            'data' => []
        ];
        $this->load->view('layout', $layoutConfig);
    }

    function list()
    {

        // Get the raw input data from the request
        $input = $this->input->raw_input_stream;

        // Decode the JSON data
        $data = json_decode($input, true); // Decode as associative array

        // Check if data is received
        if (!$data) {
            // Handle the error if no data is received
            $this->output
                ->set_status_header(400) // Set HTTP response status to 400 Bad Request
                ->set_content_type('application/json')
                ->set_output(json_encode(['message' => 'Invalid JSON input']))
                ->_display();
            exit;
        }

        // Access the parameters
        $limit = isset($data['limit']) ? $data['limit'] : 0;
        $currentPage = isset($data['currentPage']) ? $data['currentPage'] : 0;
        $filters = $this->normalizeEmployeeFilters(isset($data['filters']) ? $data['filters'] : []);
        $search = (isset($data['search']) && is_scalar($data['search']))
            ? trim((string) $data['search'])
            : '';

        $total_employee_details = $this->Employee_model->get_employee_details('total', $limit, $currentPage, $filters, $search);
        $employee_details = $this->Employee_model->get_employee_details('list', $limit, $currentPage, $filters, $search);

        $response = [
            'pagination' => [
                'total_records' => $total_employee_details,
                'total_pages' => generatePages($total_employee_details, $limit),
                'current_page' => $currentPage,
                'limit' => $limit
            ],
            'employee_details' => $employee_details,
        ];
        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }

    public function export_employee()
    {
        try {
            if (strtolower($this->input->method()) !== 'post') {
                show_error('Method Not Allowed', 405);
                return;
            }

            $fileType = $this->input->post('file_type', true) ?? 'csv';
            $filtersJson = $this->input->post('filters', true);
            $filters = !empty($filtersJson) ? json_decode($filtersJson, true) : [];
            $search = trim((string) ($this->input->post('search', true) ?? ''));

            $filters = $this->normalizeEmployeeFilters($filters);



            $data = $this->Employee_model->get_employee_details('list', 0, 1, $filters, $search);


            if (empty($data)) {
                show_error('No employee data found to export.', 404);
                return;
            }

            $filename = 'employee_data_' . date('Ymd_His');

            if ($fileType === 'csv') {
                $this->_export_csv($data, $filename . '.csv');
            } else {
                show_error('Only CSV export is enabled right now.', 400);
            }
        } catch (Exception $e) {
            show_error($e->getMessage(), 500);
        }
    }

    private function _export_csv($data, $filename)
    {
        if (empty($data)) {
            show_error('No data available for CSV export.', 404);
            return;
        }

        header('Content-Type: text/csv');
        header("Content-Disposition: attachment; filename=\"$filename\"");
        $output = fopen('php://output', 'w');

        fputcsv($output, array_keys((array) $data[0]));

        foreach ($data as $row) {
            fputcsv($output, (array) $row);
        }

        fclose($output);
        exit;
    }

    private function normalizeEmployeeFilters($filters)
    {
        if (!is_array($filters)) {
            return [];
        }

        $allowedKeys = [
            'full_name',
            'user_id',
            'employee_number',
            'email_address',
            'job_title',
            'department',
            'joining_date',
        ];

        $normalized = [];
        foreach ($allowedKeys as $key) {
            if (!array_key_exists($key, $filters)) {
                continue;
            }

            $value = $filters[$key];
            if (!is_scalar($value)) {
                continue;
            }

            $value = trim((string) $value);
            if ($value === '') {
                continue;
            }

            $normalized[$key] = $value;
        }

        return $normalized;
    }

    // private function _export_excel($data, $filename)
    // {
    //     if (empty($data)) {
    //         show_error('No data available for Excel export.', 404);
    //         return;
    //     }

    //     $spreadsheet = new Spreadsheet();
    //     $sheet = $spreadsheet->getActiveSheet();

    //     $headers = array_keys((array)$data[0]);
    //     $col = 'A';
    //     foreach ($headers as $header) {
    //         $sheet->setCellValue($col . '1', $header);
    //         $col++;
    //     }

    //     $rowNum = 2;
    //     foreach ($data as $row) {
    //         $col = 'A';
    //         foreach ((array)$row as $value) {
    //             $sheet->setCellValue($col . $rowNum, $value);
    //             $col++;
    //         }
    //         $rowNum++;
    //     }

    //     header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    //     header("Content-Disposition: attachment; filename=\"$filename\"");
    //     $writer = new Xlsx($spreadsheet);
    //     $writer->save('php://output');
    //     exit;
    // }
}
