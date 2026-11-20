<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Shift_details extends MY_Controller
{
    private $weekdays = [
        1 => 'Sunday',
        2 => 'Monday',
        3 => 'Tuesday',
        4 => 'Wednesday',
        5 => 'Thursday',
        6 => 'Friday',
        7 => 'Saturday',
    ];

    public function __construct()
    {
        parent::__construct();
        $this->load->model('Shift_detail_model', 'shiftDetailModel');
        $this->load->library(['session']);
        $this->load->helper(['url', 'form']);
    }

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/shift_details/list',
            'title' => 'Zamil Payroll Management System - Sub Shifts',
            'heading' => '',
            'active-link' => 'shift-details',
            'css' => [],
            'scripts' => [
                'src' => 'assets/js/pages/shift_details/list.js',
            ],
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
                ->set_output(json_encode([
                    'status' => false,
                    'message' => 'Invalid JSON input.',
                    'rows' => []
                ]));
        }

        $limit = isset($data['limit']) ? (int) $data['limit'] : 20;
        $currentPage = isset($data['currentPage']) ? (int) $data['currentPage'] : 1;
        $filters = isset($data['filters']) && is_array($data['filters']) ? $data['filters'] : [];
        $search = isset($data['search']) && is_scalar($data['search']) ? trim((string) $data['search']) : '';

        $filters = $this->normalizeFilters($filters);

        $total = $this->shiftDetailModel->get_shift_details_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->shiftDetailModel->get_shift_details_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeListRow($row);
        }

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode([
                'status' => true,
                'pagination' => [
                    'total_records' => $total,
                    'total_pages' => generatePages($total, $limit),
                    'current_page' => $currentPage,
                    'limit' => $limit
                ],
                'rows' => $serialized,
            ]));
    }

    public function create()
    {
        $selectedShiftUuid = trim((string) $this->input->get('shift_uuid', true));
        $bundle = [];
        $pageError = '';

        if ($selectedShiftUuid !== '') {
            $bundle = $this->shiftDetailModel->get_shift_detail_bundle($selectedShiftUuid);
            if (empty($bundle['shift'])) {
                $pageError = 'Selected shift not found.';
                $bundle = [];
            }
        }

        $oldRows = $this->session->flashdata('shift_detail_old_rows');
        $formErrors = $this->session->flashdata('shift_detail_form_errors');
        $flashError = $this->session->flashdata('error');
        $flashSuccess = $this->session->flashdata('success');

        if (!empty($oldRows) && !empty($bundle['shift'])) {
            $bundle['rows'] = $this->mergeRowsWithDefault($oldRows);
        }

        $layoutConfig = [
            'view' => 'pages/shift_details/form',
            'title' => 'Zamil Payroll Management System - Manage Sub Shifts',
            'heading' => '',
            'active-link' => 'shift-details',
            'css' => [],
            'scripts' => [
                'src' => 'assets/js/pages/shift_details/form.js',
            ],
            'data' => [
                'shiftOptions' => $this->shiftDetailModel->get_shift_options(),
                'selectedShiftUuid' => $selectedShiftUuid,
                'detailBundle' => $bundle,
                'defaultRows' => $this->getDefaultRows(),
                'formErrors' => is_array($formErrors) ? $formErrors : [],
                'pageError' => $pageError,
                'flashError' => $flashError,
                'flashSuccess' => $flashSuccess,
            ]
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function save()
    {
        $isAjax = $this->input->is_ajax_request();
        $returnUrl = $this->resolveReturnUrl(
            trim((string) $this->input->post('return_url', true)),
            trim((string) $this->input->post('shift_uuid', true))
        );

        if (strtoupper($this->input->method()) !== 'POST') {
            if ($isAjax) {
                return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
            }

            show_error('Method Not Allowed', 405);
            return;
        }

        $shiftUuid = trim((string) $this->input->post('shift_uuid', true));
        $postedRows = $this->input->post('rows');
        $rows = $this->normalizePostedRows($postedRows);

        $validation = $this->validatePayload($shiftUuid, $rows);

        if ($validation['status'] === false) {
            if ($isAjax) {
                return $this->jsonResponse(false, $validation['message'], [
                    'errors' => $validation['errors']
                ], 422);
            }

            $this->session->set_flashdata('error', $validation['message']);
            $this->session->set_flashdata('shift_detail_form_errors', $validation['errors']);
            $this->session->set_flashdata('shift_detail_old_rows', $rows);

            redirect($returnUrl);
            return;
        }

        $result = $this->shiftDetailModel->save_shift_details($shiftUuid, $rows);

        if ($result['status'] === false) {
            if ($isAjax) {
                return $this->jsonResponse(false, $result['message'], [], 500);
            }

            $this->session->set_flashdata('error', $result['message']);
            $this->session->set_flashdata('shift_detail_old_rows', $rows);
            redirect($returnUrl);
            return;
        }

        if ($isAjax) {
            $bundle = $this->shiftDetailModel->get_shift_detail_bundle($shiftUuid);

            return $this->jsonResponse(true, $result['message'], [
                'bundle' => $bundle
            ]);
        }

        $this->session->set_flashdata('success', $result['message']);
        redirect($returnUrl);
    }

    private function normalizeFilters($filters)
    {
        return [
            'shift_name' => isset($filters['shift_name']) ? trim((string) $filters['shift_name']) : '',
            'status' => isset($filters['status']) ? trim((string) $filters['status']) : '',
        ];
    }

    private function getDefaultRows()
    {
        $rows = [];
        foreach ($this->weekdays as $dayNo => $weekdayName) {
            $rows[] = [
                'day_no' => $dayNo,
                'weekday_name' => $weekdayName,
                'punch_in' => '',
                'punch_out' => '',
                'gross_time' => '',
            ];
        }

        return $rows;
    }

    private function mergeRowsWithDefault($rows)
    {
        $indexed = [];
        if (is_array($rows)) {
            foreach ($rows as $row) {
                $dayNo = isset($row['day_no']) ? (int) $row['day_no'] : 0;
                if ($dayNo >= 1 && $dayNo <= 7) {
                    $indexed[$dayNo] = [
                        'day_no' => $dayNo,
                        'weekday_name' => isset($row['weekday_name']) ? trim((string) $row['weekday_name']) : ($this->weekdays[$dayNo] ?? ''),
                        'punch_in' => isset($row['punch_in']) ? trim((string) $row['punch_in']) : '',
                        'punch_out' => isset($row['punch_out']) ? trim((string) $row['punch_out']) : '',
                        'gross_time' => isset($row['gross_time']) ? trim((string) $row['gross_time']) : '',
                    ];
                }
            }
        }

        $merged = [];
        foreach ($this->weekdays as $dayNo => $weekdayName) {
            $merged[] = isset($indexed[$dayNo]) ? $indexed[$dayNo] : [
                'day_no' => $dayNo,
                'weekday_name' => $weekdayName,
                'punch_in' => '',
                'punch_out' => '',
                'gross_time' => '',
            ];
        }

        return $merged;
    }

    private function normalizePostedRows($postedRows)
    {
        $normalized = [];

        foreach ($this->weekdays as $dayNo => $weekdayName) {
            $row = (is_array($postedRows) && isset($postedRows[$dayNo]) && is_array($postedRows[$dayNo]))
                ? $postedRows[$dayNo]
                : [];

            $normalized[] = [
                'day_no' => $dayNo,
                'weekday_name' => $weekdayName,
                'punch_in' => isset($row['punch_in']) ? trim((string) $row['punch_in']) : '',
                'punch_out' => isset($row['punch_out']) ? trim((string) $row['punch_out']) : '',
                'gross_time' => isset($row['gross_time']) ? trim((string) $row['gross_time']) : '',
            ];
        }

        return $normalized;
    }

    private function validatePayload($shiftUuid, $rows)
    {
        $errors = [
            'shift_uuid' => '',
            'rows' => []
        ];

        if ($shiftUuid === '') {
            $errors['shift_uuid'] = 'Please select a shift.';
        } else {
            $shift = $this->shiftDetailModel->find_shift_header_by_uuid($shiftUuid);
            if (empty($shift)) {
                $errors['shift_uuid'] = 'Selected shift was not found.';
            }
        }

        if (!is_array($rows) || count($rows) !== 7) {
            return [
                'status' => false,
                'message' => 'Invalid shift detail rows.',
                'errors' => $errors
            ];
        }

        foreach ($rows as $row) {
            $dayNo = isset($row['day_no']) ? (int) $row['day_no'] : 0;
            $punchIn = isset($row['punch_in']) ? trim((string) $row['punch_in']) : '';
            $punchOut = isset($row['punch_out']) ? trim((string) $row['punch_out']) : '';
            $grossTime = isset($row['gross_time']) ? trim((string) $row['gross_time']) : '';

            $rowErrors = [
                'punch_in' => '',
                'punch_out' => '',
                'gross_time' => '',
            ];

            if ($dayNo < 1 || $dayNo > 7) {
                continue;
            }

            if (($punchIn !== '' && $punchOut === '') || ($punchIn === '' && $punchOut !== '')) {
                if ($punchIn === '') {
                    $rowErrors['punch_in'] = 'Punch In is required when Punch Out is entered.';
                }
                if ($punchOut === '') {
                    $rowErrors['punch_out'] = 'Punch Out is required when Punch In is entered.';
                }
            }

            if ($punchIn !== '' && !$this->isValidTime($punchIn)) {
                $rowErrors['punch_in'] = 'Punch In must be in HH:MM format.';
            }

            if ($punchOut !== '' && !$this->isValidTime($punchOut)) {
                $rowErrors['punch_out'] = 'Punch Out must be in HH:MM format.';
            }

            if ($grossTime !== '' && !$this->isValidTime($grossTime)) {
                $rowErrors['gross_time'] = 'Gross Time must be in HH:MM format.';
            }

            if (!empty($rowErrors['punch_in']) || !empty($rowErrors['punch_out']) || !empty($rowErrors['gross_time'])) {
                $errors['rows'][$dayNo] = $rowErrors;
            }
        }

        if ($errors['shift_uuid'] !== '' || !empty($errors['rows'])) {
            return [
                'status' => false,
                'message' => 'Please correct the highlighted errors and try again.',
                'errors' => $errors
            ];
        }

        return [
            'status' => true,
            'message' => 'Validation passed.',
            'errors' => []
        ];
    }

    private function isValidTime($value)
    {
        return (bool) preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', trim((string) $value));
    }

    private function resolveReturnUrl($returnUrl, $shiftUuid)
    {
        $returnUrl = trim((string) $returnUrl);
        $defaultUrl = 'shift-details/create?shift_uuid=' . rawurlencode($shiftUuid);

        if ($returnUrl === '') {
            return $defaultUrl;
        }

        $baseUrl = rtrim(base_url(), '/');
        $siteUrl = rtrim(site_url(), '/');

        if (strpos($returnUrl, $baseUrl) === 0 || strpos($returnUrl, $siteUrl) === 0) {
            return $returnUrl;
        }

        if (preg_match('#^(https?:)?//#i', $returnUrl)) {
            return $defaultUrl;
        }

        return ltrim($returnUrl, '/');
    }

    private function serializeListRow($row)
    {
        $displayOrDash = function ($value) {
            $value = trim((string) $value);
            return $value !== '' ? $value : '-';
        };

        return [
            'id' => isset($row['ID']) ? (int) $row['ID'] : 0,
            'uuid' => isset($row['UUID']) ? (string) $row['UUID'] : '',
            'shift_name' => isset($row['SHIFT_NAME']) ? (string) $row['SHIFT_NAME'] : '',
            'status' => isset($row['STATUS']) ? (string) $row['STATUS'] : '',
            'status_display' => isset($row['STATUS']) ? ucfirst(strtolower((string) $row['STATUS'])) : '-',

            'sun_punch_in' => $displayOrDash($row['SUN_PUNCH_IN'] ?? ''),
            'sun_punch_out' => $displayOrDash($row['SUN_PUNCH_OUT'] ?? ''),
            'sun_gross_time' => $displayOrDash($row['SUN_GROSS_TIME'] ?? ''),

            'mon_punch_in' => $displayOrDash($row['MON_PUNCH_IN'] ?? ''),
            'mon_punch_out' => $displayOrDash($row['MON_PUNCH_OUT'] ?? ''),
            'mon_gross_time' => $displayOrDash($row['MON_GROSS_TIME'] ?? ''),

            'tue_punch_in' => $displayOrDash($row['TUE_PUNCH_IN'] ?? ''),
            'tue_punch_out' => $displayOrDash($row['TUE_PUNCH_OUT'] ?? ''),
            'tue_gross_time' => $displayOrDash($row['TUE_GROSS_TIME'] ?? ''),

            'wed_punch_in' => $displayOrDash($row['WED_PUNCH_IN'] ?? ''),
            'wed_punch_out' => $displayOrDash($row['WED_PUNCH_OUT'] ?? ''),
            'wed_gross_time' => $displayOrDash($row['WED_GROSS_TIME'] ?? ''),

            'thu_punch_in' => $displayOrDash($row['THU_PUNCH_IN'] ?? ''),
            'thu_punch_out' => $displayOrDash($row['THU_PUNCH_OUT'] ?? ''),
            'thu_gross_time' => $displayOrDash($row['THU_GROSS_TIME'] ?? ''),

            'fri_punch_in' => $displayOrDash($row['FRI_PUNCH_IN'] ?? ''),
            'fri_punch_out' => $displayOrDash($row['FRI_PUNCH_OUT'] ?? ''),
            'fri_gross_time' => $displayOrDash($row['FRI_GROSS_TIME'] ?? ''),

            'sat_punch_in' => $displayOrDash($row['SAT_PUNCH_IN'] ?? ''),
            'sat_punch_out' => $displayOrDash($row['SAT_PUNCH_OUT'] ?? ''),
            'sat_gross_time' => $displayOrDash($row['SAT_GROSS_TIME'] ?? ''),

            'manage_url' => base_url('shift-details/create') . '?shift_uuid=' . rawurlencode((string) ($row['UUID'] ?? '')),
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
