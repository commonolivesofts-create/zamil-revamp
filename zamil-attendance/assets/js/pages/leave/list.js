const paginate = new Pagination({
    currentPageId: "current-page",
    totalPagesId: "total-pages",
    pageOfPageId: "page-of-pages",
    recordsRangeId: "range-of-records",
});

paginate.pageLimit = 10;

function statusPillClass(status) {
    switch ((status || '').trim().toUpperCase()) {
        case 'APPROVED':
            return 'lr-pill-approved';

        case 'DENIED':
        case 'UNPLANNED':
            return 'lr-pill-denied';

        case 'AWAITING':
        case 'PENDING':
            return 'lr-pill-pending';

        default:
            return 'lr-pill-other';
    }
}

function escapeHtml(value) {
    return $('<div>')
        .text(value === null || value === undefined ? '' : value)
        .html();
}

function loadLeaveRequests() {
    const tbody = $("#leave-table-body");

    const fromDate = $("#leave-from-date").val();
    const toDate = $("#leave-to-date").val();

    $("#leave-filter-error").hide().text('');

    if (!fromDate || !toDate) {
        $("#leave-filter-error")
            .text("Please select From Date and To Date.")
            .show();

        return;
    }

    if (fromDate > toDate) {
        $("#leave-filter-error")
            .text("From Date cannot be greater than To Date.")
            .show();

        return;
    }

    tbody.html(`
        <tr>
            <td colspan="7" class="text-center py-4">
                <div
                    class="spinner-border spinner-border-sm"
                    role="status"
                >
                    <span class="visually-hidden">
                        Loading...
                    </span>
                </div>

                <span class="ms-2">Loading...</span>
            </td>
        </tr>
    `);

    $("#apply-leave-filter")
        .prop("disabled", true)
        .html(`
            <span
                class="spinner-border spinner-border-sm"
                role="status"
            ></span>
            Loading...
        `);

    $.ajax({
        url: BASE_URL + "leave_request/list",
        type: "POST",
        contentType: "application/json",
        dataType: "json",

        data: JSON.stringify({
            fromDate: fromDate,
            toDate: toDate,
            currentPage: paginate.currentPage,
            limit: paginate.pageLimit
        }),

        success: function (response) {
            $("#approved-count").text(
                response.summary?.approved ?? 0
            );

            $("#pending-count").text(
                response.summary?.pending ?? 0
            );

            $("#denied-count").text(
                response.summary?.denied ?? 0
            );

            $("#total-count").text(
                response.summary?.total ??
                response.pagination?.total_records ??
                0
            );

            if (response.period) {
                $("#leave-period-from").text(
                    response.period.from_label ?? '-'
                );

                $("#leave-period-to").text(
                    response.period.to_label ?? '-'
                );
            }

            tbody.empty();

            if (
                !response.requests ||
                response.requests.length === 0
            ) {
                tbody.html(`
                    <tr>
                        <td colspan="7" class="text-center py-4">
                            No leave requests found for the selected dates.
                        </td>
                    </tr>
                `);
            } else {
                const startIndex =
                    (
                        paginate.currentPage - 1
                    ) * paginate.pageLimit;

                response.requests.forEach(function (req, index) {
                    const status =
                        req.APPROVAL_STATUS ?? '-';

                    tbody.append(`
                        <tr>
                            <td>
                                ${startIndex + index + 1}
                            </td>

                            <td>
                                ${escapeHtml(
                        req.EMP_NAME ?? '-'
                    )}
                            </td>

                            <td>
                                ${escapeHtml(
                        req.LEAVE_TYPE ?? '-'
                    )}
                            </td>

                            <td>
                                ${escapeHtml(
                        req.LEAVE_START_DATE ?? '-'
                    )}
                            </td>

                            <td>
                                ${escapeHtml(
                        req.LEAVE_END_DATE ?? '-'
                    )}
                            </td>

                            <td>
                                ${escapeHtml(
                        req.TOTAL_DAYS ?? 0
                    )}
                            </td>

                            <td>
                                <span
                                    class="lr-pill ${statusPillClass(status)}"
                                >
                                    ${escapeHtml(status)}
                                </span>
                            </td>
                        </tr>
                    `);
                });
            }

            paginate.totalRecords =
                Number(
                    response.pagination?.total_records ?? 0
                );

            paginate.totalPages =
                Number(
                    response.pagination?.total_pages ?? 1
                );

            paginate.currentPage =
                Number(
                    response.pagination?.current_page ?? 1
                );

            /*
             * Update pagination display after receiving data.
             * Use your Pagination class render/update method
             * here if it has one.
             */
            if (typeof paginate.update === "function") {
                paginate.update();
            }

            if (typeof paginate.render === "function") {
                paginate.render();
            }
        },

        error: function (xhr) {
            let message = "Error loading records.";

            if (
                xhr.responseJSON &&
                xhr.responseJSON.message
            ) {
                message = xhr.responseJSON.message;
            }

            $("#leave-filter-error")
                .text(message)
                .show();

            tbody.html(`
                <tr>
                    <td
                        colspan="7"
                        class="text-center text-danger py-4"
                    >
                        ${escapeHtml(message)}
                    </td>
                </tr>
            `);
        },

        complete: function () {
            $("#apply-leave-filter")
                .prop("disabled", false)
                .html(`
                    <i class="ti ti-filter"></i>
                    Apply
                `);
        }
    });
}

$(document).ready(function () {
    /*
     * Initial data load.
     */
    loadLeaveRequests();

    /*
     * Apply date filter without page refresh.
     */
    $("#apply-leave-filter").on("click", function () {
        paginate.currentPage = 1;
        loadLeaveRequests();
    });

    /*
     * Reset dates to the default payroll period.
     */
    $("#reset-leave-filter").on("click", function () {
        const defaultFromDate =
            $(this).data("from-date") || '';

        const defaultToDate =
            $(this).data("to-date") || '';

        $("#leave-from-date").val(defaultFromDate);
        $("#leave-to-date").val(defaultToDate);

        paginate.currentPage = 1;

        loadLeaveRequests();
    });

    /*
     * Optional: apply when Enter is pressed.
     */
    $("#leave-from-date, #leave-to-date")
        .on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();

                paginate.currentPage = 1;
                loadLeaveRequests();
            }
        });
});

function handlePagination(action) {
    paginate.paginate(action);

    loadLeaveRequests();
}