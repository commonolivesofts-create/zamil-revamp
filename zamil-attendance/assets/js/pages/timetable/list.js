const tableId = "timetable-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let timetableMaster = [];
let timetableFetchController = null;
const timetableFilterMeta = {
  emp_name: { label: "Employee", inputId: "timetableSearch" },
  emp_no: { label: "Emp No", inputId: "timetableFilterEmpNo" },
  shift_id: { label: "Shift", inputId: "timetableFilterShiftId" },
  start_date: { label: "Start", inputId: "timetableFilterStartDate" },
  end_date: { label: "End", inputId: "timetableFilterEndDate" },
  status: { label: "Status", inputId: "timetableFilterStatus" },
};

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function renderNoResponseCode(option) {
  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No timetable data available.</td></tr>`;
}

function getTimetableFilters() {
  return {
    emp_name: document.getElementById("timetableSearch")?.value?.trim() || "",
    emp_no:
      document.getElementById("timetableFilterEmpNo")?.value?.trim() || "",
    shift_id:
      document.getElementById("timetableFilterShiftId")?.value?.trim() || "",
    start_date:
      document.getElementById("timetableFilterStartDate")?.value?.trim() || "",
    end_date:
      document.getElementById("timetableFilterEndDate")?.value?.trim() || "",
    status:
      document.getElementById("timetableFilterStatus")?.value?.trim() || "",
  };
}

function timetableListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="timetable-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Loading timetable...</span>
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

  if (key === "shift_id") {
    const select = document.getElementById("timetableFilterShiftId");
    const option = Array.from(select?.options || []).find(
      (item) => String(item.value) === raw,
    );
    return option ? option.textContent.trim() : raw;
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

function renderActiveTimetableFilterPills() {
  const filtersWrap = document.getElementById("timetableActiveFilters");
  if (!filtersWrap) return;

  const filters = getTimetableFilters();
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
      const meta = timetableFilterMeta[key];
      if (!meta) return "";

      return `
        <span class="timetable-filter-pill">
          <span class="timetable-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="timetable-filter-pill-value">${escapeHtml(formatFilterValue(key, value))}</span>
          <button
            type="button"
            class="timetable-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
    })
    .join("");

  filtersWrap.innerHTML = `
    <span class="timetable-filter-summary">Active Filters</span>
    ${pills}
    <span class="timetable-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllTimetableFiltersBtn">Clear All</button>
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

function renderTimetableList(rows) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;

  if (rows && rows.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    rows.forEach((item, idx) => {
      const empName = escapeHtml(item.emp_name || "-");
      const statusRaw = String(item.status || item.status_display || "").trim();
      const statusText = escapeHtml(item.status_display || item.status || "-");
      const statusClass =
        statusRaw.toUpperCase() === "ACTIVE"
          ? "status-active"
          : statusRaw.toUpperCase() === "INACTIVE"
            ? "status-inactive"
            : "";

      content += `
        <tr data-uuid="${escapeHtml(item.uuid || "")}">
          <td class="timetable-col-index">${pageStart + idx + 1}</td>
          <td class="timetable-primary-cell">${escapeHtml(item.emp_no || "-")}</td>
          <td class="timetable-primary-cell">
            <span class="timetable-name-text">${empName}</span>
          </td>
          <td><span class="timetable-chip">${escapeHtml(item.shift_name_display || "-")}</span></td>
          <td><span class="timetable-chip">${escapeHtml(item.start_date_display || "-")}</span></td>
          <td><span class="timetable-chip">${escapeHtml(item.end_date_display || "-")}</span></td>
          <td><span class="timetable-chip">${escapeHtml(item.overtime_alowed || "-")}</span></td>
          <td><span class="timetable-chip">${escapeHtml(item.exclude_timesheet || "-")}</span></td>
          <td>
            <span class="timetable-status-badge ${statusClass}">
              ${statusText}
            </span>
          </td>
          <td><span class="timetable-stamp-chip">${escapeHtml(item.created_at || "-")}</span></td>
          <td class="text-center timetable-action-cell">
            <div class="timetable-action-stack">
              <button
                type="button"
                class="timetable-action-btn js-edit-timetable"
                data-uuid="${escapeHtml(item.uuid || "")}"
                data-emp_no="${escapeHtml(item.emp_no || "")}"
                data-emp_name="${escapeHtml(item.emp_name || "")}"
                data-shift_id="${escapeHtml(item.shift_id || "")}"
                data-shift_name="${escapeHtml(item.shift_name || "")}"
                data-start_date="${escapeHtml(item.start_date || "")}"
                data-end_date="${escapeHtml(item.end_date || "")}"
                data-status="${escapeHtml(item.status || "")}"
                title="Edit"
                aria-label="Edit Timetable"
              >
                <i class="ti ti-edit"></i>
              </button>

              <button
                type="button"
                class="timetable-action-btn js-delete-timetable"
                data-id="${escapeHtml(item.id || "")}"
                data-uuid="${escapeHtml(item.uuid || "")}"
                data-emp_name="${escapeHtml(item.emp_name || "")}"
                title="Delete"
                aria-label="Delete Timetable"
              >
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </td>
        </tr>`;
    });

    tbody.innerHTML = content;
  } else {
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  }
}

async function fetchTimetableList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) return;

  try {
    if (timetableFetchController) {
      timetableFetchController.abort();
    }

    requestController = new AbortController();
    timetableFetchController = requestController;

    const skeletonLoaderContent = timetableListSkeleton(numberOfHeaders);
    repeatAndAppendSkeletonContent(tableId, skeletonLoaderContent, 1);

    const url = `${baseURL}timetable/list`;
    const filters = getTimetableFilters();
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
        filters,
        search: searchValue,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch timetable data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    timetableMaster = data?.timetables || [];
    renderTimetableList(timetableMaster);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    showToast("error", "Request failed: " + error.message);
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  } finally {
    if (timetableFetchController === requestController) {
      timetableFetchController = null;
    }
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchTimetableList();
}

function filterTimetable() {
  paginate.currentPage = 1;
  renderActiveTimetableFilterPills();
  fetchTimetableList();
}

function resetTimetableFilters() {
  const ids = [
    "timetableSearch",
    "timetableFilterEmpNo",
    "timetableFilterShiftId",
    "timetableFilterStartDate",
    "timetableFilterEndDate",
    "timetableFilterStatus",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveTimetableFilterPills();
  fetchTimetableList();
}

function updateCsrfToken(result, timetableForm) {
  if (
    !result ||
    !result.csrf ||
    !result.csrf.name ||
    !result.csrf.hash ||
    !timetableForm
  ) {
    return;
  }

  const tokenInput = timetableForm.querySelector(
    `input[name="${result.csrf.name}"]`,
  );
  if (tokenInput) {
    tokenInput.value = result.csrf.hash;
  }
}

function appendCsrfToBody(params, timetableForm) {
  if (!timetableForm) return params;

  const tokenInput = timetableForm.querySelector(
    'input[type="hidden"][name]:not(#timetable_uuid)',
  );
  if (tokenInput && tokenInput.name && tokenInput.value) {
    params.append(tokenInput.name, tokenInput.value);
  }
  return params;
}

function downloadTimetableData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getTimetableFilters()).filter(
        ([_, value]) => value != null && value !== "",
      ),
    );

    const searchValue = "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}timetable/export_timetable`;
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

    const timetableForm = document.getElementById("timetableForm");
    const tokenInput = timetableForm?.querySelector(
      'input[type="hidden"][name]:not(#timetable_uuid)',
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
    console.error("Timetable download failed:", error);
    showToast("error", "Failed to download Timetable data.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchTimetableList();
  renderActiveTimetableFilterPills();

  const searchInput = document.getElementById("timetableSearch");
  const tbody = table ? table.querySelector("tbody") : null;
  const modalElement = document.getElementById("addTimetableModal");
  const timetableForm = document.getElementById("timetableForm");
  const modalTitle = document.getElementById("addTimetableModalLabel");
  const submitBtn = document.getElementById("timetableFormSubmitBtn");
  const addBtn = document.querySelector(
    '[data-bs-target="#addTimetableModal"]',
  );
  const empNoInput = document.getElementById("emp_no");
  const empNameInput = document.getElementById("emp_name");
  const empLookupStatus = document.getElementById("emp_lookup_status");
  const filterPanel = document.getElementById("timetableFiltersPanel");
  const filterOpenBtn = document.getElementById("openTimetableFiltersBtn");
  const filterForm = document.getElementById("timetableFiltersForm");
  const resetFiltersBtn = document.getElementById("resetTimetableFiltersBtn");
  const activeFiltersWrap = document.getElementById("timetableActiveFilters");
  const closeFiltersBtn = document.getElementById("closeTimetableFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelTimetableFiltersBtn");

  let currentMode = "create";
  let editingUuid = "";
  let employeeLookupController = null;
  let empNameAutoFilled = false;

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

  function cleanupModalArtifacts() {
    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("padding-right");
    document.body.style.removeProperty("overflow");
  }

  function openTimetableModal() {
    if (!modalElement) return;

    cleanupModalArtifacts();

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
      modal.show();
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

  function closeTimetableModal() {
    if (!modalElement) return;

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const instance = bootstrap.Modal.getOrCreateInstance(modalElement);
      instance.hide();
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
    if (!timetableForm) return null;
    return timetableForm.querySelector(`[name="${fieldName}"]`);
  }

  function clearFieldErrors() {
    if (!timetableForm) return;

    timetableForm.querySelectorAll(".is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });

    timetableForm.querySelectorAll("[data-error-for]").forEach((el) => {
      el.textContent = "";
      el.classList.add("d-none");
    });
  }

  function showFieldErrors(errors) {
    if (!timetableForm || !errors || typeof errors !== "object") return;

    Object.keys(errors).forEach((field) => {
      const message = stripHtml(errors[field] || "");
      if (!message) return;

      const fieldInput = getFieldInput(field);
      if (fieldInput) {
        fieldInput.classList.add("is-invalid");
      }

      const fieldError = timetableForm.querySelector(
        `[data-error-for="${field}"]`,
      );
      if (fieldError) {
        fieldError.textContent = message;
        fieldError.classList.remove("d-none");
      }
    });
  }

  function fillForm(data) {
    timetableForm.querySelector("#timetable_uuid").value = data.uuid || "";
    timetableForm.querySelector("#emp_no").value = data.emp_no || "";
    timetableForm.querySelector("#emp_name").value = data.emp_name || "";
    timetableForm.querySelector("#shift_id").value = data.shift_id || "";
    timetableForm.querySelector("#start_date").value = toDateInputValue(
      data.start_date || "",
    );
    timetableForm.querySelector("#end_date").value = toDateInputValue(
      data.end_date || "",
    );
    timetableForm.querySelector("#status").value = data.status || "";
    empNameAutoFilled = false;
    setEmpLookupStatus("idle");
  }

  function resetModalToCreate() {
    currentMode = "create";
    editingUuid = "";
    timetableForm.reset();
    timetableForm.querySelector("#timetable_uuid").value = "";
    modalTitle.textContent = "Add Timetable";
    setFormLoading(false, "Save Timetable");
    clearFieldErrors();
    empNameAutoFilled = false;
    if (employeeLookupController) {
      employeeLookupController.abort();
      employeeLookupController = null;
    }
    setEmpLookupStatus("idle");
  }

  function clearAutoFilledEmpName() {
    if (!empNameInput || !empNameAutoFilled) return;
    empNameInput.value = "";
    empNameAutoFilled = false;
  }

  function setEmpLookupStatus(type = "idle", message = "") {
    if (!empLookupStatus) return;

    empLookupStatus.classList.remove("is-loading", "is-success", "is-error");

    if (type === "idle" || !message) {
      empLookupStatus.textContent = "";
      empLookupStatus.classList.add("d-none");
      return;
    }

    empLookupStatus.textContent = message;
    empLookupStatus.classList.remove("d-none");

    if (type === "loading") {
      empLookupStatus.classList.add("is-loading");
    } else if (type === "success") {
      empLookupStatus.classList.add("is-success");
    } else if (type === "error") {
      empLookupStatus.classList.add("is-error");
    }
  }

  function canLookupEmployee(empNoValue) {
    const value = String(empNoValue || "").trim();
    return /^\d+$/.test(value) && value.length >= 3;
  }

  function lookupEmployeeByNumber(empNoValue) {
    if (!timetableForm || !empNameInput) return;

    if (employeeLookupController) {
      employeeLookupController.abort();
    }
    setEmpLookupStatus("loading", "Looking up employee...");

    const body = appendCsrfToBody(new URLSearchParams(), timetableForm);
    body.append("emp_no", empNoValue);

    employeeLookupController = new AbortController();

    fetch(`${baseURL}timetable/get_employee_by_number`, {
      method: "POST",
      body,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: employeeLookupController.signal,
    })
      .then((response) => response.json())
      .then((result) => {
        updateCsrfToken(result, timetableForm);
        if (
          !result ||
          !result.status ||
          !result.data ||
          !result.data.employee
        ) {
          clearAutoFilledEmpName();
          setEmpLookupStatus("error", "Employee not found.");
          return;
        }

        const fullName = String(result.data.employee.full_name || "").trim();
        if (fullName !== "") {
          empNameInput.value = fullName;
          empNameAutoFilled = true;
          setEmpLookupStatus("success", "Employee found.");
        } else {
          clearAutoFilledEmpName();
          setEmpLookupStatus("error", "Employee not found.");
        }
      })
      .catch((error) => {
        if (error && error.name === "AbortError") {
          return;
        }
        setEmpLookupStatus("error", "Unable to verify employee right now.");
      })
      .finally(() => {
        employeeLookupController = null;
      });
  }

  function scheduleEmployeeLookup() {
    if (!empNoInput) return;

    const empNoValue = String(empNoInput.value || "").trim();
    if (!canLookupEmployee(empNoValue)) {
      if (employeeLookupController) {
        employeeLookupController.abort();
        employeeLookupController = null;
      }
      clearAutoFilledEmpName();
      setEmpLookupStatus("idle");
      return;
    }

    lookupEmployeeByNumber(empNoValue);
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (filterForm && filterForm.contains(searchInput)) {
          filterTimetable();
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
      filterTimetable();
      closeFilterPanel();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetTimetableFilters();
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
      const removeBtn = event.target.closest(".timetable-filter-pill-remove");
      const clearAllBtn = event.target.closest("#clearAllTimetableFiltersBtn");

      if (clearAllBtn) {
        resetTimetableFilters();
        return;
      }

      if (!removeBtn) {
        return;
      }

      const filterKey = removeBtn.getAttribute("data-filter-key");
      const inputId = timetableFilterMeta[filterKey]?.inputId;
      const targetInput = inputId ? document.getElementById(inputId) : null;

      if (targetInput) {
        targetInput.value = "";
      }

      filterTimetable();
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      resetModalToCreate();
    });
  }

  if (empNoInput) {
    empNoInput.addEventListener("input", () => {
      scheduleEmployeeLookup();
    });
  }

  if (timetableForm) {
    timetableForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearFieldErrors();

      const payload = new FormData(timetableForm);
      const endpoint = `${baseURL}timetable/store`;
      const submitLabel =
        currentMode === "edit" ? "Update Timetable" : "Save Timetable";

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
          updateCsrfToken(result, timetableForm);
          if (!result.status) {
            if (result.data && result.data.errors) {
              showFieldErrors(result.data.errors);
            } else {
              showToast("error", result.message || "Something went wrong.");
            }
            return;
          }

          closeTimetableModal();
          showToast("success", result.message || "Saved successfully.");
          resetModalToCreate();
          fetchTimetableList();
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
      const editBtn = event.target.closest(".js-edit-timetable");
      const deleteBtn = event.target.closest(".js-delete-timetable");

      if (editBtn) {
        event.preventDefault();
        clearFieldErrors();

        const uuid = editBtn.getAttribute("data-uuid");
        if (!uuid) return;

        currentMode = "edit";
        editingUuid = uuid;
        modalTitle.textContent = "Edit Timetable";
        setFormLoading(false, "Update Timetable");

        fillForm({
          uuid: editBtn.getAttribute("data-uuid") || "",
          emp_no: editBtn.getAttribute("data-emp_no") || "",
          emp_name: editBtn.getAttribute("data-emp_name") || "",
          shift_id: editBtn.getAttribute("data-shift_id") || "",
          start_date: editBtn.getAttribute("data-start_date") || "",
          end_date: editBtn.getAttribute("data-end_date") || "",
          status: editBtn.getAttribute("data-status") || "",
        });

        openTimetableModal();
        return;
      }

      if (!deleteBtn) return;

      event.preventDefault();
      const deleteId = deleteBtn.getAttribute("data-id");
      const deleteKey = deleteId || deleteBtn.getAttribute("data-uuid");
      if (!deleteKey) return;

      const empName =
        deleteBtn.getAttribute("data-emp_name") || "this timetable";

      const handleDelete = () => {
        const body = appendCsrfToBody(new URLSearchParams(), timetableForm);

        fetch(`${baseURL}timetable/delete/${encodeURIComponent(deleteKey)}`, {
          method: "POST",
          body,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        })
          .then((response) => response.json())
          .then((result) => {
            updateCsrfToken(result, timetableForm);
            if (!result.status) {
              showToast("error", result.message || "Delete failed.");
              return;
            }

            showToast("success", result.message || "Deleted successfully.");
            fetchTimetableList();
          })
          .catch(() => {
            showToast("error", "Unable to delete timetable.");
          });
      };

      Swal.fire({
        icon: "warning",
        title: "Delete Timetable?",
        text: `Are you sure you want to delete "${empName}"?`,
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
