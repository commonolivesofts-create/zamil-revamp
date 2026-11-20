document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('fsl-search');
    const categorySelect = document.getElementById('fsl-category');
    const statusSelect = document.getElementById('fsl-status');
    const prioritySelect = document.getElementById('fsl-priority');
    const clearButton = document.getElementById('fsl-clear');
    const resultCount = document.getElementById('fsl-result-count');
    const emptyState = document.getElementById('fsl-empty');
    const cards = Array.from(document.querySelectorAll('.fsl-feature-card'));
    const groups = Array.from(document.querySelectorAll('.fsl-group'));

    function applyFilters() {
        const search = (searchInput.value || '').trim().toLowerCase();
        const category = categorySelect.value;
        const status = statusSelect.value;
        const priority = prioritySelect.value;
        let visibleCount = 0;

        cards.forEach(function (card) {
            const visible =
                (search === '' || (card.dataset.search || '').includes(search)) &&
                (category === '' || card.dataset.category === category) &&
                (status === '' || card.dataset.status === status) &&
                (priority === '' || card.dataset.priority === priority);
            card.hidden = !visible;
            if (visible) visibleCount++;
        });

        groups.forEach(function (group) {
            group.hidden = group.querySelectorAll('.fsl-feature-card:not([hidden])').length === 0;
        });

        resultCount.textContent = visibleCount + (visibleCount === 1 ? ' feature shown' : ' features shown');
        emptyState.hidden = visibleCount !== 0;
    }

    searchInput.addEventListener('input', applyFilters);
    categorySelect.addEventListener('change', applyFilters);
    statusSelect.addEventListener('change', applyFilters);
    prioritySelect.addEventListener('change', applyFilters);
    clearButton.addEventListener('click', function () {
        searchInput.value = '';
        categorySelect.value = '';
        statusSelect.value = '';
        prioritySelect.value = '';
        applyFilters();
        searchInput.focus();
    });
});
