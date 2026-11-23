const paginate = new Pagination({
    currentPageId: "current-page",
    totalPagesId: "total-pages",
    pageOfPageId: "page-of-pages",
    recordsRangeId: "range-of-records",
});
paginate.pageLimit = 15;

function loadAttendance() {

    let tbody = $("#attendance-table-body");

    // Loader inside table
    tbody.html(`
        <tr>
            <td colspan="7" class="text-center">
                <div class="spinner-border spinner-border-sm"></div>
                Loading...
            </td>
        </tr>
    `);

    const fromDate = $("#da-from-date").val();
    const toDate = $("#da-to-date").val();
    const search = $("#da-search").val();

    // Validate dates
    if (!fromDate) {
        tbody.html(`
            <tr>
                <td colspan="7" class="text-center text-danger">
                    Please select From Date.
                </td>
            </tr>
        `);
        return;
    }

    if (!toDate) {
        tbody.html(`
            <tr>
                <td colspan="7" class="text-center text-danger">
                    Please select To Date.
                </td>
            </tr>
        `);
        return;
    }

    if (fromDate > toDate) {
        tbody.html(`
            <tr>
                <td colspan="7" class="text-center text-danger">
                    From Date must be less than or equal to To Date.
                </td>
            </tr>
        `);
        return;
    }

    $.ajax({

        url: BASE_URL + "daily_attendance/list",

        type: "POST",

        contentType: "application/json",

        dataType: "json",

        data: JSON.stringify({

            currentPage: paginate.currentPage,

            limit: paginate.pageLimit,

            from_date: fromDate,

            to_date: toDate,

            search: search

        }),

        success: function (response) {

            // Update Generated Time
            $("#generated-at").text(
                response.generatedAt ?? "-"
            );


            // -----------------------------------------
            // Export URL
            // -----------------------------------------

            let params = $.param({

                from_date: fromDate,

                to_date: toDate,

                search: search

            });

            $("#export-csv").attr(
                "href",
                BASE_URL + "daily_attendance/export?" + params
            );


            // -----------------------------------------
            // Summary
            // -----------------------------------------

            let summary = response.summary ?? {};

            $("#scheduled-employees").text(
                summary.scheduled_employees ?? 0
            );

            $("#checked-in").text(
                summary.checked_in ?? 0
            );

            $("#on-time").text(
                summary.on_time ?? 0
            );

            $("#late-arrivals").text(
                summary.late ?? 0
            );

            $("#late-minutes").text(
                summary.total_late_minutes ?? 0
            );

            $("#not-checked-in").text(
                summary.not_checked_in ?? 0
            );

            $("#absent-count").text(
                summary.absent ?? 0
            );

            $("#missing-punch").text(
                summary.missing_punch ?? 0
            );

            $("#approved-leave").text(
                summary.approved_leave ?? 0
            );

            $("#off-day-count").text(
                (summary.weekend ?? 0) +
                (summary.occasion ?? 0)
            );


            // -----------------------------------------
            // Table
            // -----------------------------------------

            tbody.empty();

            let rows = response.rows ?? [];

            if (rows.length === 0) {

                tbody.html(`
                    <tr>
                        <td colspan="7" class="text-center">
                            No attendance found.
                        </td>
                    </tr>
                `);

                // Still update pagination
                if (response.pagination) {

                    paginate.totalRecords =
                        response.pagination.total_records ?? 0;

                    paginate.totalPages =
                        response.pagination.total_pages ?? 0;

                    paginate.currentPage =
                        response.pagination.current_page ?? 1;
                }

                return;
            }


            // Serial number according to pagination
            let startIndex =
                (paginate.currentPage - 1) *
                paginate.pageLimit;


            rows.forEach(function (row, index) {

                tbody.append(`

                    <tr>

                        <td>
                            ${startIndex + index + 1}
                        </td>

                        <td>
                            ${row.EMP_NO ?? "-"}
                        </td>

                        <td>
                            ${row.EMP_NAME ?? "-"}
                        </td>

                        <td>
                            ${row.ATT_DATE_DISPLAY ?? "-"}
                        </td>

                        <td>
                            ${row.PUNCH_IN ?? "-"}
                        </td>

                        <td>
                            ${row.PUNCH_OUT ?? "-"}
                        </td>

                        <td>
                            ${parseFloat(
                    row.WORK_TIME ?? 0
                ).toFixed(2)} hrs
                        </td>

                    </tr>

                `);

            });


            // -----------------------------------------
            // Pagination
            // -----------------------------------------

            if (response.pagination) {

                paginate.totalRecords =
                    response.pagination.total_records ?? 0;

                paginate.totalPages =
                    response.pagination.total_pages ?? 0;

                paginate.currentPage =
                    response.pagination.current_page ?? 1;
            }

        },

        error: function (xhr) {

            tbody.html(`
                <tr>
                    <td colspan="7" class="text-center text-danger">
                        Error loading attendance.
                    </td>
                </tr>
            `);

            console.error(
                "Attendance API Error:",
                xhr.responseText
            );
        }

    });
}

// $(document).ready(function () {
//     loadAttendance();
// });

function handlePagination(action) {
    paginate.paginate(action);
    loadAttendance(); // <-- reload data for new page

}
function setDefaultDates() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    const todayDate = `${year}-${month}-${day}`;

    $("#da-from-date").val(todayDate);
    $("#da-to-date").val(todayDate);
}
$(document).ready(function () {

    // Set today's date by default
    setDefaultDates();

    // Load today's attendance
    loadAttendance();

    // Apply Filter
    $("#attendance-filter-form").on("submit", function (e) {

        e.preventDefault();

        const fromDate = $("#da-from-date").val();
        const toDate = $("#da-to-date").val();

        if (!fromDate) {
            alert("Please select From Date.");
            $("#da-from-date").focus();
            return;
        }

        if (!toDate) {
            alert("Please select To Date.");
            $("#da-to-date").focus();
            return;
        }

        if (fromDate > toDate) {
            alert("From Date must be less than or equal to To Date.");
            $("#da-from-date").focus();
            return;
        }

        paginate.currentPage = 1;

        loadAttendance();
    });

    // Reset Filter
    $("#btn-reset").on("click", function () {

        // Reset to today's date
        setDefaultDates();

        $("#da-search").val("");

        paginate.currentPage = 1;

        loadAttendance();
    });

});