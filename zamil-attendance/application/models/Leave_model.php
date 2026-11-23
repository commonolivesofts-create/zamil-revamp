<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Leave_model extends CI_Model
{
    protected $absenceTable = 'XX_DIGI_EMP_ABSENCE_TYPE';

    public function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    /**
     * Current Payroll Period
     * 21st -> 20th
     */
    public function build_current_payroll_period()
{
    $today = new DateTime('today');
    $day = (int) $today->format('d');

    if ($day <= 20) {
        /*
         * Example:
         * Today: 07 Aug 2026
         * Period: 21 Jul 2026 to 20 Aug 2026
         */
        $start = (clone $today)
            ->modify('first day of previous month')
            ->setTime(0, 0, 0);

        $start->setDate(
            (int) $start->format('Y'),
            (int) $start->format('m'),
            21
        );

        $end = (clone $today);
        $end->setDate(
            (int) $end->format('Y'),
            (int) $end->format('m'),
            20
        );
    } else {
        /*
         * Example:
         * Today: 25 Aug 2026
         * Period: 21 Aug 2026 to 20 Sep 2026
         */
        $start = (clone $today);
        $start->setDate(
            (int) $start->format('Y'),
            (int) $start->format('m'),
            21
        );

        $end = (clone $today)
            ->modify('first day of next month');

        $end->setDate(
            (int) $end->format('Y'),
            (int) $end->format('m'),
            20
        );
    }

    return [
        'from_date' => $start->format('Y-m-d'),
        'to_date' => $end->format('Y-m-d'),
        'from_label' => $start->format('d M Y'),
        'to_label' => $end->format('d M Y'),
        'today_date' => $today->format('Y-m-d'),
        'today_label' => $today->format('d M Y')
    ];
}

    /**
     * Dashboard Summary
     */
    public function get_summary($userID, $fromDate, $toDate)
    {
        $summary = [
            'approved' => 0,
            'pending'  => 0,
            'denied'   => 0,
            'balance'  => 0
        ];

        // Approved
        $summary['approved'] = (int)$this->db->query(
            "
        SELECT COUNT(*) CNT
        FROM {$this->absenceTable}
        WHERE UPPER(APPROVAL_STATUS) = 'APPROVED'
          AND TO_DATE(LEAVE_START_DATE,'DD-MM-RR')
              BETWEEN TO_DATE(?, 'YYYY-MM-DD')
                  AND TO_DATE(?, 'YYYY-MM-DD')
        ",
            [$fromDate, $toDate]
        )->row()->CNT;

        // Pending
        $summary['pending'] = (int)$this->db->query(
            "
        SELECT COUNT(*) CNT
        FROM {$this->absenceTable}
        WHERE UPPER(APPROVAL_STATUS) IN ('PENDING','AWAITING')
          AND TO_DATE(LEAVE_START_DATE,'DD-MM-RR')
              BETWEEN TO_DATE(?, 'YYYY-MM-DD')
                  AND TO_DATE(?, 'YYYY-MM-DD')
        ",
            [$fromDate, $toDate]
        )->row()->CNT;

        // Denied / Unplanned
        $summary['denied'] = (int)$this->db->query(
            "
        SELECT COUNT(*) CNT
        FROM {$this->absenceTable}
        WHERE UPPER(APPROVAL_STATUS) IN ('UNPLANNED','DENIED')
          AND TO_DATE(LEAVE_START_DATE,'DD-MM-RR')
              BETWEEN TO_DATE(?, 'YYYY-MM-DD')
                  AND TO_DATE(?, 'YYYY-MM-DD')
        ",
            [$fromDate, $toDate]
        )->row()->CNT;

        // Replace with actual leave balance later
        $summary['balance'] = 11.4;
        $summary['total'] = (int)$this->db->query(
            "
        SELECT COUNT(*) CNT
        FROM {$this->absenceTable}
        WHERE  TO_DATE(LEAVE_START_DATE,'DD-MM-RR')
              BETWEEN TO_DATE(?, 'YYYY-MM-DD')
                  AND TO_DATE(?, 'YYYY-MM-DD')
        ",
            [$fromDate, $toDate]
        )->row()->CNT;

        return $summary;
    }

   

    public function get_leave_requests($type = 'list', $userID = '', $fromDate = '', $toDate = '', $limit = 5, $currentPage = 1)
    {
        $offset = get_limit_offset($currentPage, $limit);

        $where = [];
        $binds = [];

        // Uncomment if you want employee-wise data
        /*
    $where[] = "EMP_CODE = ?";
    $binds[] = $userID;
    */

        $where[] = "TO_DATE(LEAVE_START_DATE,'DD-MM-RR')
                BETWEEN TO_DATE(?, 'YYYY-MM-DD')
                AND TO_DATE(?, 'YYYY-MM-DD')";
        $binds[] = $fromDate;
        $binds[] = $toDate;

        $whereSql = ' WHERE ' . implode(' AND ', $where);

        if ($type === 'total') {

            $sql = "
            SELECT COUNT(*) TOTAL
            FROM {$this->absenceTable}
            {$whereSql}
        ";

            $row = $this->db->query($sql, $binds)->row_array();

            return isset($row['TOTAL']) ? (int)$row['TOTAL'] : 0;
        }

        $sql = "
        SELECT
            EMP_NAME,
            LEAVE_TYPE,
            LEAVE_START_DATE,
            LEAVE_END_DATE,
            TOTAL_DAYS,
            APPROVAL_STATUS
        FROM {$this->absenceTable}
        {$whereSql}
        ORDER BY TO_DATE(LEAVE_START_DATE,'DD-MM-RR') ASC
    ";

        if ($limit > 0) {

            $sql = "
            SELECT *
            FROM (
                SELECT q.*, ROWNUM rn
                FROM ({$sql}) q
                WHERE ROWNUM <= ?
            )
            WHERE rn > ?
        ";

            $binds[] = $offset + $limit;
            $binds[] = $offset;
        }

        return $this->db->query($sql, $binds)->result_array();
    }

    
}
