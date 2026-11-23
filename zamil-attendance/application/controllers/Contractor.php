<?php
defined('BASEPATH') or exit('No direct script access allowed');


class Contractor extends MY_Controller
{
    private $currentContractorId = null;
    private $currentEmployeeId = null;

    public function __construct()
    {
        parent::__construct();
        $this->load->model('Contractor_model', 'contractorModel');
        $this->load->model('Con_employee_model', 'conEmployeeModel');
        $this->load->library(['form_validation', 'session']);
        $this->load->helper(['url', 'form']);
    }

    // =================================================================
    // Contractor companies
    // =================================================================

    public function index()
    {
        $layoutConfig = [
            'view' => 'pages/contractor/contractor-list',
            'title' => 'Zamil Payroll Management System - Contractors',
            'heading' => '',
            'active-link' => 'contractor',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/contractor/list.js'],
            'data' => [],
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

        $totalContractors = $this->contractorModel->get_contractor_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->contractorModel->get_contractor_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeContractor($row);
        }

        $response = [
            'pagination' => [
                'total_records' => $totalContractors,
                'total_pages' => generatePages($totalContractors, $limit),
                'current_page' => $currentPage,
                'limit' => $limit,
            ],
            'contractors' => $serialized,
        ];

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }

    public function export_contractor()
    {
        try {
            if (strtolower($this->input->method()) !== 'post') {
                show_error('Method Not Allowed', 405);
                return;
            }

            $filtersJson = $this->input->post('filters', true);
            $filters = !empty($filtersJson) ? json_decode($filtersJson, true) : [];
            $search = trim((string) ($this->input->post('search', true) ?? ''));

            if (!is_array($filters)) {
                $filters = [];
            }

            $rows = $this->contractorModel->get_contractor_list('list', 0, 1, $filters, $search);
            if (empty($rows)) {
                show_error('No contractor data found to export.', 404);
                return;
            }

            $serialized = [];
            foreach ($rows as $row) {
                $serialized[] = $this->serializeContractor($row);
            }

            $this->_export_csv($serialized, 'contractor_data_' . date('Ymd_His') . '.csv');
        } catch (Exception $e) {
            show_error($e->getMessage(), 500);
        }
    }

    /**
     * Add/edit contractor form page. Replaces the legacy Contractor::index($id).
     */
    public function form($id = null)
    {
        $record = null;
        if ($id !== null) {
            $record = $this->contractorModel->find_by_id($id);
            if (empty($record)) {
                show_404();
                return;
            }
            $record = $this->serializeContractor($record);
        }

        $layoutConfig = [
            'view' => 'pages/contractor/contractor-form',
            'title' => $id !== null
                ? 'Zamil Payroll Management System - Update Contractor'
                : 'Zamil Payroll Management System - New Contractor',
            'heading' => '',
            'active-link' => 'contractor',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/contractor/form.js'],
            'data' => ['record' => $record],
        ];

        $this->load->view('layout', $layoutConfig);
    }

    /** Looks a contractor up by CON_NUMBER for autofill. */
    public function lookup_by_number()
    {
        $conNumber = trim((string) $this->input->get('con_number', true));
        if ($conNumber === '') {
            return $this->jsonResponse(false, 'Contractor number is required.', [], 422);
        }

        $record = $this->contractorModel->find_by_number($conNumber);
        if (empty($record)) {
            return $this->jsonResponse(false, 'Contractor not found.', [], 404);
        }

        return $this->jsonResponse(true, 'Contractor fetched successfully.', [
            'contractor' => $this->serializeContractor($record),
        ]);
    }

    public function store()
    {
        $isAjax = $this->input->is_ajax_request();

        if (strtoupper($this->input->method()) !== 'POST') {
            if ($isAjax) {
                return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
            }
            show_error('Method Not Allowed', 405);
            return;
        }

        $this->applyContractorValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            $fieldErrors = $this->getContractorValidationErrors();
            if ($isAjax) {
                return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $fieldErrors], 422);
            }
            $this->session->set_flashdata('error', validation_errors(' ', ' '));
            redirect('contractor');
            return;
        }

        $userId = $this->userDetails['USER_ID'] ?? $this->session->userdata('FormsSession');
        $conId = $this->contractorModel->insert_contractor($this->collectContractorPayload(), $userId);

        if ($conId !== false) {
            $created = $this->contractorModel->find_by_id($conId);
            if ($isAjax) {
                return $this->jsonResponse(true, 'Contractor added successfully.', ['contractor' => $this->serializeContractor($created)]);
            }
            $this->session->set_flashdata('message', 'Data Saved Successfully');
            redirect(base_url('contractor/form/' . $conId));
            return;
        }

        $message = $this->ebs_error() ?: 'Failed to add contractor.';
        if ($isAjax) {
            return $this->jsonResponse(false, $message, [], 500);
        }
        $this->session->set_flashdata('message', $message);
        redirect(base_url('contractor'));
    }

    public function update($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $this->currentContractorId = $id;
        $this->applyContractorValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $this->getContractorValidationErrors()], 422);
        }

        $userId = $this->userDetails['USER_ID'] ?? $this->session->userdata('FormsSession');
        $result = $this->contractorModel->update_contractor($id, $this->collectContractorPayload(), $userId);

        if ($result['status'] === false) {
            $status = $result['message'] === 'Contractor not found.' ? 404 : 500;
            return $this->jsonResponse(false, $result['message'], [], $status);
        }

        $row = $this->contractorModel->find_by_id($id);
        return $this->jsonResponse(true, $result['message'], [
            'contractor' => $this->serializeContractor($row),
            'changed' => $result['changed'],
        ]);
    }

    public function delete($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $row = $this->contractorModel->find_by_id($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Contractor not found.', [], 404);
        }

        if (!$this->contractorModel->delete_contractor($id)) {
            $message = $this->ebs_error() ?: 'Failed to delete contractor.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        return $this->jsonResponse(true, 'Contractor deleted successfully.', ['id' => (int) $id]);
    }

    private function applyContractorValidationRules()
    {
        $this->form_validation->set_rules('con_number', 'Contractor Number', 'trim|required|max_length[50]|callback_unique_con_number');
        $this->form_validation->set_rules('con_name', 'Contractor Name', 'trim|required|max_length[200]');
        $this->form_validation->set_rules('status', 'Status', 'trim|required|callback_valid_status');
        $this->form_validation->set_rules('rate', 'Rate', 'trim|numeric');
        $this->form_validation->set_rules('start_date', 'Start Date', 'trim|callback_valid_date_optional');
        $this->form_validation->set_rules('end_date', 'End Date', 'trim|callback_valid_date_optional|callback_valid_date_range');
    }

    private function collectContractorPayload()
    {
        return [
            'con_number' => $this->input->post('con_number', true),
            'con_name' => $this->input->post('con_name', true),
            'rate' => $this->input->post('rate', true),
            'status' => $this->input->post('status', true),
            'start_date' => $this->input->post('start_date', true),
            'end_date' => $this->input->post('end_date', true),
        ];
    }

    public function unique_con_number($value)
    {
        $exists = $this->contractorModel->con_number_exists($value, $this->currentContractorId);
        if ($exists) {
            $this->form_validation->set_message('unique_con_number', 'The {field} already exists. Please use a unique value.');
            return false;
        }
        return true;
    }

    public function valid_status($value)
    {
        $allowed = ['ACTIVE', 'INACTIVE'];
        if (!in_array(strtoupper((string) $value), $allowed, true)) {
            $this->form_validation->set_message('valid_status', 'The {field} field must be one of: ACTIVE, INACTIVE.');
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
        $isValid = (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) || (bool) preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $value);
        if (!$isValid) {
            $this->form_validation->set_message('valid_date_optional', 'The {field} field must be a valid date.');
        }
        return $isValid;
    }

    public function valid_date_range($endDate)
    {
        $startDate = trim((string) $this->input->post('start_date', true));
        $endDate = trim((string) $endDate);

        if ($startDate === '' || $endDate === '') {
            return true;
        }

        if (strtotime($endDate) < strtotime($startDate)) {
            $this->form_validation->set_message('valid_date_range', 'End Date must be on or after Start Date.');
            return false;
        }

        return true;
    }

    private function getContractorValidationErrors()
    {
        return [
            'con_number' => $this->clean_validation_message(form_error('con_number', '', '')),
            'con_name' => $this->clean_validation_message(form_error('con_name', '', '')),
            'status' => $this->clean_validation_message(form_error('status', '', '')),
            'rate' => $this->clean_validation_message(form_error('rate', '', '')),
            'start_date' => $this->clean_validation_message(form_error('start_date', '', '')),
            'end_date' => $this->clean_validation_message(form_error('end_date', '', '')),
        ];
    }

    private function serializeContractor($row)
    {
        if (empty($row)) {
            return null;
        }

        $formatDate = function ($value, $format) {
            if (empty($value)) {
                return null;
            }
            $ts = strtotime((string) $value);
            return $ts ? date($format, $ts) : null;
        };

        return [
            'id' => $row['CON_ID'],
            'con_number' => $row['CON_NUMBER'],
            'con_name' => $row['CON_NAME'],
            'rate' => $row['RATE'] ?? null,
            'status' => $row['STATUS'],
            'status_display' => !empty($row['STATUS']) ? $row['STATUS'] : '-',
            'start_date' => $formatDate($row['START_DATE'] ?? null, 'Y-m-d'),
            'end_date' => $formatDate($row['END_DATE'] ?? null, 'Y-m-d'),
            'start_date_display' => $formatDate($row['START_DATE'] ?? null, 'd M Y') ?: '-',
            'end_date_display' => $formatDate($row['END_DATE'] ?? null, 'd M Y') ?: '-',
            'created_by' => $row['CREATEB_BY'] ?? null,
            'created_date' => $row['CREATION_DATE'] ?? null,
            'updated_by' => $row['UPDATED_BY'] ?? null,
            'updated_date' => $row['UPDATED_DATE'] ?? null,
        ];
    }

    // =================================================================
    // Contractor employees
    // =================================================================

    public function employee_index()
    {
        $layoutConfig = [
            'view' => 'pages/con_employee/employee-list',
            'title' => 'Zamil Payroll Management System - Contractor Employees',
            'heading' => '',
            'active-link' => 'con_employee',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/con_employee/list.js'],
            'data' => [
                'departmentOptions' => $this->conEmployeeModel->get_department_filter_options(),
                'jobTitleOptions' => $this->conEmployeeModel->get_job_title_options(),
                'bossOptions' => $this->conEmployeeModel->get_boss_options(),
                'productionOptions' => $this->conEmployeeModel->get_department_lookup_options(),
                'contractorOptions' => $this->contractorModel->get_contractor_list('list', 0, 1, [], ''),
            ],
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function employee_list()
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

        $totalEmployees = $this->conEmployeeModel->get_employee_list('total', $limit, $currentPage, $filters, $search);
        $rows = $this->conEmployeeModel->get_employee_list('list', $limit, $currentPage, $filters, $search);

        $serialized = [];
        foreach ($rows as $row) {
            $serialized[] = $this->serializeEmployee($row);
        }

        $response = [
            'pagination' => [
                'total_records' => $totalEmployees,
                'total_pages' => generatePages($totalEmployees, $limit),
                'current_page' => $currentPage,
                'limit' => $limit,
            ],
            'employees' => $serialized,
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

            $filtersJson = $this->input->post('filters', true);
            $filters = !empty($filtersJson) ? json_decode($filtersJson, true) : [];
            $search = trim((string) ($this->input->post('search', true) ?? ''));

            if (!is_array($filters)) {
                $filters = [];
            }

            $rows = $this->conEmployeeModel->get_employee_list('list', 0, 1, $filters, $search);
            if (empty($rows)) {
                show_error('No employee data found to export.', 404);
                return;
            }

            $serialized = [];
            foreach ($rows as $row) {
                $serialized[] = $this->serializeEmployee($row);
            }

            $this->_export_csv($serialized, 'contractor_employee_data_' . date('Ymd_His') . '.csv');
        } catch (Exception $e) {
            show_error($e->getMessage(), 500);
        }
    }

    /**
     * Note: the standalone full-page employee_form($id) action was removed —
     * the add/edit modal on employee_index() replaced it, and this method
     * pointed at a view/script pair (pages/con_employee/employee-form,
     * assets/js/pages/con_employee/form.js) that no longer exist. If you
     * still need a shareable direct-edit URL, this would need rebuilding
     * against the modal's markup rather than restored as-is.
     */

    public function employee_store()
    {
        $isAjax = $this->input->is_ajax_request();

        if (strtoupper($this->input->method()) !== 'POST') {
            if ($isAjax) {
                return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
            }
            show_error('Method Not Allowed', 405);
            return;
        }

        $this->applyEmployeeValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            $fieldErrors = $this->getEmployeeValidationErrors();
            if ($isAjax) {
                return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $fieldErrors], 422);
            }
            $this->session->set_flashdata('error', validation_errors(' ', ' '));
            redirect('contractor/employees');
            return;
        }

        $userId = $this->userDetails['USER_ID'] ?? $this->session->userdata('FormsSession');
        $empId = $this->conEmployeeModel->insert_con_employee($this->collectEmployeePayload(), $userId);

        if ($empId !== false) {
            $created = $this->conEmployeeModel->find_by_id($empId);
            if ($isAjax) {
                return $this->jsonResponse(true, 'Employee added successfully.', ['employee' => $this->serializeEmployee($created)]);
            }
            $this->session->set_flashdata('message', 'Data Saved Successfully');
            redirect(base_url('contractor/employees'));
            return;
        }

        $message = $this->ebs_error() ?: 'Failed to add employee.';
        if ($isAjax) {
            return $this->jsonResponse(false, $message, [], 500);
        }
        $this->session->set_flashdata('message', $message);
        redirect(base_url('contractor/employees'));
    }

    public function employee_update($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $this->currentEmployeeId = $id;
        $this->applyEmployeeValidationRules();

        if ($this->form_validation->run() === false) {
            $errors = trim(strip_tags(validation_errors(' ', ' ')));
            return $this->jsonResponse(false, $errors !== '' ? $errors : 'Validation failed.', ['errors' => $this->getEmployeeValidationErrors()], 422);
        }

        $userId = $this->userDetails['USER_ID'] ?? $this->session->userdata('FormsSession');
        $result = $this->conEmployeeModel->update_con_employee($id, $this->collectEmployeePayload(), $userId);

        if ($result['status'] === false) {
            $status = $result['message'] === 'Employee not found.' ? 404 : 500;
            return $this->jsonResponse(false, $result['message'], [], $status);
        }

        $row = $this->conEmployeeModel->find_by_id($id);
        return $this->jsonResponse(true, $result['message'], [
            'employee' => $this->serializeEmployee($row),
            'changed' => $result['changed'],
        ]);
    }

    public function employee_delete($id)
    {
        if (strtoupper($this->input->method()) !== 'POST') {
            return $this->jsonResponse(false, 'Method Not Allowed', [], 405);
        }

        $row = $this->conEmployeeModel->find_by_id($id);
        if (empty($row)) {
            return $this->jsonResponse(false, 'Employee not found.', [], 404);
        }

        if (!$this->conEmployeeModel->delete_con_employee($id)) {
            $message = $this->ebs_error() ?: 'Failed to delete employee.';
            return $this->jsonResponse(false, $message, [], 500);
        }

        return $this->jsonResponse(true, 'Employee deleted successfully.', ['id' => (int) $id]);
    }

    private function applyEmployeeValidationRules()
    {
        $this->form_validation->set_rules('employee_name', 'Employee Name', 'trim|required|max_length[200]');
        $this->form_validation->set_rules('con_number', 'Contractor', 'trim|required|callback_valid_con_number');
        $this->form_validation->set_rules('division', 'Division', 'trim|required');
        $this->form_validation->set_rules('status', 'Status', 'trim|required');
        $this->form_validation->set_rules('rate', 'Rate', 'trim|numeric');
    }

    private function collectEmployeePayload()
    {
        return [
            'division' => $this->input->post('division', true),
            'con_number' => $this->input->post('con_number', true),
            'con_name' => $this->input->post('con_name', true),
            'employee_number' => $this->input->post('employee_number', true),
            'employee_name' => $this->input->post('employee_name', true),
            'iqamah' => $this->input->post('iqamah', true),
            'department' => $this->input->post('department', true),
            'prod_dep' => $this->input->post('prod_dep', true),
            'direct_boss' => $this->input->post('direct_boss', true),
            'direct_boss_id' => $this->input->post('direct_boss_id', true),
            'job' => $this->input->post('job', true),
            'job_title' => $this->input->post('job_title', true),
            'place' => $this->input->post('place', true),
            'replacement' => $this->input->post('replacement', true),
            'rate' => $this->input->post('rate', true),
            'start_date' => $this->input->post('start_date', true),
            'end_date' => $this->input->post('end_date', true),
            'status' => $this->input->post('status', true),
            'ajeer' => $this->input->post('ajeer', true),
            'sfda' => $this->input->post('sfda', true),
            'blacklist' => $this->input->post('blacklist', true),
            'remark' => $this->input->post('remark', true),
        ];
    }

    public function valid_con_number($value)
    {
        $exists = $this->contractorModel->find_by_number($value);
        if (empty($exists)) {
            $this->form_validation->set_message('valid_con_number', 'The selected {field} does not exist.');
            return false;
        }
        return true;
    }

    private function getEmployeeValidationErrors()
    {
        return [
            'employee_name' => $this->clean_validation_message(form_error('employee_name', '', '')),
            'con_number' => $this->clean_validation_message(form_error('con_number', '', '')),
            'division' => $this->clean_validation_message(form_error('division', '', '')),
            'status' => $this->clean_validation_message(form_error('status', '', '')),
            'rate' => $this->clean_validation_message(form_error('rate', '', '')),
        ];
    }

    private function serializeEmployee($row)
    {
        if (empty($row)) {
            return null;
        }

        $formatDate = function ($value, $format) {
            if (empty($value)) {
                return null;
            }
            $ts = strtotime((string) $value);
            return $ts ? date($format, $ts) : null;
        };

        return [
            'id' => $row['EMP_ID'],
            'division' => $row['DIVISION'],
            'con_number' => $row['CON_NUMBER'],
            'con_name' => $row['CON_NAME'],
            'employee_number' => $row['EMPLOYEE_NUMBER'],
            'employee_name' => $row['EMPLOYEE_NAME'],
            'iqamah' => $row['IQAMAH'] ?? null,
            'department' => $row['DEPARTMENT'] ?? null,
            'prod_dep' => $row['PROD_DEP'] ?? null,
            'direct_boss' => $row['DIRECT_BOSS'] ?? null,
            'direct_boss_id' => $row['DIRECT_BOSS_ID'] ?? null,
            'job' => $row['JOB'] ?? null,
            'job_title' => $row['JOB_TITLE'] ?? null,
            'place' => $row['PLACE'] ?? null,
            'replacement' => $row['REPLACEMENT'] ?? null,
            'rate' => $row['RATE'] ?? null,
            'start_date' => $formatDate($row['START_DATE'] ?? null, 'Y-m-d'),
            'end_date' => $formatDate($row['END_DATE'] ?? null, 'Y-m-d'),
            'start_date_display' => $formatDate($row['START_DATE'] ?? null, 'd M Y') ?: '-',
            'end_date_display' => $formatDate($row['END_DATE'] ?? null, 'd M Y') ?: '-',
            'status' => $row['STATUS'] ?? null,
            'status_display' => !empty($row['STATUS']) ? $row['STATUS'] : '-',
            'ajeer' => $row['AJEER'] ?? null,
            'sfda' => $row['SFDA'] ?? null,
            'blacklist' => $row['BLACKLIST'] ?? null,
            'remark' => $row['REMARK'] ?? null,
            'created_by' => $row['CREATEB_BY'] ?? null,
            'created_date' => $row['CREATION_DATE'] ?? null,
            'updated_by' => $row['UPDATED_BY'] ?? null,
            'updated_date' => $row['UPDATED_DATE'] ?? null,
        ];
    }

    // =================================================================
    // Summary report (hours & cost)
    // =================================================================

    public function summary_index()
    {
        $layoutConfig = [
            'view' => 'pages/contractor_summary/summary',
            'title' => 'Zamil Payroll Management System - Contractor Summary',
            'heading' => '',
            'active-link' => 'contractor_summary',
            'css' => [],
            'scripts' => ['src' => 'assets/js/pages/contractor_summary/summary.js'],
            'data' => [
                'departmentOptions' => $this->contractorModel->get_summary_department_options(),
                'contractorOptions' => $this->contractorModel->get_summary_contractor_options(),
                'defaultFrom' => date('Y-m-01'),
                'defaultTo' => date('Y-m-t'),
            ],
        ];

        $this->load->view('layout', $layoutConfig);
    }

    public function summary_list()
    {
        if (!$this->input->is_ajax_request()) {
            show_404();
        }

        $input = $this->input->raw_input_stream;
        $data = json_decode($input, true);

        if (!is_array($data)) {
            return $this->output
                ->set_status_header(400)
                ->set_content_type('application/json')
                ->set_output(json_encode(['message' => 'Invalid JSON input']));
        }

        $filters = $this->resolveSummaryFilters($data);

        if ($filters['error'] !== '') {
            return $this->output
                ->set_status_header(422)
                ->set_content_type('application/json')
                ->set_output(json_encode(['message' => $filters['error']]));
        }

        $response = [
            'filters' => [
                'from' => $filters['from'],
                'to' => $filters['to'],
                'dept' => $filters['dept'],
                'cont' => $filters['cont'],
                'div' => $filters['div'],
            ],
            'summary' => $this->contractorModel->get_summary($filters['from'], $filters['to'], $filters['dept'], $filters['cont'], $filters['div']),
            'summary_stats' => $this->contractorModel->get_summary_stats($filters['from'], $filters['to'], $filters['dept'], $filters['cont'], $filters['div']),
            'records' => $this->contractorModel->get_summary_detail($filters['from'], $filters['to'], $filters['dept'], $filters['cont'], $filters['div']),
        ];

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }

    public function export_summary()
    {
        try {
            if (strtolower($this->input->method()) !== 'post') {
                show_error('Method Not Allowed', 405);
                return;
            }

            $filters = $this->resolveSummaryFilters([
                'from' => $this->input->post('from', true),
                'to' => $this->input->post('to', true),
                'dept' => $this->input->post('dept', true),
                'cont' => $this->input->post('con_name', true),
                'div' => $this->input->post('div', true),
            ]);

            if ($filters['error'] !== '') {
                show_error($filters['error'], 422);
                return;
            }

            $rows = $this->contractorModel->get_summary($filters['from'], $filters['to'], $filters['dept'], $filters['cont'], $filters['div']);
            if (empty($rows)) {
                show_error('No summary data found to export.', 404);
                return;
            }

            $this->_export_csv($rows, 'contractor_summary_' . date('Ymd_His') . '.csv');
        } catch (Exception $e) {
            show_error($e->getMessage(), 500);
        }
    }

    /** Applies the legacy defaults (current month) and validates the range. */
    private function resolveSummaryFilters(array $data)
    {
        $from = isset($data['from']) && $data['from'] !== '' ? trim((string) $data['from']) : date('Y-m-01');
        $to = isset($data['to']) && $data['to'] !== '' ? trim((string) $data['to']) : date('Y-m-t');
        $dept = isset($data['dept']) ? trim((string) $data['dept']) : '';
        $cont = isset($data['cont']) ? trim((string) $data['cont']) : '';
        $div = isset($data['div']) ? trim((string) $data['div']) : '';

        $error = '';
        $fromTs = strtotime($from);
        $toTs = strtotime($to);

        if ($fromTs === false || $toTs === false) {
            $error = 'From/To must be valid dates.';
        } elseif ($fromTs > $toTs) {
            $error = 'From date must be less than or equal to To date.';
        }

        return compact('from', 'to', 'dept', 'cont', 'div', 'error');
    }

    // =================================================================
    // Shared helpers
    // =================================================================

    private function clean_validation_message($message)
    {
        return trim(strip_tags((string) $message));
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

    /**
     * The 'ebs' connection is a separate CI_DB object from $this->db, so
     * error details are read off that connection directly.
     */
    private function ebs_error()
    {
        $db = $this->load->database('ebs', true);
        $error = $db->error();
        return !empty($error['message']) ? $error['message'] : '';
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
                    'hash' => $tokenHash,
                ],
            ]));
    }
}
