<style>
    #addEmployeeModal .modal-dialog {
        max-width: 1100px;
    }

    #addEmployeeModal .modal-content {
        border: 1px solid #dde6df;
        border-radius: 14px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 16px 40px rgba(16, 24, 40, 0.10);
    }

    #addEmployeeModal .modal-header {
        padding: 10px 12px;
        border-bottom: 1px solid #ebf2ed;
        background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }

    #addEmployeeModal .modal-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    #addEmployeeModal .modal-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.04px;
    }

    #addEmployeeModal .modal-subtitle {
        margin: 0;
        font-size: 10px;
        color: #667085;
        font-weight: 500;
    }

    #addEmployeeModal .btn-close {
        box-shadow: none !important;
        opacity: 0.8;
        margin: 0;
        padding: 0;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        align-self: flex-start;
    }

    #addEmployeeModal .modal-body {
        padding: 10px 14px;
        background: #fafdfb;
        max-height: 72vh;
        overflow-y: auto;
    }

    #addEmployeeModal .employee-form-shell {
        border: 1px solid #e6efea;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px 12px;
    }

    #addEmployeeModal .employee-form-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px 12px;
    }

    #addEmployeeModal .employee-field.employee-field-full {
        grid-column: 1 / -1;
    }

    #addEmployeeModal .employee-form-section-title {
        grid-column: 1 / -1;
        margin: 2px 0 -4px;
        font-size: 10px;
        font-weight: 700;
        color: #16833f;
        text-transform: uppercase;
        letter-spacing: 0.28px;
        border-top: 1px solid #ebf2ed;
        padding-top: 6px;
    }

    #addEmployeeModal .employee-form-section-title:first-child {
        border-top: 0;
        padding-top: 0;
        margin-top: 0;
    }

    #addEmployeeModal .employee-checkbox-row {
        display: flex;
        align-items: center;
        gap: 5px;
        height: 30px;
    }

    #addEmployeeModal .employee-field {
        display: flex;
        flex-direction: column;
        width: 100%;
    }

    #addEmployeeModal .employee-label {
        margin-bottom: 3px;
        font-size: 9.5px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.2px;
        text-transform: uppercase;
        color: #475467;
    }

    #addEmployeeModal .employee-required {
        color: #dc2626;
        margin-left: 2px;
    }

    #addEmployeeModal .form-control,
    #addEmployeeModal .form-select {
        width: 100%;
        height: 32px;
        border-radius: 8px;
        border: 1px solid #d6e1da;
        background: #fbfdfb;
        color: #0f172a;
        font-size: 11.5px;
        font-weight: 500;
        padding: 5px 9px;
        box-shadow: none;
        transition: all 0.18s ease;
    }

    #addEmployeeModal .form-control::placeholder {
        color: #98a2b3;
        font-size: 11px;
    }

    #addEmployeeModal .form-control:focus,
    #addEmployeeModal .form-select:focus {
        border-color: #6ab487;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(22, 131, 63, 0.08);
    }

    #addEmployeeModal input[type="date"].form-control,
    #addEmployeeModal input[type="time"].form-control {
        padding-right: 8px;
    }

    #addEmployeeModal .form-control.is-invalid,
    #addEmployeeModal .form-select.is-invalid {
        border-color: #f04438;
        background: #fff;
        box-shadow: 0 0 0 2px rgba(240, 68, 56, 0.08);
    }

    #addEmployeeModal .invalid-feedback {
        margin-top: 4px;
        font-size: 10px;
        font-weight: 500;
        line-height: 1.35;
    }

    #addEmployeeModal .modal-footer {
        padding: 10px 12px 12px;
        border-top: 1px solid #ebf2ed;
        background: #ffffff;
        gap: 6px;
    }

    #addEmployeeModal .modal-footer .btn {
        height: 32px;
        border-radius: 9px;
        padding: 0 12px;
        font-size: 11.5px;
        font-weight: 500;
        box-shadow: none !important;
    }

    #addEmployeeModal .modal-footer .btn.submit-btn {
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

    #addEmployeeModal .modal-footer .btn-light {
        border: 1px solid #d7e6dc;
        background: #ffffff;
        color: #344054;
    }

    #addEmployeeModal .modal-footer .btn-light:hover {
        background: #f5faf7;
        border-color: #bfd7c7;
    }

    @media (max-width: 991.98px) {
        #addEmployeeModal .employee-form-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 767.98px) {
        #addEmployeeModal .modal-dialog {
            max-width: calc(100% - 14px);
            margin: 10px auto;
        }

        #addEmployeeModal .modal-header,
        #addEmployeeModal .modal-body,
        #addEmployeeModal .modal-footer {
            padding-left: 10px;
            padding-right: 10px;
        }

        #addEmployeeModal .employee-form-shell {
            padding: 9px;
            border-radius: 11px;
        }

        #addEmployeeModal .employee-form-grid {
            grid-template-columns: 1fr;
            gap: 9px;
        }
    }
</style>

<div class="modal fade" id="addEmployeeModal" tabindex="-1" aria-labelledby="addEmployeeModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <h5 class="modal-title" id="addEmployeeModalLabel">Add Employee</h5>
                    <p class="modal-subtitle">Enter employee details below.</p>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <form id="employeeForm" action="<?php echo site_url('contractor/employees/store'); ?>" method="post">
                <input type="hidden" name="id" id="employee_id">

                <?php if (isset($this->security)) : ?>
                    <input type="hidden" name="<?php echo $this->security->get_csrf_token_name(); ?>" value="<?php echo $this->security->get_csrf_hash(); ?>">
                <?php endif; ?>

                <div class="modal-body">
                    <div class="employee-form-shell">
                        <div class="employee-form-grid">

                            <div class="employee-form-section-title">Assignment</div>

                           <div class="employee-field">
                                <label class="employee-label" for="division">
                                    Division <span class="employee-required">*</span>
                                </label>
                                            
                                <select name="division" id="division" class="form-select">
                                    <option value="">Select</option>
                                    <option selected value="IBM">IPP BU</option>
                                    <option value="Z3P">FPP BU</option>
                                </select>
                                            
                                <div class="invalid-feedback d-block d-none" data-error-for="division"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="con_number">Contractor # <span class="employee-required">*</span></label>
                                <select name="con_number" id="con_number" class="form-select">
                                    <option value="">Select</option>
                                    <?php if (!empty($contractorOptions)) : ?>
                                        <?php foreach ($contractorOptions as $cont) : ?>
                                            <option value="<?= html_escape($cont['CON_NUMBER'] ?? '') ?>"><?= html_escape($cont['CON_NUMBER'] ?? '') ?></option>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="con_number"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="con_name">Contractor Name</label>
                                <input type="text" name="con_name" id="con_name" class="form-control" readonly>
                                <div class="invalid-feedback d-block d-none" data-error-for="con_name"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="status">Status <span class="employee-required">*</span></label>
                                <select name="status" id="status" class="form-select">
                                    <option value="">Select</option>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="status"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="rate">Rate / Hour</label>
                                <input type="text" name="rate" id="rate" class="form-control" placeholder="Enter rate per hour">
                                <div class="invalid-feedback d-block d-none" data-error-for="rate"></div>
                            </div>

                            <div class="employee-form-section-title">Employee Identity</div>

                            <div class="employee-field">
                                <label class="employee-label" for="employee_number">Employee #</label>
                                <input type="text" name="employee_number" id="employee_number" class="form-control" readonly placeholder="Assigned automatically">
                                <div class="invalid-feedback d-block d-none" data-error-for="employee_number"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="employee_name">Employee Name <span class="employee-required">*</span></label>
                                <input type="text" name="employee_name" id="employee_name" class="form-control" maxlength="200" placeholder="Enter employee name">
                                <div class="invalid-feedback d-block d-none" data-error-for="employee_name"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="iqamah">Iqamah</label>
                                <input type="number" name="iqamah" id="iqamah" class="form-control" placeholder="Enter Iqamah #">
                                <div class="invalid-feedback d-block d-none" data-error-for="iqamah"></div>
                            </div>

                            <div class="employee-form-section-title">Department &amp; Role</div>

                            <div class="employee-field">
                                <label class="employee-label" for="department">Department</label>
                                <select name="department" id="department" class="form-select">
                                    <option value="">Select</option>
                                    <option value="Production">Production</option>
                                    <option value="QC">QC</option>
                                    <option value="Maintenance">Maintenance</option>
                                    <option value="W/H">W/H</option>
                                    <option value="Admin">Admin</option>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="department"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="prod_dep">Production</label>
                                <select name="prod_dep" id="prod_dep" class="form-select">
                                    <option value="">Select</option>
                                    <?php if (!empty($productionOptions)) : ?>
                                        <?php foreach ($productionOptions as $dep) : ?>
                                            <option value="<?= html_escape($dep['ORGANIZATION_ID'] ?? '') ?>"><?= html_escape($dep['NAME'] ?? '') ?></option>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </select>
                                <div class="invalid-feedback d-block d-none" data-error-for="prod_dep"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="job">Job Title</label>
                                <select name="job" id="job" class="form-select">
                                    <option value="">Select</option>
                                    <?php if (!empty($jobTitleOptions)) : ?>
                                        <?php foreach ($jobTitleOptions as $jobOption) : ?>
                                            <option value="<?= html_escape($jobOption['JOB_ID'] ?? '') ?>"><?= html_escape($jobOption['NAME'] ?? '') ?></option>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </select>
                                <input type="hidden" name="job_title" id="job_title">
                                <div class="invalid-feedback d-block d-none" data-error-for="job"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="direct_boss_id">Direct Boss</label>
                                <input type="text" name="direct_boss_id" id="direct_boss_id" class="form-control" list="directBossOptions" placeholder="Search boss name/ID">
                                <datalist id="directBossOptions">
                                    <?php if (!empty($bossOptions)) : ?>
                                        <?php foreach ($bossOptions as $boss) : ?>
                                            <option value="<?= html_escape($boss['PERSON_ID'] ?? '') ?>"><?= html_escape($boss['FULL_NAME'] ?? '') ?></option>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </datalist>
                                <input type="hidden" name="direct_boss" id="direct_boss">
                                <div class="invalid-feedback d-block d-none" data-error-for="direct_boss_id"></div>
                            </div>

                            <div class="employee-form-section-title">Work Details</div>

                            <div class="employee-field">
                                <label class="employee-label" for="place">Place of Work</label>
                                <input type="text" name="place" id="place" class="form-control" placeholder="Enter place of work">
                                <div class="invalid-feedback d-block d-none" data-error-for="place"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="replacement">Replacement #</label>
                                <input type="number" name="replacement" id="replacement" class="form-control" placeholder="Enter replacement #">
                                <div class="invalid-feedback d-block d-none" data-error-for="replacement"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="start_date">Start Date <span class="employee-required">*</span></label>
                                <input type="date" name="start_date" id="start_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="start_date"></div>
                            </div>

                            <div class="employee-field">
                                <label class="employee-label" for="end_date">End Date</label>
                                <input type="date" name="end_date" id="end_date" class="form-control">
                                <div class="invalid-feedback d-block d-none" data-error-for="end_date"></div>
                            </div>

                            <div class="employee-form-section-title">Flags &amp; Remarks</div>

                            <div class="employee-field">
                                <label class="employee-label">Flags</label>
                                <div class="d-flex gap-3">
                                    <div class="employee-checkbox-row">
                                        <input type="checkbox" name="ajeer" id="ajeer" class="form-check-input">
                                        <label for="ajeer" class="mb-0">Ajeer</label>
                                    </div>
                                    <div class="employee-checkbox-row">
                                        <input type="checkbox" name="sfda" id="sfda" class="form-check-input">
                                        <label for="sfda" class="mb-0">Sfda</label>
                                    </div>
                                    <div class="employee-checkbox-row">
                                        <input type="checkbox" name="blacklist" id="blacklist" class="form-check-input">
                                        <label for="blacklist" class="mb-0">Blacklist</label>
                                    </div>
                                </div>
                            </div>

                            <div class="employee-field employee-field-full">
                                <label class="employee-label" for="remark">Remark</label>
                                <textarea name="remark" id="remark" class="form-control" rows="2" placeholder="Enter remark"></textarea>
                                <div class="invalid-feedback d-block d-none" data-error-for="remark"></div>
                            </div>

                        </div>
                    </div>
                </div>


                <div class="modal-footer">
                    <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn submit-btn" id="employeeFormSubmitBtn">Save Employee</button>
                </div>
            </form>
        </div>
    </div>
</div>