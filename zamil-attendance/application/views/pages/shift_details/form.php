<?php
$shiftOptions = isset($shiftOptions) && is_array($shiftOptions) ? $shiftOptions : [];
$selectedShiftUuid = isset($selectedShiftUuid) ? (string) $selectedShiftUuid : '';
$detailBundle = isset($detailBundle) && is_array($detailBundle) ? $detailBundle : [];
$defaultRows = isset($defaultRows) && is_array($defaultRows) ? $defaultRows : [];
$formErrors = isset($formErrors) && is_array($formErrors) ? $formErrors : [];
$pageError = isset($pageError) ? (string) $pageError : '';
$flashError = isset($flashError) ? (string) $flashError : '';
$flashSuccess = isset($flashSuccess) ? (string) $flashSuccess : '';

$selectedShift = isset($detailBundle['shift']) && is_array($detailBundle['shift']) ? $detailBundle['shift'] : [];
$rows = isset($detailBundle['rows']) && is_array($detailBundle['rows']) ? $detailBundle['rows'] : $defaultRows;
$hasExistingDetails = !empty($detailBundle['has_existing_details']);

$shiftUuidError = isset($formErrors['shift_uuid']) ? (string) $formErrors['shift_uuid'] : '';
?>

<style>
    .subshift-form-page {
        --line: #dde6df;
        --line-soft: #ebf2ed;
        --text: #0f172a;
        --muted: #667085;
        --head-bg: #f6faf7;
        --primary: #16833f;
        --primary-deep: #116632;
    }

    .subshift-form-page .page-shell {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .subshift-form-page .page-topbar,
    .subshift-form-page .card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 8px;
    }

    .subshift-form-page .title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .subshift-form-page .title-icon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #e9f6ee;
        color: var(--primary);
        font-size: 14px;
    }

    .subshift-form-page .page-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: var(--text);
    }

    .subshift-form-page .btn {
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
    }

    .subshift-form-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--primary) !important;
        border-color: #c0edd1 !important;
    }

    .subshift-form-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--primary) !important;
        border-color: var(--primary) !important;
    }

    .subshift-form-page .form-card,
    .subshift-form-page .detail-card {
        border: 1px solid var(--line);
        border-radius: 4px;
        background: #fff;
        overflow: hidden;
    }

    .subshift-form-page .card-body-wrap {
        padding: 10px;
    }

    .subshift-form-page .form-label {
        font-size: 11px;
        font-weight: 700;
        color: #475467;
        margin-bottom: 5px;
    }

    .subshift-form-page .form-control,
    .subshift-form-page .form-select {
        height: 34px;
        border-radius: 6px;
        border: 1px solid #d6e1da;
        font-size: 12px;
    }

    .subshift-form-page .header-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
    }

    .subshift-form-page .header-chip {
        border: 1px solid #e5efe8;
        border-radius: 8px;
        padding: 8px;
        background: #fbfdfb;
    }

    .subshift-form-page .header-chip-label {
        font-size: 10px;
        color: #667085;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 3px;
    }

    .subshift-form-page .header-chip-value {
        font-size: 12px;
        color: #0f172a;
        font-weight: 600;
    }

    .subshift-form-page .table-responsive {
        overflow: auto;
    }

    .subshift-form-page .detail-table {
        min-width: 820px;
        margin: 0;
    }

    .subshift-form-page .detail-table thead th {
        background: var(--head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.28px;
        padding: 6px 8px;
        white-space: nowrap;
        border-bottom: 1px solid var(--line-soft);
        text-align: center;
        vertical-align: middle;
    }

    .subshift-form-page .detail-table tbody td {
        font-size: 12px;
        color: #475467;
        padding: 6px 8px;
        border-bottom: 1px solid #eff3f8;
        vertical-align: middle;
    }

    .subshift-form-page .detail-table tbody td:first-child,
    .subshift-form-page .detail-table tbody td:nth-child(2) {
        text-align: center;
        white-space: nowrap;
    }

    .subshift-form-page .weekday-text {
        font-weight: 600;
        color: #0f172a;
    }

    .subshift-form-page .invalid-feedback {
        display: block;
        font-size: 11px;
    }

    .subshift-form-page .submit-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding: 10px;
        border-top: 1px solid var(--line-soft);
        background: #fff;
    }

    @media (max-width: 991.98px) {
        .subshift-form-page .header-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 575.98px) {
        .subshift-form-page .header-grid {
            grid-template-columns: 1fr;
        }
    }
</style>

<div class="container-fluid subshift-form-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="page-shell">
                <div class="page-topbar">
                    <div class="title-wrap">
                        <div class="title-icon">
                            <i class="ti ti-clock-hour-4"></i>
                        </div>
                        <div>
                            <h1 class="page-title">Manage Sub Shifts</h1>
                        </div>
                    </div>

                    <div class="d-flex gap-2">
                        <a href="<?= base_url('shift-details') ?>" class="btn btn-outline-secondary">
                            <i class="ti ti-arrow-left me-1"></i> Back to List
                        </a>
                    </div>
                </div>

                <?php if ($flashSuccess !== '') : ?>
                    <div class="alert alert-success mb-0"><?= html_escape($flashSuccess) ?></div>
                <?php endif; ?>

                <?php if ($flashError !== '') : ?>
                    <div class="alert alert-danger mb-0"><?= html_escape($flashError) ?></div>
                <?php endif; ?>

                <?php if ($pageError !== '') : ?>
                    <div class="alert alert-danger mb-0"><?= html_escape($pageError) ?></div>
                <?php endif; ?>

                <div class="form-card">
                    <div class="card-toolbar">
                        <div class="title-wrap">
                            <div class="title-icon">
                                <i class="ti ti-settings"></i>
                            </div>
                            <div>
                                <h2 class="page-title" style="font-size: 14px;">Select Shift</h2>
                            </div>
                        </div>
                    </div>

                    <div class="card-body-wrap">
                        <form method="get" action="<?= base_url('shift-details/create') ?>" id="shiftSelectionForm">
                            <div class="row g-2">
                                <div class="col-lg-6 col-md-8 col-sm-12">
                                    <label for="shift_uuid_select" class="form-label">Shift Name</label>
                                    <select name="shift_uuid" id="shift_uuid_select" class="form-select <?= $shiftUuidError !== '' ? 'is-invalid' : '' ?>">
                                        <option value="">Select Shift</option>
                                        <?php foreach ($shiftOptions as $shift) : ?>
                                            <?php
                                            $uuid = isset($shift['UUID']) ? (string) $shift['UUID'] : '';
                                            $shiftName = isset($shift['SHIFT_NAME']) ? (string) $shift['SHIFT_NAME'] : '';
                                            ?>
                                            <?php if ($uuid === '' || $shiftName === '') {
                                                continue;
                                            } ?>
                                            <option value="<?= html_escape($uuid) ?>" <?= $selectedShiftUuid === $uuid ? 'selected' : '' ?>>
                                                <?= html_escape($shiftName) ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                    <?php if ($shiftUuidError !== '') : ?>
                                        <div class="invalid-feedback"><?= html_escape($shiftUuidError) ?></div>
                                    <?php endif; ?>
                                </div>

                                <div class="col-lg-2 col-md-4 col-sm-12 d-flex align-items-end">
                                    <button type="submit" class="btn btn-outline-secondary w-100">
                                        <i class="ti ti-search me-1"></i> Load
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                <?php if (!empty($selectedShift)) : ?>
                    <div class="detail-card">
                        <div class="card-toolbar">
                            <div class="title-wrap">
                                <div class="title-icon">
                                    <i class="ti ti-info-circle"></i>
                                </div>
                                <div>
                                    <h2 class="page-title" style="font-size: 14px;">Shift Header Details</h2>
                                </div>
                            </div>
                        </div>

                        <div class="card-body-wrap">
                            <div class="header-grid">
                                <div class="header-chip">
                                    <div class="header-chip-label">Shift Name</div>
                                    <div class="header-chip-value"><?= html_escape($selectedShift['SHIFT_NAME'] ?? '-') ?></div>
                                </div>
                                <div class="header-chip">
                                    <div class="header-chip-label">Status</div>
                                    <div class="header-chip-value"><?= html_escape($selectedShift['STATUS'] ?? '-') ?></div>
                                </div>
                                <div class="header-chip">
                                    <div class="header-chip-label">Start Date</div>
                                    <div class="header-chip-value"><?= html_escape($selectedShift['START_DATE'] ?? '-') ?></div>
                                </div>
                                <div class="header-chip">
                                    <div class="header-chip-label">End Date</div>
                                    <div class="header-chip-value"><?= html_escape($selectedShift['END_DATE'] ?? '-') ?></div>
                                </div>
                                <div class="header-chip">
                                    <div class="header-chip-label">Check In</div>
                                    <div class="header-chip-value"><?= html_escape($selectedShift['CHECK_IN'] ?? '-') ?></div>
                                </div>
                                <div class="header-chip">
                                    <div class="header-chip-label">Check Out</div>
                                    <div class="header-chip-value"><?= html_escape($selectedShift['CHECK_OUT'] ?? '-') ?></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="detail-card">
                        <div class="card-toolbar">
                            <div class="title-wrap">
                                <div class="title-icon">
                                    <i class="ti ti-calendar-week"></i>
                                </div>
                                <div>
                                    <h2 class="page-title" style="font-size: 14px;">Shift Detail Rows</h2>
                                </div>
                            </div>
                        </div>

                        <form method="post" action="<?= base_url('shift-details/save') ?>" id="shiftDetailForm" novalidate>
                            <input type="hidden" name="<?= $this->security->get_csrf_token_name(); ?>" value="<?= $this->security->get_csrf_hash(); ?>">
                            <input type="hidden" name="shift_uuid" value="<?= html_escape($selectedShiftUuid) ?>">

                            <div class="table-responsive">
                                <table class="table detail-table align-middle">
                                    <thead>
                                        <tr>
                                            <th style="width: 60px;">#</th>
                                            <th style="width: 180px;">Weekday</th>
                                            <th>Punch In</th>
                                            <th>Punch Out</th>
                                            <th>Gross Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($rows as $row) : ?>
                                            <?php
                                            $dayNo = isset($row['day_no']) ? (int) $row['day_no'] : 0;
                                            $weekdayName = isset($row['weekday_name']) ? (string) $row['weekday_name'] : '';
                                            $punchIn = isset($row['punch_in']) ? (string) $row['punch_in'] : '';
                                            $punchOut = isset($row['punch_out']) ? (string) $row['punch_out'] : '';
                                            $grossTime = isset($row['gross_time']) ? (string) $row['gross_time'] : '';
                                            $rowErrors = isset($formErrors['rows'][$dayNo]) && is_array($formErrors['rows'][$dayNo]) ? $formErrors['rows'][$dayNo] : [];
                                            ?>
                                            <tr>
                                                <td>
                                                    <?= (int) $dayNo ?>
                                                    <input type="hidden" name="rows[<?= (int) $dayNo ?>][day_no]" value="<?= (int) $dayNo ?>">
                                                    <input type="hidden" name="rows[<?= (int) $dayNo ?>][weekday_name]" value="<?= html_escape($weekdayName) ?>">
                                                </td>
                                                <td class="weekday-text"><?= html_escape($weekdayName) ?></td>
                                                <td>
                                                    <input type="time" name="rows[<?= (int) $dayNo ?>][punch_in]" class="form-control <?= !empty($rowErrors['punch_in']) ? 'is-invalid' : '' ?>" value="<?= html_escape($punchIn) ?>" step="60">
                                                    <?php if (!empty($rowErrors['punch_in'])) : ?>
                                                        <div class="invalid-feedback"><?= html_escape($rowErrors['punch_in']) ?></div>
                                                    <?php endif; ?>
                                                </td>
                                                <td>
                                                    <input type="time" name="rows[<?= (int) $dayNo ?>][punch_out]" class="form-control <?= !empty($rowErrors['punch_out']) ? 'is-invalid' : '' ?>" value="<?= html_escape($punchOut) ?>" step="60">
                                                    <?php if (!empty($rowErrors['punch_out'])) : ?>
                                                        <div class="invalid-feedback"><?= html_escape($rowErrors['punch_out']) ?></div>
                                                    <?php endif; ?>
                                                </td>
                                                <td>
                                                    <input type="time" name="rows[<?= (int) $dayNo ?>][gross_time]" class="form-control <?= !empty($rowErrors['gross_time']) ? 'is-invalid' : '' ?>" value="<?= html_escape($grossTime) ?>" step="60">
                                                    <?php if (!empty($rowErrors['gross_time'])) : ?>
                                                        <div class="invalid-feedback"><?= html_escape($rowErrors['gross_time']) ?></div>
                                                    <?php endif; ?>
                                                </td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            </div>

                            <div class="submit-bar">
                                <div style="font-size: 12px; color: #667085;">
                                    <?= $hasExistingDetails ? 'Existing records found for this shift. Saving will update them.' : 'No detail rows found for this shift. Saving will create 7 rows.' ?>
                                </div>

                                <div class="d-flex gap-2">
                                    <a href="<?= base_url('shift-details') ?>" class="btn btn-outline-secondary">Cancel</a>
                                    <button type="submit" class="btn btn-primary" id="saveShiftDetailBtn">
                                        <i class="ti ti-device-floppy me-1"></i>
                                        <?= $hasExistingDetails ? 'Update Shift Details' : 'Save Shift Details' ?>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                <?php else : ?>
                    <div class="alert alert-info mb-0">
                        Please select a shift first. If detail rows already exist, they will be loaded. Otherwise, empty Sunday to Saturday rows will be shown.
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>