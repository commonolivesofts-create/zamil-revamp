const tableId = "employees-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let employeesMaster = [];
let employeeFetchController = null;
const employeeFilterMeta = {
  division: { label: "Division" },
  department: { label: "Dept" },
  con_number: { label: "Contractor #" },
  status: { label: "Status" },
  start_date: { label: "From" },
  end_date: { label: "To" },
};

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function renderNoResponseCode(option) {
  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No employee data available.</td></tr>`;
}

function getEmployeeFilters() {
  return {
    division: document.getElementById("employeeFilterDivision")?.value?.trim() || "",
    department:
      document.getElementById("employeeFilterDepartment")?.value?.trim() || "",
    con_number:
      document.getElementById("employeeFilterConNumber")?.value?.trim() || "",
    status: document.getElementById("employeeFilterStatus")?.value?.trim() || "",
    start_date:
      document.getElementById("employeeFilterStartDate")?.value?.trim() || "",
    end_date:
      document.getElementById("employeeFilterEndDate")?.value?.trim() || "",
  };
}

function employeeListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="employee-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Loading employees...</span>
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

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function getInitials(value) {
  const cleaned = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return cleaned || "S";
}

function toDateInputValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return raw;

  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const parsed = Date.parse(raw);
  if (!isNaN(parsed)) {
    const date = new Date(parsed);
    const month = `0${date.getMonth() + 1}`.slice(-2);
    const day = `0${date.getDate()}`.slice(-2);
    return `${date.getFullYear()}-${month}-${day}`;
  }

  return raw;
}

function formatFilterValue(key, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (key === "status") {
    return raw.charAt(0) + raw.slice(1).toLowerCase();
  }

  if (key === "start_date" || key === "end_date") {
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

function renderActiveFilterPills() {
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
          <span class="employee-filter-pill-value">${escapeHtml(
            formatFilterValue(key, value),
          )}</span>
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

function showToast(type, message) {
  if (typeof toasterNotification === "function") {
    toasterNotification({ type, message });
    return;
  }

  if (typeof Swal !== "undefined" && Swal.fire) {
    Swal.fire({
      icon: type,
      title: stripHtml(message),
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

function renderEmployeesList(employees) {
  const employeeTbody = document.querySelector(`#${tableId} tbody`);

  if (!employeeTbody) {
    return;
  }

  if (employees && employees.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

  const divisionLabel = (value) => {
  const v = String(value || "").trim().toUpperCase();

  if (v === "IBM" || v === "300000003618177" || v === "IPP" || v === "IPP BU") {
    return "IPP BU";
  }

  if (v === "Z3P" || v === "300000003618190" || v === "FPP" || v === "FPP BU") {
    return "FPP BU";
  }

  return value || "-";
};
    employees.forEach((employee, idx) => {
      const employeeNumber = escapeHtml(employee.employee_number || "-");
      const employeeName = escapeHtml(employee.employee_name || "-");
      const division = escapeHtml(divisionLabel(employee.division));
      const department = escapeHtml(employee.department || "-");
      const conName = escapeHtml(employee.con_name || "-");
      const conNumber = escapeHtml(employee.con_number || "-");
      const startDate = escapeHtml(employee.start_date_display || "-");
      const endDate = escapeHtml(employee.end_date_display || "-");
      const statusRaw = String(
        employee.status || employee.status_display || "",
      ).trim();
      const statusText = escapeHtml(
        employee.status_display || employee.status || "-",
      );
      const statusClass =
        statusRaw.toUpperCase() === "ACTIVE"
          ? "status-active"
          : statusRaw.toUpperCase() === "INACTIVE"
            ? "status-inactive"
            : "";

      content += `
        <tr data-id="${escapeHtml(employee.id || "")}">
          <td class="employee-col-index">${pageStart + idx + 1}</td>
          <td class="employee-name-cell">
            <div class="employee-name-chip">
              <span class="employee-name-text">${employeeNumber}</span>
            </div>
          </td>
          <td>${division}</td>
          <td>${department}</td>
          <td class="employee-name-cell">
            <div class="employee-name-chip">
              <span class="employee-name-text">${conName}</span>
            </div>
          </td>
          <td>${conNumber}</td>
          <td class="employee-name-cell">
            <div class="employee-name-chip">
              <span class="employee-name-text">${employeeName}</span>
            </div>
          </td>
          <td>
            <span class="employee-date-chip">
              ${startDate}
            </span>
          </td>
          <td>
            <span class="employee-date-chip">
              ${endDate}
            </span>
          </td>
          <td>
            <span class="employee-status-badge ${statusClass}">
              ${statusText}
            </span>
          </td>
          <td class="text-center employee-action-cell">
            <div class="employee-action-stack">
              <button
                type="button"
                class="employee-action-btn js-edit-employee"
                data-id="${escapeHtml(employee.id || "")}"
                data-division="${escapeHtml(employee.division || "")}"
                data-con_number="${escapeHtml(employee.con_number || "")}"
                data-con_name="${escapeHtml(employee.con_name || "")}"
                data-employee_number="${escapeHtml(employee.employee_number || "")}"
                data-employee_name="${escapeHtml(employee.employee_name || "")}"
                data-iqamah="${escapeHtml(employee.iqamah || "")}"
                data-department="${escapeHtml(employee.department || "")}"
                data-prod_dep="${escapeHtml(employee.prod_dep || "")}"
                data-direct_boss="${escapeHtml(employee.direct_boss || "")}"
                data-direct_boss_id="${escapeHtml(employee.direct_boss_id || "")}"
                data-job="${escapeHtml(employee.job || "")}"
                data-job_title="${escapeHtml(employee.job_title || "")}"
                data-place="${escapeHtml(employee.place || "")}"
                data-replacement="${escapeHtml(employee.replacement || "")}"
                data-rate="${escapeHtml(employee.rate || "")}"
                data-start_date="${escapeHtml(employee.start_date || "")}"
                data-end_date="${escapeHtml(employee.end_date || "")}"
                data-status="${escapeHtml(employee.status || "")}"
                data-ajeer="${escapeHtml(employee.ajeer || "")}"
                data-sfda="${escapeHtml(employee.sfda || "")}"
                data-blacklist="${escapeHtml(employee.blacklist || "")}"
                data-remark="${escapeHtml(employee.remark || "")}"
                title="Edit"
                aria-label="Edit Employee">
                <i class="ti ti-edit"></i>
              </button>

              <button
                type="button"
                class="employee-action-btn delete js-delete-employee"
                data-id="${escapeHtml(employee.id || "")}"
                data-employee="${escapeHtml(employee.employee_name || "")}"
                title="Delete"
                aria-label="Delete Employee">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    employeeTbody.innerHTML = content;
  } else {
    employeeTbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  }
}

async function fetchEmployeeList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) {
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

    const url = `${baseURL}contractor/employees/list`;
    const filters = getEmployeeFilters();
    const searchValue = document.getElementById("employeeSearch")?.value || "";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: requestController.signal,
      body: JSON.stringify({
        limit: paginate.pageLimit,
        currentPage: paginate.currentPage,
        filters,
        search: searchValue,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch employee data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    employeesMaster = data?.employees || [];
    renderEmployeesList(employeesMaster);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    showToast("error", "Request failed: " + error.message);
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  } finally {
    if (employeeFetchController === requestController) {
      employeeFetchController = null;
    }
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchEmployeeList();
}

function filterEmployees() {
  paginate.currentPage = 1;
  renderActiveFilterPills();
  fetchEmployeeList();
}

function resetEmployeeFilters() {
  const ids = [
    "employeeSearch",
    "employeeFilterDivision",
    "employeeFilterDepartment",
    "employeeFilterConNumber",
    "employeeFilterStatus",
    "employeeFilterStartDate",
    "employeeFilterEndDate",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveFilterPills();
  fetchEmployeeList();
}

function updateCsrfToken(result, employeeForm) {
  if (
    !result ||
    !result.csrf ||
    !result.csrf.name ||
    !result.csrf.hash ||
    !employeeForm
  ) {
    return;
  }

  const tokenInput = employeeForm.querySelector(
    `input[name="${result.csrf.name}"]`,
  );
  if (tokenInput) {
    tokenInput.value = result.csrf.hash;
  }
}

function appendCsrfToBody(params, employeeForm) {
  if (!employeeForm) return params;

  const tokenInput = employeeForm.querySelector(
    'input[type="hidden"][name]:not(#employee_id)',
  );
  if (tokenInput && tokenInput.name && tokenInput.value) {
    params.append(tokenInput.name, tokenInput.value);
  }
  return params;
}

function downloadEmployeeData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getEmployeeFilters()).filter(
        ([_, value]) => value != null && value !== "",
      ),
    );

    const searchValue = document.getElementById("employeeSearch")?.value || "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}contractor/employees/export`;
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

    const employeeForm = document.getElementById("employeeForm");
    const tokenInput = employeeForm?.querySelector(
      'input[type="hidden"][name]:not(#employee_id)',
    );
    if (tokenInput && tokenInput.name && tokenInput.value) {
      const csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = tokenInput.name;
      csrfInput.value = tokenInput.value;
      form.appendChild(csrfInput);
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } catch (error) {
    console.error("Employee download failed:", error);
    showToast("error", "Failed to download Employee data.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchEmployeeList();
  renderActiveFilterPills();

  const searchInput = document.getElementById("employeeSearch");
  const tbody = table ? table.querySelector("tbody") : null;
  const modalElement = document.getElementById("addEmployeeModal");
  const employeeForm = document.getElementById("employeeForm");
  const modalTitle = document.getElementById("addEmployeeModalLabel");
  const submitBtn = document.getElementById("employeeFormSubmitBtn");
  const addBtn = document.querySelector('[data-bs-target="#addEmployeeModal"]');
  const filterDrawerElement = document.getElementById("employeeFiltersDrawer");
  const filterOpenBtn = document.getElementById("openEmployeeFiltersBtn");
  const filterForm = document.getElementById("employeeFiltersForm");
  const resetFiltersBtn = document.getElementById("resetEmployeeFiltersBtn");
  const activeFiltersWrap = document.getElementById("employeeActiveFilters");
  const closeFiltersBtn = document.getElementById("closeEmployeeFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelEmployeeFiltersBtn");

  let currentMode = "create";
  let editingId = "";

  function openFilterDrawer() {
    if (filterDrawerElement) {
      filterDrawerElement.classList.add("is-open");
      filterDrawerElement.setAttribute("aria-hidden", "false");
    }

    if (filterOpenBtn) {
      filterOpenBtn.classList.add("is-active");
      filterOpenBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeFilterDrawer() {
    if (filterDrawerElement) {
      filterDrawerElement.classList.remove("is-open");
      filterDrawerElement.setAttribute("aria-hidden", "true");
    }

    if (filterOpenBtn) {
      filterOpenBtn.classList.remove("is-active");
      filterOpenBtn.setAttribute("aria-expanded", "false");
    }
  }

  function cleanupModalArtifacts() {
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("padding-right");
    document.body.style.removeProperty("overflow");
  }

  function openEmployeeModal() {
    if (!modalElement) return;

    cleanupModalArtifacts();

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
      modalInstance.show();
      return;
    }

    if (typeof jQuery !== "undefined" && jQuery.fn && jQuery.fn.modal) {
      jQuery(modalElement).modal("show");
      return;
    }

    modalElement.classList.add("show");
    modalElement.style.display = "block";
    modalElement.removeAttribute("aria-hidden");
    modalElement.setAttribute("aria-modal", "true");
    document.body.classList.add("modal-open");

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop fade show";
    document.body.appendChild(backdrop);
  }

  function closeEmployeeModal() {
    if (!modalElement) return;

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
      modalInstance.hide();
      setTimeout(() => {
        cleanupModalArtifacts();
      }, 300);
      return;
    }

    if (typeof jQuery !== "undefined" && jQuery.fn && jQuery.fn.modal) {
      jQuery(modalElement).modal("hide");
      setTimeout(() => {
        cleanupModalArtifacts();
      }, 300);
      return;
    }

    modalElement.classList.remove("show");
    modalElement.style.display = "none";
    modalElement.setAttribute("aria-hidden", "true");
    modalElement.removeAttribute("aria-modal");
    cleanupModalArtifacts();
  }

  function setFormLoading(isLoading, label) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? `<span class="spinner-border spinner-border-sm me-1"></span>${label}`
      : label;
  }

  function getFieldInput(fieldName) {
    if (!employeeForm) return null;
    return employeeForm.querySelector(`[name="${fieldName}"]`);
  }

  function clearFieldErrors() {
    if (!employeeForm) return;

    employeeForm.querySelectorAll(".is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });

    employeeForm.querySelectorAll("[data-error-for]").forEach((el) => {
      el.textContent = "";
      el.classList.add("d-none");
    });
  }

  function showFieldErrors(errors) {
    if (!employeeForm || !errors || typeof errors !== "object") return;

    Object.keys(errors).forEach((field) => {
      const message = stripHtml(errors[field] || "");
      if (!message) return;

      const fieldInput = getFieldInput(field);
      if (fieldInput) {
        fieldInput.classList.add("is-invalid");
      }

      const fieldError = employeeForm.querySelector(`[data-error-for="${field}"]`);
      if (fieldError) {
        fieldError.textContent = message;
        fieldError.classList.remove("d-none");
      }
    });
  }

  /**
   * The legacy codebase is inconsistent about what DIVISION actually
   * stores: employee.php's own add/edit form wrote short codes ('IBM' /
   * 'Z3P'), but contractor_model.php's fetch_summary_report() decoded
   * DIVISION against long numeric org-ids ('300000003618177' /
   * '300000003618190') instead. Some employee records — likely older or
   * imported ones — may use the long-id form, which won't match either
   * <option> in the dropdown (only 'IBM'/'Z3P' are listed) and would show
   * as blank on edit even though a division genuinely is set. This maps
   * the known alternate encoding onto the dropdown's actual values before
   * assigning, so editing those records still shows the right selection.
   * If a record still opens with Division blank after this, check the raw
   * DIVISION value in XX_CON_EMPLOYEE_INFO for that row — it likely isn't
   * one of the four values covered here yet.
   */
const DIVISION_VALUE_ALIASES = {
  "IBM": "IBM",
  "IPP BU": "IBM",
  "IPP": "IBM",

  "Z3P": "Z3P",
  "FPP BU": "Z3P",
  "FPP": "Z3P",
};

  function normalizeDivisionValue(rawValue, selectEl) {
  const value = String(rawValue ?? "").trim();

  if (!value || !selectEl) {
    return "";
  }

  // First try exact option value
  const directMatch = Array.from(selectEl.options).find(
    option => String(option.value).trim() === value
  );

  if (directMatch) {
    return directMatch.value;
  }

  // Then support API/DB returning labels such as IPP BU / FPP BU
  const aliasKey = Object.keys(DIVISION_VALUE_ALIASES).find(
    key => key.toUpperCase() === value.toUpperCase()
  );

  if (aliasKey) {
    return DIVISION_VALUE_ALIASES[aliasKey];
  }

  console.warn("Unknown division value:", rawValue);
  return "";
}

  function fillForm(data) {
    employeeForm.querySelector("#employee_id").value = data.id || "";
    const divisionField = employeeForm.querySelector("#division");
    divisionField.value = normalizeDivisionValue(data.division, divisionField);
    employeeForm.querySelector("#con_number").value = data.con_number || "";
    employeeForm.querySelector("#con_name").value = data.con_name || "";
    employeeForm.querySelector("#status").value = data.status || "";
    employeeForm.querySelector("#rate").value = data.rate || "";
    employeeForm.querySelector("#employee_number").value =
      data.employee_number || "";
    employeeForm.querySelector("#employee_name").value =
      data.employee_name || "";
    employeeForm.querySelector("#iqamah").value = data.iqamah || "";
    employeeForm.querySelector("#department").value = data.department || "";
    employeeForm.querySelector("#prod_dep").value = data.prod_dep || "";
    employeeForm.querySelector("#job").value = data.job || "";
    employeeForm.querySelector("#job_title").value = data.job_title || "";
    employeeForm.querySelector("#direct_boss").value = data.direct_boss || "";
    employeeForm.querySelector("#direct_boss_id").value =
      data.direct_boss_id || "";
    employeeForm.querySelector("#place").value = data.place || "";
    employeeForm.querySelector("#replacement").value = data.replacement || "";
    employeeForm.querySelector("#start_date").value = toDateInputValue(
      data.start_date || "",
    );
    employeeForm.querySelector("#end_date").value = toDateInputValue(
      data.end_date || "",
    );
    employeeForm.querySelector("#ajeer").checked = data.ajeer === "on";
    employeeForm.querySelector("#sfda").checked = data.sfda === "on";
    employeeForm.querySelector("#blacklist").checked = data.blacklist === "on";
    employeeForm.querySelector("#remark").value = data.remark || "";
    toggleProdDep();
  }

  function resetModalToCreate() {
    currentMode = "create";
    editingId = "";
    employeeForm.reset();
    employeeForm.querySelector("#employee_id").value = "";
    modalTitle.textContent = "Add Employee";
    setFormLoading(false, "Save Employee");
    clearFieldErrors();
    toggleProdDep();
  }

  const PROD_DEP_DISABLED_DEPARTMENTS = ["QC", "MAINTENANCE", "W/H", "ADMIN"];

  function toggleProdDep() {
    const departmentField = employeeForm?.querySelector("#department");
    const prodDepField = employeeForm?.querySelector("#prod_dep");
    if (!departmentField || !prodDepField) return;

    const shouldDisable = PROD_DEP_DISABLED_DEPARTMENTS.includes(
      String(departmentField.value || "").toUpperCase(),
    );

    prodDepField.disabled = shouldDisable;
    if (shouldDisable) {
      prodDepField.value = "";
    }
  }

  function syncJobTitle() {
    const jobField = employeeForm?.querySelector("#job");
    const jobTitleField = employeeForm?.querySelector("#job_title");
    if (!jobField || !jobTitleField) return;

    const selectedOption = jobField.options[jobField.selectedIndex];
    jobTitleField.value = selectedOption ? selectedOption.text : "";
  }

  function syncDirectBoss() {
    const bossIdField = employeeForm?.querySelector("#direct_boss_id");
    const bossField = employeeForm?.querySelector("#direct_boss");
    const bossList = document.getElementById("directBossOptions");
    if (!bossIdField || !bossField || !bossList) return;

    const match = Array.from(bossList.options).find(
      (option) => option.value === bossIdField.value,
    );
    bossField.value = match ? match.textContent : "";
  }

  async function fetchContractorForEmployeeForm(conNumber) {
    const conNameField = employeeForm?.querySelector("#con_name");
    const statusField = employeeForm?.querySelector("#status");
    const rateField = employeeForm?.querySelector("#rate");
    if (!conNameField || !statusField || !rateField) return;

    if (!conNumber) {
      conNameField.value = "";
      statusField.value = "";
      rateField.value = "";
      return;
    }

    try {
      const response = await fetch(
        `${baseURL}contractor/lookup?con_number=${encodeURIComponent(conNumber)}`,
        { headers: { "X-Requested-With": "XMLHttpRequest" } },
      );
      const result = await response.json();

      if (!result.status || !result.data || !result.data.contractor) {
        return;
      }

      const contractor = result.data.contractor;
      conNameField.value = contractor.con_name || "";
      statusField.value = contractor.status || "";
      rateField.value = contractor.rate || "";
    } catch (error) {
      console.error("Contractor lookup failed:", error);
    }
  }

  if (employeeForm) {
    const departmentField = employeeForm.querySelector("#department");
    const jobField = employeeForm.querySelector("#job");
    const bossIdField = employeeForm.querySelector("#direct_boss_id");
    const conNumberField = employeeForm.querySelector("#con_number");

    if (departmentField) {
      departmentField.addEventListener("change", toggleProdDep);
    }
    if (jobField) {
      jobField.addEventListener("change", syncJobTitle);
    }
    if (bossIdField) {
      bossIdField.addEventListener("input", syncDirectBoss);
      bossIdField.addEventListener("change", syncDirectBoss);
    }
    if (conNumberField) {
      conNumberField.addEventListener("change", (event) => {
        fetchContractorForEmployeeForm(event.target.value);
      });
    }
  }

  if (searchInput) {
    const debouncedSearch =
      typeof debounce === "function"
        ? debounce(() => filterEmployees(), 350)
        : () => filterEmployees();

    searchInput.addEventListener("input", debouncedSearch);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        filterEmployees();
      }
    });
  }

  if (filterOpenBtn) {
    filterOpenBtn.addEventListener("click", (event) => {
      event.stopPropagation();

      if (filterDrawerElement?.classList.contains("is-open")) {
        closeFilterDrawer();
        return;
      }

      openFilterDrawer();
    });
  }

  if (filterDrawerElement) {
    filterDrawerElement.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (closeFiltersBtn) {
    closeFiltersBtn.addEventListener("click", () => {
      closeFilterDrawer();
    });
  }

  if (cancelFiltersBtn) {
    cancelFiltersBtn.addEventListener("click", () => {
      closeFilterDrawer();
    });
  }

  if (filterForm) {
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      filterEmployees();
      closeFilterDrawer();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetEmployeeFilters();
    });
  }

  document.addEventListener("click", (event) => {
    if (!filterDrawerElement?.classList.contains("is-open")) {
      return;
    }

    if (
      filterDrawerElement.contains(event.target) ||
      filterOpenBtn?.contains(event.target)
    ) {
      return;
    }

    closeFilterDrawer();
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      filterDrawerElement?.classList.contains("is-open")
    ) {
      closeFilterDrawer();
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
      if (!filterKey) {
        return;
      }

      const inputIdMap = {
        division: "employeeFilterDivision",
        department: "employeeFilterDepartment",
        con_number: "employeeFilterConNumber",
        status: "employeeFilterStatus",
        start_date: "employeeFilterStartDate",
        end_date: "employeeFilterEndDate",
      };

      const targetInput = document.getElementById(inputIdMap[filterKey] || "");
      if (targetInput) {
        targetInput.value = "";
      }

      filterEmployees();
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      resetModalToCreate();
    });
  }

  if (employeeForm) {
    employeeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearFieldErrors();

      const payload = new FormData(employeeForm);
      const endpoint =
        currentMode === "edit"
          ? `${baseURL}contractor/employees/update/${encodeURIComponent(editingId)}`
          : `${baseURL}contractor/employees/store`;
      const submitLabel =
        currentMode === "edit" ? "Update Employee" : "Save Employee";

      setFormLoading(
        true,
        currentMode === "edit" ? "Updating..." : "Saving...",
      );

      fetch(endpoint, {
        method: "POST",
        body: payload,
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      })
        .then((response) => response.json())
        .then((result) => {
          updateCsrfToken(result, employeeForm);

          if (!result.status) {
            if (result.data && result.data.errors) {
              showFieldErrors(result.data.errors);
            } else {
              showToast("error", result.message || "Something went wrong.");
            }
            return;
          }

          closeEmployeeModal();
          showToast("success", result.message || "Saved successfully.");
          resetModalToCreate();
          fetchEmployeeList();
        })
        .catch(() => {
          showToast("error", "Unable to process request. Please try again.");
        })
        .finally(() => {
          setFormLoading(false, submitLabel);
        });
    });
  }

  if (tbody) {
    tbody.addEventListener("click", (event) => {
      const editBtn = event.target.closest(".js-edit-employee");
      const deleteBtn = event.target.closest(".js-delete-employee");

      if (editBtn) {
        event.preventDefault();
        clearFieldErrors();

        const id = editBtn.getAttribute("data-id");
        if (!id) return;

        currentMode = "edit";
        editingId = id;
        modalTitle.textContent = "Edit Employee";
        setFormLoading(false, "Update Employee");

        fillForm({
          id: editBtn.getAttribute("data-id") || "",
          division: editBtn.getAttribute("data-division") || "",
          con_number: editBtn.getAttribute("data-con_number") || "",
          con_name: editBtn.getAttribute("data-con_name") || "",
          status: editBtn.getAttribute("data-status") || "",
          rate: editBtn.getAttribute("data-rate") || "",
          employee_number: editBtn.getAttribute("data-employee_number") || "",
          employee_name: editBtn.getAttribute("data-employee_name") || "",
          iqamah: editBtn.getAttribute("data-iqamah") || "",
          department: editBtn.getAttribute("data-department") || "",
          prod_dep: editBtn.getAttribute("data-prod_dep") || "",
          job: editBtn.getAttribute("data-job") || "",
          job_title: editBtn.getAttribute("data-job_title") || "",
          direct_boss: editBtn.getAttribute("data-direct_boss") || "",
          direct_boss_id: editBtn.getAttribute("data-direct_boss_id") || "",
          place: editBtn.getAttribute("data-place") || "",
          replacement: editBtn.getAttribute("data-replacement") || "",
          start_date: editBtn.getAttribute("data-start_date") || "",
          end_date: editBtn.getAttribute("data-end_date") || "",
          ajeer: editBtn.getAttribute("data-ajeer") || "",
          sfda: editBtn.getAttribute("data-sfda") || "",
          blacklist: editBtn.getAttribute("data-blacklist") || "",
          remark: editBtn.getAttribute("data-remark") || "",
        });

        openEmployeeModal();
        return;
      }

      if (!deleteBtn) {
        return;
      }

      event.preventDefault();
      const deleteId = deleteBtn.getAttribute("data-id");
      const employeeName = deleteBtn.getAttribute("data-employee") || "this employee";

      const handleDelete = () => {
        const body = appendCsrfToBody(new URLSearchParams(), employeeForm);

        fetch(`${baseURL}contractor/employees/delete/${encodeURIComponent(deleteId)}`, {
          method: "POST",
          body,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        })
          .then((response) => response.json())
          .then((result) => {
            updateCsrfToken(result, employeeForm);
            if (!result.status) {
              showToast("error", result.message || "Delete failed.");
              return;
            }

            showToast("success", result.message || "Deleted successfully.");
            fetchEmployeeList();
          })
          .catch(() => {
            showToast("error", "Unable to delete employee.");
          });
      };

      Swal.fire({
        icon: "warning",
        title: "Delete Employee?",
        text: `Are you sure you want to delete "${employeeName}"?`,
        showCancelButton: true,
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          handleDelete();
        }
      });
    });
  }

  if (modalElement) {
    modalElement.addEventListener("hidden.bs.modal", () => {
      cleanupModalArtifacts();
      resetModalToCreate();
    });
  }
});