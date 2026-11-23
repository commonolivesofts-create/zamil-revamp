<?php
defined('BASEPATH') or exit('No direct script access allowed');

class Dashboard extends MY_Controller
{
	public function index()
	{
		$this->load->model('Dashboard_model', 'dashboardModel');

		$dashboardPayload = $this->dashboardModel->get_dashboard_payload();

		$layoutConfig = [
			'view' => 'pages/home/main',
			'title' => 'Zamil Payroll Management System - Overview',
			'heading' => '',
			'active-link' => 'dashboard',
			'css' => [ 'assets/css/dashboard.css'],
			'scripts' => [
				'assets/js/pages/dashboard/main.js',
			],
			'data' => [
				'dashboardPayload' => $dashboardPayload,
			],
		];

		$this->load->view('layout', $layoutConfig);
	}
}

