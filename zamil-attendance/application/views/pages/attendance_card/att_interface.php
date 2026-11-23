<div class="container-fluid attendance-card-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="attendance-card-page-shell">
                <div class="attendance-card-page-topbar">
                    <div class="attendance-card-title-wrap">
                        <div class="attendance-card-title-icon">
                            <i class="ti ti-id"></i>
                        </div>
                        <div>
                            <h1 class="attendance-card-page-title">Attendance Interface</h1>
                        </div>


                    </div>

                </div>
                <!-- HEADER -->
                <div class="px-3 py-3 bg-white">
                    <!-- COLUMN LIST -->
                    <div class="d-flex flex-column ">
                        <!-- ITEM -->
                        <div class="d-flex align-items-center gap-2">
                            <div class="attendance-card-title-icon gap-2">
                                <i class="ti ti-calendar-check"></i>
                            </div>
                            <a href="javascript:void(0);"
                                onclick="openAttendanceGenerator(this)"
                                class="text-decoration-none  hover-link attendance-link">
                                Generate Attendance
                            </a>
                        </div>

                        <div class="d-flex align-items-center gap-2 mt-3">
                            <div class="attendance-card-title-icon gap-2">
                                <i class="ti ti-file-upload"></i>
                            </div>
                            <a href="javascript:void(0);" onclick="openAttendanceUpload()" class="text-decoration-none hover-link attendance-link">
                                Upload Attendance File
                            </a>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    </div>
</div>

<!-- STYLE -->
<style>
    .attendance-card-page .attendance-card-title-wrap,
    .attendance-card-page .attendance-card-heading {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .attendance-card-page .attendance-card-page-title {
        margin: 0 0 1px;
        font-size: 17px;
        font-weight: 700;
        color: var(--attendance-text);
        letter-spacing: -0.12px;
    }

    .attendance-card-page .attendance-card-title-icon {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: #16833f;
        font-size: 14px;
        flex: 0 0 auto;
    }

    .icon-box {
        width: 32px;
        height: 32px;
        font-size: 15px;
    }

    .attendance-link {
        font-weight: 500;
        font-size: 13px;
    }

    .attendance-card-page .attendance-card-page-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 12px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fbf8 100%);
        box-shadow: var(--attendance-shadow);
    }
</style>
<?php $this->load->view('pages/attendance_card/mdl-generate-attendance'); ?>
<?php $this->load->view('pages/attendance_card/mdl-upload-attendance'); ?>