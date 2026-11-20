<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Manager extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Manager_model', 'managerModel');
    }

    public function index()
    {
        // Oracle USER_ID from session
        $userID = trim((string) $this->session->userdata('FormsSession'));

        $period = $this->managerModel->build_current_payroll_period();

        $team = $this->managerModel->get_team_overview(
            $userID,
            $period['from_date'],
            $period['to_date'],
            $period['today_date']
        );

        $layoutConfig = [
            'view' => 'pages/manager/index',
            'title' => 'Zamil Payroll Management System - Manager View',
            'heading' => 'Manager View',
            'active-link' => 'manager',
            'css' => [],
            'scripts' => [
                'src' => 'assets/js/pages/manager/index.js'
            ],
            'data' => [
                'period' => $period,
                'team'   => $team,
            ],
        ];

        $this->load->view('layout', $layoutConfig);
    }

    /**
     * AJAX endpoint used by the Approvals Queue card to approve/deny a
     * pending leave or absence request without leaving the page.
     */
    public function approve_absence()
    {
        if (strtolower($this->input->method()) !== 'post') {
            return $this->output
                ->set_content_type('application/json')
                ->set_status_header(405)
                ->set_output(json_encode(['message' => 'Method Not Allowed']));
        }

        $empNo = trim((string) $this->input->post('emp_no', true));
        $leaveStartDate = trim((string) $this->input->post('leave_start_date', true));
        $leaveEndDate = trim((string) $this->input->post('leave_end_date', true));
        $decision = strtoupper(trim((string) $this->input->post('decision', true)));

        $statusMap = [
            'APPROVE' => 'APPROVED',
            'DENY' => 'DENIED',
        ];

        if ($empNo === '' || $leaveStartDate === '' || $leaveEndDate === '' || !isset($statusMap[$decision])) {
            return $this->output
                ->set_content_type('application/json')
                ->set_status_header(400)
                ->set_output(json_encode(['message' => 'Missing or invalid parameters.']));
        }

        $updated = $this->managerModel->update_absence_approval(
            $empNo,
            $leaveStartDate,
            $leaveEndDate,
            $statusMap[$decision]
        );

        if (!$updated) {
            return $this->output
                ->set_content_type('application/json')
                ->set_status_header(404)
                ->set_output(json_encode(['message' => 'Request not found or already actioned.']));
        }

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode([
                'message' => 'Request ' . strtolower($statusMap[$decision]) . '.',
                'status' => $statusMap[$decision],
            ]));
    }
}
