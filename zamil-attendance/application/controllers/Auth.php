<?php
defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Sign-out for the attendance system. Sign-in is handled by Zamil
 * Digitalization (see MY_Controller::isAuthenticated), so this controller
 * deliberately does not extend MY_Controller.
 */
class Auth extends CI_Controller
{
    public function logout()
    {
        // POST only: a cross-site GET must not be able to sign the user out.
        if ($this->input->method() !== 'post') {
            redirect(base_url());
        }
        $this->load->library('zamil_sso');

        // Revoke the central Zamil session too; otherwise single sign-on would
        // sign the user straight back in on the next request.
        $this->zamil_sso->revokeSession();
        $this->session->sess_destroy();

        redirect($this->zamil_sso->loginUrl());
    }
}
