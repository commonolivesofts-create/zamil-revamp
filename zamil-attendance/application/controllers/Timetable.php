<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Timetable extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Timetable_model', 'timetableModel');
        $this->load->model('Shift_model', 'shiftModel');
        $this->load->library(['form_validation', 'session']);
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/timetable/timetable-list',
            'title' => 'Zamil Payroll Management System - Timetable list',
            'heading' => '',
            'active-link' => '',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/timetable/list.js'],
            'data' => [
                'shiftOptions' => $this->timetableModel->get_shift_options()
            ]
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

        $limit = isset($data['limit']) ? (int) $data['limit'] : 0;
        $currentPage = isset($data['currentPage']) ? (int) $data['currentPage'] : 1;
        $filters = isset($data['filters']) && is_array($data['filters']) ? $data['filters'] : [];
        $search = (isset($data['search']) && is_scalar($data['search']))
            ? trim((string) $data['search'])
            : '';

        $totalTimetable = $this->timetableModel->get_timetable_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->timetableModel->get_timetable_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeTimetable($row);
        }

        $response = [
            'pagination' => [
                'total_records' => $totalTimetable,
                'total_pages' => generatePages($totalTimetable, $limit),
                'current_page' => $currentPage,
                'limit' => $limit
            ],
            'timetables' => $serialized,
        ];

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }

    public function export_timetable()
    {
        try {
            if (!$this->isPostRequest()) {
                show_error('Method Not Allowed', 405);
                return;
            }

            $fileType = $this->input->post('file_type', true) ?? 'csv';
            $filtersJson = $this->input->post('filters', true);
            $filters = !empty($filtersJson) ? json_decode($filtersJson, true) : [];
            $search = trim((string) ($this->input->post('search', true) ?? ''));

            if (!is_array($filters)) {
                $filters = [];
            }

            $rows = $this->timetableModel->get_timetable_list('list', 0, 1, $filters, $search);
            if (empty($rows)) {
                show_error('No timetable data found to export.', 404);
                return;
            }

            $serialized = [];
            foreach ($rows as $row) {
                $serialized[] = $this->serializeTimetable($row);
            }

            $filename = 'timetable_data_' . date('Ymd_His');

            if ($fileType === 'csv') {
                $this->_export_csv($serialized, $filename . '.csv');
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

    public function store()
    {
        $isAjax = $this->input->is_ajax_request();
        if (!$this->isPostRequest()) {
            if ($isAjax) {
                return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
            }
            show_error('Method Not Allowed', 405);
            return;
        }
        $this->applyValidationRules();
        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            if ($isAjax) {
                return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $this->getValidationErrors()], 422);
            }
            $this->session->set_flashdata('error', validation_errors(' ', ' '));
            $this->session->set_flashdata('open_add_modal', '1');
            redirect('timetable');
            return;
        }

        $sourceUuid = trim((string) $this->input->post('uuid', true));
        $result = $this->saveTimetableVersion($this->collectPayload(), $sourceUuid);

        if ($result['status']) {
            $created = $this->timetableModel->find_by_uuid($result['uuid']);
            $message = $sourceUuid !== '' ? 'Timetable updated successfully.' : 'Timetable added successfully.';
            if ($isAjax) {
                return $this->jsonResponse(true, $message, ['timetable' => $this->serializeTimetable($created)]);
            }
            $this->session->set_flashdata('success', $message);
        } else {
            $message = $result['message'];
            if ($isAjax) {
                return $this->jsonResponse(false, $message, [], $result['http_status']);
            }
            $this->session->set_flashdata('error', $message);
            $this->session->set_flashdata('open_add_modal', '1');
        }
        redirect('timetable');
    }
    public function edit($id)
    {
        $row = $this->timetableModel->find_by_uuid($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Timetable not found.', [], 404);
        }

        return $this->jsonResponse(true, 'Timetable fetched successfully.', [
            'timetable' => $this->serializeTimetable($row)
        ]);
    }

    public function update($id)
    {
        if (!$this->isPostRequest()) {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $this->applyValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            return $this->jsonResponse(
                false,
                $errors !== '' ? $errors : 'Validation failed.',
                ['errors' => $this->getValidationErrors()],
                422
            );
        }

        $result = $this->saveTimetableVersion($this->collectPayload(), $id);
        if ($result['status']) {
            $row = $this->timetableModel->find_by_uuid($result['uuid']);

            return $this->jsonResponse(true, 'Timetable updated successfully.', [
                'timetable' => $this->serializeTimetable($row)
            ]);
        }

        return $this->jsonResponse(false, $result['message'], [], $result['http_status']);
    }

    public function delete($id)
    {
        if (!$this->isPostRequest()) {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $row = ctype_digit((string) $id)
            ? $this->timetableModel->find_by_id((int) $id)
            : $this->timetableModel->find_by_uuid($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Timetable not found.', [], 404);
        }

        $deleted = ctype_digit((string) $id)
            ? $this->timetableModel->delete_timetable_by_id((int) $id)
            : $this->timetableModel->delete_timetable($id);
        if (!$deleted) {
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to delete timetable.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        return $this->jsonResponse(true, 'Timetable deleted successfully.', [
            'id' => isset($row['ID']) ? $row['ID'] : null,
            'uuid' => isset($row['UUID']) ? $row['UUID'] : $id,
        ]);
    }

    public function get_employee_by_number()
    {
        if (!$this->isPostRequest()) {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $empNoRaw = trim((string) $this->input->post('emp_no', true));
        if (!preg_match('/^\d+$/', $empNoRaw)) {
            return $this->jsonResponse(false, 'Employee Number must be numeric.', [], 422);
        }

        if (strlen($empNoRaw) < 3) {
            return $this->jsonResponse(false, 'Please enter at least 3 digits for Employee Number.', [], 422);
        }

        $employee = $this->timetableModel->find_employee_master_by_number($empNoRaw);
        if (empty($employee)) {
            return $this->jsonResponse(false, 'Employee not found for the provided Employee Number.', [], 404);
        }

        return $this->jsonResponse(true, 'Employee fetched successfully.', [
            'employee' => [
                'employee_number' => isset($employee['EMPLOYEE_NUMBER']) ? $employee['EMPLOYEE_NUMBER'] : null,
                'full_name' => isset($employee['FULL_NAME']) ? $employee['FULL_NAME'] : null,
                'email_address' => isset($employee['EMAIL_ADDRESS']) ? $employee['EMAIL_ADDRESS'] : null,
            ]
        ]);
    }

    private function applyValidationRules()
    {
        $this->form_validation->set_rules('emp_no', 'Employee Number', 'trim|required|callback_valid_emp_no');
        $this->form_validation->set_rules('emp_name', 'Employee Name', 'trim|required|max_length[150]');
        $this->form_validation->set_rules('shift_id', 'Shift', 'trim|required|callback_valid_shift_id');
        $this->form_validation->set_rules('start_date', 'Start Date', 'trim|required|callback_valid_date');
        $this->form_validation->set_rules('end_date', 'End Date', 'trim|callback_valid_date_optional|callback_valid_date_range');
        $this->form_validation->set_rules('status', 'Status', 'trim|required|max_length[10]|callback_valid_status');
    }

    private function collectPayload()
    {
        return [
            'emp_no' => $this->input->post('emp_no', true),
            'emp_name' => $this->input->post('emp_name', true),
            'shift_id' => $this->input->post('shift_id', true),
            'start_date' => $this->normalize_input_date($this->input->post('start_date', true)),
            'end_date' => $this->normalize_input_date($this->input->post('end_date', true)),
            'status' => $this->input->post('status', true),

            // 👇 NEW FIELDS
            'overtime_allowed' => $this->input->post('overtime_allowed', true) ?? 'N',
            'exclude_timesheet' => $this->input->post('exclude_timesheet', true) ?? 'N',
        ];
    }

    private function saveTimetableVersion($payload, $sourceUuid = null)
    {
        $sourceUuid = trim((string) $sourceUuid);

        if ($sourceUuid !== '') {
            $current = $this->timetableModel->find_by_uuid($sourceUuid);
            if (empty($current)) {
                return [
                    'status' => false,
                    'message' => 'Timetable not found.',
                    'uuid' => null,
                    'http_status' => 404,
                ];
            }
        }

        $payload['status'] = 'ACTIVE';

        $this->db->trans_begin();

        $deactivatedSource = $sourceUuid !== ''
            ? $this->timetableModel->deactivate_by_uuid($sourceUuid)
            : true;

        $deactivatedMatching = $this->timetableModel->deactivate_active_assignments(
            $payload['emp_no'],
            $payload['shift_id'],
            $sourceUuid !== '' ? $sourceUuid : null
        );

        $newUuid = ($deactivatedSource && $deactivatedMatching)
            ? $this->timetableModel->insert_timetable($payload)
            : false;

        if ($newUuid === false || $this->db->trans_status() === false) {
            $this->db->trans_rollback();
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to save timetable.';

            return [
                'status' => false,
                'message' => $message,
                'uuid' => null,
                'http_status' => 500,
            ];
        }

        $this->db->trans_commit();

        return [
            'status' => true,
            'message' => 'Timetable saved successfully.',
            'uuid' => $newUuid,
            'http_status' => 200,
        ];
    }

    public function valid_emp_no($value)
    {
        $value = trim((string) $value);
        if (!preg_match('/^\d+$/', $value) || (int) $value <= 0) {
            $this->form_validation->set_message('valid_emp_no', 'The {field} field must be a valid positive number.');
            return false;
        }
        return true;
    }

    public function valid_shift_id($value)
    {
        $value = trim((string) $value);
        if (!preg_match('/^\d+$/', $value) || (int) $value <= 0) {
            $this->form_validation->set_message('valid_shift_id', 'Please select a valid shift.');
            return false;
        }

        $shift = $this->shiftModel->find_by_id((int) $value);
        if (empty($shift)) {
            $this->form_validation->set_message('valid_shift_id', 'Selected shift does not exist.');
            return false;
        }

        return true;
    }

    public function valid_date($value)
    {
        if ($this->normalize_input_date($value) === null) {
            $this->form_validation->set_message('valid_date', 'The {field} field must be a valid date in DD/MM/YYYY format.');
            return false;
        }
        return true;
    }

    public function valid_date_optional($value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return true;
        }

        if ($this->normalize_input_date($value) === null) {
            $this->form_validation->set_message('valid_date_optional', 'The {field} field must be a valid date in DD/MM/YYYY format.');
            return false;
        }

        return true;
    }

    public function valid_date_range($endDate)
    {
        $startDate = $this->normalize_input_date($this->input->post('start_date', true));
        $endDate = $this->normalize_input_date($endDate);

        if ($startDate === null || $endDate === null) {
            return true;
        }

        if (strtotime($endDate) < strtotime($startDate)) {
            $this->form_validation->set_message('valid_date_range', 'End Date must be on or after Start Date.');
            return false;
        }

        return true;
    }

    public function valid_status($value)
    {
        $allowed = ['ACTIVE', 'INACTIVE'];
        if (!in_array((string) $value, $allowed, true)) {
            $this->form_validation->set_message('valid_status', 'The {field} field must be one of: ACTIVE, INACTIVE.');
            return false;
        }
        return true;
    }

    private function getValidationErrors()
    {
        return [
            'emp_no' => $this->clean_validation_message(form_error('emp_no', '', '')),
            'emp_name' => $this->clean_validation_message(form_error('emp_name', '', '')),
            'shift_id' => $this->clean_validation_message(form_error('shift_id', '', '')),
            'start_date' => $this->clean_validation_message(form_error('start_date', '', '')),
            'end_date' => $this->clean_validation_message(form_error('end_date', '', '')),
            'status' => $this->clean_validation_message(form_error('status', '', '')),
        ];
    }

    private function normalize_input_date($value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        if (preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $value)) {
            $date = DateTime::createFromFormat('d/m/Y', $value);
            return ($date && $date->format('d/m/Y') === $value) ? $date->format('Y-m-d') : null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            $date = DateTime::createFromFormat('Y-m-d', $value);
            return ($date && $date->format('Y-m-d') === $value) ? $value : null;
        }

        return null;
    }

    private function clean_validation_message($message)
    {
        return trim(strip_tags((string) $message));
    }

    private function serializeTimetable($row)
    {
        if (empty($row)) {
            return null;
        }

        $formatDate = function ($value, $format) {
            if (empty($value)) {
                return null;
            }
            $value = str_replace('.', ':', (string) $value);
            $ts = strtotime($value);
            return $ts ? date($format, $ts) : null;
        };

        return [
            'id' => $row['ID'],
            'uuid' => $row['UUID'],
            'emp_no' => $row['EMP_NO'],
            'emp_name' => $row['EMP_NAME'],
            'shift_id' => $row['SHIFT_ID'],
            'shift_name' => isset($row['SHIFT_NAME']) ? $row['SHIFT_NAME'] : null,
            'start_date' => $formatDate($row['START_DATE'], 'Y-m-d'),
            'end_date' => $formatDate($row['END_DATE'], 'Y-m-d'),
            'exclude_timesheet' => $row['EXCLUDE_TIMESHEET'],
            'overtime_alowed' => $row['OVERTIME_ALLOWED'],
            'status' => $row['STATUS'],
            'created_at' => $formatDate($row['CREATED_AT'], 'd M Y, h:i A'),
            'updated_at' => $formatDate($row['UPDATED_AT'], 'd M Y, h:i A'),
            'start_date_display' => $formatDate($row['START_DATE'], 'd M Y') ?: '-',
            'end_date_display' => $formatDate($row['END_DATE'], 'd M Y') ?: '-',
            'status_display' => !empty($row['STATUS']) ? $row['STATUS'] : '-',
            'shift_name_display' => !empty($row['SHIFT_NAME']) ? $row['SHIFT_NAME'] : '-',
        ];
    }

    private function isPostRequest()
    {
        $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : '';
        return $method === 'POST';
    }

    private function jsonResponse($status, $message, $data = [], $httpStatus = 200)
    {
        $tokenName = $this->security->get_csrf_token_name();
        $tokenHash = $this->security->get_csrf_hash();

        if (!$tokenHash) {
            $tokenHash = $this->input->cookie($tokenName, true);
        }

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
}
