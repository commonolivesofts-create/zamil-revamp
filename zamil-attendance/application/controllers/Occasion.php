<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Occasion extends MY_Controller
{
    private $currentOccasionId = null;

    public function __construct()
    {
        parent::__construct();
        $this->load->model('Occasion_model', 'occasionModel');
        $this->load->library(['form_validation', 'session']);
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {

        $shiftList = $this->occasionModel->getShiftList();

        $layoutConfig = [
            'view' => 'pages/occasion/occasions-list',
            'title' => 'Zamil Payroll Management System - Occasion List',
            'heading' => '',
            'active-link' => 'occasion',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/occasion/list.js'],
            'data' => [
                'shift_list' => $shiftList
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
                ->set_output(json_encode(['message' => 'Invalid JSON input']));
        }

        $limit = isset($data['limit']) ? (int) $data['limit'] : 0;
        $currentPage = isset($data['currentPage']) ? (int) $data['currentPage'] : 1;
        $filters = isset($data['filters']) && is_array($data['filters']) ? $data['filters'] : [];
        $search = (isset($data['search']) && is_scalar($data['search']))
            ? trim((string) $data['search'])
            : '';

        $totalOccasions = $this->occasionModel->get_occasion_list('total', $limit, $currentPage, $filters, $search);
        $occasionRows = $this->occasionModel->get_occasion_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($occasionRows as $row) {
            $serialized[] = $this->serializeOccasion($row);
        }

        $response = [
            'pagination' => [
                'total_records' => $totalOccasions,
                'total_pages' => generatePages($totalOccasions, $limit),
                'current_page' => $currentPage,
                'limit' => $limit
            ],
            'occasions' => $serialized,
        ];

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }

    public function export_occasion()
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

            $data = $this->occasionModel->get_occasion_list('list', 0, 1, $filters, $search);
            if (empty($data)) {
                show_error('No occasion data found to export.', 404);
                return;
            }

            $serialized = [];
            foreach ($data as $row) {
                $serialized[] = $this->serializeOccasion($row);
            }

            $filename = 'occasion_data_' . date('Ymd_His');

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
        $this->currentOccasionId = null;

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
            redirect('occasion');
            return;
        }

        $payload = $this->collectPayload();
        $savedId = $this->occasionModel->insertOccasion($payload);

        if ($savedId !== false) {
            $created = $this->occasionModel->getOccasionById($savedId);

            if ($isAjax) {
                return $this->jsonResponse(true, 'Occasion added successfully.', [
                    'occasion' => $this->serializeOccasion($created)
                ]);
            }

            $this->session->set_flashdata('success', 'Occasion added successfully.');
        } else {
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to add occasion.';

            if ($isAjax) {
                return $this->jsonResponse(false, $message, [], 500);
            }

            $this->session->set_flashdata('error', $message);
            $this->session->set_flashdata('open_add_modal', '1');
        }

        redirect('occasion');
    }

    public function view($id)
    {
        $row = $this->occasionModel->getOccasionById($id);

        if (empty($row)) {
            show_404();
            return;
        }

        $layoutConfig = [
            'view' => 'pages/occasion/view',
            'title' => 'Zamil Payroll Management System - View Occasion',
            'heading' => '',
            'active-link' => 'occasion',
            'css' => [],
            'scripts' => [],
            'data' => [
                'occasion' => $this->serializeOccasion($row),
                'flashError' => (string) $this->session->flashdata('error'),
                'flashSuccess' => (string) $this->session->flashdata('success'),
            ]
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function edit($id)
    {
        $row = $this->occasionModel->getOccasionById($id);

        if (empty($row)) {
            return $this->jsonResponse(false, 'Occasion not found.', [], 404);
        }

        return $this->jsonResponse(true, 'Occasion fetched successfully.', [
            'occasion' => $this->serializeOccasion($row)
        ]);
    }

    public function update($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $this->currentOccasionId = $id;
        $this->applyValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', [
                'errors' => $this->getValidationErrors()
            ], 422);
        }

        $updated = $this->occasionModel->updateOccasion($id, $this->collectPayload());

        if (!$updated) {
            $row = $this->occasionModel->getOccasionById($id);
            if (empty($row)) {
                return $this->jsonResponse(false, 'Occasion not found.', [], 404);
            }

            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to update occasion.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        $row = $this->occasionModel->getOccasionById($id);

        return $this->jsonResponse(true, 'Occasion updated successfully.', [
            'occasion' => $this->serializeOccasion($row)
        ]);
    }

    public function delete($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $row = $this->occasionModel->getOccasionById($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Occasion not found.', [], 404);
        }

        $deleted = $this->occasionModel->deleteOccasion($id);

        if (!$deleted) {
            $dbError = $this->db->error();
            $message = !empty($dbError['message']) ? $dbError['message'] : 'Failed to delete occasion.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        return $this->jsonResponse(true, 'Occasion deleted successfully.', [
            'occasion_id' => $id
        ]);
    }

    private function applyValidationRules()
    {
        $this->form_validation->set_rules('occasion_name', 'Occasion Name', 'trim|required|max_length[255]');
        $this->form_validation->set_rules('from_date', 'From Date', 'trim|required|callback_valid_date');
        $this->form_validation->set_rules('to_date', 'To Date', 'trim|required|callback_valid_date|callback_valid_date_range');
        $this->form_validation->set_rules('occasion_type', 'Occasion Type', 'trim|max_length[100]');
        $this->form_validation->set_rules('count_as_present', 'Count As Present', 'trim|required|callback_valid_yes_no');
        $this->form_validation->set_rules('paid_holiday', 'Paid Holiday', 'trim|required|callback_valid_yes_no');
        $this->form_validation->set_rules('is_active', 'Is Active', 'trim|required|callback_valid_yes_no');
        $this->form_validation->set_rules('remarks', 'Remarks', 'trim|max_length[500]');
    }

    private function collectPayload()
    {
        return [
            'OCCASION_NAME'    => trim((string) $this->input->post('occasion_name', true)),
            'FROM_DATE'        => $this->normalize_input_date($this->input->post('from_date', true)),
            'TO_DATE'          => $this->normalize_input_date($this->input->post('to_date', true)),
            'OCCASION_TYPE'    => trim((string) $this->input->post('occasion_type', true)),
            'SHIFT_ID'         => trim((string) $this->input->post('shift_id', true)),
            'COUNT_AS_PRESENT' => strtoupper(trim((string) $this->input->post('count_as_present', true))),
            'PAID_HOLIDAY'     => strtoupper(trim((string) $this->input->post('paid_holiday', true))),
            'IS_ACTIVE'        => strtoupper(trim((string) $this->input->post('is_active', true))),
            'REMARKS'          => trim((string) $this->input->post('remarks', true)),
            'CREATED_BY'       => $this->session->userdata('username') ?: $this->session->userdata('user_id') ?: 'SYSTEM',
            'UPDATED_BY'       => $this->session->userdata('username') ?: $this->session->userdata('user_id') ?: 'SYSTEM',
        ];
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

    public function valid_date_range($toDate)
    {
        $fromDate = $this->normalize_input_date($this->input->post('from_date', true));
        $toDate = $this->normalize_input_date($toDate);

        if ($fromDate === null || $toDate === null) {
            return true;
        }

        if (strtotime($toDate) < strtotime($fromDate)) {
            $this->form_validation->set_message('valid_date_range', 'To Date must be on or after From Date.');
            return false;
        }

        return true;
    }

    public function valid_yes_no($value)
    {
        $value = strtoupper(trim((string) $value));
        if (!in_array($value, ['Y', 'N'], true)) {
            $this->form_validation->set_message('valid_yes_no', 'The {field} field must be Y or N.');
            return false;
        }

        return true;
    }

    private function getValidationErrors()
    {
        return [
            'occasion_name'    => $this->clean_validation_message(form_error('occasion_name', '', '')),
            'from_date'        => $this->clean_validation_message(form_error('from_date', '', '')),
            'to_date'          => $this->clean_validation_message(form_error('to_date', '', '')),
            'occasion_type'    => $this->clean_validation_message(form_error('occasion_type', '', '')),
            'count_as_present' => $this->clean_validation_message(form_error('count_as_present', '', '')),
            'paid_holiday'     => $this->clean_validation_message(form_error('paid_holiday', '', '')),
            'is_active'        => $this->clean_validation_message(form_error('is_active', '', '')),
            'remarks'          => $this->clean_validation_message(form_error('remarks', '', '')),
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

    private function serializeOccasion($row)
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

        $yesNoDisplay = function ($value) {
            $value = strtoupper((string) $value);
            return $value === 'Y' ? 'Yes' : ($value === 'N' ? 'No' : '-');
        };

        return [
            'occasion_id'               => $row['OCCASION_ID'] ?? '',
            'occasion_name'             => $row['OCCASION_NAME'] ?? '',

            'from_date'                 => $formatDate($row['FROM_DATE'] ?? null, 'Y-m-d'),
            'to_date'                   => $formatDate($row['TO_DATE'] ?? null, 'Y-m-d'),

            // IMPORTANT FOR EDIT MODE
            // This value is saved in XX_DIGI_ATT_OCCASIONS table like: 1,2,3
            'shift_id'                  => $row['SHIFT_ID'] ?? '',

            // IMPORTANT FOR LIST DISPLAY
            // This comes from LISTAGG query as SHIFT_NAMES
            'shift_names'               => !empty($row['SHIFT_NAMES']) ? $row['SHIFT_NAMES'] : '-',

            'occasion_type'             => $row['OCCASION_TYPE'] ?? '',
            'count_as_present'          => $row['COUNT_AS_PRESENT'] ?? 'Y',
            'paid_holiday'              => $row['PAID_HOLIDAY'] ?? 'Y',
            'is_active'                 => $row['IS_ACTIVE'] ?? 'Y',
            'remarks'                   => $row['REMARKS'] ?? '',

            'created_by'                => $row['CREATED_BY'] ?? '',
            'created_at'                => $formatDate($row['CREATED_AT'] ?? null, 'd M Y, h:i A'),

            'updated_by'                => $row['UPDATED_BY'] ?? '',
            'updated_at'                => $formatDate($row['UPDATED_AT'] ?? null, 'd M Y, h:i A'),

            'from_date_display'         => $formatDate($row['FROM_DATE'] ?? null, 'd M Y') ?: '-',
            'to_date_display'           => $formatDate($row['TO_DATE'] ?? null, 'd M Y') ?: '-',

            'occasion_type_display'     => !empty($row['OCCASION_TYPE']) ? $row['OCCASION_TYPE'] : '-',

            'count_as_present_display'  => $yesNoDisplay($row['COUNT_AS_PRESENT'] ?? ''),
            'paid_holiday_display'      => $yesNoDisplay($row['PAID_HOLIDAY'] ?? ''),
            'is_active_display'         => $yesNoDisplay($row['IS_ACTIVE'] ?? ''),

            'remarks_display'           => !empty($row['REMARKS']) ? $row['REMARKS'] : '-',
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
