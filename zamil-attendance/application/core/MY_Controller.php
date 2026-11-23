<?php
defined('BASEPATH') or exit('No direct script access allowed');

class MY_Controller extends CI_Controller
{
    public $userDetails;

    public function __construct()
    {
        parent::__construct();
        $this->load->library('zamil_sso');
        $this->isAuthenticated();
        $this->userDetails = $this->getUserDetails();
        $this->load->vars(['loggedInUser' => $this->userDetails]);
    }

    /**
     * Details of the signed-in employee from the attendance session.
     *
     * @return array Associative array of user details, or an empty array.
     */
    protected function getUserDetails()
    {
        $userID = $this->session->userdata('FormsSession');
        if ($userID === null || $userID === '') {
            return [];
        }
        $userDetails = $this->db->query(
            "SELECT DISTINCT USER_ID, USER_NAME, FULL_NAME, EMPLOYEE_NUMBER, EMAIL_ADDRESS FROM XX_DIGI_EMP_MASTER WHERE USER_ID = ?",
            [$userID]
        )->row_array();
        return $userDetails ?? [];
    }

    function currentURL()
    {
        $actual_link = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http") . "://$_SERVER[HTTP_HOST]$_SERVER[REQUEST_URI]";
        return base64_encode($actual_link);
    }

    /**
     * Single sign-on with Zamil Digitalization (same model as TrainingHub and
     * ExpenseHub). The attendance session is trusted only while it belongs to
     * the same Zamil session cookie and is re-validated every
     * `recheck_seconds`, so signing out of Zamil also ends access here.
     */
    protected function isAuthenticated()
    {
        $fingerprint = $this->zamil_sso->fingerprint();
        $session = $this->session;

        $isFresh = $fingerprint !== null
            && $session->userdata('FormsSession')
            && hash_equals((string) $session->userdata('zamil_sso_fp'), $fingerprint)
            && (int) $session->userdata('zamil_sso_expires') > time()
            && time() - (int) $session->userdata('zamil_sso_checked_at') < (int) $this->zamil_sso->config('recheck_seconds');
        if ($isFresh) {
            return true;
        }

        $identity = $this->zamil_sso->resolveIdentity();
        if ($identity === null) {
            $this->clearAttendanceSession();
            if ($this->zamil_sso->lastError === Zamil_sso::RESULT_UNAVAILABLE) {
                $this->denyAccess(503, 'Zamil sign-in could not be checked',
                    'The Zamil Digitalization service did not respond. Make sure it is running, then reload this page.');
            }
            $this->redirectToZamilLogin();
        }

        $userId = $this->db->query(
            "SELECT MAX(USER_ID) AS USER_ID FROM XX_DIGI_EMP_MASTER WHERE EMPLOYEE_NUMBER = ?",
            [$identity['employeeNumber']]
        )->row('USER_ID');
        if ($userId === null || $userId === '') {
            $this->clearAttendanceSession();
            $this->denyAccess(403, 'No attendance profile',
                'Your Zamil account (employee ' . html_escape($identity['employeeNumber'])
                . ') is not linked to an employee record in the attendance system.');
        }

        // New sign-in or a different Zamil user: start a fresh session id.
        if ((string) $session->userdata('FormsSession') !== (string) $userId) {
            $session->sess_regenerate(true);
        }
        $session->set_userdata([
            'FormsSession'          => $userId,
            'zamil_employee_number' => $identity['employeeNumber'],
            'zamil_sso_fp'          => $fingerprint,
            'zamil_sso_expires'     => $identity['expiresAt'],
            'zamil_sso_checked_at'  => time(),
        ]);
        return true;
    }

    protected function clearAttendanceSession()
    {
        $this->session->unset_userdata([
            'FormsSession', 'zamil_employee_number', 'zamil_sso_fp', 'zamil_sso_expires', 'zamil_sso_checked_at',
        ]);
    }

    protected function zamilLoginUrl()
    {
        return $this->zamil_sso->loginUrl();
    }

    protected function redirectToZamilLogin()
    {
        if ($this->input->is_ajax_request()) {
            $this->denyAccess(401, 'Session expired', 'Sign in to Zamil Digitalization again.');
        }
        redirect($this->zamilLoginUrl());
    }

    /**
     * Stop the request with a JSON (AJAX) or HTML response.
     */
    protected function denyAccess($status, $title, $message)
    {
        if ($this->input->is_ajax_request()) {
            $this->output
                ->set_status_header($status)
                ->set_content_type('application/json')
                ->set_output(json_encode([
                    'success' => false,
                    'message' => $message,
                    'loginUrl' => $this->zamilLoginUrl(),
                ]))
                ->_display();
            exit;
        }

        $loginUrl = html_escape($this->zamilLoginUrl());
        set_status_header($status);
        echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<title>' . html_escape($title) . '</title>'
            . '<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#1f2937;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}'
            . 'main{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:32px;max-width:460px}h1{font-size:20px;margin:0 0 12px}'
            . 'a{display:inline-block;margin-top:16px;color:#fff;background:#1d4ed8;padding:8px 16px;border-radius:6px;text-decoration:none}</style></head>'
            . '<body><main><h1>' . html_escape($title) . '</h1><p>' . $message . '</p>'
            . '<a href="' . $loginUrl . '">Go to Zamil Digitalization</a></main></body></html>';
        exit;
    }
}
