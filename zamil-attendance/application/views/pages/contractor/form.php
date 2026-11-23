<style>
    #addContractorModal .modal-dialog {
        max-width: 460px;
    }

    #addContractorModal .modal-content {
        border: 1px solid #dde6df;
        border-radius: 14px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 16px 40px rgba(16, 24, 40, 0.10);
    }

    #addContractorModal .modal-header {
        padding: 10px 12px;
        border-bottom: 1px solid #ebf2ed;
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }

    #addContractorModal .modal-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    #addContractorModal .modal-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.04px;
    }

    #addContractorModal .modal-subtitle {
        margin: 0;
        font-size: 10px;
        color: #667085;
        font-weight: 500;
    }

    #addContractorModal .btn-close {
        box-shadow: none !important;
        opacity: 0.8;
        margin: 0;
        padding: 0;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        align-self: flex-start;
    }

    #addContractorModal .modal-body {
        padding: 12px;
        background: #fafdfb;
    }

    #addContractorModal .contractor-form-shell {
        border: 1px solid #e6efea;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px;
    }

    #addContractorModal .contractor-form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
    }

    #addContractorModal .contractor-field {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    #addContractorModal .contractor-label {
        margin-bottom: 4px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.22px;
        text-transform: uppercase;
        color: #475467;
    }

    #addContractorModal .contractor-required {
        color: #dc2626;
        margin-left: 2px;
    }

    #addContractorModal .form-control,
    #addContractorModal .form-select {
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

    #addContractorModal .form-control::placeholder {
        color: #98a2b3;
        font-size: 11px;
    }

    #addContractorModal .form-control:focus,
    #addContractorModal .form-select:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    #addContractorModal input[type="date"].form-control,
    #addContractorModal input[type="time"].form-control {
        padding-right: 8px;
    }

    #addContractorModal .form-control.is-invalid,
    #addContractorModal .form-select.is-invalid {
        border-color: #f04438;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(240, 68, 56, 0.08);
    }

    #addContractorModal .invalid-feedback {
        margin-top: 4px;
        font-size: 10px;
        font-weight: 500;
        line-height: 1.35;
    }

    #addContractorModal .modal-footer {
        padding: 10px 12px 12px;
        border-top: 1px solid #ebf2ed;
        background: #ffffff;
        gap: 6px;
    }

    #addContractorModal .modal-footer .btn {
        height: 32px;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 11.5px;
        font-weight: 500;
        box-shadow: none !important;
    }

    #addContractorModal .modal-footer .btn.submit-btn {
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

    #addContractorModal .modal-footer .btn-light {
        border: 1px solid #d7e6dc;
        background: #ffffff;
        color: #344054;
    }

    #addContractorModal .modal-footer .btn-light:hover {
        background: #f5faf7;
        border-color: #bfd7c7;
    }

    @media (max-width: 767.98px) {
        #addContractorModal .modal-dialog {
            max-width: calc(100% - 14px);
            margin: 10px auto;
        }

        #addContractorModal .modal-header,
        #addContractorModal .modal-body,
        #addContractorModal .modal-footer {
            padding-left: 10px;
            padding-right: 10px;
        }

        #addContractorModal .contractor-form-shell {
            padding: 9px;
            border-radius: 11px;
        }

        #addContractorModal .contractor-form-grid {
            grid-template-columns: 1fr;
            gap: 9px;
        }
    }
</style>

<div class="modal fade" id="addContractorModal" tabindex="-1" aria-labelledby="addContractorModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <h5 class="modal-title" id="addContractorModalLabel">Add Contractor</h5>
                    <p class="modal-subtitle">Enter contractor details below.</p>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <form id="contractorForm" action="<?php echo site_url('contractor/store'); ?>" method="post">
                <input type="hidden" name="id" id="contractor_id">

                <?php if (isset($this->security)) : ?>
                    <input type="hidden" name="<?php echo $this->security->get_csrf_token_name(); ?>" value="<?php echo $this->security->get_csrf_hash(); ?>">
                <?php endif; ?>

                <div class="modal-body">
                    <div class="contractor-form-shell">
                        <div class="contractor-form-grid">

                            <div class="contractor-field">
                                <label class="contractor-label" for="con_number">Contractor Number <span class="contractor-required">*</span></label>
                                <input type="text" name="con_number" id="con_number" class="form-control" maxlength="50" placeholder="Enter contractor number">
                                <div class="invalid-feedback d-block d-none" data-error-for="con_number"></div>
                            </div>

                            <div class="contractor-field">
                                <label class="contractor-label" for="con_name">Contractor Name <span class="contractor-required">*</span></label>
                                <input type="text" name="con_name" id="con_name" class="form-control" maxlength="200" placeholder="Enter contractor name">
                                <div class="invalid-feedback d-block d-none" data-error-for="con_name"></div>
                            </div>

                            <div class="contractor-field">
                                <label class="contractor-label" for="status">Status <span class="contractor-required">*</span></label>
                                <select name="status" id="status" class="form-select">
                                    <option value="">Select status</option>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="status"></div>
                            </div>

                            <div class="contractor-field">
                                <label class="contractor-label" for="rate">Rate / Hour <span class="contractor-required">*</span></label>
                                <input type="text" name="rate" id="rate" class="form-control" maxlength="20" placeholder="Enter rate per hour">
                                <div class="invalid-feedback d-block d-none" data-error-for="rate"></div>
                            </div>

                            <div class="contractor-field">
                                <label class="contractor-label" for="start_date">Start Date</label>
                                <input type="date" name="start_date" id="start_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="start_date"></div>
                            </div>

                            <div class="contractor-field">
                                <label class="contractor-label" for="end_date">End Date</label>
                                <input type="date" name="end_date" id="end_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="end_date"></div>
                            </div>

                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn submit-btn" id="contractorFormSubmitBtn">Save Contractor</button>
                </div>
            </form>
        </div>
    </div>
</div>