function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(type, message) {
  if (typeof toasterNotification === "function") {
    toasterNotification({ type, message });
    return;
  }
  if (typeof Swal !== "undefined" && Swal.fire) {
    Swal.fire({
      icon: type,
      title: message,
      toast: true,
      position: "top-end",
      timer: 2200,
      showConfirmButton: false,
      timerProgressBar: true,
    });
    return;
  }
  alert(message);
}

function formatNumber(value, decimals = 2) {
  const num = parseFloat(value);
  return isNaN(num) ? (0).toFixed(decimals) : num.toFixed(decimals);
}

function getSummaryFilters() {
  return {
    div: document.getElementById("summaryFilterDiv")?.value?.trim() || "",
    cont: document.getElementById("summaryFilterConName")?.value?.trim() || "",
    dept: document.getElementById("summaryFilterDept")?.value?.trim() || "",
    from: document.getElementById("summaryFilterFrom")?.value?.trim() || "",
    to: document.getElementById("summaryFilterTo")?.value?.trim() || "",
  };
}

function emptyRow(colspan, message) {
  return `<tr class="summary-empty-row"><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

/**
 * Renders the per-employee summary tab, inserting a subtotal row every time
 * the (CON_NO, DIVISION) combination changes — same break logic as the
 * legacy summary.php PHP loop, just ported to run over the JSON payload.
 */
function renderSummaryTab(rows) {
  const tbody = document.querySelector("#table-summary tbody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = emptyRow(11, "No summary data for the selected filters.");
    document.getElementById("summaryTotalHrs").textContent = "0.00";
    document.getElementById("summaryTotalCost").textContent = "0.00";
    return;
  }

  let html = "";
  let rowNum = 0;
  let currentContractor = null;
  let currentDivision = null;
  let subtotalHrs = 0;
  let subtotalCost = 0;
  let subtotalEmpCount = 0;
  let grandHrs = 0;
  let grandCost = 0;

  const flushSubtotal = () => {
    if (currentContractor === null && currentDivision === null) return;
    html += `
      <tr class="summary-subtotal-row">
        <td></td><td></td><td></td><td></td>
        <td>Employees:</td>
        <td>${subtotalEmpCount}</td>
        <td></td>
        <td class="text-end">Subtotal</td>
        <td></td>
        <td>${formatNumber(subtotalHrs)}</td>
        <td>${formatNumber(subtotalCost)}</td>
      </tr>
    `;
  };

  rows.forEach((row) => {
    const conNo = row.CON_NO;
    const division = row.DIVISION;

    if (currentContractor !== conNo || currentDivision !== division) {
      flushSubtotal();
      currentContractor = conNo;
      currentDivision = division;
      subtotalHrs = 0;
      subtotalCost = 0;
      subtotalEmpCount = 0;
    }

    rowNum += 1;
    const hrs = parseFloat(row.TOT_HRS) || 0;
    const cost = parseFloat(row.TOT_COST) || 0;

    html += `
      <tr>
        <td>${rowNum}</td>
        <td>${escapeHtml(conNo)}</td>
        <td>${escapeHtml(row.CON_NAME)}</td>
        <td>${escapeHtml(division)}</td>
        <td>${escapeHtml(row.DEP)}</td>
        <td>${escapeHtml(row.EMPLOYEE_NUMBER)}</td>
        <td>${escapeHtml(row.EMPLOYEE_NAME)}</td>
        <td>${escapeHtml(row.IQAMAH)}</td>
        <td>${escapeHtml(row.RATE)}</td>
        <td>${formatNumber(hrs)}</td>
        <td>${formatNumber(cost)}</td>
      </tr>
    `;

    subtotalHrs += hrs;
    subtotalCost += cost;
    subtotalEmpCount += 1;
    grandHrs += hrs;
    grandCost += cost;
  });

  flushSubtotal();

  tbody.innerHTML = html;
  document.getElementById("summaryTotalHrs").textContent = formatNumber(grandHrs);
  document.getElementById("summaryTotalCost").textContent = formatNumber(grandCost);
}

function renderReportTab(rows) {
  const tbody = document.querySelector("#table-report tbody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = emptyRow(11, "No punch detail for the selected filters.");
    document.getElementById("reportTotalHrs").textContent = "0.00";
    return;
  }

  let html = "";
  let grandHrs = 0;

  rows.forEach((row, idx) => {
    const hrs = parseFloat(row.ACT_HRS) || 0;
    grandHrs += hrs;

    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.T_DATE)}</td>
        <td>${escapeHtml(row.CON_NO)}</td>
        <td>${escapeHtml(row.CON_NAME)}</td>
        <td>${escapeHtml(row.DEP_ID)}</td>
        <td>${escapeHtml(row.DEP)}</td>
        <td>${escapeHtml(row.EMP_NO)}</td>
        <td>${escapeHtml(row.EMPLOYEE_NAME)}</td>
        <td>${escapeHtml(row.INN_P_IN)}</td>
        <td>${escapeHtml(row.OUTT_P_OUT)}</td>
        <td>${formatNumber(hrs)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  document.getElementById("reportTotalHrs").textContent = formatNumber(grandHrs);
}

function renderGroupwiseTab(rows) {
  const tbody = document.querySelector("#table-groupwise tbody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = emptyRow(5, "No contractor rollup for the selected filters.");
    document.getElementById("groupwiseTotalEmp").textContent = "0";
    document.getElementById("groupwiseTotalCost").textContent = "0.00";
    return;
  }

  let html = "";
  let grandEmp = 0;
  let grandCost = 0;

  rows.forEach((row, idx) => {
    const empCount = parseInt(row.TOTAL_EMP, 10) || 0;
    const cost = parseFloat(row.TOTAL_COST) || 0;
    grandEmp += empCount;
    grandCost += cost;

    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.CON_NO)}</td>
        <td>${escapeHtml(row.CON_NAME)}</td>
        <td>${empCount}</td>
        <td>${formatNumber(cost)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  document.getElementById("groupwiseTotalEmp").textContent = grandEmp;
  document.getElementById("groupwiseTotalCost").textContent = formatNumber(grandCost);
}

let summaryFetchController = null;

async function fetchSummary() {
  const filters = getSummaryFilters();

  if (!filters.from || !filters.to) {
    showToast("error", "Please select both From and To dates.");
    return;
  }

  const runBtn = document.getElementById("runSummaryBtn");
  const originalLabel = runBtn ? runBtn.innerHTML : "";
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Running...`;
  }

  try {
    if (summaryFetchController) {
      summaryFetchController.abort();
    }
    summaryFetchController = new AbortController();

    const response = await fetch(`${baseURL}report/contractor-summary/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: summaryFetchController.signal,
      body: JSON.stringify(filters),
    });

    const result = await response.json();

    if (!response.ok) {
      showToast("error", result?.message || "Failed to load summary report.");
      return;
    }

    renderSummaryTab(result.summary || []);
    renderReportTab(result.records || []);
    renderGroupwiseTab(result.summary_stats || []);
  } catch (error) {
    if (error.name === "AbortError") return;
    showToast("error", "Request failed: " + error.message);
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = originalLabel;
    }
  }
}

/**
 * The export endpoint reads the contractor-name filter from a POST field
 * named `con_name` (not `cont`) — matching Contractor::export_summary(),
 * which forwards $this->input->post('con_name') into resolveSummaryFilters().
 */
function exportSummaryCsv() {
  const filters = getSummaryFilters();

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${baseURL}report/contractor-summary/export`;
  form.style.display = "none";

  const fields = {
    from: filters.from,
    to: filters.to,
    dept: filters.dept,
    con_name: filters.cont,
    div: filters.div,
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

function exportSummaryExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table || typeof XLSX === "undefined") {
    showToast("error", "Excel export is unavailable right now.");
    return;
  }

  const wb = XLSX.utils.table_to_book(table, { sheet: "sheet-1" });
  XLSX.writeFile(wb, `${filename || "Contractor_Report"}.xlsx`);
}

function printSummaryTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const printWindow = window.open("", "", "width=1366,height=768");
  printWindow.document.open();
  printWindow.document.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 12px; }
          th, td { border: 1px solid #999; padding: 4px 6px; }
          th { background: #eaf7ef; }
        </style>
      </head>
      <body>${table.outerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

document.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runSummaryBtn");
  if (runBtn) {
    runBtn.addEventListener("click", () => fetchSummary());
  }

  fetchSummary();
});
