<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Leave_request extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Leave_model', 'leaveModel');
        $this->load->model('Dashboard_model', 'dashboardModel');
    }

    // public function index()
    // {
    //     // Oracle USER_ID from session
    //     $userID = trim((string) $this->session->userdata('FormsSession'));
    //     $dashboardPayload = $this->dashboardModel->get_dashboard_payload();


    //     $period = $this->leaveModel->build_current_payroll_period();

    //     $summary = $this->leaveModel->get_summary(
    //         $userID,
    //         $period['from_date'],
    //         $period['to_date']
    //     );
    //     $currentDate = new DateTime();

    //     if ((int)$currentDate->format('d') <= 20) {
    //         // Before or on 20th
    //         $fromDate = (clone $currentDate)
    //             ->modify('-1 month')
    //             ->setDate(
    //                 (int)(clone $currentDate)->modify('-1 month')->format('Y'),
    //                 (int)(clone $currentDate)->modify('-1 month')->format('m'),
    //                 21
    //             );

    //         $toDate = $currentDate->setDate(
    //             (int)$currentDate->format('Y'),
    //             (int)$currentDate->format('m'),
    //             20
    //         );
    //     } else {
    //         // After 20th
    //         $fromDate = $currentDate->setDate(
    //             (int)$currentDate->format('Y'),
    //             (int)$currentDate->format('m'),
    //             21
    //         );

    //         $toDate = (clone $currentDate)
    //             ->modify('+1 month')
    //             ->setDate(
    //                 (int)(clone $currentDate)->modify('+1 month')->format('Y'),
    //                 (int)(clone $currentDate)->modify('+1 month')->format('m'),
    //                 20
    //             );
    //     }

    //     $fromDate = $fromDate->format('Y-m-d');
    //     $toDate   = $toDate->format('Y-m-d');


    //     $limit = 10;
    //     $currentPage = (int)$this->input->get('page');
    //     $currentPage = $currentPage > 0 ? $currentPage : 1;

    //     $totalRequests = $this->leaveModel->get_leave_requests(
    //         'total',
    //         $userID,
    //         $period['from_date'],
    //         $period['to_date'],
    //         $limit,
    //         $currentPage
    //     );

    //     $requests = $this->leaveModel->get_leave_requests(
    //         'list',
    //         $userID,
    //         $period['from_date'],
    //         $period['to_date'],
    //         $limit,
    //         $currentPage
    //     );
    //     $layoutConfig = [
    //         'view' => 'pages/leave/index',
    //         'title' => 'Zamil Payroll Management System - Leave & Requests',
    //         'heading' => 'Leave & Requests',
    //         'active-link' => 'leave-requests',
    //         'css' => [],
    //         'scripts' => [],
    //         'data' => [
    //             'period'   => $period,
    //             'summary'  => $summary,
    //             'requests' => $requests,
    //             'pagination' => [
    //                 'total_records' => $totalRequests,
    //                 'total_pages'   => generatePages($totalRequests, $limit),
    //                 'current_page'  => $currentPage,
    //                 'limit'         => $limit
    //             ],
    //             'dashboardPayload' => $dashboardPayload,
    //         ],
    //     ];

    //     $this->load->view('layout', $layoutConfig);
    // }
    public function index()
    {
        $dashboardPayload = $this->dashboardModel->get_dashboard_payload();

        $layoutConfig = [
            'view' => 'pages/leave/index',
            'title' => 'Zamil Payroll Management System - Leave & Requests',
            'heading' => 'Leave & Requests',
            'active-link' => 'leave-requests',
            'css' => [],
            'scripts' => [
                'src' => 'assets/js/pages/leave/list.js'
            ],
            'data' => [
                'dashboardPayload' => $dashboardPayload
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

        $userID = trim(
            (string) $this->session->userdata('FormsSession')
        );

        $defaultPeriod = $this->leaveModel
            ->build_current_payroll_period();

        /*
     * Use selected dates.
     * When no dates are selected, use the current payroll period.
     */
        $fromDate = !empty($data['fromDate'])
            ? trim($data['fromDate'])
            : $defaultPeriod['from_date'];

        $toDate = !empty($data['toDate'])
            ? trim($data['toDate'])
            : $defaultPeriod['to_date'];

        /*
     * Validate YYYY-MM-DD date format.
     */
        if (
            !$this->isValidDate($fromDate) ||
            !$this->isValidDate($toDate)
        ) {
            return $this->output
                ->set_status_header(422)
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'message' => 'Invalid date format.'
                ]));
        }

        if ($fromDate > $toDate) {
            return $this->output
                ->set_status_header(422)
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'message' =>
                    'From Date cannot be greater than To Date.'
                ]));
        }

        $limit = isset($data['limit'])
            ? max(1, (int) $data['limit'])
            : 10;

        $currentPage = isset($data['currentPage'])
            ? max(1, (int) $data['currentPage'])
            : 1;

        $summary = $this->leaveModel->get_summary(
            $userID,
            $fromDate,
            $toDate
        );

        $totalRequests = $this->leaveModel->get_leave_requests(
            'total',
            $userID,
            $fromDate,
            $toDate,
            $limit,
            $currentPage
        );

        $requests = $this->leaveModel->get_leave_requests(
            'list',
            $userID,
            $fromDate,
            $toDate,
            $limit,
            $currentPage
        );

        $period = [
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'from_label' => date(
                'd M Y',
                strtotime($fromDate)
            ),
            'to_label' => date(
                'd M Y',
                strtotime($toDate)
            ),
        ];

        $response = [
            'period' => $period,
            'summary' => $summary,
            'pagination' => [
                'total_records' => $totalRequests,
                'total_pages' => generatePages(
                    $totalRequests,
                    $limit
                ),
                'current_page' => $currentPage,
                'limit' => $limit
            ],
            'requests' => $requests
        ];

        return $this->output
            ->set_content_type('application/json')
            ->set_status_header(200)
            ->set_output(json_encode($response));
    }
    private function isValidDate($date)
    {
        $dateObject = DateTime::createFromFormat(
            'Y-m-d',
            $date
        );

        return $dateObject &&
            $dateObject->format('Y-m-d') === $date;
    }
}
