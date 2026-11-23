<?php
$departmentOptions = isset($data['departmentOptions']) && is_array($data['departmentOptions']) ? $data['departmentOptions'] : [];
$currentYear = (int) date('Y');
$currentMonth = date('m');

$monthOptions = [
    '01' => 'January',
    '02' => 'February',
    '03' => 'March',
    '04' => 'April',
    '05' => 'May',
    '06' => 'June',
    '07' => 'July',
    '08' => 'August',
    '09' => 'September',
    '10' => 'October',
    '11' => 'November',
    '12' => 'December',
];
?>

<style>
    .attendance-generator-modal .modal-dialog {
        max-width: 420px;
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

    /* Primary */
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

    /* Light */
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

    .attendance-generator-btn-primary {
        border: 1px solid #111827;
        background: #111827;
        color: #ffffff;
    }

    /* .attendance-generator-btn-primary:hover,
    .attendance-generator-btn-primary:focus {
        background: #1f2937;
        border-color: #1f2937;
        color: #ffffff;
    } */

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

<div class="modal fade attendance-generator-modal" id="attendanceGeneratorModal" tabindex="-1" data-bs-backdrop="static"
    data-bs-keyboard="false" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
            <div class="attendance-generator-header">
                <h5 class="attendance-generator-title">Generate Attendance</h5>
                <p class="attendance-generator-subtitle">Choose department, employee, month and year.</p>
            </div>

            <div class="attendance-generator-body">
                <form id="attendanceGeneratorForm" novalidate>
                    <div class="attendance-generator-form-group">
                        <label class="attendance-generator-label" for="attendanceDepartment">Department</label>
                        <select class="form-select attendance-generator-input" id="attendanceDepartment"
                            name="department">
                            <option value="">Select Department</option>
                            <?php foreach ($departmentOptions as $department): ?>
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
                                <label class="attendance-generator-label" for="attendanceMonth">Month</label>
                                <select class="form-select attendance-generator-input" id="attendanceMonth"
                                    name="month">
                                    <?php foreach ($monthOptions as $monthValue => $monthLabel): ?>
                                        <option value="<?php echo $monthValue; ?>" <?php echo $monthValue === $currentMonth ? 'selected' : ''; ?>>
                                            <?php echo html_escape($monthLabel); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>

                        <div class="col-6">
                            <div class="attendance-generator-form-group mb-0">
                                <label class="attendance-generator-label" for="attendanceYear">Year</label>
                                <select class="form-select attendance-generator-input" id="attendanceYear" name="year">
                                    <?php for ($year = $currentYear + 1; $year >= $currentYear - 5; $year--): ?>
                                        <option value="<?php echo $year; ?>" <?php echo $year === $currentYear ? 'selected' : ''; ?>>
                                            <?php echo $year; ?>
                                        </option>
                                    <?php endfor; ?>
                                </select>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <div class="attendance-generator-footer">
                <button type="button" class="btn attendance-generator-btn attendance-generator-btn-light"
                    data-bs-dismiss="modal">
                    Close
                </button>
                <button type="button" class="btn attendance-primary-btn" id="processAttendanceBtn">
                    <span class="attendance-generator-btn-text">Process Attendance</span>
                    <span class="attendance-generator-loader" id="processAttendanceLoader"></span>
                </button>
            </div>
        </div>
    </div>
</div>

<script>
    const appBaseUrl = "<?= base_url(); ?>";
    (function () {
        const selectors = {
            modal: '#attendanceGeneratorModal',
            form: '#attendanceGeneratorForm',
            department: '#attendanceDepartment',
            employee: '#attendanceEmployee',
            month: '#attendanceMonth',
            year: '#attendanceYear',
            processButton: '#processAttendanceBtn',
            processLoader: '#processAttendanceLoader'
        };

        function getElement(selector) {
            return document.querySelector(selector);
        }

        function showEmployeeLoadingState() {
            const employeeEl = getElement(selectors.employee);
            if (!employeeEl) {
                return;
            }

            employeeEl.innerHTML = '<option value="">Loading Employees...</option>';
            employeeEl.setAttribute('disabled', 'disabled');
        }

        function resetEmployeeDropdown() {
            const employeeEl = getElement(selectors.employee);
            if (!employeeEl) {
                return;
            }

            employeeEl.innerHTML = '<option value="">Select Employee</option>';
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
                options += employees.map(function (employee) {
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
            const url = `${appBaseUrl}attendance_card/get_employees_by_department?department=${encodeURIComponent(department)}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch employee list.');
            }

            const result = await response.json();

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

        async function processAttendance() {
            const departmentEl = getElement(selectors.department);
            const employeeEl = getElement(selectors.employee);
            const monthEl = getElement(selectors.month);
            const yearEl = getElement(selectors.year);
            const processBtn = getElement(selectors.processButton);
            const loaderEl = getElement(selectors.processLoader);

            if (!departmentEl || !employeeEl || !monthEl || !yearEl || !processBtn || !loaderEl) {
                return;
            }

            const payload = {
                department: departmentEl.value.trim(),
                employee_number: employeeEl.value.trim(),
                month: monthEl.value.trim(),
                year: yearEl.value.trim()
            };

            if (!payload.department) {
                alert('Please select department.');
                departmentEl.focus();
                return;
            }

            if (!payload.employee_number) {
                alert('Please select employee.');
                employeeEl.focus();
                return;
            }

            if (!payload.month) {
                alert('Please select month.');
                monthEl.focus();
                return;
            }

            if (!payload.year) {
                alert('Please select year.');
                yearEl.focus();
                return;
            }

            processBtn.setAttribute('disabled', 'disabled');
            loaderEl.style.display = 'inline-block';

            try {
                const response = await fetch(`${appBaseUrl}attendance_card/process_attendance`, {
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

                console.log('Process attendance response:', result);

                alert(
                    result.message ||
                    'Attendance processed successfully.'
                );
            } catch (error) {
                console.error(error);
                alert(error.message || 'Something went wrong while processing attendance.');
            } finally {
                processBtn.removeAttribute('disabled');
                loaderEl.style.display = 'none';
            }
        }

        window.openAttendanceGenerator = function () {
            const modalEl = getElement(selectors.modal);
            if (!modalEl) {
                return;
            }

            const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalInstance.show();
        };

        function resetAttendanceModalForm() {
            const departmentEl = getElement(selectors.department);
            const monthEl = getElement(selectors.month);
            const yearEl = getElement(selectors.year);
            const processBtn = getElement(selectors.processButton);
            const loaderEl = getElement(selectors.processLoader);

            if (departmentEl) {
                departmentEl.value = '';
            }

            resetEmployeeDropdown();

            if (monthEl) {
                monthEl.value = String(new Date().getMonth() + 1).padStart(2, '0');
            }

            if (yearEl) {
                yearEl.value = String(new Date().getFullYear());
            }

            if (processBtn) {
                processBtn.removeAttribute('disabled');
            }

            if (loaderEl) {
                loaderEl.style.display = 'none';
            }
        }

        document.addEventListener('DOMContentLoaded', function () {
            const departmentEl = getElement(selectors.department);
            const processBtn = getElement(selectors.processButton);
            const modalEl = getElement(selectors.modal);

            if (modalEl) {
                modalEl.addEventListener('hidden.bs.modal', function () {
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