<style>
    #addShiftModal .modal-dialog {
        max-width: 460px;
    }

    #addShiftModal .modal-content {
        border: 1px solid #dde6df;
        border-radius: 14px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 16px 40px rgba(16, 24, 40, 0.10);
    }

    #addShiftModal .modal-header {
        padding: 10px 12px;
        border-bottom: 1px solid #ebf2ed;
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }

    #addShiftModal .modal-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    #addShiftModal .modal-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.04px;
    }

    #addShiftModal .modal-subtitle {
        margin: 0;
        font-size: 10px;
        color: #667085;
        font-weight: 500;
    }

    #addShiftModal .btn-close {
        box-shadow: none !important;
        opacity: 0.8;
        margin: 0;
        padding: 0;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        align-self: flex-start;
    }

    #addShiftModal .modal-body {
        padding: 12px;
        background: #fafdfb;
    }

    #addShiftModal .shift-form-shell {
        border: 1px solid #e6efea;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px;
    }

    #addShiftModal .shift-form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
    }

    #addShiftModal .shift-field {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    #addShiftModal .shift-label {
        margin-bottom: 4px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.22px;
        text-transform: uppercase;
        color: #475467;
    }

    #addShiftModal .shift-required {
        color: #dc2626;
        margin-left: 2px;
    }

    #addShiftModal .form-control,
    #addShiftModal .form-select {
        width: 100%;
        height: 34px;
        border-radius: 9px;
        border: 1px solid #d6e1da;
        background: #fbfdfb;
        color: #0f172a;
        font-size: 11.5px;
        font-weight: 500;
        padding: 6px 10px;
        box-shadow: none;
        transition: all 0.18s ease;
    }

    #addShiftModal .form-control::placeholder {
        color: #98a2b3;
        font-size: 11px;
    }

    #addShiftModal .form-control:focus,
    #addShiftModal .form-select:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    #addShiftModal input[type="date"].form-control,
    #addShiftModal input[type="time"].form-control {
        padding-right: 8px;
    }

    #addShiftModal .form-control.is-invalid,
    #addShiftModal .form-select.is-invalid {
        border-color: #f04438;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(240, 68, 56, 0.08);
    }

    #addShiftModal .invalid-feedback {
        margin-top: 4px;
        font-size: 10px;
        font-weight: 500;
        line-height: 1.35;
    }

    #addShiftModal .modal-footer {
        padding: 10px 12px 12px;
        border-top: 1px solid #ebf2ed;
        background: #ffffff;
        gap: 6px;
    }

    #addShiftModal .modal-footer .btn {
        height: 32px;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 11.5px;
        font-weight: 500;
        box-shadow: none !important;
    }

    #addShiftModal .modal-footer .btn.submit-btn {
        background: #16833f !important;
        color: #ffffff !important;
        border: none;
        height: 32px;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 11.5px;
        font-weight: 500;
        box-shadow: none !important;

    }

    #addShiftModal .modal-footer .btn-light {
        border: 1px solid #d7e6dc;
        background: #ffffff;
        color: #344054;
    }

    #addShiftModal .modal-footer .btn-light:hover {
        background: #f5faf7;
        border-color: #bfd7c7;
    }

    @media (max-width: 767.98px) {
        #addShiftModal .modal-dialog {
            max-width: calc(100% - 14px);
            margin: 10px auto;
        }

        #addShiftModal .modal-header,
        #addShiftModal .modal-body,
        #addShiftModal .modal-footer {
            padding-left: 10px;
            padding-right: 10px;
        }

        #addShiftModal .shift-form-shell {
            padding: 9px;
            border-radius: 11px;
        }

        #addShiftModal .shift-form-grid {
            grid-template-columns: 1fr;
            gap: 9px;
        }
    }
</style>

<div class="modal fade" id="addShiftModal" tabindex="-1" aria-labelledby="addShiftModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <h5 class="modal-title" id="addShiftModalLabel">Add Shift</h5>
                    <p class="modal-subtitle">Enter shift details below.</p>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <form id="shiftForm" action="<?php echo site_url('shifts/store'); ?>" method="post">
                <input type="hidden" name="uuid" id="shift_uuid">

                <?php if (isset($this->security)) : ?>
                    <input type="hidden" name="<?php echo $this->security->get_csrf_token_name(); ?>" value="<?php echo $this->security->get_csrf_hash(); ?>">
                <?php endif; ?>

                <div class="modal-body">
                    <div class="shift-form-shell">
                        <div class="shift-form-grid">

                            <div class="shift-field">
                                <label class="shift-label" for="shift_name">Shift Name <span class="shift-required">*</span></label>
                                <input type="text" name="shift_name" id="shift_name" class="form-control" maxlength="100" placeholder="Enter shift name">
                                <div class="invalid-feedback d-block d-none" data-error-for="shift_name"></div>
                            </div>

                            <div class="shift-field">
                                <label class="shift-label" for="status">Status <span class="shift-required">*</span></label>
                                <select name="status" id="status" class="form-select">
                                    <option value="">Select status</option>
                                    <option value="ACTIVE" selected>ACTIVE</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="status"></div>
                            </div>

                            <div class="shift-field">
                                <label class="shift-label" for="start_date">Start Date <span class="shift-required">*</span></label>
                                <input type="date" name="start_date" id="start_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="start_date"></div>
                            </div>

                            <div class="shift-field">
                                <label class="shift-label" for="end_date">End Date <span class="shift-required">*</span></label>
                                <input type="date" name="end_date" id="end_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="end_date"></div>
                            </div>

                            <div class="shift-field">
                                <label class="shift-label" for="check_in">Check In <span class="shift-required">*</span></label>
                                <input type="time" name="check_in" id="check_in" class="form-control" step="60">
                                <div class="invalid-feedback d-block d-none" data-error-for="check_in"></div>
                            </div>

                            <div class="shift-field">
                                <label class="shift-label" for="check_out">Check Out <span class="shift-required">*</span></label>
                                <input type="time" name="check_out" id="check_out" class="form-control" step="60">
                                <div class="invalid-feedback d-block d-none" data-error-for="check_out"></div>
                            </div>
                            <div class="shift-field">
                                <label class="shift-label" for="weekday_ovrtm_cap">Weekday Overtime Cap <span class="shift-required">*</span></label>
                                <input type="text" name="weekday_ovrtm_cap" id="weekday_ovrtm_cap" class="form-control" maxlength="20" placeholder="Enter weekday overtime cap">
                                <div class="invalid-feedback d-block d-none" data-error-for="weekday_ovrtm_cap"></div>
                            </div>

                            <div class="shift-field">
                                <label class="shift-label" for="weekend_ovrtm_cap">Weekend Overtime Cap <span class="shift-required">*</span></label>
                                <input type="text" name="weekend_ovrtm_cap" id="weekend_ovrtm_cap" class="form-control" maxlength="20" placeholder="Enter weekend overtime cap">
                                <div class="invalid-feedback d-block d-none" data-error-for="weekend_ovrtm_cap"></div>
                            </div>

                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn submit-btn" id="shiftFormSubmitBtn">Save Shift</button>
                </div>
            </form>
        </div>
    </div>
</div>