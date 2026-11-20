<style>
    #addOccasionModal .modal-dialog {
        max-width: 620px;
    }

    #addOccasionModal .modal-content {
        border: 1px solid #e8edf3;
        border-radius: 18px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }

    #addOccasionModal .modal-header {
        padding: 14px 16px;
        border-bottom: 1px solid #eef2f6;
        background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
    }

    #addOccasionModal .modal-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    #addOccasionModal .modal-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: #111827;
        letter-spacing: 0.1px;
    }

    #addOccasionModal .modal-subtitle {
        margin: 0;
        font-size: 11.5px;
        color: #6b7280;
    }

    #addOccasionModal .modal-body {
        padding: 12px;
        background: #fafdfb;
    }

    #addOccasionModal .occasion-form-shell {
        border: 1px solid #e6efea;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px;
    }

    #addOccasionModal .occasion-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    #addOccasionModal .occasion-field {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    #addOccasionModal .occasion-field.full-width {
        grid-column: 1 / -1;
    }

    #addOccasionModal .occasion-label {
        margin-bottom: 4px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.22px;
        text-transform: uppercase;
        color: #475467;
    }

    #addOccasionModal .occasion-required {
        color: #dc2626;
        margin-left: 2px;
    }

    #addOccasionModal .form-control,
    #addOccasionModal .form-select {
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

    #addOccasionModal textarea.form-control {
        min-height: 84px;
        height: auto;
        resize: vertical;
    }

    #addOccasionModal .form-control::placeholder,
    #addOccasionModal .form-select::placeholder {
        color: #98a2b3;
        font-size: 11px;
    }

    #addOccasionModal .form-control:focus,
    #addOccasionModal .form-select:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    #addOccasionModal input[type="date"].form-control {
        padding-right: 8px;
    }

    #addOccasionModal .form-control.is-invalid,
    #addOccasionModal .form-select.is-invalid,
    #addOccasionModal textarea.form-control.is-invalid {
        border-color: #f04438;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(240, 68, 56, 0.08);
    }

    #addOccasionModal .invalid-feedback {
        margin-top: 4px;
        font-size: 10px;
        font-weight: 500;
        line-height: 1.35;
        display: block;
    }

    #addOccasionModal .modal-footer {
        padding: 10px 12px 12px;
        border-top: 1px solid #ebf2ed;
        background: #ffffff;
        gap: 6px;
    }

    #addOccasionModal .modal-footer .btn {
        height: 32px;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 11.5px;
        font-weight: 500;
        box-shadow: none !important;
    }

    #addOccasionModal .modal-footer .btn.submit-btn {
        background: #16833f !important;
        color: #ffffff !important;
        border: none;
    }

    #addOccasionModal .modal-footer .btn-light {
        border: 1px solid #d7e6dc;
        background: #ffffff;
        color: #344054;
    }

    #addOccasionModal .modal-footer .btn-light:hover {
        background: #f5faf7;
        border-color: #bfd7c7;
    }

    .selected-shift-pills {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        min-height: 28px;
    }

    .shift-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 9px;
        border-radius: 999px;
        background: #eaf7ef;
        color: #16833f;
        border: 1px solid #c7ead4;
        font-size: 11px;
        font-weight: 600;
    }

    .shift-pill button {
        border: 0;
        background: transparent;
        color: #16833f;
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
    }

    @media (max-width: 767.98px) {
        #addOccasionModal .modal-dialog {
            max-width: calc(100% - 14px);
            margin: 10px auto;
        }

        #addOccasionModal .modal-header,
        #addOccasionModal .modal-body,
        #addOccasionModal .modal-footer {
            padding-left: 10px;
            padding-right: 10px;
        }

        #addOccasionModal .occasion-form-shell {
            padding: 9px;
            border-radius: 11px;
        }

        #addOccasionModal .occasion-form-grid {
            grid-template-columns: 1fr;
            gap: 9px;
        }


    }
</style>

<div class="modal fade" id="addOccasionModal" tabindex="-1" aria-labelledby="addOccasionModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <h5 class="modal-title" id="addOccasionModalLabel">Add Occasion</h5>
                    <p class="modal-subtitle">Enter occasion details below.</p>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <form id="occasionForm" action="<?php echo site_url('occasion/store'); ?>" method="post">
                <input type="hidden" name="occasion_id" id="occasion_id">

                <?php if (isset($this->security)) : ?>
                    <input type="hidden"
                        name="<?php echo $this->security->get_csrf_token_name(); ?>"
                        value="<?php echo $this->security->get_csrf_hash(); ?>">
                <?php endif; ?>

                <div class="modal-body">
                    <div class="occasion-form-shell">
                        <div class="occasion-form-grid">

                            <div class="occasion-field full-width">
                                <label class="occasion-label" for="occasion_name">
                                    Occasion Name <span class="occasion-required">*</span>
                                </label>
                                <input type="text" name="occasion_name" id="occasion_name" class="form-control"
                                    maxlength="255" placeholder="Enter occasion name">
                                <div class="invalid-feedback d-block" id="occasion_name_error"></div>
                            </div>

                            <div class="occasion-field">
                                <label class="occasion-label" for="from_date">
                                    From Date <span class="occasion-required">*</span>
                                </label>
                                <input type="date" name="from_date" id="from_date" class="form-control">
                                <div class="invalid-feedback d-block" id="from_date_error"></div>
                            </div>

                            <div class="occasion-field">
                                <label class="occasion-label" for="to_date">
                                    To Date <span class="occasion-required">*</span>
                                </label>
                                <input type="date" name="to_date" id="to_date" class="form-control">
                                <div class="invalid-feedback d-block" id="to_date_error"></div>
                            </div>

                            <div class="occasion-field">
                                <label class="occasion-label" for="occasion_type">Occasion Type</label>
                                <input type="text" name="occasion_type" id="occasion_type" class="form-control"
                                    maxlength="100" placeholder="Enter occasion type">
                                <div class="invalid-feedback d-block" id="occasion_type_error"></div>
                            </div>

                            <div class="occasion-field">
                                <label class="occasion-label" for="count_as_present">
                                    Count As Present <span class="occasion-required">*</span>
                                </label>
                                <select name="count_as_present" id="count_as_present" class="form-select">
                                    <option value="Y">Yes</option>
                                    <option value="N">No</option>
                                </select>
                                <div class="invalid-feedback d-block" id="count_as_present_error"></div>
                            </div>

                            <div class="occasion-field">
                                <label class="occasion-label" for="paid_holiday">
                                    Paid Holiday <span class="occasion-required">*</span>
                                </label>
                                <select name="paid_holiday" id="paid_holiday" class="form-select">
                                    <option value="Y">Yes</option>
                                    <option value="N">No</option>
                                </select>
                                <div class="invalid-feedback d-block" id="paid_holiday_error"></div>
                            </div>

                            <div class="occasion-field">
                                <label class="occasion-label" for="is_active">
                                    Is Active <span class="occasion-required">*</span>
                                </label>
                                <select name="is_active" id="is_active" class="form-select">
                                    <option value="Y">Yes</option>
                                    <option value="N">No</option>
                                </select>
                                <div class="invalid-feedback d-block" id="is_active_error"></div>
                            </div>
                            <div class="occasion-field full-width">
                                <label class="occasion-label" for="shift_dropdown">
                                    Shift
                                </label>

                                <select id="shift_dropdown" class="form-select">
                                    <option value="">Select Shift</option>

                                    <?php if (!empty($shift_list)) : ?>
                                        <?php foreach ($shift_list as $shift) : ?>
                                            <option
                                                value="<?php echo html_escape($shift['ID']); ?>"
                                                data-name="<?php echo html_escape($shift['SHIFT_NAME']); ?>">
                                                <?php echo html_escape($shift['SHIFT_NAME']); ?>
                                            </option>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </select>

                                <input type="hidden" name="shift_id" id="shift_id">

                                <div id="selected_shift_pills" class="selected-shift-pills mt-2"></div>
                            </div>
                            <div class="occasion-field full-width">
                                <label class="occasion-label" for="remarks">Remarks</label>
                                <textarea name="remarks" id="remarks" class="form-control"
                                    maxlength="500" placeholder="Enter remarks"></textarea>
                                <div class="invalid-feedback d-block" id="remarks_error"></div>
                            </div>

                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn submit-btn" id="saveOccasionBtn">Save Occasion</button>
                </div>
            </form>
        </div>
    </div>
</div>