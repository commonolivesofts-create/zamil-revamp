<style>
    #addTimetableModal .modal-dialog {
        max-width: 540px;
    }

    #addTimetableModal .modal-content {
        border: 1px solid #e7edf5;
        border-radius: 16px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
    }

    #addTimetableModal .modal-header {
        padding: 12px 14px;
        border-bottom: 1px solid #eef2f6;
        background: #ffffff;
    }

    #addTimetableModal .modal-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    #addTimetableModal .modal-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        letter-spacing: 0.1px;
        line-height: 1.2;
    }

    #addTimetableModal .modal-subtitle {
        margin: 0;
        font-size: 10.5px;
        color: #6b7280;
        font-weight: 500;
        line-height: 1.3;
    }

    #addTimetableModal .btn-close {
        box-shadow: none !important;
        opacity: 0.8;
    }

    #addTimetableModal .modal-body {
        padding: 12px;
        background: #f8fafc;
    }

    #addTimetableModal .timetable-form-shell {
        border: 1px solid #e9eef5;
        border-radius: 14px;
        background: #ffffff;
        padding: 12px;
    }

    #addTimetableModal .timetable-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px 12px;
    }

    #addTimetableModal .timetable-field {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    #addTimetableModal .timetable-label {
        margin-bottom: 5px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.35px;
        text-transform: uppercase;
        color: #6b7280;
    }

    #addTimetableModal .form-control,
    #addTimetableModal .form-select {
        width: 100%;
        height: 34px;
        border-radius: 10px;
        border: 1px solid #dbe3ec;
        background: #ffffff;
        color: #111827;
        font-size: 12px;
        font-weight: 500;
        padding: 6px 10px;
        box-shadow: none;
        transition: all 0.18s ease;
    }

    #addTimetableModal .form-control::placeholder,
    #addTimetableModal .form-select::placeholder {
        color: #9ca3af;
    }

    #addTimetableModal .form-control:focus,
    #addTimetableModal .form-select:focus {
        border-color: #60a5fa;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08);
    }

    #addTimetableModal .invalid-feedback {
        margin-top: 4px;
        font-size: 10.5px;
        font-weight: 500;
    }

    #addTimetableModal .emp-lookup-status {
        margin-top: 4px;
        font-size: 10.5px;
        font-weight: 600;
        color: #6b7280;
    }

    #addTimetableModal .emp-lookup-status.is-loading {
        color: #2563eb;
    }

    #addTimetableModal .emp-lookup-status.is-success {
        color: #059669;
    }

    #addTimetableModal .emp-lookup-status.is-error {
        color: #dc2626;
    }

    #addTimetableModal .modal-footer {
        padding: 10px 12px 12px;
        border-top: 1px solid #eef2f6;
        background: #ffffff;
        gap: 8px;
    }

    #addTimetableModal .modal-footer .btn {
        height: 34px;
        border-radius: 10px;
        padding: 0 14px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: none !important;
    }

    #addTimetableModal .modal-footer .btn-light {
        border: 1px solid #dbe3ec;
        background: #ffffff;
        color: #374151;
    }

    #addTimetableModal .modal-footer .btn-primary {
        background: #16833f;
        border-color: #16833f;
    }


    @media (max-width: 767.98px) {
        #addTimetableModal .modal-dialog {
            max-width: calc(100% - 12px);
            margin: 8px auto;
        }

        #addTimetableModal .modal-header,
        #addTimetableModal .modal-body,
        #addTimetableModal .modal-footer {
            padding-left: 10px;
            padding-right: 10px;
        }

        #addTimetableModal .timetable-form-shell {
            padding: 10px;
            border-radius: 12px;
        }

        #addTimetableModal .timetable-form-grid {
            grid-template-columns: 1fr;
            gap: 9px;
        }
    }
</style>

<div class="modal fade" id="addTimetableModal" tabindex="-1" aria-labelledby="addTimetableModalLabel"
    aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <h5 class="modal-title" id="addTimetableModalLabel">Add Timetable</h5>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <form id="timetableForm" action="<?php echo site_url('timetable/store'); ?>" method="post">
                <input type="hidden" name="uuid" id="timetable_uuid">

                <?php if (isset($this->security)): ?>
                    <input type="hidden" name="<?php echo $this->security->get_csrf_token_name(); ?>"
                        value="<?php echo $this->security->get_csrf_hash(); ?>">
                <?php endif; ?>

                <div class="modal-body">
                    <div class="timetable-form-shell">
                        <div class="timetable-form-grid">
                            <div class="timetable-field">
                                <label class="timetable-label" for="emp_no">
                                    Employee Number <span class="text-danger">*</span>
                                </label>
                                <input type="number" name="emp_no" id="emp_no" class="form-control" min="1" step="1">
                                <div class="invalid-feedback d-block d-none" data-error-for="emp_no"></div>
                            </div>

                            <div class="timetable-field">
                                <label class="timetable-label" for="emp_name">
                                    Employee Name <span class="text-danger">*</span>
                                </label>
                                <input type="text" name="emp_name" id="emp_name" class="form-control" maxlength="150">
                                <div class="emp-lookup-status d-none" id="emp_lookup_status"></div>
                                <div class="invalid-feedback d-block d-none" data-error-for="emp_name"></div>
                            </div>

                            <div class="timetable-field">
                                <label class="timetable-label" for="shift_id">
                                    Shift <span class="text-danger">*</span>
                                </label>
                                <select name="shift_id" id="shift_id" class="form-select">
                                    <option value="">Select shift</option>
                                    <?php foreach ((isset($shiftOptions) && is_array($shiftOptions) ? $shiftOptions : []) as $shift): ?>
                                        <option value="<?php echo html_escape($shift['ID']); ?>">
                                            <?php echo html_escape($shift['SHIFT_NAME'] . ' (#' . $shift['ID'] . ')'); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="shift_id"></div>
                            </div>

                            <div class="timetable-field">
                                <label class="timetable-label" for="status">
                                    Status <span class="text-danger">*</span>
                                </label>
                                <select name="status" id="status" class="form-select">
                                    <option value="">Select status</option>
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="status"></div>
                            </div>

                            <div class="timetable-field">
                                <label class="timetable-label" for="start_date">
                                    Start Date <span class="text-danger">*</span>
                                </label>
                                <input type="date" name="start_date" id="start_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="start_date"></div>
                            </div>

                            <div class="timetable-field">
                                <label class="timetable-label" for="end_date">End Date</label>
                                <input type="date" name="end_date" id="end_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="end_date"></div>
                            </div>
                            <div class="timetable-field">
                                <label class="timetable-label">
                                    Overtime Allowed <span class="text-danger">*</span>
                                </label>
                                <div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="overtime_allowed"
                                            id="overtime_yes" value="Y">
                                        <label class="form-check-label" for="overtime_yes">Yes</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="overtime_allowed"
                                            id="overtime_no" value="N" checked>
                                        <label class="form-check-label" for="overtime_no">No</label>
                                    </div>
                                </div>
                            </div>

                            <div class="timetable-field">
                                <label class="timetable-label">
                                    Exclude Timesheet <span class="text-danger">*</span>
                                </label>
                                <div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="exclude_timesheet"
                                            id="exclude_yes" value="Y">
                                        <label class="form-check-label" for="exclude_yes">Yes</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="exclude_timesheet"
                                            id="exclude_no" value="N" checked>
                                        <label class="form-check-label" for="exclude_no">No</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="timetableFormSubmitBtn">Save Timetable</button>
                </div>
            </form>
        </div>
    </div>
</div>