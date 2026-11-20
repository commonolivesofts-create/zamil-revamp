const tableId = "attendance-card-table";
const table = document.getElementById(tableId);
const numberOfHeaders =
	document.querySelectorAll(`#${tableId} thead th`).length || 0;
let attendanceCardMaster = [];
let attendanceCardFetchController = null;
const attendanceCardFilterMeta = {
	emp_no: { label: "Emp No", inputId: "attendanceCardFilterEmpNo" },
	emp_name: { label: "Employee", inputId: "attendanceCardSearch" },
	att_date: { label: "Date", inputId: "attendanceCardFilterAttDate" },
};

const paginate = new Pagination({
	currentPageId: "current-page",
	totalPagesId: "total-pages",
	pageOfPageId: "page-of-pages",
	recordsRangeId: "range-of-records",
});
paginate.pageLimit = 15;

function renderNoResponseCode(option) {
	return `<tr><td class="text-center" colspan="${option?.colspan || 1}">No attendance card data available.</td></tr>`;
}

function getAttendanceCardFilters() {
	return {
		emp_no:
			document.getElementById("attendanceCardFilterEmpNo")?.value?.trim() || "",
		emp_name: document.getElementById("attendanceCardSearch")?.value?.trim() || "",
		att_date:
			document.getElementById("attendanceCardFilterAttDate")?.value?.trim() || "",
	};
}

function attendanceCardListSkeleton(numberOfHeaders = 1) {
	return `
        <tr class="attendance-card-loading-row">
            <td class="text-center py-3" colspan="${numberOfHeaders}">
                <div class="d-inline-flex align-items-center gap-2 text-muted small">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="color: #16833f;"></span>
                    <span>Loading attendance cards...</span>
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

function formatFilterValue(key, value) {
	const raw = String(value || "").trim();
	if (!raw) return "";

	if (key === "att_date") {
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

function renderActiveAttendanceCardFilterPills() {
	const filtersWrap = document.getElementById("attendanceCardActiveFilters");
	if (!filtersWrap) return;

	const filters = getAttendanceCardFilters();
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
			const meta = attendanceCardFilterMeta[key];
			if (!meta) return "";

			return `
        <span class="attendance-card-filter-pill">
          <span class="attendance-card-filter-pill-label">${escapeHtml(meta.label)}</span>
          <span class="attendance-card-filter-pill-value">${escapeHtml(formatFilterValue(key, value))}</span>
          <button
            type="button"
            class="attendance-card-filter-pill-remove"
            data-filter-key="${escapeHtml(key)}"
            aria-label="Remove ${escapeHtml(meta.label)} filter">
            <i class="ti ti-x"></i>
          </button>
        </span>
      `;
		})
		.join("");

	filtersWrap.innerHTML = `
    <span class="attendance-card-filter-summary">Active Filters</span>
    ${pills}
    <span class="attendance-card-active-filters-spacer"></span>
    <button type="button" class="btn btn-link" id="clearAllAttendanceCardFiltersBtn">Clear All</button>
  `;
	filtersWrap.classList.add("is-visible");
}

function renderAttendanceCardList(rows) {
	const tbody = document.querySelector(`#${tableId} tbody`);
	if (!tbody) return;

	if (rows && rows.length > 0) {
		let content = "";
		const pageStart = (paginate.currentPage - 1) * paginate.pageLimit;

		rows.forEach((item, idx) => {
			content += `
                <tr>
                    <td class="attendance-card-col-index">${pageStart + idx + 1}</td>
                    <td><span class="attendance-card-chip">${escapeHtml(item.emp_no || "-")}</span></td>
                    <td class="attendance-card-primary-cell">
                        <span class="attendance-card-name-text">${escapeHtml(item.emp_name || "-")}</span>
                    </td>
                    <td><span class="attendance-card-date-chip">${escapeHtml(item.att_date_display || "-")}</span></td>
                </tr>
            `;
		});

		tbody.innerHTML = content;
	} else {
		tbody.innerHTML = renderNoResponseCode({ colspan: numberOfHeaders });
	}
}

async function fetchAttendanceCardList() {
	const tbody = document.querySelector(`#${tableId} tbody`);
	let requestController = null;

	if (!tbody) return;

	try {
		if (attendanceCardFetchController) {
			attendanceCardFetchController.abort();
		}

		requestController = new AbortController();
		attendanceCardFetchController = requestController;

		repeatAndAppendSkeletonContent(
			tableId,
			attendanceCardListSkeleton(numberOfHeaders),
			1,
		);

		const response = await fetch(`${baseURL}report/attendance-card/list`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			signal: requestController.signal,
			body: JSON.stringify({
				limit: paginate.pageLimit,
				currentPage: paginate.currentPage,
				filters: getAttendanceCardFilters(),
				search: "",
			}),
		});

		if (!response.ok) {
			throw new Error("Failed to fetch attendance card data");
		}

		const data = await response.json();
		paginate.totalPages = parseFloat(data?.pagination?.total_pages) || 0;
		paginate.totalRecords = parseFloat(data?.pagination?.total_records) || 0;

		attendanceCardMaster = data.attendance_cards || [];
		renderAttendanceCardList(attendanceCardMaster);
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
		if (attendanceCardFetchController === requestController) {
			attendanceCardFetchController = null;
		}
	}
}

function handlePagination(action) {
	paginate.paginate(action);
	fetchAttendanceCardList();
}

function filterAttendanceCards() {
	paginate.currentPage = 1;
	renderActiveAttendanceCardFilterPills();
	fetchAttendanceCardList();
}

function resetAttendanceCardFilters() {
	const ids = [
		"attendanceCardFilterEmpNo",
		"attendanceCardSearch",
		"attendanceCardFilterAttDate",
	];

	ids.forEach((id) => {
		const element = document.getElementById(id);
		if (element) {
			element.value = "";
		}
	});

	paginate.currentPage = 1;
	renderActiveAttendanceCardFilterPills();
	fetchAttendanceCardList();
}

function downloadAttendanceCardData(fileType = "csv") {
	try {
		const filters = Object.fromEntries(
			Object.entries(getAttendanceCardFilters()).filter(
				([, value]) => value != null && value !== "",
			),
		);

		const form = document.createElement("form");
		form.method = "POST";
		form.action = `${baseURL}report/attendance-card/export`;
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
		console.error("Attendance card download failed:", error);
		toasterNotification({
			type: "error",
			message: "Failed to download attendance card data.",
		});
	}
}

document.addEventListener("DOMContentLoaded", () => {
	fetchAttendanceCardList();
	renderActiveAttendanceCardFilterPills();

	const employeeSearch = document.getElementById("attendanceCardSearch");
	const filterPanel = document.getElementById("attendanceCardFiltersPanel");
	const filterOpenBtn = document.getElementById("openAttendanceCardFiltersBtn");
	const filterForm = document.getElementById("attendanceCardFiltersForm");
	const resetFiltersBtn = document.getElementById("resetAttendanceCardFiltersBtn");
	const activeFiltersWrap = document.getElementById("attendanceCardActiveFilters");
	const closeFiltersBtn = document.getElementById("closeAttendanceCardFiltersBtn");
	const cancelFiltersBtn = document.getElementById("cancelAttendanceCardFiltersBtn");

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
					filterAttendanceCards();
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
			filterAttendanceCards();
			closeFilterPanel();
		});
	}

	if (resetFiltersBtn) {
		resetFiltersBtn.addEventListener("click", () => {
			resetAttendanceCardFilters();
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
			const removeBtn = event.target.closest(".attendance-card-filter-pill-remove");
			const clearAllBtn = event.target.closest("#clearAllAttendanceCardFiltersBtn");

			if (clearAllBtn) {
				resetAttendanceCardFilters();
				return;
			}

			if (!removeBtn) {
				return;
			}

			const filterKey = removeBtn.getAttribute("data-filter-key");
			const inputId = attendanceCardFilterMeta[filterKey]?.inputId;
			const targetInput = inputId ? document.getElementById(inputId) : null;

			if (targetInput) {
				targetInput.value = "";
			}

			filterAttendanceCards();
		});
	}
});
