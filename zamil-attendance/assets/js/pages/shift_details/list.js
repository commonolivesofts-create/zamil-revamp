const tableId = "subshift-table";
const table = document.getElementById(tableId);
const tbody = table ? table.querySelector("tbody") : null;
const numberOfHeaders =
    document.querySelectorAll(`#${tableId} thead th`).length || 1;

const ROOT_URL = (() => {
    const raw =
        typeof baseURL !== "undefined" && baseURL
            ? String(baseURL)
            : `${window.location.origin}/`;
    return raw.endsWith("/") ? raw : `${raw}/`;
})();

const paginate = {
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    pageLimit: 20,
    paginate(action) {
        if (action === "prev" && this.currentPage > 1) {
            this.currentPage -= 1;
        }
        if (action === "next" && this.currentPage < this.totalPages) {
            this.currentPage += 1;
        }
    },
};

let activeRequestController = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(type, message) {
    if (typeof toasterNotification === "function") {
        toasterNotification({ type, message });
        return;
    }

    if (typeof Swal !== "undefined" && Swal.fire) {
        Swal.fire({
            icon: type,
            title: String(message || "").replace(/<[^>]*>/g, "").trim(),
            toast: true,
            position: "top-end",
            timer: 1800,
            showConfirmButton: false,
            timerProgressBar: true,
        });
        return;
    }

    alert(message);
}

function renderNoResponse(message = "No shift detail data available.") {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${numberOfHeaders}" class="empty-text">${escapeHtml(
        message,
    )}</td></tr>`;
}

function renderLoading() {
    if (!tbody) return;
    tbody.innerHTML = `
    <tr>
      <td colspan="${numberOfHeaders}" class="text-center py-3">
        <div class="d-inline-flex align-items-center gap-2 text-muted small">
          <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          <span>Loading sub shifts...</span>
        </div>
      </td>
    </tr>
  `;
}

function getFilters() {
    return {
        shift_name: document.getElementById("subShiftSearch")?.value?.trim() || "",
        status: document.getElementById("subShiftStatus")?.value?.trim() || "",
    };
}

function updatePaginationUi() {
    const currentPageEl = document.getElementById("current-page");
    const totalPagesEl = document.getElementById("total-pages");
    const rangeEl = document.getElementById("range-of-records");

    if (currentPageEl) currentPageEl.textContent = String(paginate.currentPage);
    if (totalPagesEl) totalPagesEl.textContent = String(paginate.totalPages || 1);

    const start =
        paginate.totalRecords === 0
            ? 0
            : (paginate.currentPage - 1) * paginate.pageLimit + 1;
    const end = Math.min(
        paginate.currentPage * paginate.pageLimit,
        paginate.totalRecords,
    );

    if (rangeEl) {
        rangeEl.textContent =
            paginate.totalRecords === 0
                ? "0"
                : `${start}-${end} of ${paginate.totalRecords}`;
    }

    const prevBtn = document.getElementById("prev-page-btn");
    const nextBtn = document.getElementById("next-page-btn");

    if (prevBtn) prevBtn.disabled = paginate.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = paginate.currentPage >= paginate.totalPages;
}

function statusBadge(status, statusDisplay) {
    const raw = String(status || "").trim().toUpperCase();
    const klass =
        raw === "ACTIVE"
            ? "status-active"
            : raw === "INACTIVE"
                ? "status-inactive"
                : "";

    return `<span class="status-badge ${klass}">${escapeHtml(
        statusDisplay || status || "-",
    )}</span>`;
}

function renderRows(rows) {
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        renderNoResponse();
        return;
    }

    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    tbody.innerHTML = rows
        .map((row, index) => {
            return `
        <tr>
          <td class="col-index">${pageStart + index + 1}</td>
          <td class="col-shift">${escapeHtml(row.shift_name || "-")}</td>
          <td>${statusBadge(row.status, row.status_display)}</td>

          <td>${escapeHtml(row.sun_punch_in || "-")}</td>
          <td>${escapeHtml(row.sun_punch_out || "-")}</td>
          <td>${escapeHtml(row.sun_gross_time || "-")}</td>

          <td>${escapeHtml(row.mon_punch_in || "-")}</td>
          <td>${escapeHtml(row.mon_punch_out || "-")}</td>
          <td>${escapeHtml(row.mon_gross_time || "-")}</td>

          <td>${escapeHtml(row.tue_punch_in || "-")}</td>
          <td>${escapeHtml(row.tue_punch_out || "-")}</td>
          <td>${escapeHtml(row.tue_gross_time || "-")}</td>

          <td>${escapeHtml(row.wed_punch_in || "-")}</td>
          <td>${escapeHtml(row.wed_punch_out || "-")}</td>
          <td>${escapeHtml(row.wed_gross_time || "-")}</td>

          <td>${escapeHtml(row.thu_punch_in || "-")}</td>
          <td>${escapeHtml(row.thu_punch_out || "-")}</td>
          <td>${escapeHtml(row.thu_gross_time || "-")}</td>

          <td>${escapeHtml(row.fri_punch_in || "-")}</td>
          <td>${escapeHtml(row.fri_punch_out || "-")}</td>
          <td>${escapeHtml(row.fri_gross_time || "-")}</td>

          <td>${escapeHtml(row.sat_punch_in || "-")}</td>
          <td>${escapeHtml(row.sat_punch_out || "-")}</td>
          <td>${escapeHtml(row.sat_gross_time || "-")}</td>

          <td>
            <a href="${escapeHtml(row.manage_url || "#")}" class="btn btn-outline-secondary manage-btn">
              <i class="ti ti-edit"></i> Manage
            </a>
          </td>
        </tr>
      `;
        })
        .join("");
}

async function fetchList() {
    if (!tbody) return;

    if (activeRequestController) {
        activeRequestController.abort();
    }

    activeRequestController = new AbortController();
    renderLoading();

    try {
        const response = await fetch(`${ROOT_URL}shift-details/list`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            signal: activeRequestController.signal,
            body: JSON.stringify({
                limit: paginate.pageLimit,
                currentPage: paginate.currentPage,
                filters: getFilters(),
                search: document.getElementById("subShiftSearch")?.value?.trim() || "",
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to fetch shift detail data.");
        }

        const result = await response.json();

        paginate.totalPages = Math.max(
            1,
            parseInt(result?.pagination?.total_pages, 10) || 1,
        );
        paginate.totalRecords = parseInt(result?.pagination?.total_records, 10) || 0;

        renderRows(result?.rows || []);
        updatePaginationUi();
    } catch (error) {
        if (error.name === "AbortError") return;

        renderNoResponse("Unable to load shift detail records.");
        updatePaginationUi();
        showToast("error", error.message || "Request failed.");
    } finally {
        activeRequestController = null;
    }
}

function applyFilters() {
    paginate.currentPage = 1;
    fetchList();
}

function handlePagination(action) {
    paginate.paginate(action);
    fetchList();
}

document.addEventListener("DOMContentLoaded", () => {
    fetchList();

    document.getElementById("subShiftFilterBtn")?.addEventListener("click", () => {
        applyFilters();
    });

    document.getElementById("subShiftSearch")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyFilters();
        }
    });

    document.getElementById("subShiftStatus")?.addEventListener("change", () => {
        applyFilters();
    });

    document.getElementById("prev-page-btn")?.addEventListener("click", () => {
        handlePagination("prev");
    });

    document.getElementById("next-page-btn")?.addEventListener("click", () => {
        handlePagination("next");
    });
});