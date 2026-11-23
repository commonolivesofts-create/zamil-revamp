<?php
defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Renders pagination controls.
 *
 * @param string $currentPageId The ID for the current page input field.
 * @param string $pageOfPageId The ID for the page of pages text.
 * @param string $rangeOfRecordsId The ID for the range of records text.
 * @return string The HTML string for the pagination controls.
 */
if (!function_exists('renderPaginate')) {
    function renderPaginate($currentPageId = 'current-page', $totalPagesId = 'total-pages',  $pageOfPageId = 'page-of-pages', $rangeOfRecordsId = 'range-of-records')
    {
        return '
        <div class=" w-100">
            <div class="d-flex align-items-center justify-content-between gap-2">
                <div class="d-flex align-items-center gap-2">
                    <div class="pagination-button-group">
                        <button class="btn paginate-border-left" onclick="handlePagination(\'first\')">
                            <i class="fa fa-angle-double-left"></i>
                        </button>
                        <button class="btn paginate-border-left" onclick="handlePagination(\'prev\')">
                            <i class="fa fa-angle-left"></i>
                        </button>
                        <input type="text" class="input-field" readonly value="0" id="' . htmlspecialchars($currentPageId, ENT_QUOTES) . '" />
                        <input type="hidden" class="input-field" readonly value="0" id="' . htmlspecialchars($totalPagesId, ENT_QUOTES) . '" />
                        <button class="btn paginate-border-right" onclick="handlePagination(\'next\')">
                            <i class="fa fa-angle-right"></i>
                        </button>
                        <button class="btn paginate-border-right" onclick="handlePagination(\'last\')">
                            <i class="fa fa-angle-double-right"></i>
                        </button>
                    </div>
                    <div class="d-flex flex-row align-items-center">
                        <p class="m-0" id="' . htmlspecialchars($pageOfPageId, ENT_QUOTES) . '">Page 0 of 0</p>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="d-flex flex-row align-items-center">
                        <p class="m-0" id="' . htmlspecialchars($rangeOfRecordsId, ENT_QUOTES) . '">Records 0-0 of 0</p>
                    </div>
                </div>
            </div>
        </div>';
    }
}

/**
 * Calculate the offset for pagination based on the current page and limit.
 *
 * @param int $currentPage The current page number.
 * @param int $limit The number of items per page.
 * @return int The calculated offset.
 */
if (!function_exists('get_limit_offset')) {
    function get_limit_offset($currentPage, $limit)
    {
        // Validate inputs
        $currentPage = max(1, (int)$currentPage);
        $limit = max(1, (int)$limit);

        // Calculate and return offset
        return ($currentPage - 1) * $limit;
    }
}


/**
 * Calculate the total number of pages based on total records and limit per page.
 *
 * @param int $totalRecords The total number of records.
 * @param int $limit        The number of records per page.
 *
 * @return int The total number of pages needed.
 */
if (!function_exists('generatePages')) {
    function generatePages($totalRecords = 0, $limit = 10)
    {
        // Ensure valid, non-zero parameters
        $totalRecords = (int)$totalRecords;
        $limit = max(1, (int)$limit); // Ensures limit is at least 1

        return $totalRecords > 0 ? (int)ceil($totalRecords / $limit) : 1;
    }
}
