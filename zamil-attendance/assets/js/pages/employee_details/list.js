const tableId = "employee-details-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let employeeDetailsMaster = [];
let employeeFetchController = null;
const employeeFilterMeta = {
  full_name: { label: "Employee", inputId: "employeeSearch" },
  employee_number: { label: "Emp No", inputId: "employeeFilterEmpNo" },
  email_address: { label: "Email", inputId: "employeeFilterEmail" },
  job_title: { label: "Job", inputId: "employeeFilterJobTitle" },
  department: { label: "Department", inputId: "employeeFilterDepartment" },
  joining_date: { label: "Joining", inputId: "employeeFilterJoiningDate" },
};

function renderNoResponseCode(option, isAdmin = false) {
  const message = isAdmin
    ? "No employee data available. Try adjusting filters or adding new employees."
    : "No employees found for the selected criteria.";

  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">
        ${message}
    </td></tr>`;
}

async function fetchEmployeeDetailsList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) {
    console.error(`tbody not found for table id: ${tableId}`);
    return;
  }

  try {
    if (employeeFetchController) {
      employeeFetchController.abort();
    }

    requestController = new AbortController();
    employeeFetchController = requestController;

    const skeletonLoaderContent = employeeListSkeleton(numberOfHeaders);
    repeatAndAppendSkeletonContent(tableId, skeletonLoaderContent, 1);

    const url = `${baseURL}employee_details/list`;
    const filters = getEmployeeFilters();
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

    employeeDetailsMaster = data.employee_details || [];
    renderEmployeeDetailsList(employeeDetailsMaster);
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
    if (employeeFetchController === requestController) {
      employeeFetchController = null;
    }
  }
}

function getEmployeeFilters() {
  return {
    full_name: document.getElementById("employeeSearch")?.value?.trim() || "",
    employee_number:
      document.getElementById("employeeFilterEmpNo")?.value?.trim() || "",
    email_address:
      document.getElementById("employeeFilterEmail")?.value?.trim() || "",
    job_title:
      document.getElementById("employeeFilterJobTitle")?.value?.trim() || "",
    department:
      document.getElementById("employeeFilterDepartment")?.value?.trim() || "",
    joining_date:
      document.getElementById("employeeFilterJoiningDate")?.value?.trim() || "",
  };
}

// Set Up Paginate
const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

const employeeStatus = {
  Active: "success",
  Inactive: "danger",
};

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

  if (key === "joining_date") {
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

function renderActiveEmployeeFilterPills() {
  const filtersWrap = document.getElementById("employeeActiveFilters");
  if (!filtersWrap) return;

  const filters = getEmployeeFilters();
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
      const meta = employeeFilterMeta[key];
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
    <button type="button" class="btn btn-link" id="clearAllEmployeeFiltersBtn">Clear All</button>
  `;
  filtersWrap.classList.add("is-visible");
}

function renderEmployeeDetailsList(employees) {
  const employeeTbody = document.querySelector(`#${tableId} tbody`);

  if (!employees) {
    throw new Error("employee details list not found");
  }

  if (employees && employees.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    employees.forEach((emp, idx) => {
      const employeeName = escapeHtml(emp.FULL_NAME || "-");
      content += `
                <tr data-employee-id="${emp.HEADER_ID}">
                    <td class="employee-col-index">${pageStart + idx + 1}</td>

                    <td>
                        <span class="employee-chip">${escapeHtml(emp.EMPLOYEE_NUMBER || "-")}</span>
                    </td>

                    <td class="employee-primary-cell">
                        <span class="employee-name-text">${employeeName}</span>
                    </td>

                    <td>
                        <span class="employee-line">${escapeHtml(emp.EMAIL_ADDRESS || "-")}</span>
                    </td>

                    <td>
                        <span class="employee-chip">${escapeHtml(emp.JOB_TITLE || "-")}</span>
                    </td>

                    <td>
                        <span class="employee-chip">${escapeHtml(emp.DEPARTMENT || "-")}</span>
                    </td>

                 <td>
                        <span class="employee-date-chip">${escapeHtml(emp.JOINING_DATE || "-")}</span>
                    </td>

                 
                </tr>
            `;
    });

    employeeTbody.innerHTML = content;
  } else {
    employeeTbody.innerHTML = renderNoResponseCode({
      colspan: numberOfHeaders,
    });
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchEmployeeDetailsList();
}

function filterContacts() {
  paginate.currentPage = 1;
  renderActiveEmployeeFilterPills();
  fetchEmployeeDetailsList();
}

function resetEmployeeFilters() {
  const ids = [
    "employeeSearch",
    "employeeFilterEmpNo",
    "employeeFilterEmail",
    "employeeFilterJobTitle",
    "employeeFilterDepartment",
    "employeeFilterJoiningDate",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveEmployeeFilterPills();
  fetchEmployeeDetailsList();
}

function employeeListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="employee-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="color: #16833f;"></span>
                    <span style="color: >Loading employees...</span>
                </div>
            </td>
        </tr>
    `;
}

document.addEventListener("DOMContentLoaded", () => {
  fetchEmployeeDetailsList();
  renderActiveEmployeeFilterPills();

  const employeeSearch = document.getElementById("employeeSearch");
  const filterPanel = document.getElementById("employeeFiltersPanel");
  const filterOpenBtn = document.getElementById("openEmployeeFiltersBtn");
  const filterForm = document.getElementById("employeeFiltersForm");
  const resetFiltersBtn = document.getElementById("resetEmployeeFiltersBtn");
  const activeFiltersWrap = document.getElementById("employeeActiveFilters");
  const closeFiltersBtn = document.getElementById("closeEmployeeFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelEmployeeFiltersBtn");

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
    employeeSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (filterForm && filterForm.contains(employeeSearch)) {
          filterContacts();
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
      filterContacts();
      closeFilterPanel();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetEmployeeFilters();
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
      const clearAllBtn = event.target.closest("#clearAllEmployeeFiltersBtn");

      if (clearAllBtn) {
        resetEmployeeFilters();
        return;
      }

      if (!removeBtn) {
        return;
      }

      const filterKey = removeBtn.getAttribute("data-filter-key");
      const inputId = employeeFilterMeta[filterKey]?.inputId;
      const targetInput = inputId ? document.getElementById(inputId) : null;

      if (targetInput) {
        targetInput.value = "";
      }

      filterContacts();
    });
  }
});

// function downloadEmployeeData(fileType = 'excel') {
//     try {
//         const rawFilters = filterCriterias([

//         ]);

//         const filters = Object.fromEntries(
//             Object.entries(rawFilters)
//                 .filter(([_, value]) => value != null && value !== '')
//                 .map(([key, value]) => [key.replace(/^FILTER_/, ''), value])
//         );

//         const form = document.createElement('form');
//         form.method = 'POST';
//         form.action = `${baseURL}employee_details/export_employee`;
//         form.style.display = 'none';

//         const fileTypeInput = document.createElement('input');
//         fileTypeInput.type = 'hidden';
//         fileTypeInput.name = 'file_type';
//         fileTypeInput.value = fileType;

//         const filtersInput = document.createElement('input');
//         filtersInput.type = 'hidden';
//         filtersInput.name = 'filters';
//         filtersInput.value = JSON.stringify(filters);

//         form.appendChild(fileTypeInput);
//         form.appendChild(filtersInput);

//         document.body.appendChild(form);
//         form.submit();
//         document.body.removeChild(form);
//     } catch (error) {
//         console.error('Employee download failed:', error);
//         toasterNotification({
//             type: 'error',
//             message: 'Failed to download Employee data.'
//         });
//     }
// }

function downloadEmployeeData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getEmployeeFilters()).filter(
        ([_, value]) => value != null && value !== "",
      ),
    );

    const searchValue = "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}employee_details/export_employee`;
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
    console.error("Employee download failed:", error);
    toasterNotification({
      type: "error",
      message: "Failed to download Employee data.",
    });
  }
}
