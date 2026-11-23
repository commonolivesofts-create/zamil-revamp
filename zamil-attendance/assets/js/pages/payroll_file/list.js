const tableId = "payroll-file-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
  document.querySelectorAll(`#${tableId} thead th`).length || 0;
let payrollFileMaster = [];
let payrollFileFetchController = null;
const payrollFileFilterMeta = {
  emp_no: { label: "Emp No", inputId: "payrollFileFilterEmpNo" },
  emp_name: { label: "Employee", inputId: "payrollFileSearch" },
  from_date: { label: "From Date", inputId: "payrollFileFilterFromDate" },
  to_date: { label: "To Date", inputId: "payrollFileFilterToDate" },
};

const paginate = new Pagination({
  currentPageId: "current-page",
  totalPagesId: "total-pages",
  pageOfPageId: "page-of-pages",
  recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function renderNoResponseCode(option) {
  return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No payroll file data available.</td></tr>`;
}

function getPayrollFileFilters() {
  return {
    emp_no:
      document.getElementById("payrollFileFilterEmpNo")?.value?.trim() || "",
    emp_name: document.getElementById("payrollFileSearch")?.value?.trim() || "",
    from_date:
      document.getElementById("payrollFileFilterFromDate")?.value?.trim() || "",
    to_date:
      document.getElementById("payrollFileFilterToDate")?.value?.trim() || "",
  };
}

function updatePayrollAdjustCsrf(result) {
  const form = document.getElementById("payrollFileAdjustForm");
  if (!form || !result || !result.csrf || !result.csrf.name || !result.csrf.hash) {
    return;
  }

  const tokenInput = form.querySelector(`input[name="${result.csrf.name}"]`);
  if (tokenInput) {
    tokenInput.value = result.csrf.hash;
  }
}

function openPayrollAdjustModal() {
  const modalEl = document.getElementById("payrollFileAdjustModal");
  if (!modalEl) return;

  const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
  modalInstance.show();
}

function closePayrollAdjustModal() {
  const modalEl = document.getElementById("payrollFileAdjustModal");
  if (!modalEl) return;

  const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
  modalInstance.hide();
}

function fillPayrollAdjustForm(data) {
  const filters = getPayrollFileFilters();

  document.getElementById("payrollAdjustEmpNo").value = data.emp_no || "";
  document.getElementById("payrollAdjustEmpName").value = data.emp_name || "";
  document.getElementById("payrollAdjustFromDate").value = filters.from_date || "";
  document.getElementById("payrollAdjustToDate").value = filters.to_date || "";
  document.getElementById("payrollAdjustLate").value = data.late || "0";
  document.getElementById("payrollAdjustEarly").value = data.early || "0";
  document.getElementById("payrollAdjustTotDelay").value = data.tot_delay || "0";
  document.getElementById("payrollAdjustOvertime").value = data.overtime_hrs || "0";
  document.getElementById("payrollAdjustAbsenceWo").value = data.absence_wo || "0";
}

document.addEventListener("DOMContentLoaded", function () {
  const startInput = document.getElementById("payrollFileFilterFromDate");
  const endInput = document.getElementById("payrollFileFilterToDate");

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

function payrollFileListSkeleton(numberOfHeaders = 1) {
  return `
        <tr class="payroll-file-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="color: #16833f;"></span>
                    <span>Loading payroll file...</span>
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

function renderActivePayrollFileFilterPills() {
  const filtersWrap = document.getElementById("payrollFileActiveFilters");
  if (!filtersWrap) return;

  const filters = getPayrollFileFilters();
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
      const meta = payrollFileFilterMeta[key];
      if (!meta) return "";

      return `
        <span class="payroll-file-filter-pill">
          <span class="payroll-file-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="payroll-file-filter-pill-value">${escapeHtml(value)}</span>
          <button
            type="button"
            class="payroll-file-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
    })
    .join("");

  filtersWrap.innerHTML = `
    <span class="payroll-file-filter-summary">Active Filters</span>
    ${pills}
    <span class="payroll-file-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllPayrollFileFiltersBtn">Clear All</button>
  `;
  filtersWrap.classList.add("is-visible");
}

function displayValue(value) {
  const raw = String(value || "").trim();
  return raw === "" ? "-" : raw;
}
// -----------------Auto calculated total delay -------------------

function calculatePayrollTotalDelay() {
  const lateInput = document.getElementById("payrollAdjustLate");
  const earlyInput = document.getElementById("payrollAdjustEarly");
  const totalDelayInput = document.getElementById("payrollAdjustTotDelay");

  if (!lateInput || !earlyInput || !totalDelayInput) return;

  const late = parseFloat(lateInput.value) || 0;
  const early = parseFloat(earlyInput.value) || 0;
  const total = late + early;

  totalDelayInput.value = total.toFixed(2);
}

document.addEventListener("DOMContentLoaded", function () {
  const lateInput = document.getElementById("payrollAdjustLate");
  const earlyInput = document.getElementById("payrollAdjustEarly");

  if (lateInput) {
    lateInput.addEventListener("input", calculatePayrollTotalDelay);
  }

  if (earlyInput) {
    earlyInput.addEventListener("input", calculatePayrollTotalDelay);
  }
});

// ------------------------------
function renderPayrollFileList(rows) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;

  if (rows && rows.length > 0) {
    let content = "";
    const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

    rows.forEach((item, idx) => {
      content += `
                <tr>
                    <td class="payroll-file-col-index">${pageStart + idx + 1}</td>
                    <td><span class="payroll-file-chip">${escapeHtml(displayValue(item.emp_no))}</span></td>
                    <td><span class="payroll-file-name-text">${escapeHtml(displayValue(item.emp_name))}</span></td>
                    <td><span class="payroll-file-chip">${escapeHtml(displayValue(item.late))}</span></td>
                    <td><span class="payroll-file-chip">${escapeHtml(displayValue(item.early))}</span></td>
                    <td><span class="payroll-file-chip">${escapeHtml(displayValue(item.tot_delay))}</span></td>
                    <td><span class="payroll-file-chip">${escapeHtml(Number(item.overtime_hrs).toFixed(2))}</span></td>
                    <td><span class="payroll-file-chip">${escapeHtml(displayValue(item.absence_wo))}</span></td>
                    <td class="text-center">
                        <button
                            type="button"
                            class="btn btn-link js-edit-payroll-adjust"
                            data-emp_no="${escapeHtml(displayValue(item.emp_no))}"
                            data-emp_name="${escapeHtml(displayValue(item.emp_name))}"
                            data-late="${escapeHtml(displayValue(item.late))}"
                            data-early="${escapeHtml(displayValue(item.early))}"
                            data-tot_delay="${escapeHtml(displayValue(item.tot_delay))}"
                            data-overtime_hrs="${escapeHtml(displayValue(item.overtime_hrs))}"
                            data-absence_wo="${escapeHtml(displayValue(item.absence_wo))}">
                            <i class="ti ti-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
    });

    tbody.innerHTML = content;
  } else {
    tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
  }
}

async function fetchPayrollFileList() {
  const tbody = document.querySelector(`#${tableId} tbody`);
  let requestController = null;

  if (!tbody) return;

  try {
    if (payrollFileFetchController) {
      payrollFileFetchController.abort();
    }

    requestController = new AbortController();
    payrollFileFetchController = requestController;

    repeatAndAppendSkeletonContent(
      tableId,
      payrollFileListSkeleton(numberOfHeaders),
      1,
    );

    const response = await fetch(`${baseURL}report/payroll-file/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: requestController.signal,
      body: JSON.stringify({
        limit: paginate.pageLimit,
        currentPage: paginate.currentPage,
        filters: getPayrollFileFilters(),
        search: "",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch payroll file data");
    }

    const data = await response.json();
    paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
    paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

    payrollFileMaster = data.payroll_files || [];
    renderPayrollFileList(payrollFileMaster);
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
    if (payrollFileFetchController === requestController) {
      payrollFileFetchController = null;
    }
  }
}

function handlePagination(action) {
  paginate.paginate(action);
  fetchPayrollFileList();
}

function filterPayrollFiles() {
  paginate.currentPage = 1;
  renderActivePayrollFileFilterPills();
  fetchPayrollFileList();
}

function resetPayrollFileFilters() {
  const ids = [
    "payrollFileFilterEmpNo",
    "payrollFileSearch",
    "payrollFileFilterFromDate",
    "payrollFileFilterToDate",
  ];

  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = "";
    }
  });

  paginate.currentPage = 1;
  renderActivePayrollFileFilterPills();
  fetchPayrollFileList();
}

function downloadPayrollFileData(fileType = "csv") {
  try {
    const filters = Object.fromEntries(
      Object.entries(getPayrollFileFilters()).filter(
        ([, value]) => value != null && value !== "",
      ),
    );

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${baseURL}report/payroll-file/export`;
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
    console.error("Payroll file download failed:", error);
    toasterNotification({
      type: "error",
      message: "Failed to download payroll file data.",
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchPayrollFileList();
  renderActivePayrollFileFilterPills();

  const tbody = table ? table.querySelector("tbody") : null;
  const payrollAdjustForm = document.getElementById("payrollFileAdjustForm");
  const payrollAdjustSubmitBtn = document.getElementById("payrollAdjustSubmitBtn");

  const payrollAdjustModalEl = document.getElementById("payrollFileAdjustModal");
  if (payrollAdjustModalEl) {
    payrollAdjustModalEl.addEventListener("hidden.bs.modal", () => {
      if (payrollAdjustForm) {
        payrollAdjustForm.reset();
      }
    });
  }

  const employeeSearch = document.getElementById("payrollFileSearch");
  const filterPanel = document.getElementById("payrollFileFiltersPanel");
  const filterOpenBtn = document.getElementById("openPayrollFileFiltersBtn");
  const filterForm = document.getElementById("payrollFileFiltersForm");
  const resetFiltersBtn = document.getElementById("resetPayrollFileFiltersBtn");
  const activeFiltersWrap = document.getElementById("payrollFileActiveFilters");
  const closeFiltersBtn = document.getElementById("closePayrollFileFiltersBtn");
  const cancelFiltersBtn = document.getElementById(
    "cancelPayrollFileFiltersBtn",
  );

  if (tbody) {
    tbody.addEventListener("click", (event) => {
      const editBtn = event.target.closest(".js-edit-payroll-adjust");
      if (!editBtn) return;

      const filters = getPayrollFileFilters();
      if (!filters.from_date || !filters.to_date) {
        toasterNotification({
          type: "error",
          message: "From Date and To Date are required before editing payroll file.",
        });
        return;
      }

      fillPayrollAdjustForm({
        emp_no: editBtn.getAttribute("data-emp_no") || "",
        emp_name: editBtn.getAttribute("data-emp_name") || "",
        late: editBtn.getAttribute("data-late") || "0",
        early: editBtn.getAttribute("data-early") || "0",
        tot_delay: editBtn.getAttribute("data-tot_delay") || "0",
        overtime_hrs: editBtn.getAttribute("data-overtime_hrs") || "0",
        absence_wo: editBtn.getAttribute("data-absence_wo") || "0",
      });

      openPayrollAdjustModal();
    });
  }

  if (payrollAdjustForm) {
    payrollAdjustForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (payrollAdjustSubmitBtn) {
        payrollAdjustSubmitBtn.disabled = true;
        payrollAdjustSubmitBtn.textContent = "Saving...";
      }

      try {
        const formData = new FormData(payrollAdjustForm);

        const response = await fetch(`${baseURL}report/payroll-file/save-adjustment`, {
          method: "POST",
          body: formData,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        const result = await response.json();
        updatePayrollAdjustCsrf(result);

        if (!response.ok || !result.status) {
          toasterNotification({
            type: "error",
            message: result.message || "Failed to save payroll adjustment.",
          });
          return;
        }

        toasterNotification({
          type: "success",
          message: result.message || "Payroll adjustment saved successfully.",
        });

        closePayrollAdjustModal();
        fetchPayrollFileList();
      } catch (error) {
        toasterNotification({
          type: "error",
          message: "Failed to save payroll adjustment.",
        });
      } finally {
        if (payrollAdjustSubmitBtn) {
          payrollAdjustSubmitBtn.disabled = false;
          payrollAdjustSubmitBtn.textContent = "Save";
        }
      }
    });
  }

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
          filterPayrollFiles();
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
      filterPayrollFiles();
      closeFilterPanel();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      resetPayrollFileFilters();
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
      const removeBtn = event.target.closest(
        ".payroll-file-filter-pill-remove",
      );
      const clearAllBtn = event.target.closest(
        "#clearAllPayrollFileFiltersBtn",
      );

      if (clearAllBtn) {
        resetPayrollFileFilters();
        return;
      }

      if (!removeBtn) {
        return;
      }

      const filterKey = removeBtn.getAttribute("data-filter-key");
      const inputId = payrollFileFilterMeta[filterKey]?.inputId;
      const targetInput = inputId ? document.getElementById(inputId) : null;

      if (targetInput) {
        targetInput.value = "";
      }

      filterPayrollFiles();
    });
  }
});
