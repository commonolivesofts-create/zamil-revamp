<?php
defined('BASEPATH') or exit('No direct script access allowed');
class Employee_model extends CI_Model
{
    protected $employee_details;
    protected $absence_details;

    public function __construct()
    {
        parent::__construct();
        $this->employee_details = 'XX_DIGI_EMP_MASTER';
        $this->absence_details = 'XX_DIGI_EMP_ABSENCE_TYPE';
    }

    function get_employee_details($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = max(0, (int) get_limit_offset($currentPage, $limit));
        $limit = (int) $limit;
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        $fullName = isset($filters['full_name']) ? trim((string) $filters['full_name']) : '';
        $userId = isset($filters['user_id']) ? trim((string) $filters['user_id']) : '';
        $employeeNo = isset($filters['employee_number']) ? trim((string) $filters['employee_number']) : '';
        $email = isset($filters['email_address']) ? trim((string) $filters['email_address']) : '';
        $jobTitle = isset($filters['job_title']) ? trim((string) $filters['job_title']) : '';
        $department = isset($filters['department']) ? trim((string) $filters['department']) : '';
        $joiningDate = isset($filters['joining_date']) ? trim((string) $filters['joining_date']) : '';

        if ($fullName !== '') {
            $where[] = "UPPER(NVL(d.FULL_NAME, '')) LIKE ?";
            $binds[] = '%' . strtoupper($fullName) . '%';
        }
        if ($userId !== '') {
            $where[] = "UPPER(NVL(d.USER_ID, '')) LIKE ?";
            $binds[] = '%' . strtoupper($userId) . '%';
        }
        if ($employeeNo !== '') {
            $where[] = "UPPER(NVL(d.EMPLOYEE_NUMBER, '')) LIKE ?";
            $binds[] = '%' . strtoupper($employeeNo) . '%';
        }
        if ($email !== '') {
            $where[] = "UPPER(NVL(d.EMAIL_ADDRESS, '')) LIKE ?";
            $binds[] = '%' . strtoupper($email) . '%';
        }
        if ($jobTitle !== '') {
            $where[] = "UPPER(NVL(d.JOB_TITLE, '')) LIKE ?";
            $binds[] = '%' . strtoupper($jobTitle) . '%';
        }
        if ($department !== '') {
            $where[] = "UPPER(NVL(d.DEPARTMENT, '')) LIKE ?";
            $binds[] = '%' . strtoupper($department) . '%';
        }
        if ($joiningDate !== '') {
            $where[] = "TO_CHAR(d.JOINING_DATE, 'YYYY-MM-DD') = ?";
            $binds[] = $joiningDate;
        }

        if ($search !== '') {
            $like = '%' . strtoupper($search) . '%';
            $where[] = "(UPPER(NVL(d.USER_ID, '')) LIKE ? OR UPPER(NVL(d.FULL_NAME, '')) LIKE ? OR UPPER(NVL(d.EMPLOYEE_NUMBER, '')) LIKE ? OR UPPER(NVL(d.EMAIL_ADDRESS, '')) LIKE ? OR UPPER(NVL(d.JOB_TITLE, '')) LIKE ? OR UPPER(NVL(d.DEPARTMENT, '')) LIKE ?)";
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
        }

        // Always apply current employee filter
        $where[] = "d.CURRENT_EMP_FLAG = 'Y'";
        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));
        
        if ($type !== 'list') {
            $countSql = "SELECT COUNT(1) AS TOTAL FROM {$this->employee_details} d {$whereSql}";
            $row = $this->db->query($countSql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $sql = "SELECT d.*  FROM {$this->employee_details} d {$whereSql} ORDER BY d.HEADER_ID DESC";
        if ($limit > 0) {
            $sql .= " OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY";
        }

        return $this->db->query($sql, $binds)->result_array();
    }


    function get_absence_details($type = 'list', $limit = 10, $currentPage = 1, $filters = [], $search = '')
    {
        $offset = max(0, (int) get_limit_offset($currentPage, $limit));
        $limit = (int) $limit;
        $filters = is_array($filters) ? $filters : [];
        $search = trim((string) $search);

        $where = [];
        $binds = [];

        $empNo          = isset($filters['emp_no']) ? trim((string) $filters['emp_no']) : '';
        $departmentName = isset($filters['department_name']) ? trim((string) $filters['department_name']) : '';
        $empName        = isset($filters['emp_name']) ? trim((string) $filters['emp_name']) : '';
        $position       = isset($filters['position']) ? trim((string) $filters['position']) : '';
        $leaveStartDate = isset($filters['leave_start_date']) ? trim((string) $filters['leave_start_date']) : '';
        $leaveEndDate   = isset($filters['leave_end_date']) ? trim((string) $filters['leave_end_date']) : '';
        $totalDays      = isset($filters['total_days']) ? trim((string) $filters['total_days']) : '';
        $leaveType      = isset($filters['leave_type']) ? trim((string) $filters['leave_type']) : '';
        $approvalStatus = isset($filters['approval_status']) ? trim((string) $filters['approval_status']) : '';

        if ($empNo !== '') {
            $where[] = "a.EMP_NO LIKE ?";
            $binds[] = '%' . $empNo . '%';
        }

        if ($departmentName !== '') {
            $where[] = "UPPER(NVL(a.DEPARTMENT_NAME, '')) LIKE ?";
            $binds[] = '%' . strtoupper($departmentName) . '%';
        }

        if ($empName !== '') {
            $where[] = "UPPER(NVL(a.EMP_NAME, '')) LIKE ?";
            $binds[] = '%' . strtoupper($empName) . '%';
        }

        if ($position !== '') {
            $where[] = "UPPER(NVL(a.POSITION, '')) LIKE ?";
            $binds[] = '%' . strtoupper($position) . '%';
        }

        if ($leaveStartDate !== '') {
            $where[] = "TO_DATE(TRIM(a.LEAVE_END_DATE), 'DD-MM-RR') >= TO_DATE(?, 'DD-MM-RR')";
            $binds[] = $leaveStartDate;
        }

        if ($leaveEndDate !== '') {
            $where[] = "TO_DATE(TRIM(a.LEAVE_START_DATE), 'DD-MM-RR') <= TO_DATE(?, 'DD-MM-RR')";
            $binds[] = $leaveEndDate;
        }

        if ($totalDays !== '') {
            $where[] = "TO_CHAR(a.TOTAL_DAYS) LIKE ?";
            $binds[] = '%' . $totalDays . '%';
        }

        if ($leaveType !== '') {
            $where[] = "UPPER(NVL(a.LEAVE_TYPE, '')) LIKE ?";
            $binds[] = '%' . strtoupper($leaveType) . '%';
        }

        if ($approvalStatus !== '') {
            $where[] = "UPPER(NVL(a.APPROVAL_STATUS, '')) LIKE ?";
            $binds[] = '%' . strtoupper($approvalStatus) . '%';
        }

        if ($search !== '') {
            $like = '%' . strtoupper($search) . '%';
            $where[] = "(
            UPPER(NVL(a.EMP_NO, '')) LIKE ?
            OR UPPER(NVL(a.DEPARTMENT_NAME, '')) LIKE ?
            OR UPPER(NVL(a.EMP_NAME, '')) LIKE ?
            OR UPPER(NVL(a.POSITION, '')) LIKE ?
            OR UPPER(NVL(a.LEAVE_TYPE, '')) LIKE ?
            OR UPPER(NVL(a.APPROVAL_STATUS, '')) LIKE ?
        )";

            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
            $binds[] = $like;
        }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        if ($type !== 'list') {
            $countSql = "SELECT COUNT(1) AS TOTAL FROM {$this->absence_details} a{$whereSql}";
            $row = $this->db->query($countSql, $binds)->row_array();
            return isset($row['TOTAL']) ? (int) $row['TOTAL'] : 0;
        }

        $sql = "SELECT 
                a.EMP_NO,
                a.DEPARTMENT_NAME,
                a.EMP_NAME,
                a.POSITION,
                a.LEAVE_START_DATE,
                a.LEAVE_END_DATE,
                a.TOTAL_DAYS,
                a.LEAVE_TYPE,
                a.APPROVAL_STATUS
            FROM {$this->absence_details} a
            {$whereSql}
            ORDER BY TO_DATE(TRIM(a.LEAVE_START_DATE), 'DD-MM-RR') DESC";

        if ($limit > 0) {
            $sql .= " OFFSET {$offset} ROWS FETCH NEXT {$limit} ROWS ONLY";
        }

        return $this->db->query($sql, $binds)->result_array();
    }
}
