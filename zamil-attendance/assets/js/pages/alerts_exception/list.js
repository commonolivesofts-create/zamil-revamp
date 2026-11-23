const paginate = new Pagination({
    currentPageId: "current-page",
    totalPagesId: "total-pages",
    pageOfPageId: "page-of-pages",
    recordsRangeId: "range-of-records",
});

paginate.pageLimit = 15;

let loadAlertsData = null;

(function () {
    'use strict';

    const page = document.querySelector(
        '.ae-page'
    );

    const form = document.getElementById(
        'ae-filter-form'
    );

    const results = document.getElementById(
        'ae-results'
    );

    const resetButton = document.getElementById(
        'ae-reset'
    );

    const exportLink = document.getElementById(
        'ae-export-link'
    );

    if (!page || !form || !results) {
        return;
    }

    function buildQuery() {
        const params =
            new URLSearchParams();

        new FormData(form).forEach(
            function (value, key) {
                const clean =
                    String(value).trim();

                if (clean !== '') {
                    params.set(
                        key,
                        clean
                    );
                }
            }
        );

        return params;
    }

    function setLoading(loading) {
        form.classList.toggle(
            'ae-loading',
            loading
        );

        form.querySelectorAll(
            'button, input, select'
        ).forEach(function (element) {
            element.disabled = loading;
        });
    }

    function showTableLoader() {
        const tbody =
            document.querySelector(
                '#ae-results tbody'
            );

        if (!tbody) {
            results.innerHTML = `
                <div class="ae-table-card">
                    <div class="ae-table-scroll">
                        <table class="ae-table">
                            <tbody>
                                <tr>
                                    <td
                                        colspan="10"
                                        class="text-center p-3"
                                    >
                                        <div
                                            class="spinner-border spinner-border-sm"
                                            role="status"
                                        ></div>

                                        <span class="ms-2">
                                            Loading...
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            return;
        }

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center p-3"
                >
                    <div
                        class="spinner-border spinner-border-sm"
                        role="status"
                    >
                        <span class="visually-hidden">
                            Loading...
                        </span>
                    </div>

                    <span class="ms-2">
                        Loading...
                    </span>
                </td>
            </tr>
        `;
    }

    async function loadData(
        pushState = false
    ) {
        showTableLoader();

        const params = buildQuery();

        params.set(
            'currentPage',
            paginate.currentPage
        );

        params.set(
            'limit',
            paginate.pageLimit
        );

        const url =
            `${form.action}?${params.toString()}`;

        setLoading(true);

        try {
            const response = await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        'X-Requested-With':
                            'XMLHttpRequest'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(
                    'Unable to load exceptions.'
                );
            }

            const data =
                await response.json();

            if (
                data.status !== 'success'
            ) {
                throw new Error(
                    'Invalid server response.'
                );
            }

            results.innerHTML =
                data.html;

            if (data.pagination) {
                paginate.totalRecords =
                    Number(
                        data.pagination
                            .total_records || 0
                    );

                paginate.totalPages =
                    Number(
                        data.pagination
                            .total_pages || 1
                    );

                paginate.currentPage =
                    Number(
                        data.pagination
                            .current_page || 1
                    );
            }

            Object.keys(
                data.summary || {}
            ).forEach(function (key) {
                const element =
                    document.querySelector(
                        `[data-summary="${key}"]`
                    );

                if (element) {
                    element.textContent =
                        Number(
                            data.summary[key] || 0
                        ).toLocaleString();
                }
            });

            const generated =
                document.getElementById(
                    'ae-generated-at'
                );

            if (generated) {
                generated.innerHTML = `
                    <i class="ti ti-refresh"></i>
                    Generated ${data.generated_at}
                `;
            }

            if (exportLink) {
                const exportParams =
                    buildQuery();

                exportLink.href =
                    `${page.dataset.pageUrl}/export?` +
                    exportParams.toString();
            }

            if (pushState) {
                history.pushState(
                    {},
                    '',
                    url
                );
            }
        } catch (error) {
            results.innerHTML = `
                <div class="ae-error">
                    <i class="ti ti-alert-circle"></i>
                    ${escapeHtml(error.message)}
                </div>
            `;
        } finally {
            setLoading(false);
        }
    }

    function escapeHtml(value) {
        const element =
            document.createElement('div');

        element.textContent =
            value === null ||
                value === undefined
                ? ''
                : String(value);

        return element.innerHTML;
    }

    loadAlertsData = loadData;

    form.addEventListener(
        'submit',
        function (event) {
            event.preventDefault();

            paginate.currentPage = 1;

            loadData(true);
        }
    );

    if (resetButton) {
        resetButton.addEventListener(
            'click',
            function () {
                form.reset();

                const from =
                    form.querySelector(
                        '[name="from_date"]'
                    );

                const to =
                    form.querySelector(
                        '[name="to_date"]'
                    );

                const now =
                    new Date();

                const first =
                    new Date(
                        now.getFullYear(),
                        now.getMonth(),
                        1
                    );

                const formatDate =
                    function (date) {
                        const year =
                            date.getFullYear();

                        const month =
                            String(
                                date.getMonth() + 1
                            ).padStart(2, '0');

                        const day =
                            String(
                                date.getDate()
                            ).padStart(2, '0');

                        return `${year}-${month}-${day}`;
                    };

                if (from) {
                    from.value =
                        formatDate(first);
                }

                if (to) {
                    to.value =
                        formatDate(now);
                }

                paginate.currentPage = 1;

                loadData(true);
            }
        );
    }

    window.addEventListener(
        'popstate',
        function () {
            const params =
                new URLSearchParams(
                    window.location.search
                );

            form.querySelectorAll(
                '[name]'
            ).forEach(function (field) {
                field.value =
                    params.get(field.name) ||
                    '';
            });

            paginate.currentPage =
                Number(
                    params.get(
                        'currentPage'
                    ) || 1
                );

            loadData(false);
        }
    );

    /*
     * Initial AJAX loading.
     */
    loadData(false);
})();

function handlePagination(action) {
    paginate.paginate(action);

    if (
        typeof loadAlertsData ===
        'function'
    ) {
        loadAlertsData(false);
    }
}