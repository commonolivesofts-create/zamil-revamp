const tableId = "contractors-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let contractorsMaster = [];
let contractorFetchController = null;
const contractorFilterMeta = {
  con_number: { label: "Contractor #" },
  con_name: { label: "Name" },
  status: { label: "Status" },
};

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function renderNoResponseCode(option) {
  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No contractor data available.</td></tr>`;
}

function getContractorFilters() {
  return {
    con_number:
      document.getElementById("contractorFilterConNumber")?.value?.trim() || "",
    con_name:
      document.getElementById("contractorFilterConName")?.value?.trim() || "",
    status: document.getElementById("contractorFilterStatus")?.value?.trim() || "",
  };
}

function contractorListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="contractor-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Loading contractors...</span>
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

  return raw;
}

function renderActiveFilterPills() {
  const filtersWrap = document.getElementById("contractorActiveFilters");
  if (!filtersWrap) return;

  const filters = getContractorFilters();
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
      const meta = contractorFilterMeta[key];
      if (!meta) return "";

      return `
        <span class="contractor-filter-pill">
          <span class="contractor-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="contractor-filter-pill-value">${escapeHtml(
            formatFilterValue(key, value),
          )}</span>
          <button
            type="button"
            class="contractor-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
    })
    .join("");

  filtersWrap.innerHTML = `
    <span class="contractor-filter-summary">Active Filters</span>
    ${pills}
    <span class="contractor-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllContractorFiltersBtn">Clear All</button>
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

function renderContractorsList(contractors) {
  const contractorTbody = document.querySelector(`#${tableId} tbody`);

  if (!contractorTbody) {
    return;
  }

  if (contractors && contractors.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    contractors.forEach((contractor, idx) => {
      const conNumber = escapeHtml(contractor.con_number || "-");
      const conName = escapeHtml(contractor.con_name || "-");
      const startDate = escapeHtml(contractor.start_date_display || "-");
      const endDate = escapeHtml(contractor.end_date_display || "-");
      const rate = escapeHtml(
        contractor.rate !== null && contractor.rate !== undefined && contractor.rate !== ""
          ? contractor.rate
          : "-",
      );
      const createdDate = escapeHtml(contractor.created_date || "-");
      const statusRaw = String(
        contractor.status || contractor.status_display || "",
      ).trim();
      const statusText = escapeHtml(
        contractor.status_display || contractor.status || "-",
      );
      const statusClass =
        statusRaw.toUpperCase() === "ACTIVE"
          ? "status-active"
          : statusRaw.toUpperCase() === "INACTIVE"
            ? "status-inactive"
            : "";

      content += `
        <tr data-id="${escapeHtml(contractor.id || "")}">
          <td class="contractor-col-index">${pageStart + idx + 1}</td>
          <td class="contractor-name-cell">
            <div class="contractor-name-chip">
              <span class="contractor-name-text">${conNumber}</span>
            </div>
          </td>
          <td class="contractor-name-cell">
            <div class="contractor-name-chip">
              <span class="contractor-name-text">${conName}</span>
            </div>
          </td>
          <td>
            <span class="contractor-date-chip">
              ${startDate}
            </span>
          </td>
          <td>
            <span class="contractor-date-chip">
              ${endDate}
            </span>
          </td>
          <td>
            <span class="contractor-status-badge ${statusClass}">
              ${statusText}
            </span>
          </td>
          <td>
            <span class="contractor-time-chip">
              ${rate}
            </span>
          </td>
          <td>
            <span class="contractor-stamp-chip">
              ${createdDate}
            </span>
          </td>
          <td class="text-center contractor-action-cell">
            <div class="contractor-action-stack">
              <button
                type="button"
                class="contractor-action-btn js-edit-contractor"
                data-id="${escapeHtml(contractor.id || "")}"
                data-con_number="${escapeHtml(contractor.con_number || "")}"
                data-con_name="${escapeHtml(contractor.con_name || "")}"
                data-rate="${escapeHtml(contractor.rate || "")}"
                data-start_date="${escapeHtml(contractor.start_date || "")}"
                data-end_date="${escapeHtml(contractor.end_date || "")}"
                data-status="${escapeHtml(contractor.status || "")}"
                title="Edit"
                aria-label="Edit Contractor">
                <i class="ti ti-edit"></i>
              </button>

              <button
                type="button"
                class="contractor-action-btn delete js-delete-contractor"
                data-id="${escapeHtml(contractor.id || "")}"
                data-contractor="${escapeHtml(contractor.con_name || "")}"
                title="Delete"
                aria-label="Delete Contractor">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    contractorTbody.innerHTML = content;
  } else {
    contractorTbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  }
}

async function fetchContractorList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) {
    return;
  }

  try {
    if (contractorFetchController) {
      contractorFetchController.abort();
    }

    requestController = new AbortController();
    contractorFetchController = requestController;

    const skeletonLoaderContent = contractorListSkeleton(numberOfHeaders);
    repeatAndAppendSkeletonContent(tableId, skeletonLoaderContent, 1);

    const url = `${baseURL}contractor/list`;
    const filters = getContractorFilters();
    const searchValue = document.getElementById("contractorSearch")?.value || "";

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
      throw new Error("Failed to fetch contractor data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    contractorsMaster = data?.contractors || [];
    renderContractorsList(contractorsMaster);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    showToast("error", "Request failed: " + error.message);
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  } finally {
    if (contractorFetchController === requestController) {
      contractorFetchController = null;
    }
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchContractorList();
}

function filterContractors() {
  paginate.currentPage = 1;
  renderActiveFilterPills();
  fetchContractorList();
}

function resetContractorFilters() {
  const ids = [
    "contractorSearch",
    "contractorFilterConNumber",
    "contractorFilterConName",
    "contractorFilterStatus",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActiveFilterPills();
  fetchContractorList();
}

function updateCsrfToken(result, contractorForm) {
  if (
    !result ||
    !result.csrf ||
    !result.csrf.name ||
    !result.csrf.hash ||
    !contractorForm
  ) {
    return;
  }

  const tokenInput = contractorForm.querySelector(
    `input[name="${result.csrf.name}"]`,
  );
  if (tokenInput) {
    tokenInput.value = result.csrf.hash;
  }
}

function appendCsrfToBody(params, contractorForm) {
  if (!contractorForm) return params;

  const tokenInput = contractorForm.querySelector(
    'input[type="hidden"][name]:not(#contractor_id)',
  );
  if (tokenInput && tokenInput.name && tokenInput.value) {
    params.append(tokenInput.name, tokenInput.value);
  }
  return params;
}

function downloadContractorData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getContractorFilters()).filter(
        ([_, value]) => value != null && value !== "",
      ),
    );

    const searchValue = document.getElementById("contractorSearch")?.value || "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}contractor/export`;
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

    const contractorForm = document.getElementById("contractorForm");
    const tokenInput = contractorForm?.querySelector(
      'input[type="hidden"][name]:not(#contractor_id)',
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
    console.error("Contractor download failed:", error);
    showToast("error", "Failed to download Contractor data.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchContractorList();
  renderActiveFilterPills();

  const searchInput = document.getElementById("contractorSearch");
  const tbody = table ? table.querySelector("tbody") : null;
  const modalElement = document.getElementById("addContractorModal");
  const contractorForm = document.getElementById("contractorForm");
  const modalTitle = document.getElementById("addContractorModalLabel");
  const submitBtn = document.getElementById("contractorFormSubmitBtn");
  const addBtn = document.querySelector('[data-bs-target="#addContractorModal"]');
  const filterDrawerElement = document.getElementById("contractorFiltersDrawer");
  const filterOpenBtn = document.getElementById("openContractorFiltersBtn");
  const filterForm = document.getElementById("contractorFiltersForm");
  const resetFiltersBtn = document.getElementById("resetContractorFiltersBtn");
  const activeFiltersWrap = document.getElementById("contractorActiveFilters");
  const closeFiltersBtn = document.getElementById("closeContractorFiltersBtn");
  const cancelFiltersBtn = document.getElementById("cancelContractorFiltersBtn");

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

  function openContractorModal() {
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

  function closeContractorModal() {
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
    if (!contractorForm) return null;
    return contractorForm.querySelector(`[name="${fieldName}"]`);
  }

  function clearFieldErrors() {
    if (!contractorForm) return;

    contractorForm.querySelectorAll(".is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });

    contractorForm.querySelectorAll("[data-error-for]").forEach((el) => {
      el.textContent = "";
      el.classList.add("d-none");
    });
  }

  function showFieldErrors(errors) {
    if (!contractorForm || !errors || typeof errors !== "object") return;

    Object.keys(errors).forEach((field) => {
      const message = stripHtml(errors[field] || "");
      if (!message) return;

      const fieldInput = getFieldInput(field);
      if (fieldInput) {
        fieldInput.classList.add("is-invalid");
      }

      const fieldError = contractorForm.querySelector(`[data-error-for="${field}"]`);
      if (fieldError) {
        fieldError.textContent = message;
        fieldError.classList.remove("d-none");
      }
    });
  }

  function fillForm(data) {
    contractorForm.querySelector("#contractor_id").value = data.id || "";
    contractorForm.querySelector("#con_number").value = data.con_number || "";
    contractorForm.querySelector("#con_name").value = data.con_name || "";
    contractorForm.querySelector("#rate").value = data.rate || "";
    contractorForm.querySelector("#start_date").value = toDateInputValue(
      data.start_date || "",
    );
    contractorForm.querySelector("#end_date").value = toDateInputValue(
      data.end_date || "",
    );
    contractorForm.querySelector("#status").value = data.status || "";
  }

  function resetModalToCreate() {
    currentMode = "create";
    editingId = "";
    contractorForm.reset();
    contractorForm.querySelector("#contractor_id").value = "";
    modalTitle.textContent = "Add Contractor";
    setFormLoading(false, "Save Contractor");
    clearFieldErrors();
  }

  if (searchInput) {
    const debouncedSearch =
      typeof debounce === "function"
        ? debounce(() => filterContractors(), 350)
        : () => filterContractors();

    searchInput.addEventListener("input", debouncedSearch);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        filterContractors();
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
      filterContractors();
      closeFilterDrawer();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetContractorFilters();
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
      const removeBtn = event.target.closest(".contractor-filter-pill-remove");
      const clearAllBtn = event.target.closest("#clearAllContractorFiltersBtn");

      if (clearAllBtn) {
        resetContractorFilters();
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
        con_number: "contractorFilterConNumber",
        con_name: "contractorFilterConName",
        status: "contractorFilterStatus",
      };

      const targetInput = document.getElementById(inputIdMap[filterKey] || "");
      if (targetInput) {
        targetInput.value = "";
      }

      filterContractors();
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      resetModalToCreate();
    });
  }

  if (contractorForm) {
    contractorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearFieldErrors();

      const payload = new FormData(contractorForm);
      const endpoint =
        currentMode === "edit"
          ? `${baseURL}contractor/update/${encodeURIComponent(editingId)}`
          : `${baseURL}contractor/store`;
      const submitLabel =
        currentMode === "edit" ? "Update Contractor" : "Save Contractor";

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
          updateCsrfToken(result, contractorForm);

          if (!result.status) {
            if (result.data && result.data.errors) {
              showFieldErrors(result.data.errors);
            } else {
              showToast("error", result.message || "Something went wrong.");
            }
            return;
          }

          closeContractorModal();
          showToast("success", result.message || "Saved successfully.");
          resetModalToCreate();
          fetchContractorList();
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
      const editBtn = event.target.closest(".js-edit-contractor");
      const deleteBtn = event.target.closest(".js-delete-contractor");

      if (editBtn) {
        event.preventDefault();
        clearFieldErrors();

        const id = editBtn.getAttribute("data-id");
        if (!id) return;

        currentMode = "edit";
        editingId = id;
        modalTitle.textContent = "Edit Contractor";
        setFormLoading(false, "Update Contractor");

        fillForm({
          id: editBtn.getAttribute("data-id") || "",
          con_number: editBtn.getAttribute("data-con_number") || "",
          con_name: editBtn.getAttribute("data-con_name") || "",
          rate: editBtn.getAttribute("data-rate") || "",
          start_date: editBtn.getAttribute("data-start_date") || "",
          end_date: editBtn.getAttribute("data-end_date") || "",
          status: editBtn.getAttribute("data-status") || "",
        });

        openContractorModal();
        return;
      }

      if (!deleteBtn) {
        return;
      }

      event.preventDefault();
      const deleteId = deleteBtn.getAttribute("data-id");
      const contractorName = deleteBtn.getAttribute("data-contractor") || "this contractor";

      const handleDelete = () => {
        const body = appendCsrfToBody(new URLSearchParams(), contractorForm);

        fetch(`${baseURL}contractor/delete/${encodeURIComponent(deleteId)}`, {
          method: "POST",
          body,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        })
          .then((response) => response.json())
          .then((result) => {
            updateCsrfToken(result, contractorForm);
            if (!result.status) {
              showToast("error", result.message || "Delete failed.");
              return;
            }

            showToast("success", result.message || "Deleted successfully.");
            fetchContractorList();
          })
          .catch(() => {
            showToast("error", "Unable to delete contractor.");
          });
      };

      Swal.fire({
        icon: "warning",
        title: "Delete Contractor?",
        text: `Are you sure you want to delete "${contractorName}"?`,
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
