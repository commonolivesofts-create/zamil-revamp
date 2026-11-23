<style>
    .att-upload-modal .modal-dialog {
        max-width: 880px;
        width: calc(100% - 24px);
        height: calc(100vh - 24px);
        margin: 12px auto;
    }

    .att-upload-modal .modal-content {
        height: 100%;
        max-height: calc(100vh - 24px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #e5eaf1;
        border-radius: 14px;
    }

    .att-upload-head {
        flex: 0 0 auto;
        padding: 13px 16px;
        border-bottom: 1px solid #edf1f6;
        background: #ffffff;
    }

    .att-upload-body {
        flex: 1 1 auto;
        min-height: 0;
        padding: 14px 16px;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
    }

    .att-upload-note {
        padding: 9px 11px;
        font-size: 11px;
        color: #64748b;
        background: #f8fafc;
        border: 1px solid #e5eaf1;
        border-radius: 9px;
    }

    .att-upload-table {
        margin-bottom: 0;
        font-size: 11px;
        white-space: nowrap;
    }

    .att-upload-table thead th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: #ffffff;
    }

    .att-upload-summary .badge {
        padding: 5px 8px;
        font-size: 10px;
    }

    .att-upload-footer {
        flex: 0 0 auto;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        background: #ffffff;
        border-top: 1px solid #edf1f6;
    }

    .att-upload-btn {
        height: 32px;
        font-size: 12px;
        border-radius: 4px;
    }

    .att-upload-btn-primary {
        color: #ffffff;
        background: #16833f;
        border: 0;
    }

    .att-upload-btn-primary:hover,
    .att-upload-btn-primary:focus {
        color: #ffffff;
        background: #16833f;
    }

    #attendanceUploadPreview {
        max-height: none;
        overflow: visible;
    }

    #attendanceUploadErrors {
        padding-bottom: 10px;
    }

    @media (max-width: 575.98px) {
        .att-upload-modal .modal-dialog {
            width: calc(100% - 16px);
            height: calc(100vh - 16px);
            margin: 8px;
        }

        .att-upload-modal .modal-content {
            max-height: calc(100vh - 16px);
        }

        .att-upload-head,
        .att-upload-body,
        .att-upload-footer {
            padding-left: 12px;
            padding-right: 12px;
        }

        .att-upload-footer {
            flex-wrap: wrap;
        }

        .att-upload-footer .btn {
            flex: 1 1 auto;
        }
    }
</style>
<div class="modal fade att-upload-modal"
    id="attendanceUploadModal"
    tabindex="-1"
    data-bs-backdrop="static"
    aria-hidden="true">

    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">

            <div class="att-upload-head">
                <h5 class="mb-1 fs-14 fw-bold">Upload Attendance File</h5>

                <div class="text-muted fs-11">
                    Convert the old attendance format and save it in
                    XX_DIGI_ATT_ATT_CARD.
                </div>
            </div>

            <div class="att-upload-body">

                <div class="att-upload-note mb-3">
                    <strong>Required old columns:</strong>
                    Employee ID, First Name, Date, First Punch and Last Punch.
                    Department, Weekday and Total Time are ignored.
                    Supported files: CSV and XLSX.
                </div>

                <input
                    type="file"
                    class="form-control form-control-sm"
                    id="attendanceUploadFile"
                    accept=".csv,.xlsx">

                <div
                    id="attendanceUploadSummary"
                    class="att-upload-summary d-none mt-3">
                </div>

                <div
                    id="attendanceUploadPreview"
                    class="table-responsive d-none mt-2">

                    <table class="table table-sm table-bordered att-upload-table">
                        <thead>
                            <tr>
                                <th>EMP_NO</th>
                                <th>EMP_NAME</th>
                                <th>ATT_DATE</th>
                                <th>PUNCH_IN</th>
                                <th>PUNCH_OUT</th>
                            </tr>
                        </thead>

                        <tbody></tbody>
                    </table>
                </div>

                <div
                    id="attendanceUploadErrors"
                    class="d-none mt-3">

                    <div class="fw-semibold fs-12 text-danger mb-1">
                        Validation Errors
                    </div>

                    <div class="table-responsive">
                        <table class="table table-sm table-bordered att-upload-table">
                            <thead>
                                <tr>
                                    <th>Row</th>
                                    <th>Employee ID</th>
                                    <th>Error</th>
                                </tr>
                            </thead>

                            <tbody></tbody>
                        </table>
                    </div>
                </div>

            </div>

            <div class="att-upload-footer">
                <button
                    type="button"
                    class="btn btn-light att-upload-btn"
                    data-bs-dismiss="modal">
                    Close
                </button>

                <button
                    type="button"
                    class="btn btn-outline-success att-upload-btn"
                    id="previewAttendanceUploadBtn">
                    Preview
                </button>

                <button
                    type="button"
                    class="btn att-upload-btn att-upload-btn-primary"
                    id="importAttendanceUploadBtn"
                    disabled>
                    Import Attendance
                </button>
            </div>

        </div>
    </div>
</div>
<script>
    (function() {
        const modalEl = document.getElementById('attendanceUploadModal'),
            fileEl = document.getElementById('attendanceUploadFile'),
            previewBtn = document.getElementById('previewAttendanceUploadBtn'),
            importBtn = document.getElementById('importAttendanceUploadBtn'),
            summaryEl = document.getElementById('attendanceUploadSummary'),
            previewEl = document.getElementById('attendanceUploadPreview'),
            errorsEl = document.getElementById('attendanceUploadErrors');
        window.openAttendanceUpload = function() {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        };

        function esc(v) {
            const d = document.createElement('div');
            d.textContent = v == null ? '' : v;
            return d.innerHTML;
        }

        function notify(type, message) {
            if (typeof Swal !== 'undefined' && Swal.fire) {
                Swal.fire({
                    icon: type,
                    title: type === 'success' ? 'Success' : 'Error',
                    text: message,
                    confirmButtonColor: '#16833f'
                });
            } else alert(message);
        }

        function reset() {
            summaryEl.classList.add('d-none');
            previewEl.classList.add('d-none');
            errorsEl.classList.add('d-none');
            importBtn.disabled = true;
        }
        fileEl.addEventListener('change', reset);
        async function send(mode) {
            if (!fileEl.files.length) {
                notify('error', 'Please select a CSV or XLSX file.');
                return;
            }
            const btn = mode === 'preview' ? previewBtn : importBtn,
                old = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Processing...';
            try {
                const fd = new FormData();
                fd.append('attendance_file', fileEl.files[0]);
                fd.append('mode', mode);
                const r = await fetch('<?= base_url('attendance_card/upload_attendance_file'); ?>', {
                    method: 'POST',
                    body: fd,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                const j = await r.json();
                if (!j.success) throw new Error(j.message || 'Upload failed.');
                if (mode === 'import') {
                    notify('success', j.message + ' Inserted: ' + (j.data.inserted_rows || 0) + ', Updated: ' + (j.data.updated_rows || 0) + ', Invalid: ' + (j.data.invalid_rows || 0));
                    reset();
                    fileEl.value = '';
                    return;
                }
                const s = j.data.summary || {};
                summaryEl.innerHTML = '<span class="badge bg-light text-dark border me-1">Rows: ' + (s.total_data_rows || 0) + '</span><span class="badge bg-success me-1">Valid: ' + (s.valid_rows || 0) + '</span><span class="badge bg-danger">Invalid: ' + (s.invalid_rows || 0) + '</span>';
                summaryEl.classList.remove('d-none');
                const tb = previewEl.querySelector('tbody');
                tb.innerHTML = (j.data.rows || []).map(x => '<tr><td>' + esc(x.EMP_NO) + '</td><td>' + esc(x.EMP_NAME) + '</td><td>' + esc(x.ATT_DATE) + '</td><td>' + esc(x.PUNCH_IN) + '</td><td>' + esc(x.PUNCH_OUT) + '</td></tr>').join('');
                previewEl.classList.toggle('d-none', !(j.data.rows || []).length);
                const eb = errorsEl.querySelector('tbody');
                eb.innerHTML = (j.data.errors || []).map(x => '<tr><td>' + esc(x.row) + '</td><td>' + esc(x.employee_id) + '</td><td class="text-danger">' + esc(x.errors) + '</td></tr>').join('');
                errorsEl.classList.toggle('d-none', !(j.data.errors || []).length);
                importBtn.disabled = !(s.valid_rows > 0);
            } catch (e) {
                notify('error', e.message);
            } finally {
                btn.innerHTML = old;
                btn.disabled = mode === 'import' ? importBtn.disabled : false;
            }
        }
        previewBtn.addEventListener('click', () => send('preview'));
        importBtn.addEventListener('click', () => send('import'));
    })();

    function resetAttendanceUploadModal() {
        const fileInput = document.getElementById('attendanceUploadFile');
        const summaryBox = document.getElementById('attendanceUploadSummary');
        const previewBox = document.getElementById('attendanceUploadPreview');
        const errorsBox = document.getElementById('attendanceUploadErrors');
        const importButton = document.getElementById('importAttendanceUploadBtn');

        if (fileInput) {
            fileInput.value = '';
        }

        if (summaryBox) {
            summaryBox.innerHTML = '';
            summaryBox.classList.add('d-none');
        }

        if (previewBox) {
            previewBox.classList.add('d-none');

            const previewBody = previewBox.querySelector('tbody');

            if (previewBody) {
                previewBody.innerHTML = '';
            }
        }

        if (errorsBox) {
            errorsBox.classList.add('d-none');

            const errorsBody = errorsBox.querySelector('tbody');

            if (errorsBody) {
                errorsBody.innerHTML = '';
            }
        }

        if (importButton) {
            importButton.disabled = true;
        }

        /*
         * Reset your preview variables only when they exist.
         */
        if (typeof attendanceUploadPreviewData !== 'undefined') {
            attendanceUploadPreviewData = [];
        }

        if (typeof attendanceUploadToken !== 'undefined') {
            attendanceUploadToken = '';
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        const modalElement = document.getElementById('attendanceUploadModal');

        if (!modalElement) {
            return;
        }

        modalElement.addEventListener('hidden.bs.modal', function() {
            resetAttendanceUploadModal();
        });
    });
</script>