<?php
$shift = isset($shift) && is_array($shift) ? $shift : [];
$detailRows = isset($detailRows) && is_array($detailRows) ? $detailRows : [];
$formErrors = isset($formErrors) && is_array($formErrors) ? $formErrors : [];
$flashError = isset($flashError) ? (string) $flashError : '';
$flashSuccess = isset($flashSuccess) ? (string) $flashSuccess : '';
$weekdayMap = [
    1 => 'Sunday',
    2 => 'Monday',
    3 => 'Tuesday',
    4 => 'Wednesday',
    5 => 'Thursday',
    6 => 'Friday',
    7 => 'Saturday',
];

$detailRowsByDay = [];
foreach ($detailRows as $row) {
    $dayNo = isset($row['day_no']) ? (int) $row['day_no'] : 0;
    if ($dayNo >= 1 && $dayNo <= 7) {
        $detailRowsByDay[$dayNo] = $row;
    }
}

$summaryRows = [
    'Shift Name' => $shift['shift_name'] ?? '-',
    'Status' => $shift['status_display'] ?? '-',
    'Start Date' => $shift['start_date_display'] ?? '-',
    'End Date' => $shift['end_date_display'] ?? '-',
    'Check In' => $shift['check_in_display'] ?? '-',
    'Check Out' => $shift['check_out_display'] ?? '-',
    'Weekday Overtime Cap' => $shift['weekday_ovrtm_cap_display'] ?? '-',
    'Weekend Overtime Cap' => $shift['weekend_ovrtm_cap_display'] ?? '-',
    'Created At' => $shift['created_at'] ?? '-',
];
?>

<style>
    .shift-view-page {
        --line: #dde6df;
        --line-soft: #ebf2ed;
        --text: #0f172a;
        --muted: #667085;
        --head-bg: #f6faf7;
        --primary: #16833f;
        --primary-deep: #116632;
    }

    .shift-view-page .page-shell {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .shift-view-page .page-topbar,
    .shift-view-page .card-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 8px;
    }

    .shift-view-page .title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .shift-view-page .title-icon {
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

    .shift-view-page .page-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: var(--text);
    }

    .shift-view-page .btn {
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
    }

    .shift-view-page .btn-primary {
        background: #e9f6ee !important;
        color: var(--primary) !important;
        border-color: #c0edd1 !important;
    }

    .shift-view-page .btn-outline-secondary {
        background: #ffffff !important;
        color: var(--primary) !important;
        border-color: var(--primary) !important;
    }

    .shift-view-page .detail-card {
        border: 1px solid var(--line);
        border-radius: 4px;
        background: #fff;
        overflow: hidden;
        height: 100%;
    }

    .shift-view-page .card-body-wrap {
        padding: 10px;
    }

    .shift-view-page .invalid-feedback {
        display: block;
        font-size: 11px;
        text-align: left;
        margin-top: 4px;
    }

    .shift-view-page .summary-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .shift-view-page .summary-row {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) minmax(0, 1fr);
        gap: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--line-soft);
    }

    .shift-view-page .summary-row:last-child {
        border-bottom: 0;
        padding-bottom: 0;
    }

    .shift-view-page .summary-key {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
    }

    .shift-view-page .summary-value {
        font-size: 12px;
        color: #475467;
        font-weight: 600;
        text-align: left;
        word-break: break-word;
    }

    .shift-view-page .table-responsive {
        overflow: auto;
    }

    .shift-view-page .detail-table {
        margin: 0;
        min-width: 560px;
    }

    .shift-view-page .detail-table thead th {
        background: var(--head-bg);
        color: #475467;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.28px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--line-soft);
        white-space: nowrap;
        text-align: center;
    }

    .shift-view-page .detail-table tbody td {
        font-size: 12px;
        color: #475467;
        padding: 6px 8px;
        border-bottom: 1px solid #eff3f8;
        text-align: center;
        vertical-align: middle;
    }

    .shift-view-page .detail-table tbody td:nth-child(2) {
        text-align: center;
        white-space: nowrap;
    }

    .shift-view-page .time-input-wrap {
        position: relative;
        width: 100%;
    }

    .shift-view-page .time-input {
        border: 1px solid #d6e1da;
        border-radius: 6px;
        background: #fff;
        color: var(--text);
        font-size: 12px;
        font-weight: 500;
        height: 34px;
        width: 100%;
        padding: 6px 36px 6px 12px;
        text-align: left;
        direction: ltr;
        appearance: auto;
        -webkit-appearance: auto;
    }

    .shift-view-page .time-input.is-invalid {
        border-color: #dc3545;
    }

    .shift-view-page .time-input::-webkit-calendar-picker-indicator {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        margin: 0;
        opacity: 1;
        cursor: pointer;
    }

    .shift-view-page .time-input::-webkit-datetime-edit,
    .shift-view-page .time-input::-webkit-datetime-edit-fields-wrapper {
        padding: 0;
    }

    .shift-view-page .weekday-text {
        font-weight: 600;
        color: #0f172a;
    }

    .shift-view-page .submit-bar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        padding: 10px;
        border-top: 1px solid var(--line-soft);
        background: #fff;
    }

    @media (max-width: 767.98px) {
        .shift-view-page .summary-row {
            grid-template-columns: 1fr;
            gap: 4px;
        }
    }
</style>

<div class="container-fluid shift-view-page">
    <div class="row">
        <div class="col-12 p-0">
            <div class="page-shell">
                <div class="page-topbar">
                    <div class="title-wrap">
                        <div class="title-icon">
                            <i class="ti ti-eye"></i>
                        </div>
                        <div>
                            <h1 class="page-title">View Shift</h1>
                        </div>
                    </div>

                    <div class="d-flex gap-2">
                        <a href="<?= base_url('shifts') ?>" class="btn btn-outline-secondary">
                            <i class="ti ti-arrow-left me-1"></i> Back to List
                        </a>
                    </div>
                </div>

                <?php if ($flashSuccess !== ''): ?>
                    <div class="alert alert-success mb-0"><?= html_escape($flashSuccess) ?></div>
                <?php endif; ?>

                <?php if ($flashError !== ''): ?>
                    <div class="alert alert-danger mb-0"><?= html_escape($flashError) ?></div>
                <?php endif; ?>

                <div class="row g-2">
                    <div class="col-lg-5">
                        <div class="detail-card">
                            <div class="card-toolbar">
                                <div class="title-wrap">
                                    <div class="title-icon">
                                        <i class="ti ti-info-circle"></i>
                                    </div>
                                    <div>
                                        <h2 class="page-title" style="font-size: 14px;">Shift Details</h2>
                                    </div>
                                </div>
                            </div>

                            <div class="card-body-wrap">
                                <div class="summary-list">
                                    <?php foreach ($summaryRows as $label => $value): ?>
                                        <div class="summary-row">
                                            <div class="summary-key weekday-text"><?= html_escape($label) ?></div>
                                            <div class="summary-value"><?= html_escape($value !== '' ? $value : '-') ?>
                                            </div>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-lg-7">
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

                            <form method="post" action="<?= base_url('shift-details/save') ?>" novalidate>
                                <input type="hidden" name="<?= $this->security->get_csrf_token_name(); ?>"
                                    value="<?= $this->security->get_csrf_hash(); ?>">
                                <input type="hidden" name="shift_uuid"
                                    value="<?= html_escape((string) ($shift['uuid'] ?? '')) ?>">
                                <input type="hidden" name="return_url"
                                    value="<?= html_escape(base_url('shifts/view/' . rawurlencode((string) ($shift['uuid'] ?? '')))) ?>">

                                <div class="card-body-wrap">
                                    <div class="table-responsive">
                                        <table class="table detail-table align-middle">
                                            <thead>
                                                <tr>
                                                    <th style="width: 60px;">#</th>
                                                    <th style="width: 180px;">Weekday</th>
                                                    <th>Punch In</th>
                                                    <th>Punch Out</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <?php for ($dayNo = 1; $dayNo <= 7; $dayNo++): ?>
                                                    <?php
                                                    $row = isset($detailRowsByDay[$dayNo]) ? $detailRowsByDay[$dayNo] : [];
                                                    $rowErrors = isset($formErrors['rows'][$dayNo]) && is_array($formErrors['rows'][$dayNo]) ? $formErrors['rows'][$dayNo] : [];
                                                    $weekdayName = isset($row['weekday_name']) && trim((string) $row['weekday_name']) !== ''
                                                        ? (string) $row['weekday_name']
                                                        : ($weekdayMap[$dayNo] ?? '');
                                                    $punchIn = isset($row['punch_in']) ? trim((string) $row['punch_in']) : '';
                                                    $punchOut = isset($row['punch_out']) ? trim((string) $row['punch_out']) : '';
                                                    ?>
                                                    <tr>
                                                        <td>
                                                            <?= (int) $dayNo ?>
                                                            <input type="hidden" name="rows[<?= (int) $dayNo ?>][day_no]"
                                                                value="<?= (int) $dayNo ?>">
                                                            <input type="hidden"
                                                                name="rows[<?= (int) $dayNo ?>][weekday_name]"
                                                                value="<?= html_escape($weekdayName) ?>">
                                                        </td>
                                                        <td class="weekday-text">
                                                            <?= html_escape($weekdayName !== '' ? $weekdayName : '-') ?>
                                                        </td>
                                                        <td>
                                                            <div class="time-input-wrap">
                                                                <input type="time"
                                                                    name="rows[<?= (int) $dayNo ?>][punch_in]"
                                                                    class="form-control time-input <?= !empty($rowErrors['punch_in']) ? 'is-invalid' : '' ?>"
                                                                    value="<?= html_escape($punchIn) ?>" step="60">
                                                            </div>
                                                            <?php if (!empty($rowErrors['punch_in'])): ?>
                                                                <div class="invalid-feedback">
                                                                    <?= html_escape($rowErrors['punch_in']) ?>
                                                                </div>
                                                            <?php endif; ?>
                                                        </td>
                                                        <td>
                                                            <div class="time-input-wrap">
                                                                <input type="time"
                                                                    name="rows[<?= (int) $dayNo ?>][punch_out]"
                                                                    class="form-control time-input <?= !empty($rowErrors['punch_out']) ? 'is-invalid' : '' ?>"
                                                                    value="<?= html_escape($punchOut) ?>" step="60">
                                                            </div>
                                                            <?php if (!empty($rowErrors['punch_out'])): ?>
                                                                <div class="invalid-feedback">
                                                                    <?= html_escape($rowErrors['punch_out']) ?>
                                                                </div>
                                                            <?php endif; ?>
                                                        </td>
                                                    </tr>
                                                <?php endfor; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div class="submit-bar">
                                    <div class="d-flex gap-2">
                                        <button type="submit" class="btn btn-primary">
                                            <i class="ti ti-device-floppy me-1"></i> Update Shift Details
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</div>

<script>
    document.addEventListener("DOMContentLoaded", () => {
        const detailForm = document.querySelector('.shift-view-page form[action$="shift-details/save"]');
        if (!detailForm) {
            return;
        }

        const showToast = (type, message) => {
            if (typeof toasterNotification === "function") {
                toasterNotification({ type, message });
                return;
            }

            if (typeof Swal !== "undefined" && Swal.fire) {
                Swal.fire({
                    icon: type,
                    title: String(message || "").replace(/<[^>]*>/g, "").trim(),
                    toast: true,
                    position: "top-end",
                    timer: 1800,
                    showConfirmButton: false,
                    timerProgressBar: true,
                });
                return;
            }

            alert(message);
        };

        const clearFieldErrors = () => {
            detailForm.querySelectorAll(".is-invalid").forEach((element) => {
                element.classList.remove("is-invalid");
            });

            detailForm.querySelectorAll(".invalid-feedback").forEach((element) => {
                element.remove();
            });
        };

        const showFieldErrors = (errors) => {
            if (!errors || typeof errors !== "object" || !errors.rows) {
                return;
            }

            Object.keys(errors.rows).forEach((dayNo) => {
                const rowErrors = errors.rows[dayNo];
                if (!rowErrors || typeof rowErrors !== "object") {
                    return;
                }

                ["punch_in", "punch_out"].forEach((field) => {
                    const message = String(rowErrors[field] || "").trim();
                    if (!message) {
                        return;
                    }

                    const input = detailForm.querySelector(`[name="rows[${dayNo}][${field}]"]`);
                    if (!input) {
                        return;
                    }

                    input.classList.add("is-invalid");

                    const feedback = document.createElement("div");
                    feedback.className = "invalid-feedback";
                    feedback.textContent = message;
                    input.insertAdjacentElement("afterend", feedback);
                });
            });
        };

        const updateCsrfToken = (result) => {
            if (!result || !result.csrf || !result.csrf.name || !result.csrf.hash) {
                return;
            }

            const tokenInput = detailForm.querySelector(`input[name="${result.csrf.name}"]`);
            if (tokenInput) {
                tokenInput.value = result.csrf.hash;
            }
        };

        detailForm.addEventListener("submit", (event) => {
            event.preventDefault();
            clearFieldErrors();

            const submitButton = detailForm.querySelector('button[type="submit"]');
            const originalHtml = submitButton ? submitButton.innerHTML : "";
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Updating...';
            }

            fetch(detailForm.action, {
                method: "POST",
                body: new FormData(detailForm),
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
            })
                .then((response) => response.json())
                .then((result) => {
                    updateCsrfToken(result);

                    if (!result.status) {
                        showFieldErrors(result.data?.errors || {});
                        showToast("error", result.message || "Unable to update shift details.");
                        return;
                    }

                    showToast("success", result.message || "Shift details updated successfully.");
                })
                .catch(() => {
                    showToast("error", "Unable to update shift details. Please try again.");
                })
                .finally(() => {
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.innerHTML = originalHtml;
                    }
                });
        });
    });
</script>