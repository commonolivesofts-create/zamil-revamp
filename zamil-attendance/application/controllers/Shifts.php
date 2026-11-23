<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Shifts extends MY_Controller
{
    private $currentShiftUuid = null;

    public function __construct()
    {
        parent::__construct();
        $this->load->model('Shift_model', 'shiftModel');
        $this->load->model('Shift_detail_model', 'shiftDetailModel');
        $this->load->library(['form_validation', 'session']);
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/shifts/shifts-list',
            'title' => 'Zamil Payroll Management System - Shift list',
            'heading' => '',
            'active-link' => '',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/shifts/list.js'],
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
                ->set_output(json_encode(['message' => 'Invalid JSON input']));
        }

        $limit = isset($data['limit']) ? (int) $data['limit'] : 0;
        $currentPage = isset($data['currentPage']) ? (int) $data['currentPage'] : 1;
        $filters = isset($data['filters']) && is_array($data['filters']) ? $data['filters'] : [];
        $search = (isset($data['search']) && is_scalar($data['search']))
            ? trim((string) $data['search'])
            : '';

        $totalShifts = $this->shiftModel->get_shift_list('total', $limit, $currentPage, $filters, $search);
        $shiftRows = $this->shiftModel->get_shift_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($shiftRows as $row) {
            $serialized[] = $this->serializeShift($row);
        }

        $response = [
            'pagination' => [
                'total_records' => $totalShifts,
                'total_pages' => generatePages($totalShifts, $limit),
                'current_page' => $currentPage,
                'limit' => $limit
            ],
            'shifts' => $serialized,
        ];

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }

    public function export_shift()
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

            if (!is_array($filters)) {
                $filters = [];
            }

            $data = $this->shiftModel->get_shift_list('list', 0, 1, $filters, $search);
            if (empty($data)) {
                show_error('No shift data found to export.', 404);
                return;
            }

            $serialized = [];
            foreach ($data as $row) {
                $serialized[] = $this->serializeShift($row);
            }

            $filename = 'shift_data_' . date('Ymd_His');

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

    public function create()
    {
    }

    public function store()
    {
        $isAjax = $this->input->is_ajax_request();
        $this->currentShiftUuid = null;

        if (strtoupper($this->input->method()) !== 'POST') {
            if ($isAjax) {
                return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
            }
            show_error('Method Not Allowed', 405);
        }

        $this->applyValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            $fieldErrors = $this->getValidationErrors();
            if ($isAjax) {
                return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $fieldErrors], 422);
            }
            $this->session->set_flashdata('error', validation_errors(' ', ' '));
            $this->session->set_flashdata('open_add_modal', '1');
            redirect('shifts');
            return;
        }

        $payload = $this->collectPayload();

        $savedUuid = $this->shiftModel->insert_shift($payload);

        if ($savedUuid !== false) {
            $created = $this->shiftModel->find_by_uuid($savedUuid);
            if ($isAjax) {
                return $this->jsonResponse(true, 'Shift added successfully.', ['shift' => $this->serializeShift($created)]);
            }
            $this->session->set_flashdata('success', 'Shift added successfully.');
        } else {
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to add shift.';
            if ($isAjax) {
                return $this->jsonResponse(false, $message, [], 500);
            }
            $this->session->set_flashdata('error', $message);
            $this->session->set_flashdata('open_add_modal', '1');
        }

        redirect('shifts');
    }

    public function view($id)
    {
        $row = $this->shiftModel->find_by_uuid($id);

        if (empty($row)) {
            show_404();
            return;
        }

        $detailBundle = $this->shiftDetailModel->get_shift_detail_bundle($id);
        $detailRows = isset($detailBundle['rows']) && is_array($detailBundle['rows'])
            ? $detailBundle['rows']
            : [];
        $oldRows = $this->session->flashdata('shift_detail_old_rows');
        $formErrors = $this->session->flashdata('shift_detail_form_errors');
        $flashError = $this->session->flashdata('error');
        $flashSuccess = $this->session->flashdata('success');

        if (is_array($oldRows) && !empty($oldRows)) {
            $detailRows = $oldRows;
        }

        $layoutConfig = [
            'view' => 'pages/shifts/view',
            'title' => 'Zamil Payroll Management System - View Shift',
            'heading' => '',
            'active-link' => '',
            'css' => [],
            'scripts' => [],
            'data' => [
                'shift' => $this->serializeShift($row),
                'detailRows' => $detailRows,
                'formErrors' => is_array($formErrors) ? $formErrors : [],
                'flashError' => is_string($flashError) ? $flashError : '',
                'flashSuccess' => is_string($flashSuccess) ? $flashSuccess : '',
            ]
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function edit($id)
    {
        $row = $this->shiftModel->find_by_uuid($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Shift not found.', [], 404);
        }

        return $this->jsonResponse(true, 'Shift fetched successfully.', ['shift' => $this->serializeShift($row)]);
    }

    public function update($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $this->currentShiftUuid = $id;
        $this->applyValidationRules();
        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $this->getValidationErrors()], 422);
        }

        $result = $this->shiftModel->update_shift($id, $this->collectPayload());
        if ($result['status'] === false) {
            if ($result['message'] === 'Shift not found.') {
                return $this->jsonResponse(false, $result['message'], [], 404);
            }
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : $result['message'];
            return $this->jsonResponse(false, $message, [], 500);
        }

        $row = $this->shiftModel->find_by_uuid($id);
        return $this->jsonResponse(true, $result['message'], [
            'shift' => $this->serializeShift($row),
            'changed' => $result['changed']
        ]);
    }

    public function delete($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $row = $this->shiftModel->find_by_uuid($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Shift not found.', [], 404);
        }

        $deleted = $this->shiftModel->delete_shift($id);
        if (!$deleted) {
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to delete shift.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        return $this->jsonResponse(true, 'Shift deleted successfully.', [
            'uuid' => $id
        ]);
    }

    private function applyValidationRules()
    {
        $this->form_validation->set_rules('shift_name', 'Shift Name', 'trim|required|max_length[100]|callback_unique_shift_name');
        $this->form_validation->set_rules('start_date', 'Start Date', 'trim|required|callback_valid_date');
        $this->form_validation->set_rules('end_date', 'End Date', 'trim|required|callback_valid_date|callback_valid_date_range');
        $this->form_validation->set_rules('status', 'Status', 'trim|required|max_length[50]|callback_valid_status');
        $this->form_validation->set_rules('check_in', 'Check In', 'trim|required');
        $this->form_validation->set_rules('check_out', 'Check Out', 'trim|required');
    }

    private function collectPayload()
    {
        return [
            'shift_name' => $this->input->post('shift_name', true),
            'start_date' => $this->normalize_input_date($this->input->post('start_date', true)),
            'end_date' => $this->normalize_input_date($this->input->post('end_date', true)),
            'status' => $this->input->post('status', true),
            'check_in' => $this->input->post('check_in', true),
            'check_out' => $this->input->post('check_out', true),
            'weekday_ovrtm_cap' => $this->input->post('weekday_ovrtm_cap', true),
            'weekend_ovrtm_cap' => $this->input->post('weekend_ovrtm_cap', true)
        ];
    }

    public function valid_time($value)
    {
        $value = trim((string) $value);
        if ($value === '') {
            return true;
        }

        $isValid = (bool) preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value);
        if (!$isValid) {
            $this->form_validation->set_message('valid_time', 'The {field} field must be in HH:MM format.');
        }

        return $isValid;
    }

    public function valid_date($value)
    {
        $value = trim((string) $value);
        $isValid = $this->normalize_input_date($value) !== null;
        if (!$isValid) {
            $this->form_validation->set_message('valid_date', 'The {field} field must be a valid date in DD/MM/YYYY format.');
        }
        return $isValid;
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

    public function valid_time_range($checkOut)
    {
        $checkIn = trim((string) $this->input->post('check_in', true));
        $checkOut = trim((string) $checkOut);

        if ($checkIn === '' || $checkOut === '') {
            return true;
        }

        if (strtotime('1970-01-01 ' . $checkOut) <= strtotime('1970-01-01 ' . $checkIn)) {
            $this->form_validation->set_message('valid_time_range', 'Check Out must be later than Check In.');
            return false;
        }

        return true;
    }

    public function unique_shift_name($value)
    {
        $shiftName = trim((string) $value);
        if ($shiftName === '') {
            return true;
        }

        $exists = $this->shiftModel->shift_name_exists($shiftName, $this->currentShiftUuid);
        if ($exists) {
            $this->form_validation->set_message('unique_shift_name', 'The {field} already exists. Please use a unique value.');
            return false;
        }

        return true;
    }

    private function getValidationErrors()
    {
        return [
            'shift_name' => $this->clean_validation_message(form_error('shift_name', '', '')),
            'start_date' => $this->clean_validation_message(form_error('start_date', '', '')),
            'end_date' => $this->clean_validation_message(form_error('end_date', '', '')),
            'status' => $this->clean_validation_message(form_error('status', '', '')),
            'check_in' => $this->clean_validation_message(form_error('check_in', '', '')),
            'check_out' => $this->clean_validation_message(form_error('check_out', '', '')),
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

    private function serializeShift($row)
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
            'shift_name' => $row['SHIFT_NAME'],
            'start_date' => $formatDate($row['START_DATE'], 'Y-m-d'),
            'end_date' => $formatDate($row['END_DATE'], 'Y-m-d'),
            'status' => $row['STATUS'],
            'check_in' => $formatDate($row['CHECK_IN'], 'H:i'),
            'check_out' => $formatDate($row['CHECK_OUT'], 'H:i'),
            'created_at' => $formatDate($row['CREATED_AT'], 'd M Y, h:i A'),
            'updated_at' => $formatDate($row['UPDATED_AT'], 'd M Y, h:i A'),
            'start_date_display' => $formatDate($row['START_DATE'], 'd M Y') ?: '-',
            'end_date_display' => $formatDate($row['END_DATE'], 'd M Y') ?: '-',
            'status_display' => !empty($row['STATUS']) ? $row['STATUS'] : '-',
            'check_in_display' => $formatDate($row['CHECK_IN'], 'H:i') ?: '-',
            'check_out_display' => $formatDate($row['CHECK_OUT'], 'H:i') ?: '-',
            'weekday_ovrtm_cap' => isset($row['WEEKDAY_OVRTM_CAP']) ? $row['WEEKDAY_OVRTM_CAP'] : null,
            'weekend_ovrtm_cap' => isset($row['WEEKEND_OVRTM_CAP']) ? $row['WEEKEND_OVRTM_CAP'] : null,
            'weekday_ovrtm_cap_display' => !empty($row['WEEKDAY_OVRTM_CAP']) ? $row['WEEKDAY_OVRTM_CAP'] : '-',
            'weekend_ovrtm_cap_display' => !empty($row['WEEKEND_OVRTM_CAP']) ? $row['WEEKEND_OVRTM_CAP'] : '-',
        ];
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
}
