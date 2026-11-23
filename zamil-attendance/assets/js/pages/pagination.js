class Pagination {
    // Class fields for properties
    _limit = 10; // Default current page
    _currentPage = 1; // Default current page
    _totalPages = 0;   // Default total pages
    _totalRecords = 0; // Default total records
    _currentPageInput = null;
    _totalPagesInput = null;

    constructor(config) {
        // Initialize elements
        this.pageOfPage = document.getElementById(config?.pageOfPageId);
        this.recordsOfRecords = document.getElementById(config?.recordsRangeId);
        this._currentPageInput = document.getElementById(config?.currentPageId);
        this._totalPagesInput = document.getElementById(config?.totalPagesId);
        // Initialize the pagination display
        this.updateDisplay();
    }

    // Getter for currentPage
    get currentPage() {
        return this._currentPage;
    }

    // Getter for currentPage
    get pageLimit() {
        return this._limit;
    }

    // Setter for currentPage
    set currentPage(page) {
        if (this.isValidPage(page)) {
            this._currentPage = page;
            this.updateDisplay();
        } else {
            console.error('Invalid page number');
        }
    }

    // Setter for currentPage
    set pageLimit(limit) {
        this._limit = limit;
        this.updateDisplay();
    }

    // Getter for totalPages
    get totalPages() {
        return this._totalPages;
    }

    // Setter for totalPages
    set totalPages(pages) {
        this._totalPages = pages;
        this.updateDisplay();
    }

    // Getter for totalRecords
    get totalRecords() {
        return this._totalRecords;
    }

    // Setter for totalRecords
    set totalRecords(records) {
        this._totalRecords = records;
        this.updateDisplay();
    }

    // Check if the page number is valid
    isValidPage(page) {
        return page >= 1 && page <= this._totalPages;
    }

    // Update display for pagination information
    updateDisplay = () => {
        this.pageOfPage.innerHTML = `Page <span>${this._currentPage}</span> of <span>${this._totalPages}</span>`;

        this._totalPagesInput.value = this._totalPages; // Update hidden input

        this._currentPageInput.value = this._currentPage; // Update hidden input

        // Display record range
        this.displayRecordsRange();
    }

    // Display the range of records currently shown
    displayRecordsRange = () => {
        const recordsPerPage = this._limit; // Set number of records per page

        // Calculate starting and ending record numbers
        let startRecord = (this._currentPage - 1) * recordsPerPage + 1;
        let endRecord = startRecord + recordsPerPage - 1;

        // Adjust endRecord for last page
        endRecord = this._currentPage === this._totalPages ? this._totalRecords : Math.min(endRecord, this._totalRecords);

        // Handle case when there are no records
        if (this._totalRecords === 0) {
            this.recordsOfRecords.innerHTML = `<p class="mb-0">No records to show.</p>`;
            return;
        }

        // Ensure startRecord does not exceed totalRecords
        startRecord = Math.min(startRecord, this._totalRecords);

        // Display the range of records
        this.recordsOfRecords.innerHTML = `<p class="mb-0">Records ${startRecord}-${endRecord} of ${this._totalRecords}</p>`;
    }
    // Method to handle pagination actions
    paginate(action = 'first') {
        let queryPage = this.currentPage;

        if (action === 'first') {
            queryPage = 1;
        } else if (action === 'last') {
            queryPage = this.totalPages;
        } else if (action === 'prev') {
            if (this.currentPage > 1) queryPage = this.currentPage - 1;
        } else if (action === 'next') {
            if (this.currentPage < this.totalPages) queryPage = this.currentPage + 1;
        }

        // Set the current page
        this.currentPage = queryPage; // This will automatically update the display
        this._currentPageInput.value = this.currentPage; // Update the input field with the new page value
        return queryPage;
    }

}