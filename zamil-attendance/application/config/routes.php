<?php
defined('BASEPATH') or exit('No direct script access allowed');

$route['default_controller'] = 'Dashboard';
$route['404_override'] = '';
$route['translate_uri_dashes'] = FALSE;

$route['default_controller'] = 'dashboard';
$route['404_override'] = '';
$route['translate_uri_dashes'] = FALSE;

/*
|--------------------------------------------------------------------------
| Main
|--------------------------------------------------------------------------
*/
$route['employee_details'] = 'employee_details/index'; // load view
$route['employee_details/list'] = 'employee_details/list'; // load api data

/*
|--------------------------------------------------------------------------
| Manager View
|--------------------------------------------------------------------------
*/
$route['leave-requests'] = 'leave_request/index';
$route['alerts-exceptions'] = 'alerts_exceptions/index';
$route['alerts-exceptions/export'] = 'alerts_exceptions/export';

$route['manager'] = 'manager/index';
$route['manager/approve-absence'] = 'manager/approve_absence';
/*
|--------------------------------------------------------------------------
| Shifts - Full CRUD
|--------------------------------------------------------------------------
*/
$route['shifts'] = 'shifts/index'; // load view
$route['shifts/list'] = 'shifts/list'; // load api data
$route['shifts/create'] = 'shifts/create';
$route['shifts/store'] = 'shifts/store';
$route['shifts/edit/(:any)'] = 'shifts/edit/$1';
$route['shifts/update/(:any)'] = 'shifts/update/$1';
$route['shifts/delete/(:any)'] = 'shifts/delete/$1';
$route['shifts/view/(:any)'] = 'shifts/view/$1';

/*
|--------------------------------------------------------------------------
| Timetable - Full CRUD
|--------------------------------------------------------------------------
*/
$route['timetable'] = 'timetable/index';
$route['timetable/list'] = 'timetable/list';
$route['timetable/create'] = 'timetable/create';
$route['timetable/store'] = 'timetable/store';
$route['timetable/edit/(:num)'] = 'timetable/edit/$1';
$route['timetable/update/(:num)'] = 'timetable/update/$1';
$route['timetable/delete/(:num)'] = 'timetable/delete/$1';
$route['timetable/view/(:num)'] = 'timetable/view/$1';

/*
|--------------------------------------------------------------------------
| Reports - Only listing/report pages
|--------------------------------------------------------------------------
*/
$route['daily-attendance'] = 'daily_attendance/index';
$route['daily-attendance/export'] = 'daily_attendance/export';
$route['report/employee-details'] = 'employee_details/index';
$route['report/absence'] = 'absence/index';
$route['report/attendance-card'] = 'attendance_card/index';
$route['report/attendance-card/list'] = 'attendance_card/list';
$route['report/attendance-card/export'] = 'attendance_card/export_attendance_card';
$route['report/timesheet'] = 'timesheet/index';
$route['report/timesheet/list'] = 'timesheet/list';
$route['report/timesheet/export'] = 'timesheet/export_timesheet';
$route['report/payroll-file'] = 'payroll_file/index';
$route['report/payroll-file/list'] = 'payroll_file/list';
$route['report/payroll-file/export'] = 'payroll_file/export_payroll_file';
$route['report/payroll-file/save-adjustment'] = 'Payroll_file/save_adjustment';
/*
|--------------------------------------------------------------------------
| Shift Details / Sub Shifts
|--------------------------------------------------------------------------
*/
$route['shift-details'] = 'shift_details/index';
$route['shift-details/list'] = 'shift_details/list';
$route['shift-details/create'] = 'shift_details/create';
$route['shift-details/save'] = 'shift_details/save';


/*
|--------------------------------------------------------------------------
| Interface
|--------------------------------------------------------------------------
*/
$route['contractor'] = 'contractor/index';
$route['contractor/list'] = 'contractor/list';
$route['contractor/export'] = 'contractor/export_contractor';
$route['contractor/form'] = 'contractor/form';
$route['contractor/form/(:num)'] = 'contractor/form/$1';
$route['contractor/lookup'] = 'contractor/lookup_by_number';
$route['contractor/store'] = 'contractor/store';
$route['contractor/update/(:num)'] = 'contractor/update/$1';
$route['contractor/delete/(:num)'] = 'contractor/delete/$1';

// Contractor employees
$route['contractor/employees'] = 'contractor/employee_index';
$route['contractor/employees/list'] = 'contractor/employee_list';
$route['contractor/employees/export'] = 'contractor/export_employee';
$route['contractor/employees/form'] = 'contractor/employee_form';
$route['contractor/employees/form/(:num)'] = 'contractor/employee_form/$1';
$route['contractor/employees/store'] = 'contractor/employee_store';
$route['contractor/employees/update/(:num)'] = 'contractor/employee_update/$1';
$route['contractor/employees/delete/(:num)'] = 'contractor/employee_delete/$1';

// Summary report
$route['report/contractor-summary'] = 'contractor/summary_index';
$route['report/contractor-summary/list'] = 'contractor/summary_list';
$route['report/contractor-summary/export'] = 'contractor/export_summary';


/*
|--------------------------------------------------------------------------
| Interface
|--------------------------------------------------------------------------
*/

$route['interface'] = 'attendance_card/interface';

/*
|--------------------------------------------------------------------------
| Account
|--------------------------------------------------------------------------
*/
$route['logout'] = 'auth/logout';



$route['function_feature'] = 'function_feature/index';