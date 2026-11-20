const tableId = "shifts-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let shiftsMaster = [];
let shiftFetchController = null;
const shiftFilterMeta = {
  shift_name: { label: "Name" },
  status: { label: "Status" },
  start_date: { label: "Start" },
  end_date: { label: "End" },
  check_in: { label: "Check In" },
  check_out: { label: "Check Out" },
};

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function renderNoResponseCode(option) {
  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No shift data available.</td></tr>`;
}

function getShiftFilters() {
  return {
    shift_name: document.getElementById("shiftSearch")?.value?.trim() || "",
    start_date:
      document.getElementById("shiftFilterStartDate")?.value?.trim() || "",
    end_date:
      document.getElementById("shiftFilterEndDate")?.value?.trim() || "",
    status: document.getElementById("shiftFilterStatus")?.value?.trim() || "",
    check_in:
      document.getElementById("shiftFilterCheckIn")?.value?.trim() || "",
    check_out:
      document.getElementById("shiftFilterCheckOut")?.value?.trim() || "",
  };
}

function shiftListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="shift-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Loading shifts...</span>
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
  const filtersWrap = document.getElementById("shiftActiveFilters");
  if (!filtersWrap) return;

  const filters = getShiftFilters();
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
      const meta = shiftFilterMeta[key];
      if (!meta) return "";

      return `
        <span class="shift-filter-pill">
          <span class="shift-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="shift-filter-pill-value">${escapeHtml(
            formatFilterValue(key, value),
          )}</span>
          <button
            type="button"
            class="shift-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
    })
    .join("");

  filtersWrap.innerHTML = `
    <span class="shift-filter-summary">Active Filters</span>
    ${pills}
    <span class="shift-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllShiftFiltersBtn">Clear All</button>
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

function renderShiftsList(shifts) {
  const shiftTbody = document.querySelector(`#${tableId} tbody`);

  if (!shiftTbody) {
    return;
  }

  if (shifts && shifts.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    shifts.forEach((shift, idx) => {
      const shiftName = escapeHtml(shift.shift_name || "-");
      const startDate = escapeHtml(shift.start_date_display || "-");
      const endDate = escapeHtml(shift.end_date_display || "-");
      const checkIn = escapeHtml(shift.check_in_display || "-");
      const checkOut = escapeHtml(shift.check_out_display || "-");
      const createdAt = escapeHtml(shift.created_at || "-");
      const weekdayOvrtmCap = escapeHtml(
        shift.weekday_ovrtm_cap_display || "-",
      );
      const weekendOvrtmCap = escapeHtml(
        shift.weekend_ovrtm_cap_display || "-",
      );
      const statusRaw = String(
        shift.status || shift.status_display || "",
      ).trim();
      const statusText = escapeHtml(
        shift.status_display || shift.status || "-",
      );
      const statusClass =
        statusRaw.toUpperCase() === "ACTIVE"
          ? "status-active"
          : statusRaw.toUpperCase() === "INACTIVE"
            ? "status-inactive"
            : "";

      content += `
        <tr data-uuid="${escapeHtml(shift.uuid || "")}">
          <td class="shift-col-index">${pageStart + idx + 1}</td>
          <td class="shift-name-cell">
            <div class="shift-name-chip">
              <a
                class="shift-name-text"
                href="${baseURL}shift-details/create?shift_uuid=${encodeURIComponent(
                  shift.uuid || "",
                )}"
                title="Manage Shift Details">
                ${shiftName}
              </a>
            </div>
          </td>
          <td>
            <span class="shift-date-chip">
              ${startDate}
            </span>
          </td>
          <td>
            <span class="shift-date-chip">
              ${endDate}
            </span>
          </td>
          <td>
            <span class="shift-status-badge ${statusClass}">
              ${statusText}
            </span>
          </td>
          <td>
            <span class="shift-time-chip">
              ${checkIn}
            </span>
          </td>
          <td>
            <span class="shift-time-chip">
              ${checkOut}
            </span>
          </td>
          <td>
            <span class="shift-time-chip">
              ${weekdayOvrtmCap}
            </span>
          </td>
          <td>
            <span class="shift-time-chip">
              ${weekendOvrtmCap}
            </span>
          </td>
          <td>
            <span class="shift-stamp-chip">
              ${createdAt}
            </span>
          </td>
          <td class="text-center shift-action-cell">
            <div class="shift-action-stack">
              <button
                type="button"
                class="shift-action-btn js-edit-shift"
                data-uuid="${escapeHtml(shift.uuid || "")}"
                data-shift_name="${escapeHtml(shift.shift_name || "")}"
                data-start_date="${escapeHtml(shift.start_date || "")}"
                data-end_date="${escapeHtml(shift.end_date || "")}"
                data-status="${escapeHtml(shift.status || "")}"
                data-check_in="${escapeHtml(shift.check_in || "")}"
                data-check_out="${escapeHtml(shift.check_out || "")}"
                data-weekday_ovrtm_cap="${escapeHtml(shift.weekday_ovrtm_cap || "")}"
                data-weekend_ovrtm_cap="${escapeHtml(shift.weekend_ovrtm_cap || "")}"
                title="Edit"
                aria-label="Edit Shift">
                <i class="ti ti-edit"></i>
              </button>

              <button
                type="button"
                class="shift-action-btn delete js-delete-shift"
                data-uuid="${escapeHtml(shift.uuid || "")}"
                data-shift="${escapeHtml(shift.shift_name || "")}"
                title="Delete"
                aria-label="Delete Shift">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    shiftTbody.innerHTML = content;
  } else {
    shiftTbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  }
}

async function fetchShiftList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) {
    return;
  }

  try {
    if (shiftFetchController) {
      shiftFetchController.abort();
    }

    requestController = new AbortController();
    shiftFetchController = requestController;

    const skeletonLoaderContent = shiftListSkeleton(numberOfHeaders);
    repeatAndAppendSkeletonContent(tableId, skeletonLoaderContent, 1);

    const url = `${baseURL}shifts/list`;
    const filters = getShiftFilters();
    const searchValue = document.getElementById("shiftSearch")?.value || "";

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
      throw new Error("Failed to fetch shift data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    shiftsMaster = data?.shifts || [];
    renderShiftsList(shiftsMaster);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    showToast("error", "Request failed: " + error.message);
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  } finally {
    if (shiftFetchController === requestController) {
      shiftFetchController = null;
    }
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchShiftList();
}

function filterShifts() {
  paginate.currentPage = 1;
  renderActiveFilterPills();
  fetchShiftList();
}

function resetShiftFilters() {
  const ids = [
    "shiftSearch",
    "shiftFilterStartDate",
    "shiftFilterEndDate",
    "shiftFilterStatus",
    "shiftFilterCheckIn",
    "shiftFilterCheckOut",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveFilterPills();
  fetchShiftList();
}

function updateCsrfToken(result, shiftForm) {
  if (
    !result ||
    !result.csrf ||
    !result.csrf.name ||
    !result.csrf.hash ||
    !shiftForm
  ) {
    return;
  }

  const tokenInput = shiftForm.querySelector(
    `input[name="${result.csrf.name}"]`,
  );
  if (tokenInput) {
    tokenInput.value = result.csrf.hash;
  }
}

function appendCsrfToBody(params, shiftForm) {
  if (!shiftForm) return params;

  const tokenInput = shiftForm.querySelector(
    'input[type="hidden"][name]:not(#shift_uuid)',
  );
  if (tokenInput && tokenInput.name && tokenInput.value) {
    params.append(tokenInput.name, tokenInput.value);
  }
  return params;
}

function downloadShiftData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getShiftFilters()).filter(
        ([_, value]) => value != null && value !== "",
      ),
    );

    const searchValue = document.getElementById("shiftSearch")?.value || "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}shifts/export_shift`;
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

    const shiftForm = document.getElementById("shiftForm");
    const tokenInput = shiftForm?.querySelector(
      'input[type="hidden"][name]:not(#shift_uuid)',
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
    console.error("Shift download failed:", error);
    showToast("error", "Failed to download Shift data.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchShiftList();
  renderActiveFilterPills();

  const searchInput = document.getElementById("shiftSearch");
  const tbody = table ? table.querySelector("tbody") : null;
  const modalElement = document.getElementById("addShiftModal");
  const shiftForm = document.getElementById("shiftForm");
  const modalTitle = document.getElementById("addShiftModalLabel");
  const submitBtn = document.getElementById("shiftFormSubmitBtn");
  const addBtn = document.querySelector('[data-bs-target="#addShiftModal"]');
  const filterDrawerElement = document.getElementById("shiftFiltersDrawer");
  const filterOpenBtn = document.getElementById("openShiftFiltersBtn");
  const filterForm = document.getElementById("shiftFiltersForm");
  const resetFiltersBtn = document.getElementById("resetShiftFiltersBtn");
  const activeFiltersWrap = document.getElementById("shiftActiveFilters");
  const closeFiltersBtn = document.getElementById("closeShiftFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelShiftFiltersBtn");

  let currentMode = "create";
  let editingUuid = "";

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

  function openShiftModal() {
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

  function closeShiftModal() {
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
    if (!shiftForm) return null;
    return shiftForm.querySelector(`[name="${fieldName}"]`);
  }

  function clearFieldErrors() {
    if (!shiftForm) return;

    shiftForm.querySelectorAll(".is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });

    shiftForm.querySelectorAll("[data-error-for]").forEach((el) => {
      el.textContent = "";
      el.classList.add("d-none");
    });
  }

  function showFieldErrors(errors) {
    if (!shiftForm || !errors || typeof errors !== "object") return;

    Object.keys(errors).forEach((field) => {
      const message = stripHtml(errors[field] || "");
      if (!message) return;

      const fieldInput = getFieldInput(field);
      if (fieldInput) {
        fieldInput.classList.add("is-invalid");
      }

      const fieldError = shiftForm.querySelector(`[data-error-for="${field}"]`);
      if (fieldError) {
        fieldError.textContent = message;
        fieldError.classList.remove("d-none");
      }
    });
  }

  function fillForm(data) {
    shiftForm.querySelector("#shift_uuid").value = data.uuid || "";
    shiftForm.querySelector("#shift_name").value = data.shift_name || "";
    shiftForm.querySelector("#start_date").value = toDateInputValue(
      data.start_date || "",
    );
    shiftForm.querySelector("#end_date").value = toDateInputValue(
      data.end_date || "",
    );
    shiftForm.querySelector("#status").value = data.status || "";
    shiftForm.querySelector("#check_in").value = data.check_in || "";
    shiftForm.querySelector("#check_out").value = data.check_out || "";
    shiftForm.querySelector("#weekday_ovrtm_cap").value =
      data.weekday_ovrtm_cap || "";
    shiftForm.querySelector("#weekend_ovrtm_cap").value =
      data.weekend_ovrtm_cap || "";
  }

  function resetModalToCreate() {
    currentMode = "create";
    editingUuid = "";
    shiftForm.reset();
    shiftForm.querySelector("#shift_uuid").value = "";
    modalTitle.textContent = "Add Shift";
    setFormLoading(false, "Save Shift");
    clearFieldErrors();
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (filterForm && filterForm.contains(searchInput)) {
          filterShifts();
          closeFilterDrawer();
        }
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
      filterShifts();
      closeFilterDrawer();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetShiftFilters();
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
      const removeBtn = event.target.closest(".shift-filter-pill-remove");
      const clearAllBtn = event.target.closest("#clearAllShiftFiltersBtn");

      if (clearAllBtn) {
        resetShiftFilters();
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
        shift_name: "shiftSearch",
        start_date: "shiftFilterStartDate",
        end_date: "shiftFilterEndDate",
        status: "shiftFilterStatus",
        check_in: "shiftFilterCheckIn",
        check_out: "shiftFilterCheckOut",
      };

      const targetInput = document.getElementById(inputIdMap[filterKey] || "");
      if (targetInput) {
        targetInput.value = "";
      }

      filterShifts();
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      resetModalToCreate();
    });
  }

  if (shiftForm) {
    shiftForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearFieldErrors();

      const payload = new FormData(shiftForm);
      const endpoint =
        currentMode === "edit"
          ? `${baseURL}shifts/update/${encodeURIComponent(editingUuid)}`
          : `${baseURL}shifts/store`;
      const submitLabel =
        currentMode === "edit" ? "Update Shift" : "Save Shift";

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
          updateCsrfToken(result, shiftForm);

          if (!result.status) {
            if (result.data && result.data.errors) {
              showFieldErrors(result.data.errors);
            } else {
              showToast("error", result.message || "Something went wrong.");
            }
            return;
          }

          closeShiftModal();
          showToast("success", result.message || "Saved successfully.");
          resetModalToCreate();
          fetchShiftList();
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
      const editBtn = event.target.closest(".js-edit-shift");
      const deleteBtn = event.target.closest(".js-delete-shift");

      if (editBtn) {
        event.preventDefault();
        clearFieldErrors();

        const uuid = editBtn.getAttribute("data-uuid");
        if (!uuid) return;

        currentMode = "edit";
        editingUuid = uuid;
        modalTitle.textContent = "Edit Shift";
        setFormLoading(false, "Update Shift");

        fillForm({
          uuid: editBtn.getAttribute("data-uuid") || "",
          shift_name: editBtn.getAttribute("data-shift_name") || "",
          start_date: editBtn.getAttribute("data-start_date") || "",
          end_date: editBtn.getAttribute("data-end_date") || "",
          status: editBtn.getAttribute("data-status") || "",
          check_in: editBtn.getAttribute("data-check_in") || "",
          check_out: editBtn.getAttribute("data-check_out") || "",
          weekday_ovrtm_cap:
            editBtn.getAttribute("data-weekday_ovrtm_cap") || "",
          weekend_ovrtm_cap:
            editBtn.getAttribute("data-weekend_ovrtm_cap") || "",
        });

        openShiftModal();
        return;
      }

      if (!deleteBtn) {
        return;
      }

      event.preventDefault();
      const deleteUuid = deleteBtn.getAttribute("data-uuid");
      const shiftName = deleteBtn.getAttribute("data-shift") || "this shift";

      const handleDelete = () => {
        const body = appendCsrfToBody(new URLSearchParams(), shiftForm);

        fetch(`${baseURL}shifts/delete/${encodeURIComponent(deleteUuid)}`, {
          method: "POST",
          body,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        })
          .then((response) => response.json())
          .then((result) => {
            updateCsrfToken(result, shiftForm);
            if (!result.status) {
              showToast("error", result.message || "Delete failed.");
              return;
            }

            showToast("success", result.message || "Deleted successfully.");
            fetchShiftList();
          })
          .catch(() => {
            showToast("error", "Unable to delete shift.");
          });
      };

      Swal.fire({
        icon: "warning",
        title: "Delete Shift?",
        text: `Are you sure you want to delete "${shiftName}"?`,
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
