<?php
defined('BASEPATH') or exit('No direct script access allowed');

?>

<?php $this->load->view('includes/__header'); ?>

<?php
if ($view !== '' && file_exists(APPPATH . 'views/' . $view . '.php')) {
    $this->load->view($view, $data);
} else {
    echo '<div style="padding:15px;color:red;">View file not found or not provided.</div>';
}
?>

<?php $this->load->view('includes/__footer'); ?>