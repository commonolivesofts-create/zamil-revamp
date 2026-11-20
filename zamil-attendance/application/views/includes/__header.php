<?php
defined('BASEPATH') or exit('No direct script access allowed');
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <title><?= html_escape(isset($title) ? $title : APP_TITLE) ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml"
        href="https://cdn-ilbbkmj.nitrocdn.com/cRYFiDiEDxSTYcPdyCcSPfHxCQdqrdfA/assets/images/optimized/rev-55dae52/zamilplastic.com/favicon.svg" />
    <link rel="manifest" href="<?= base_url() ?>assets/site.webmanifest">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css">

    <script type="module" crossorigin src="<?= base_url() ?>assets/js/main.js"></script>
    <link rel="stylesheet" crossorigin href="<?= base_url() ?>assets/css/main.css">
    <link rel="stylesheet" href="<?= base_url() ?>assets/css/app.css">

    <?= render_css($css ?? []) ?>
</head>

<body>
    <div id="overlay" class="overlay"></div>
    <!-- TOPBAR -->
    <?php
    if (file_exists(APPPATH . 'views/includes/__topbar.php')) {
        $this->load->view('includes/__topbar');
    }
    ?>

    <!-- SIDEBAR -->
    <?php
    if (file_exists(APPPATH . 'views/includes/__sidebar.php')) {
        $this->load->view('includes/__sidebar');
    }
    ?>

    <!-- MAIN CONTENT -->
    <main id="content" class="content py-9">
        <div class="container-fluid">