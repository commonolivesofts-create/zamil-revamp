const tableId = "timesheet-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let timesheetMaster = [];
let timesheetFetchController = null;
const timesheetFilterMeta = {
  emp_no: { label: "Emp No", inputId: "timesheetFilterEmpNo" },
  emp_name: { label: "Employee", inputId: "timesheetSearch" },
  shift: { label: "Shift", inputId: "timesheetFilterShift" },
  att_date_start: {
    label: "Date From",
    inputId: "timesheetFilterAttDateStart",
  },
  att_date_end: { label: "Date To", inputId: "timesheetFilterAttDateEnd" },
};

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 50;

function renderNoResponseCode(option) {
  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No timesheet data available.</td></tr>`;
}

function getTimesheetFilters() {
  return {
    emp_no:
      document.getElementById("timesheetFilterEmpNo")?.value?.trim() || "",
    emp_name: document.getElementById("timesheetSearch")?.value?.trim() || "",
    shift: document.getElementById("timesheetFilterShift")?.value?.trim() || "",
    att_date_start:
      document.getElementById("timesheetFilterAttDateStart")?.value?.trim() ||
      "",
    att_date_end:
      document.getElementById("timesheetFilterAttDateEnd")?.value?.trim() || "",
  };
}


function timesheetListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="timesheet-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="color: #16833f;"></span>
                    <span>Loading timesheet...</span>
                </div>
            </td>
        </tr>
    `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", function () {
  const startInput = document.getElementById("timesheetFilterAttDateStart");
  const endInput = document.getElementById("timesheetFilterAttDateEnd");

  if (!startInput || !endInput) return;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based

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


function formatFilterValue(key, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (key === "att_date_start" || key === "att_date_end") {
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

function renderActiveTimesheetFilterPills() {
  const filtersWrap = document.getElementById("timesheetActiveFilters");
  if (!filtersWrap) return;

  const filters = getTimesheetFilters();
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
      const meta = timesheetFilterMeta[key];
      if (!meta) return "";

      return `
        <span class="timesheet-filter-pill">
          <span class="timesheet-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="timesheet-filter-pill-value">${escapeHtml(formatFilterValue(key, value))}</span>
          <button
            type="button"
            class="timesheet-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
    })
    .join("");

  filtersWrap.innerHTML = `
    <span class="timesheet-filter-summary">Active Filters</span>
    ${pills}
    <span class="timesheet-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllTimesheetFiltersBtn">Clear All</button>
  `;
  filtersWrap.classList.add("is-visible");
}

function displayValue(value) {
  const raw = String(value || "").trim();
  return raw === "" ? "-" : raw;
}

function renderTimesheetList(rows) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;

  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;

    const value = String(timeStr).trim();
    if (!value || value === "-") return null;

    const parts = value.split(":");
    if (parts.length < 2) return null;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return null;

    return (hours * 60) + minutes;
  }

  function getLateClass(punchIn, checkIn) {
    const punchInMinutes = parseTimeToMinutes(punchIn);
    const checkInMinutes = parseTimeToMinutes(checkIn);

    if (punchInMinutes === null || checkInMinutes === null) {
      return "";
    }

    return punchInMinutes > checkInMinutes ? "timesheet-danger-text" : "";
  }

  function getEarlyOutClass(punchOut, checkOut) {
    const punchOutMinutes = parseTimeToMinutes(punchOut);
    const checkOutMinutes = parseTimeToMinutes(checkOut);

    if (punchOutMinutes === null || checkOutMinutes === null) {
      return "";
    }

    return punchOutMinutes < checkOutMinutes ? "timesheet-danger-text" : "";
  }

  function getRowClass(item) {
    const absence = String(item.absence || "").trim().toLowerCase();
    return absence === "absence without permission" ? "timesheet-row-light-danger" : "";
  }

  function getDayName(item) {
    const rawDate = item.att_date || item.att_date_display || "";
    if (!rawDate) return "-";

    let dateObj = null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      dateObj = new Date(rawDate);
    } else if (/^\d{2}-\d{2}-\d{2}$/.test(rawDate)) {
      const [dd, mm, yy] = rawDate.split("-");
      const fullYear = Number(yy) + 2000;
      dateObj = new Date(fullYear, Number(mm) - 1, Number(dd));
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(rawDate)) {
      const [dd, mm, yyyy] = rawDate.split("-");
      dateObj = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    } else {
      const temp = new Date(rawDate);
      if (!isNaN(temp.getTime())) {
        dateObj = temp;
      }
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      return "-";
    }

    return dateObj.toLocaleDateString("en-US", { weekday: "long" });
  }

  if (rows && rows.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    rows.forEach((item, idx) => {
      const checkIn = displayValue(item.check_in);
      const punchIn = displayValue(item.punch_in);
      const checkOut = displayValue(item.check_out);
      const punchOut = displayValue(item.punch_out);
      const dayName = getDayName(item);

      const punchInClass = getLateClass(punchIn, checkIn);
      const punchOutClass = getEarlyOutClass(punchOut, checkOut);
      const rowClass = getRowClass(item);

      content += `
        <tr class="${rowClass}">
          <td class="timesheet-col-index">${pageStart + idx + 1}</td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.emp_no))}</span></td>
          <td class="timesheet-primary-cell">
            <span class="timesheet-name-text">${escapeHtml(displayValue(item.emp_name))}</span>
          </td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.shift))}</span></td>
          <td><span class="timesheet-date-chip">${escapeHtml(item.att_date_display || "-")}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(dayName)}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(checkIn)}</span></td>
          <td><span class="timesheet-chip ${punchInClass}">${escapeHtml(punchIn)}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(checkOut)}</span></td>
          <td><span class="timesheet-chip ${punchOutClass}">${escapeHtml(punchOut)}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.total_minutes))}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.early))}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.late))}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.overtime))}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.absence))}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.tot_delay))}</span></td>
          <td><span class="timesheet-chip">${escapeHtml(displayValue(item.overtime_hrs))}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = content;
  } else {
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  }
}

async function fetchTimesheetList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) return;

  try {
    if (timesheetFetchController) {
      timesheetFetchController.abort();
    }

    requestController = new AbortController();
    timesheetFetchController = requestController;

    repeatAndAppendSkeletonContent(
      tableId,
      timesheetListSkeleton(numberOfHeaders),
      1,
    );

    const response = await fetch(`${baseURL}report/timesheet/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: requestController.signal,
      body: JSON.stringify({
        limit: paginate.pageLimit,
        currentPage: paginate.currentPage,
        filters: getTimesheetFilters(),
        search: "",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch timesheet data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    timesheetMaster = data.timesheets || [];
    renderTimesheetList(timesheetMaster);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    toasterNotification({
      type: "error",
      message: "Request failed: " + error.message,
    });
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  } finally {
    if (timesheetFetchController === requestController) {
      timesheetFetchController = null;
    }
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchTimesheetList();
}

function filterTimesheets() {
  paginate.currentPage = 1;
  renderActiveTimesheetFilterPills();
  fetchTimesheetList();
}

function resetTimesheetFilters() {
  const ids = [
    "timesheetFilterEmpNo",
    "timesheetSearch",
    "timesheetFilterShift",
    "timesheetFilterAttDateStart",
    "timesheetFilterAttDateEnd",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveTimesheetFilterPills();
  fetchTimesheetList();
}

function downloadTimesheetData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getTimesheetFilters()).filter(
        ([, value]) => value != null && value !== "",
      ),
    );

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}report/timesheet/export`;
    form.style.display = "none";

    const fileTypeInput = document.createElement("input");
    fileTypeInput.type = "hidden";
    fileTypeInput.name = "file_type";
    fileTypeInput.value = fileType;

    const filtersInput = document.createElement("input");
    filtersInput.type = "hidden";
    filtersInput.name = "filters";
    filtersInput.value = JSON.stringify(filters);

    const searchInput = document.createElement("input");
    searchInput.type = "hidden";
    searchInput.name = "search";
    searchInput.value = "";

    form.appendChild(fileTypeInput);
    form.appendChild(filtersInput);
    form.appendChild(searchInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } catch (error) {
    console.error("Timesheet download failed:", error);
    toasterNotification({
      type: "error",
      message: "Failed to download timesheet data.",
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchTimesheetList();
  renderActiveTimesheetFilterPills();

  const employeeSearch = document.getElementById("timesheetSearch");
  const filterPanel = document.getElementById("timesheetFiltersPanel");
  const filterOpenBtn = document.getElementById("openTimesheetFiltersBtn");
  const filterForm = document.getElementById("timesheetFiltersForm");
  const resetFiltersBtn = document.getElementById("resetTimesheetFiltersBtn");
  const activeFiltersWrap = document.getElementById("timesheetActiveFilters");
  const closeFiltersBtn = document.getElementById("closeTimesheetFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelTimesheetFiltersBtn");

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

  if (employeeSearch) {
    employeeSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (filterForm && filterForm.contains(employeeSearch)) {
          filterTimesheets();
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
      filterTimesheets();
      closeFilterPanel();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetTimesheetFilters();
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
      const removeBtn = event.target.closest(".timesheet-filter-pill-remove");
      const clearAllBtn = event.target.closest("#clearAllTimesheetFiltersBtn");

      if (clearAllBtn) {
        resetTimesheetFilters();
        return;
      }

      if (!removeBtn) {
        return;
      }

      const filterKey = removeBtn.getAttribute("data-filter-key");
      const inputId = timesheetFilterMeta[filterKey]?.inputId;
      const targetInput = inputId ? document.getElementById(inputId) : null;

      if (targetInput) {
        targetInput.value = "";
      }

      filterTimesheets();
    });
  }
});
