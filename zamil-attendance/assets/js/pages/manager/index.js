/**
 * Manager View page behaviour: approve/deny a pending absence request
 * inline, without leaving the page.
 */
async function mgrDecideAbsence(rowId, empNo, leaveStartDate, leaveEndDate, decision) {
    const row = document.getElementById(rowId);
    const buttons = row ? row.querySelectorAll('button') : [];

    buttons.forEach((btn) => (btn.disabled = true));

    try {
        const params = new URLSearchParams();
        params.append('emp_no', empNo);
        params.append('leave_start_date', leaveStartDate);
        params.append('leave_end_date', leaveEndDate);
        params.append('decision', decision);

        const base = typeof baseURL !== 'undefined' ? baseURL : '';
        const response = await fetch(`${base}manager/approve-absence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data?.message || 'Unable to update this request.');
        }

        if (typeof toasterNotification === 'function') {
            toasterNotification({ message: data?.message || 'Request updated.', type: 'success' });
        }

        if (row) {
            row.style.transition = 'opacity .2s ease';
            row.style.opacity = '0';
            setTimeout(() => {
                row.remove();
                mgrRefreshEmptyState();
            }, 200);
        }
    } catch (error) {
        console.error(error);
        buttons.forEach((btn) => (btn.disabled = false));
        if (typeof toasterNotification === 'function') {
            toasterNotification({ message: error.message || 'Something went wrong.', type: 'error' });
        } else {
            alert(error.message || 'Something went wrong.');
        }
    }
}

function mgrRefreshEmptyState() {
    const list = document.getElementById('mgrApprovalsList');
    if (!list) return;

    if (!list.querySelector('.mgr-approval-row')) {
        list.innerHTML = '<div class="mgr-empty">No pending requests for this team.</div>';
    }
}
