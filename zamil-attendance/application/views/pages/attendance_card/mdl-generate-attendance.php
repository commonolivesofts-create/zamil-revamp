<?php
$departmentOptions = isset($data['departmentOptions']) && is_array($data['departmentOptions']) ? $data['departmentOptions'] : [];

$defaultFromDateObj = new DateTime('first day of last month');
$defaultFromDateObj->setDate(
    (int) $defaultFromDateObj->format('Y'),
    (int) $defaultFromDateObj->format('m'),
    21
);

$defaultToDateObj = new DateTime('first day of this month');
$defaultToDateObj->setDate(
    (int) $defaultToDateObj->format('Y'),
    (int) $defaultToDateObj->format('m'),
    20
);

$defaultFromDate = $defaultFromDateObj->format('Y-m-d');
$defaultToDate = $defaultToDateObj->format('Y-m-d');
?>

<style>
    .attendance-generator-modal .modal-dialog {
        max-width: 460px;
    }

    .attendance-generator-modal .modal-content {
        border: 1px solid #e9edf5;
        border-radius: 16px;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        overflow: hidden;
    }

    .attendance-generator-header {
        padding: 14px 16px 10px;
        border-bottom: 1px solid #eef2f7;
        background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
    }

    .attendance-generator-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        line-height: 1.2;
    }

    .attendance-generator-subtitle {
        margin: 4px 0 0;
        font-size: 11px;
        color: #6b7280;
        line-height: 1.4;
    }

    .attendance-generator-body {
        padding: 14px 16px 12px;
        background: #ffffff;
    }

    .attendance-generator-form-group {
        margin-bottom: 10px;
    }

    .attendance-generator-label {
        display: block;
        margin-bottom: 5px;
        font-size: 11px;
        font-weight: 600;
        color: #374151;
    }

    .attendance-generator-input {
        min-height: 34px;
        font-size: 12px;
        border-radius: 10px;
        border: 1px solid #dbe3ef;
        background: #fbfcfe;
        color: #111827;
        box-shadow: none !important;
    }

    .attendance-generator-input:focus {
        border-color: #9fc3ff;
        background: #ffffff;
    }

    .attendance-generator-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px 14px;
        border-top: 1px solid #eef2f7;
        background: #fcfdff;
    }

    .attendance-primary-btn,
    .attendance-generator-btn-light {
        height: 32px;
        padding: 0 12px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .attendance-primary-btn {
        background: #16833f;
        color: #ffffff;
        border: none;
    }

    .attendance-primary-btn:hover {
        background: #16833f !important;
        color: #ffffff !important;
        border: none !important;
    }

    .attendance-generator-btn-light {
        border: 1px solid #d9e2ef;
        background: #ffffff;
        color: #374151;
    }

    .attendance-generator-btn-light:hover {
        border: 1px solid #d9e2ef;
        background: #ffffff;
        color: #374151;
    }

    .attendance-generator-btn[disabled] {
        opacity: 0.75;
        cursor: not-allowed;
    }

    .attendance-generator-loader {
        display: none;
        margin-left: 6px;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: attendanceSpin .7s linear infinite;
        vertical-align: middle;
    }

    @keyframes attendanceSpin {
        to {
            transform: rotate(360deg);
        }
    }
</style>

<div class="modal fade attendance-generator-modal" id="attendanceGeneratorModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
            <div class="attendance-generator-header">
                <h5 class="attendance-generator-title">Process Attendance</h5>
                <p class="attendance-generator-subtitle">Choose department, employee and date range.</p>
            </div>

            <div class="attendance-generator-body">
                <form id="attendanceGeneratorForm" novalidate>
                    <div class="attendance-generator-form-group">
                        <label class="attendance-generator-label" for="attendanceDepartment">Department</label>
                        <select class="form-select attendance-generator-input" id="attendanceDepartment" name="department">
                            <option value="">Select Department</option>
                            <option value="ALL">ALL</option>
                            <?php foreach ($departmentOptions as $department) : ?>
                                <option value="<?php echo html_escape($department); ?>">
                                    <?php echo html_escape($department); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="attendance-generator-form-group">
                        <label class="attendance-generator-label" for="attendanceEmployee">Employee</label>
                        <select class="form-select attendance-generator-input" id="attendanceEmployee" name="employee">
                            <option value="">Select Employee</option>
                        </select>
                    </div>

                    <div class="row g-2">
                        <div class="col-6">
                            <div class="attendance-generator-form-group mb-0">
                                <label class="attendance-generator-label" for="attendanceFromDate">From Date</label>
                                <input type="date" class="form-control attendance-generator-input" id="attendanceFromDate" name="from_date" value="<?php echo html_escape($defaultFromDate); ?>">
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="attendance-generator-form-group mb-0">
                                <label class="attendance-generator-label" for="attendanceToDate">To Date</label>
                                <input type="date" class="form-control attendance-generator-input" id="attendanceToDate" name="to_date" value="<?php echo html_escape($defaultToDate); ?>">
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <div class="attendance-generator-footer">
                <button type="button" class="btn attendance-generator-btn attendance-generator-btn-light" data-bs-dismiss="modal">
                    Close
                </button>
                <button type="button" class="btn attendance-primary-btn" id="processAttendanceBtn">
                    <span class="attendance-generator-btn-text" id="processAttendanceBtnText">Process Attendance</span>
                    <span class="attendance-generator-loader" id="processAttendanceLoader"></span>
                </button>
            </div>
        </div>
    </div>
</div>

<script>
    const appBaseUrl = "<?= base_url(); ?>";

    (function() {
        const selectors = {
            modal: '#attendanceGeneratorModal',
            department: '#attendanceDepartment',
            employee: '#attendanceEmployee',
            fromDate: '#attendanceFromDate',
            toDate: '#attendanceToDate',
            processButton: '#processAttendanceBtn',
            processButtonText: '#processAttendanceBtnText',
            processLoader: '#processAttendanceLoader'
        };

        const defaults = {
            fromDate: '<?= $defaultFromDate; ?>',
            toDate: '<?= $defaultToDate; ?>'
        };

        function getElement(selector) {
            return document.querySelector(selector);
        }

        function resetEmployeeDropdown() {
            const employeeEl = getElement(selectors.employee);
            if (!employeeEl) {
                return;
            }

            employeeEl.innerHTML = '<option value="">Select Employee</option>';
            employeeEl.setAttribute('disabled', 'disabled');
        }

        function setEmployeeAllOnlyState() {
            const employeeEl = getElement(selectors.employee);
            if (!employeeEl) {
                return;
            }

            employeeEl.innerHTML = '<option value="ALL">ALL</option>';
            employeeEl.value = 'ALL';
            employeeEl.setAttribute('disabled', 'disabled');
        }

        function showEmployeeLoadingState() {
            const employeeEl = getElement(selectors.employee);
            if (!employeeEl) {
                return;
            }

            employeeEl.innerHTML = '<option value="">Loading Employees...</option>';
            employeeEl.setAttribute('disabled', 'disabled');
        }

        function populateEmployeeDropdown(employees) {
            const employeeEl = getElement(selectors.employee);
            if (!employeeEl) {
                return;
            }

            let options = '<option value="">Select Employee</option>';
            options += '<option value="ALL">ALL</option>';

            if (Array.isArray(employees) && employees.length > 0) {
                options += employees.map(function(employee) {
                    const employeeNumber = employee.EMPLOYEE_NUMBER || '';
                    const fullName = employee.FULL_NAME || '';
                    const label = `${employeeNumber} - ${fullName}`;
                    return `<option value="${employeeNumber}">${label}</option>`;
                }).join('');
            }

            employeeEl.innerHTML = options;
            employeeEl.removeAttribute('disabled');
        }

        async function fetchEmployeesByDepartment(department) {
            const url = `${appBaseUrl}processattendance/get_employees_by_department?department=${encodeURIComponent(department)}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to fetch employee list.');
            }

            if (!result.success) {
                throw new Error(result.message || 'Unable to load employee list.');
            }

            return Array.isArray(result.data) ? result.data : [];
        }

        async function handleDepartmentChange() {
            const departmentEl = getElement(selectors.department);
            if (!departmentEl) {
                return;
            }

            const department = departmentEl.value.trim();

            if (!department) {
                resetEmployeeDropdown();
                return;
            }

            if (department === 'ALL') {
                setEmployeeAllOnlyState();
                return;
            }

            try {
                showEmployeeLoadingState();
                const employees = await fetchEmployeesByDepartment(department);
                populateEmployeeDropdown(employees);
            } catch (error) {
                console.error(error);
                resetEmployeeDropdown();
                alert(error.message || 'Something went wrong while loading employees.');
            }
        }

        function setProcessingState(isProcessing) {
            const processBtn = getElement(selectors.processButton);
            const buttonText = getElement(selectors.processButtonText);
            const loaderEl = getElement(selectors.processLoader);

            if (!processBtn || !buttonText || !loaderEl) {
                return;
            }

            if (isProcessing) {
                processBtn.setAttribute('disabled', 'disabled');
                buttonText.textContent = 'Processing...';
                loaderEl.style.display = 'inline-block';
            } else {
                processBtn.removeAttribute('disabled');
                buttonText.textContent = 'Process Attendance';
                loaderEl.style.display = 'none';
            }
        }

        async function processAttendance() {
            const departmentEl = getElement(selectors.department);
            const employeeEl = getElement(selectors.employee);
            const fromDateEl = getElement(selectors.fromDate);
            const toDateEl = getElement(selectors.toDate);

            if (!departmentEl || !employeeEl || !fromDateEl || !toDateEl) {
                return;
            }

            const department = departmentEl.value.trim();
            const employeeNumber = department === 'ALL' ? 'ALL' : employeeEl.value.trim();
            const fromDate = fromDateEl.value.trim();
            const toDate = toDateEl.value.trim();

            if (!department) {
                alert('Please select department.');
                departmentEl.focus();
                return;
            }

            if (department !== 'ALL' && !employeeNumber) {
                alert('Please select employee.');
                employeeEl.focus();
                return;
            }

            if (!fromDate) {
                alert('Please select from date.');
                fromDateEl.focus();
                return;
            }

            if (!toDate) {
                alert('Please select to date.');
                toDateEl.focus();
                return;
            }

            if (fromDate > toDate) {
                alert('From date must be less than or equal to to date.');
                fromDateEl.focus();
                return;
            }

            const payload = {
                department: department,
                employee_number: employeeNumber,
                from_date: fromDate,
                to_date: toDate
            };

            setProcessingState(true);

            try {
                const response = await fetch(`${appBaseUrl}processattendance/process_attendance`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Failed to call process attendance API.');
                }

                if (!result.success) {
                    throw new Error(result.message || 'Process attendance failed.');
                }

                const data = result.data || {};
                const summaryMessage =
                    `${result.message || 'Attendance processed successfully.'}\n\n` +
                    `Employees: ${data.total_employees || 0}\n` +
                    `Processed Rows: ${data.processed_rows || 0}\n` +
                    `Inserted Rows: ${data.inserted_rows || 0}\n` +
                    `Updated Rows: ${data.updated_rows || 0}`;

                alert(summaryMessage);
            } catch (error) {
                console.error(error);
                alert(error.message || 'Something went wrong while processing attendance.');
            } finally {
                setProcessingState(false);
            }
        }

        window.openAttendanceGenerator = function() {
            const modalEl = getElement(selectors.modal);
            if (!modalEl) {
                return;
            }

            const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalInstance.show();
        };

        function resetAttendanceModalForm() {
            const departmentEl = getElement(selectors.department);
            const fromDateEl = getElement(selectors.fromDate);
            const toDateEl = getElement(selectors.toDate);

            if (departmentEl) {
                departmentEl.value = '';
            }

            if (fromDateEl) {
                fromDateEl.value = defaults.fromDate;
            }

            if (toDateEl) {
                toDateEl.value = defaults.toDate;
            }

            resetEmployeeDropdown();
            setProcessingState(false);
        }

        document.addEventListener('DOMContentLoaded', function() {
            const departmentEl = getElement(selectors.department);
            const processBtn = getElement(selectors.processButton);
            const modalEl = getElement(selectors.modal);

            if (modalEl) {
                modalEl.addEventListener('hidden.bs.modal', function() {
                    resetAttendanceModalForm();
                });
            }

            if (departmentEl) {
                departmentEl.addEventListener('change', handleDepartmentChange);
            }

            if (processBtn) {
                processBtn.addEventListener('click', processAttendance);
            }

            resetEmployeeDropdown();
        });
    })();
</script>