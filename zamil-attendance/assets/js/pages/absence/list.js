const tableId = "absence-details-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let absenceDetailsMaster = [];
let absenceFetchController = null;

const absenceFilterMeta = {
  emp_name: { label: "Employee", inputId: "absenceSearch" },
  emp_no: { label: "Emp No", inputId: "absenceFilterEmpNo" },
  department_name: {
    label: "Department",
    inputId: "absenceFilterDepartmentName",
  },
  position: { label: "Position", inputId: "absenceFilterPosition" },
  leave_type: { label: "Leave Type", inputId: "absenceFilterLeaveType" },
  approval_status: {
    label: "Approval Status",
    inputId: "absenceFilterApprovalStatus",
  },
  leave_start_date: {
    label: "Start Date",
    inputId: "absenceFilterLeaveStartDate",
  },
  leave_end_date: {
    label: "End Date",
    inputId: "absenceFilterLeaveEndDate",
  },
  total_days: { label: "Total Days", inputId: "absenceFilterTotalDays" },
};


document.addEventListener("DOMContentLoaded", function () {
  const startInput = document.getElementById("absenceFilterLeaveStartDate");
  const endInput = document.getElementById("absenceFilterLeaveEndDate");

  if (!startInput || !endInput) return;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const startDate = new Date(year, month - 1, 21);
  const endDate = new Date(year, month, 20);

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  startInput.value = formatDate(startDate);
  endInput.value = formatDate(endDate);
});

function renderNoResponseCode(option, isAdmin = false) {
  const message = isAdmin
    ? "No absence data available. Try adjusting filters."
    : "No absence records found for the selected criteria.";

  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">
        ${message}
    </td></tr>`;
}

async function fetchAbsenceDetailsList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) {
    console.error(`tbody not found for table id: ${tableId}`);
    return;
  }

  try {
    if (absenceFetchController) {
      absenceFetchController.abort();
    }

    requestController = new AbortController();
    absenceFetchController = requestController;

    const skeletonLoaderContent = absenceListSkeleton(numberOfHeaders);
    repeatAndAppendSkeletonContent(tableId, skeletonLoaderContent, 1);

    const url = `${baseURL}absence/list`;
    const filters = getAbsenceFilters();
    const searchValue = "";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: requestController.signal,
      body: JSON.stringify({
        limit: paginate.pageLimit,
        currentPage: paginate.currentPage,
        filters: filters,
        search: searchValue,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    absenceDetailsMaster = data.absence_details || [];
    renderAbsenceDetailsList(absenceDetailsMaster);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    toasterNotification({
      type: "error",
      message: "Request failed: " + error.message,
    });
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
    console.error(error);
  } finally {
    if (absenceFetchController === requestController) {
      absenceFetchController = null;
    }
  }
}

function convertDateToOracleFormat(dateValue) {
  if (!dateValue) return "";

  const parts = dateValue.split("-");
  if (parts.length !== 3) return "";

  const yyyy = parts[0];
  const mm = parts[1];
  const dd = parts[2];

  return `${dd}-${mm}-${yyyy.slice(-2)}`;
}

function getAbsenceFilters() {
  return {
    emp_name: document.getElementById("absenceSearch")?.value?.trim() || "",
    emp_no: document.getElementById("absenceFilterEmpNo")?.value?.trim() || "",
    department_name: document.getElementById("absenceFilterDepartmentName")?.value?.trim() || "",
    position: document.getElementById("absenceFilterPosition")?.value?.trim() || "",
    leave_type: document.getElementById("absenceFilterLeaveType")?.value?.trim() || "",
    approval_status: document.getElementById("absenceFilterApprovalStatus")?.value?.trim() || "",
    leave_start_date: convertDateToOracleFormat(
      document.getElementById("absenceFilterLeaveStartDate")?.value?.trim() || ""
    ),
    leave_end_date: convertDateToOracleFormat(
      document.getElementById("absenceFilterLeaveEndDate")?.value?.trim() || ""
    ),
    total_days: document.getElementById("absenceFilterTotalDays")?.value?.trim() || "",
  };
}

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatFilterValue(key, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (key === "leave_start_date" || key === "leave_end_date") {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) {
      return new Date(parsed).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }

  return raw;
}

function renderActiveAbsenceFilterPills() {
  const filtersWrap = document.getElementById("absenceActiveFilters");
  if (!filtersWrap) return;

  const filters = getAbsenceFilters();
  const activeEntries = Object.entries(filters).filter(
    ([, value]) => value != null && String(value).trim() !== "",
  );

  if (!activeEntries.length) {
    filtersWrap.innerHTML = "";
    filtersWrap.classList.remove("is-visible");
    return;
  }

  const pills = activeEntries
    .map(([key, value]) => {
      const meta = absenceFilterMeta[key];
      if (!meta) return "";

      return `
        <span class="employee-filter-pill">
          <span class="employee-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="employee-filter-pill-value">${escapeHtml(formatFilterValue(key, value))}</span>
          <button
            type="button"
            class="employee-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
    })
    .join("");

  filtersWrap.innerHTML = `
    <span class="employee-filter-summary">Active Filters</span>
    ${pills}
    <span class="employee-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllAbsenceFiltersBtn">Clear All</button>
  `;
  filtersWrap.classList.add("is-visible");
}

function renderAbsenceDetailsList(absences) {
  const absenceTbody = document.querySelector(`#${tableId} tbody`);

  if (!absences) {
    throw new Error("absence details list not found");
  }

  const approvalStatusClasses = {
    AWAITING: "absence-status-badge absence-status-awaiting",
    APPROVED: "absence-status-badge absence-status-approved",
    DENIED: "absence-status-badge absence-status-denied",
  };

  if (absences && absences.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    absences.forEach((row, idx) => {
      const approvalStatus = (row.APPROVAL_STATUS || "-")
        .toString()
        .trim()
        .toUpperCase();
      const approvalStatusClass =
        approvalStatusClasses[approvalStatus] ||
        "absence-status-badge absence-status-default";

      content += `
        <tr>
          <td class="employee-col-index">${pageStart + idx + 1}</td>

          <td class="employee-primary-cell">
            <span class="employee-chip">${escapeHtml(row.EMP_NO || "-")}</span>
          </td>

          <td>
            <span class="employee-chip">${escapeHtml(row.DEPARTMENT_NAME || "-")}</span>
          </td>

          <td class="employee-primary-cell">
            <div class="employee-person-chip">
              <span class="employee-name-text">${escapeHtml(row.EMP_NAME || "-")}</span>
            </div>
          </td>

          <td>
            <span class="employee-chip">${escapeHtml(row.POSITION || "-")}</span>
          </td>

          <td>
            <span class="employee-date-chip">${escapeHtml(row.LEAVE_START_DATE || "-")}</span>
          </td>

          <td>
            <span class="employee-date-chip">${escapeHtml(row.LEAVE_END_DATE || "-")}</span>
          </td>

          <td>
            <span class="employee-chip">${escapeHtml(row.TOTAL_DAYS || "-")}</span>
          </td>

          <td>
            <span class="employee-chip">${escapeHtml(row.LEAVE_TYPE || "-")}</span>
          </td>

          <td>
            <span class="${approvalStatusClass}">
              ${escapeHtml(row.APPROVAL_STATUS || "-")}
            </span>
          </td>
        </tr>
      `;
    });

    absenceTbody.innerHTML = content;
  } else {
    absenceTbody.innerHTML = renderNoResponseCode({
      colspan: numberOfHeaders,
    });
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchAbsenceDetailsList();
}

function filterAbsenceRecords() {
  paginate.currentPage = 1;
  renderActiveAbsenceFilterPills();
  fetchAbsenceDetailsList();
}

function resetAbsenceFilters() {
  const ids = [
    "absenceSearch",
    "absenceFilterEmpNo",
    "absenceFilterDepartmentName",
    "absenceFilterPosition",
    "absenceFilterLeaveType",
    "absenceFilterApprovalStatus",
    "absenceFilterLeaveStartDate",
    "absenceFilterLeaveEndDate",
    "absenceFilterTotalDays",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveAbsenceFilterPills();
  fetchAbsenceDetailsList();
}

function absenceListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="employee-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="color: #16833f;"></span>
                    <span>Loading absence details...</span>
                </div>
            </td>
        </tr>
    `;
}

document.addEventListener("DOMContentLoaded", () => {
  fetchAbsenceDetailsList();
  renderActiveAbsenceFilterPills();

  const absenceSearch = document.getElementById("absenceSearch");
  const filterPanel = document.getElementById("absenceFiltersPanel");
  const filterOpenBtn = document.getElementById("openAbsenceFiltersBtn");
  const filterForm = document.getElementById("absenceFiltersForm");
  const resetFiltersBtn = document.getElementById("resetAbsenceFiltersBtn");
  const activeFiltersWrap = document.getElementById("absenceActiveFilters");
  const closeFiltersBtn = document.getElementById("closeAbsenceFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelAbsenceFiltersBtn");

  function openFilterPanel() {
    if (filterPanel) {
      filterPanel.classList.add("is-open");
      filterPanel.setAttribute("aria-hidden", "false");
    }

    if (filterOpenBtn) {
      filterOpenBtn.classList.add("is-active");
      filterOpenBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeFilterPanel() {
    if (filterPanel) {
      filterPanel.classList.remove("is-open");
      filterPanel.setAttribute("aria-hidden", "true");
    }

    if (filterOpenBtn) {
      filterOpenBtn.classList.remove("is-active");
      filterOpenBtn.setAttribute("aria-expanded", "false");
    }
  }

  if (absenceSearch) {
    absenceSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (filterForm && filterForm.contains(absenceSearch)) {
          filterAbsenceRecords();
          closeFilterPanel();
        }
      }
    });
  }

  if (filterOpenBtn) {
    filterOpenBtn.addEventListener("click", (event) => {
      event.stopPropagation();

      if (filterPanel?.classList.contains("is-open")) {
        closeFilterPanel();
        return;
      }

      openFilterPanel();
    });
  }

  if (filterPanel) {
    filterPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (closeFiltersBtn) {
    closeFiltersBtn.addEventListener("click", () => {
      closeFilterPanel();
    });
  }

  if (cancelFiltersBtn) {
    cancelFiltersBtn.addEventListener("click", () => {
      closeFilterPanel();
    });
  }

  if (filterForm) {
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      filterAbsenceRecords();
      closeFilterPanel();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetAbsenceFilters();
    });
  }

  document.addEventListener("click", (event) => {
    if (!filterPanel?.classList.contains("is-open")) {
      return;
    }

    if (
      filterPanel.contains(event.target) ||
      filterOpenBtn?.contains(event.target)
    ) {
      return;
    }

    closeFilterPanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filterPanel?.classList.contains("is-open")) {
      closeFilterPanel();
    }
  });

  if (activeFiltersWrap) {
    activeFiltersWrap.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".employee-filter-pill-remove");
      const clearAllBtn = event.target.closest("#clearAllAbsenceFiltersBtn");

      if (clearAllBtn) {
        resetAbsenceFilters();
        return;
      }

      if (!removeBtn) {
        return;
      }

      const filterKey = removeBtn.getAttribute("data-filter-key");
      const inputId = absenceFilterMeta[filterKey]?.inputId;
      const targetInput = inputId ? document.getElementById(inputId) : null;

      if (targetInput) {
        targetInput.value = "";
      }

      filterAbsenceRecords();
    });
  }
});

function downloadAbsenceData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getAbsenceFilters()).filter(
        ([_, value]) => value != null && value !== "",
      ),
    );

    const searchValue = "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}absence/export_absence`;
    form.style.display = "none";

    const fileTypeInput = document.createElement("input");
    fileTypeInput.type = "hidden";
    fileTypeInput.name = "file_type";
    fileTypeInput.value = fileType;

    const filtersInput = document.createElement("input");
    filtersInput.type = "hidden";
    filtersInput.name = "filters";
    filtersInput.value = JSON.stringify(filters);

    const limitInput = document.createElement("input");
    limitInput.type = "hidden";
    limitInput.name = "limit";
    limitInput.value = paginate.pageLimit;

    const currentPageInput = document.createElement("input");
    currentPageInput.type = "hidden";
    currentPageInput.name = "currentPage";
    currentPageInput.value = paginate.currentPage;

    const searchInput = document.createElement("input");
    searchInput.type = "hidden";
    searchInput.name = "search";
    searchInput.value = searchValue;

    form.appendChild(fileTypeInput);
    form.appendChild(filtersInput);
    form.appendChild(limitInput);
    form.appendChild(currentPageInput);
    form.appendChild(searchInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } catch (error) {
    console.error("Absence download failed:", error);
    toasterNotification({
      type: "error",
      message: "Failed to download absence data.",
    });
  }
}
