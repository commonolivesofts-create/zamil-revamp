(function () {
  const payload = window.dashboardPayload || {};

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setAnimatedWidths() {
    document.querySelectorAll("[data-progress-width]").forEach((el) => {
      const width = el.getAttribute("data-progress-width") || "0%";
      requestAnimationFrame(() => {
        el.style.width = width;
      });
    });
  }

  function renderDailyTrend() {
    const container = document.getElementById("dashboardDailyTrend");
    const rows = Array.isArray(payload.daily_trend) ? payload.daily_trend : [];
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = '<div class="small text-muted">No daily attendance trend available.</div>';
      return;
    }

    const maxTotal = Math.max(...rows.map((row) => Number(row.total || 0)), 1);

    container.innerHTML = rows
      .map((row) => {
        const total = Number(row.total || 0);
        const present = total ? (Number(row.present || 0) / total) * 100 : 0;
        const leave = total ? (Number(row.leave || 0) / total) * 100 : 0;
        const weekend = total ? (Number(row.weekend || 0) / total) * 100 : 0;
        const occasion = total ? (Number(row.occasion || 0) / total) * 100 : 0;
        const awi = total ? (Number(row.awi || 0) / total) * 100 : 0;
        const overallHeight = Math.max(8, (total / maxTotal) * 100);

        return `
            <div class="dashboard-trend-col" title="${escapeHtml(row.label)} | Present: ${row.present} | Leave: ${row.leave} | Weekend: ${row.weekend} | Occasion: ${row.occasion} | AWI: ${row.awi} | OT: ${row.overtime}">
              <div class="dashboard-trend-bar" style="height:${overallHeight}%">
                <div class="dashboard-trend-segment trend-present" style="height:${present}%"></div>
                <div class="dashboard-trend-segment trend-leave" style="height:${leave}%"></div>
                <div class="dashboard-trend-segment trend-weekend" style="height:${weekend}%"></div>
                <div class="dashboard-trend-segment trend-occasion" style="height:${occasion}%"></div>
                <div class="dashboard-trend-segment trend-awi" style="height:${awi}%"></div>
              </div>
              <div class="dashboard-trend-label">${escapeHtml(row.label)}</div>
            </div>
          `;
      })
      .join("");
  }

  function renderDepartmentVerticalBars() {

    const container =
      document.getElementById("dashboardDepartmentVerticalBars");

    const rows =
      Array.isArray(payload.department_employee_list)
        ? payload.department_employee_list
        : [];

    if (!container) return;

    if (!rows.length) {

      container.innerHTML =
        '<div class="small text-muted">No department data available.</div>';

      return;
    }

    /*
     * Find highest employee count
     */
    const maxCount = Math.max(
      ...rows.map(row =>
        Number(row.employee_count || 0)
      ),
      1
    );


    /*
     * Professional colors
     */
    const departmentColors = [
      {
        background:
          "linear-gradient(180deg, #4F46E5 0%, #6366F1 100%)",
        shadow:
          "rgba(79, 70, 229, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #059669 0%, #10B981 100%)",
        shadow:
          "rgba(5, 150, 105, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #D97706 0%, #F59E0B 100%)",
        shadow:
          "rgba(217, 119, 6, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #DC2626 0%, #EF4444 100%)",
        shadow:
          "rgba(220, 38, 38, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #7C3AED 0%, #8B5CF6 100%)",
        shadow:
          "rgba(124, 58, 237, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #0891B2 0%, #06B6D4 100%)",
        shadow:
          "rgba(8, 145, 178, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #DB2777 0%, #EC4899 100%)",
        shadow:
          "rgba(219, 39, 119, 0.25)"
      },

      {
        background:
          "linear-gradient(180deg, #65A30D 0%, #84CC16 100%)",
        shadow:
          "rgba(101, 163, 13, 0.25)"
      }
    ];


    container.innerHTML = rows
      .map((row, index) => {

        const count =
          Number(row.employee_count || 0);

        const heightPct =
          Math.max(
            5,
            (count / maxCount) * 100
          );


        const color =
          departmentColors[
          index % departmentColors.length
          ];


        return `
                <div
                    class="dashboard-vbar-col"
                    title="${escapeHtml(row.department)}: ${count} employees"
                >

                    <div class="dashboard-vbar-count">
                        ${escapeHtml(count)}
                    </div>


                    <div class="dashboard-vbar-track">

                        <div
                            class="dashboard-vbar-fill"
                            data-progress-height="${heightPct}%"
                            style="
                                background:${color.background};
                                box-shadow:0 4px 12px ${color.shadow};
                            "
                        ></div>

                    </div>


                    <div
                        class="dashboard-vbar-label"
                        title="${escapeHtml(row.department)}"
                    >
                        ${escapeHtml(row.department)}
                    </div>

                </div>
            `;
      })
      .join("");


    /*
     * Animate bars
     */
    requestAnimationFrame(() => {

      container
        .querySelectorAll("[data-progress-height]")
        .forEach(el => {

          el.style.height =
            el.getAttribute(
              "data-progress-height"
            );

        });

    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setAnimatedWidths();
    renderDailyTrend();
    renderDepartmentVerticalBars();
  });
})();
