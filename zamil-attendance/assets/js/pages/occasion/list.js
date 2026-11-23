const tableId = "occasionListTable";
const table = document.getElementById(tableId);
const numberOfHeaders =
    document.querySelectorAll(`#${tableId} thead th`).length || 0;
let occasionsMaster = [];
let occasionFetchController = null;

const occasionFilterMeta = {
    occasion_name: { label: "Occasion Name" },
    from_date: { label: "From Date" },
    to_date: { label: "To Date" },
    occasion_type: { label: "Type" },
    count_as_present: { label: "Count As Present" },
    paid_holiday: { label: "Paid Holiday" },
    is_active: { label: "Is Active" },
};

const paginate = new Pagination({
    currentPageId: "current-page",
    totalPagesId: "total-pages",
    pageOfPageId: "page-of-pages",
    recordsRangeId: "range-of-records",
});
paginate.pageLimit = 30;

function renderNoResponseCode(option) {
    return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No occasion data available.</td></tr>`;
}

function getOccasionFilters() {
    return {
        occasion_name:
            document.getElementById("occasionFilterName")?.value?.trim() || "",
        from_date:
            document.getElementById("occasionFilterFromDate")?.value?.trim() || "",
        to_date: document.getElementById("occasionFilterToDate")?.value?.trim() || "",
        occasion_type:
            document.getElementById("occasionFilterType")?.value?.trim() || "",
        count_as_present:
            document.getElementById("occasionFilterCountAsPresent")?.value?.trim() || "",
        paid_holiday:
            document.getElementById("occasionFilterPaidHoliday")?.value?.trim() || "",
        is_active:
            document.getElementById("occasionFilterActive")?.value?.trim() || "",
    };
}

function occasionListSkeleton(numberOfHeaders = 1) {
    return `
        <tr class="occasion-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Loading occasions...</span>
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

    if (
        key === "from_date" ||
        key === "to_date"
    ) {
        const parsed = Date.parse(raw);
        if (!isNaN(parsed)) {
            return new Date(parsed).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
        }
    }

    if (
        key === "count_as_present" ||
        key === "paid_holiday" ||
        key === "is_active"
    ) {
        return raw === "Y" ? "Yes" : raw === "N" ? "No" : raw;
    }

    return raw;
}

function renderActiveFilterPills() {
    const filtersWrap = document.getElementById("occasionActiveFilters");
    if (!filtersWrap) return;

    const filters = getOccasionFilters();
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
            const meta = occasionFilterMeta[key];
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
    <button type="button" class="btn btn-link" id="clearAllOccasionFiltersBtn">Clear All</button>
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

function renderYesNoBadge(value) {
    const val = String(value || "").toUpperCase().trim();

    if (val === "Y") {
        return `<span class="shift-status-badge status-active">Yes</span>`;
    }

    if (val === "N") {
        return `<span class="shift-status-badge status-inactive">No</span>`;
    }

    return `<span class="shift-status-badge">${escapeHtml(value || "-")}</span>`;
}

function renderOccasionList(occasions) {
    const tbody = document.querySelector(`#${tableId} tbody`);

    if (!tbody) {
        return;
    }

    if (occasions && occasions.length > 0) {
        let content = "";
        const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

        occasions.forEach((occasion, idx) => {
            const occasionId = escapeHtml(occasion.occasion_id || "");
            const occasionName = escapeHtml(occasion.occasion_name || "-");
            const fromDate = escapeHtml(occasion.from_date_display || "-");
            const toDate = escapeHtml(occasion.to_date_display || "-");
            const shiftId = escapeHtml(occasion.shift_id || occasion.SHIFT_ID || "");
            const shiftNames = escapeHtml(occasion.shift_names || "-");
            const occasionType = escapeHtml(occasion.occasion_type_display || "-");
            const createdAt = escapeHtml(occasion.created_at || "-");
            const remarks = escapeHtml(occasion.remarks_display || "-");

            content += `
        <tr data-id="${occasionId}">
          <td class="shift-col-index text-center">${pageStart + idx + 1}</td>
          <td class="shift-name-cell">
            <div class="shift-name-chip">
              <span class="shift-name-text">${occasionName}</span>
            </div>
          </td>
          <td>
            <span class="shift-date-chip">${fromDate}</span>
          </td>
          <td>
            <span class="shift-date-chip">${toDate}</span>
          </td>
           <td>
            <span class="shift-date-chip">${shiftNames}</span>
          </td>
          
          <td>
            <span class="shift-time-chip">${occasionType}</span>
          </td>
          <td>${renderYesNoBadge(occasion.count_as_present)}</td>
          <td>${renderYesNoBadge(occasion.paid_holiday)}</td>
          <td>${renderYesNoBadge(occasion.is_active)}</td>
          
          <td>
            <span class="shift-stamp-chip">${createdAt}</span>
          </td>
          <td class="text-center shift-action-cell">
            <div class="shift-action-stack">
              <button
                type="button"
                class="shift-action-btn js-edit-occasion"
                data-id="${occasionId}"
                data-occasion_name="${escapeHtml(occasion.occasion_name || "")}"
                data-from_date="${escapeHtml(occasion.from_date || "")}"
                data-to_date="${escapeHtml(occasion.to_date || "")}"
                data-occasion_type="${escapeHtml(occasion.occasion_type || "")}"
                data-shift_id="${shiftId}"
                data-count_as_present="${escapeHtml(occasion.count_as_present || "Y")}"
                data-paid_holiday="${escapeHtml(occasion.paid_holiday || "Y")}"
                data-is_active="${escapeHtml(occasion.is_active || "Y")}"
                data-remarks="${escapeHtml(occasion.remarks || "")}"
                title="Edit"
                aria-label="Edit Occasion">
                <i class="ti ti-edit"></i>
              </button>

              <button
                type="button"
                class="shift-action-btn js-delete-occasion"
                data-id="${occasionId}"
                data-occasion="${escapeHtml(occasion.occasion_name || "")}"
                title="Delete"
                aria-label="Delete Occasion">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
        });

        tbody.innerHTML = content;
    } else {
        tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
    }
}

async function fetchOccasionList() {
    const tbody = document.querySelector(`#${tableId} tbody`);
    let requestController = null;

    if (!tbody) {
        return;
    }

    try {
        if (occasionFetchController) {
            occasionFetchController.abort();
        }

        requestController = new AbortController();
        occasionFetchController = requestController;

        const skeletonLoaderContent = occasionListSkeleton(numberOfHeaders);
        repeatAndAppendSkeletonContent(tableId, skeletonLoaderContent, 1);

        const url = `${baseURL}occasion/list`;
        const filters = getOccasionFilters();
        const searchValue =
            document.getElementById("occasionSearchInput")?.value || "";

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
            throw new Error("Failed to fetch occasion data");
        }

        const data = await response.json();
        paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
        paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

        occasionsMaster = data?.occasions || [];
        renderOccasionList(occasionsMaster);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        showToast("error", "Request failed: " + error.message);
        tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
    } finally {
        if (occasionFetchController === requestController) {
            occasionFetchController = null;
        }
    }
}

function handlePagination(action) {
    paginate.paginate(action);
    fetchOccasionList();
}

function filterOccasions() {
    paginate.currentPage = 1;
    renderActiveFilterPills();
    fetchOccasionList();
}

function resetOccasionFilters() {
    const ids = [
        "occasionSearchInput",
        "occasionFilterName",
        "occasionFilterFromDate",
        "occasionFilterToDate",
        "occasionFilterType",
        "occasionFilterCountAsPresent",
        "occasionFilterPaidHoliday",
        "occasionFilterActive",
    ];

    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = "";
        }
    });

    paginate.currentPage = 1;
    renderActiveFilterPills();
    fetchOccasionList();
}

function updateCsrfToken(result, occasionForm) {
    if (
        !result ||
        !result.csrf ||
        !result.csrf.name ||
        !result.csrf.hash ||
        !occasionForm
    ) {
        return;
    }

    const tokenInput = occasionForm.querySelector(
        `input[name="${result.csrf.name}"]`,
    );
    if (tokenInput) {
        tokenInput.value = result.csrf.hash;
    }
}

function appendCsrfToBody(params, occasionForm) {
    if (!occasionForm) return params;

    const tokenInput = occasionForm.querySelector(
        'input[type="hidden"][name]:not(#occasion_id)',
    );
    if (tokenInput && tokenInput.name && tokenInput.value) {
        params.append(tokenInput.name, tokenInput.value);
    }
    return params;
}

function downloadOccasionData(fileType = "csv") {
    try {
        const filters = Object.fromEntries(
            Object.entries(getOccasionFilters()).filter(
                ([_, value]) => value != null && value !== "",
            ),
        );

        const searchValue =
            document.getElementById("occasionSearchInput")?.value || "";

        const form = document.createElement("form");
        form.method = "POST";
        form.action = `${baseURL}occasion/export_occasion`;
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

        const occasionForm = document.getElementById("occasionForm");
        const tokenInput = occasionForm?.querySelector(
            'input[type="hidden"][name]:not(#occasion_id)',
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
        console.error("Occasion download failed:", error);
        showToast("error", "Failed to download Occasion data.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    fetchOccasionList();
    renderActiveFilterPills();

    const searchInput = document.getElementById("occasionSearchInput");
    const tbody = table ? table.querySelector("tbody") : null;
    const modalElement = document.getElementById("addOccasionModal");
    const occasionForm = document.getElementById("occasionForm");
    const modalTitle = document.getElementById("addOccasionModalLabel");
    const submitBtn = document.getElementById("saveOccasionBtn");
    const addBtn = document.querySelector('[data-bs-target="#addOccasionModal"]');
    const filterPanelElement = document.getElementById("occasionFilterPanel");
    const filterOpenBtn = document.getElementById("toggleOccasionFiltersBtn");
    const filterForm = document.getElementById("occasionFiltersForm");
    const resetFiltersBtn = document.getElementById("resetOccasionFiltersBtn");
    const activeFiltersWrap = document.getElementById("occasionActiveFilters");
    const cancelFiltersBtn = document.getElementById("cancelOccasionFiltersBtn");

    let currentMode = "create";
    let editingId = "";

    function openFilterPanel() {
        if (filterPanelElement) {
            filterPanelElement.classList.add("show");
        }
    }

    function closeFilterPanel() {
        if (filterPanelElement) {
            filterPanelElement.classList.remove("show");
        }
    }

    function cleanupModalArtifacts() {
        document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
        document.body.classList.remove("modal-open");
        document.body.style.removeProperty("padding-right");
        document.body.style.removeProperty("overflow");
    }

    function openOccasionModal() {
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

    function closeOccasionModal() {
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
        if (!occasionForm) return null;
        return occasionForm.querySelector(`[name="${fieldName}"]`);
    }

    function clearFieldErrors() {
        if (!occasionForm) return;

        occasionForm.querySelectorAll(".is-invalid").forEach((el) => {
            el.classList.remove("is-invalid");
        });

        const errorIds = [
            "occasion_name_error",
            "from_date_error",
            "to_date_error",
            "occasion_type_error",
            "count_as_present_error",
            "paid_holiday_error",
            "is_active_error",
            "remarks_error",
        ];

        errorIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = "";
            }
        });
    }

    function showFieldErrors(errors) {
        if (!occasionForm || !errors || typeof errors !== "object") return;

        Object.keys(errors).forEach((field) => {
            const message = stripHtml(errors[field] || "");
            if (!message) return;

            const fieldInput = getFieldInput(field);
            if (fieldInput) {
                fieldInput.classList.add("is-invalid");
            }

            const fieldError = document.getElementById(`${field}_error`);
            if (fieldError) {
                fieldError.textContent = message;
            }
        });
    }

    function fillForm(data) {
        occasionForm.querySelector("#occasion_id").value = data.occasion_id || "";
        occasionForm.querySelector("#occasion_name").value = data.occasion_name || "";
        occasionForm.querySelector("#from_date").value = toDateInputValue(
            data.from_date || "",
        );
        occasionForm.querySelector("#to_date").value = toDateInputValue(
            data.to_date || "",
        );
        occasionForm.querySelector("#occasion_type").value =
            data.occasion_type || "";
        occasionForm.querySelector("#count_as_present").value =
            data.count_as_present || "Y";
        occasionForm.querySelector("#paid_holiday").value =
            data.paid_holiday || "Y";
        occasionForm.querySelector("#is_active").value = data.is_active || "Y";
        occasionForm.querySelector("#remarks").value = data.remarks || "";
        setSelectedShiftsFromIds(data.shift_id || "");
    }

    function resetModalToCreate() {
        currentMode = "create";
        editingId = "";

        if (occasionForm) {
            occasionForm.reset();
            const hiddenId = occasionForm.querySelector("#occasion_id");
            if (hiddenId) {
                hiddenId.value = "";
            }
        }

        selectedShifts = [];
        renderShiftPills();

        if (modalTitle) {
            modalTitle.textContent = "Add Occasion";
        }

        setFormLoading(false, "Save Occasion");
        clearFieldErrors();
    }

    if (searchInput) {
        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                filterOccasions();
                closeFilterPanel();
            }
        });
    }

    if (filterOpenBtn) {
        filterOpenBtn.addEventListener("click", (event) => {
            event.stopPropagation();

            if (filterPanelElement?.classList.contains("show")) {
                closeFilterPanel();
                return;
            }

            openFilterPanel();
        });
    }

    if (filterPanelElement) {
        filterPanelElement.addEventListener("click", (event) => {
            event.stopPropagation();
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
            filterOccasions();
            closeFilterPanel();
        });
    }

    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener("click", () => {
            resetOccasionFilters();
        });
    }

    document.addEventListener("click", (event) => {
        if (!filterPanelElement?.classList.contains("show")) {
            return;
        }

        if (
            filterPanelElement.contains(event.target) ||
            filterOpenBtn?.contains(event.target)
        ) {
            return;
        }

        closeFilterPanel();
    });

    if (activeFiltersWrap) {
        activeFiltersWrap.addEventListener("click", (event) => {
            const removeBtn = event.target.closest(".shift-filter-pill-remove");
            const clearAllBtn = event.target.closest("#clearAllOccasionFiltersBtn");

            if (clearAllBtn) {
                resetOccasionFilters();
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
                occasion_name: "occasionFilterName",
                from_date: "occasionFilterFromDate",
                to_date: "occasionFilterToDate",
                occasion_type: "occasionFilterType",
                count_as_present: "occasionFilterCountAsPresent",
                paid_holiday: "occasionFilterPaidHoliday",
                is_active: "occasionFilterActive",
            };

            const targetInput = document.getElementById(inputIdMap[filterKey] || "");
            if (targetInput) {
                targetInput.value = "";
            }

            filterOccasions();
        });
    }

    if (addBtn) {
        addBtn.addEventListener("click", () => {
            resetModalToCreate();
        });
    }

    if (occasionForm) {
        occasionForm.addEventListener("submit", (event) => {
            event.preventDefault();
            clearFieldErrors();

            const payload = new FormData(occasionForm);
            const endpoint =
                currentMode === "edit"
                    ? `${baseURL}occasion/update/${encodeURIComponent(editingId)}`
                    : `${baseURL}occasion/store`;
            const submitLabel =
                currentMode === "edit" ? "Update Occasion" : "Save Occasion";

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
                    updateCsrfToken(result, occasionForm);

                    if (!result.status) {
                        if (result.data && result.data.errors) {
                            showFieldErrors(result.data.errors);
                        } else {
                            showToast("error", result.message || "Something went wrong.");
                        }
                        return;
                    }

                    closeOccasionModal();
                    showToast("success", result.message || "Saved successfully.");
                    resetModalToCreate();
                    fetchOccasionList();
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
            const editBtn = event.target.closest(".js-edit-occasion");
            const deleteBtn = event.target.closest(".js-delete-occasion");

            if (editBtn) {
                event.preventDefault();
                clearFieldErrors();

                const id = editBtn.getAttribute("data-id");
                if (!id) return;

                currentMode = "edit";
                editingId = id;

                if (modalTitle) {
                    modalTitle.textContent = "Edit Occasion";
                }
                setFormLoading(false, "Update Occasion");

                fillForm({
                    occasion_id: editBtn.getAttribute("data-id") || "",
                    occasion_name: editBtn.getAttribute("data-occasion_name") || "",
                    from_date: editBtn.getAttribute("data-from_date") || "",
                    to_date: editBtn.getAttribute("data-to_date") || "",
                    shift_id: editBtn.getAttribute("data-shift_id") || "",

                    occasion_type: editBtn.getAttribute("data-occasion_type") || "",
                    count_as_present:
                        editBtn.getAttribute("data-count_as_present") || "Y",
                    paid_holiday: editBtn.getAttribute("data-paid_holiday") || "Y",
                    is_active: editBtn.getAttribute("data-is_active") || "Y",
                    remarks: editBtn.getAttribute("data-remarks") || "",
                });

                openOccasionModal();
                return;
            }

            if (!deleteBtn) {
                return;
            }

            event.preventDefault();
            const deleteId = deleteBtn.getAttribute("data-id");
            const occasionName =
                deleteBtn.getAttribute("data-occasion") || "this occasion";

            const handleDelete = () => {
                const body = appendCsrfToBody(new URLSearchParams(), occasionForm);

                fetch(`${baseURL}occasion/delete/${encodeURIComponent(deleteId)}`, {
                    method: "POST",
                    body,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                    },
                })
                    .then((response) => response.json())
                    .then((result) => {
                        updateCsrfToken(result, occasionForm);
                        if (!result.status) {
                            showToast("error", result.message || "Delete failed.");
                            return;
                        }

                        showToast("success", result.message || "Deleted successfully.");
                        fetchOccasionList();
                    })
                    .catch(() => {
                        showToast("error", "Unable to delete occasion.");
                    });
            };

            Swal.fire({
                icon: "warning",
                title: "Delete Occasion?",
                text: `Are you sure you want to delete "${occasionName}"?`,
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



let selectedShifts = [];

function renderShiftPills() {
    const pillBox = document.getElementById('selected_shift_pills');
    const hiddenInput = document.getElementById('shift_id');

    if (!pillBox || !hiddenInput) return;

    hiddenInput.value = selectedShifts.map(item => item.id).join(',');

    pillBox.innerHTML = selectedShifts.map(item => `
        <span class="shift-pill">
            ${escapeHtml(item.name)}
            <button type="button" onclick="removeShift('${escapeJs(item.id)}')">&times;</button>
        </span>
    `).join('');
}

function removeShift(shiftId) {
    selectedShifts = selectedShifts.filter(item => String(item.id) !== String(shiftId));
    renderShiftPills();
}

document.addEventListener('DOMContentLoaded', function () {
    const shiftDropdown = document.getElementById('shift_dropdown');

    if (shiftDropdown) {
        shiftDropdown.addEventListener('change', function () {
            const shiftId = this.value;
            const selectedOption = this.options[this.selectedIndex];
            const shiftName = selectedOption.getAttribute('data-name');

            if (
                shiftId !== '' &&
                shiftName !== '' &&
                !selectedShifts.some(item => String(item.id) === String(shiftId))
            ) {
                selectedShifts.push({
                    id: shiftId,
                    name: shiftName
                });

                renderShiftPills();
            }

            this.value = '';
        });
    }
});

function setSelectedShiftsFromIds(savedIds) {
    selectedShifts = [];

    if (!savedIds || savedIds.trim() === '') {
        renderShiftPills();
        return;
    }

    const ids = savedIds.split(',').map(id => id.trim()).filter(id => id !== '');
    const shiftDropdown = document.getElementById('shift_dropdown');

    ids.forEach(id => {
        const option = shiftDropdown.querySelector(`option[value="${id}"]`);

        if (option) {
            selectedShifts.push({
                id: id,
                name: option.getAttribute('data-name')
            });
        }
    });

    renderShiftPills();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}