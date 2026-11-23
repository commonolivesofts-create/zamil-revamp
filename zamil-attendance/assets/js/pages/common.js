// Save Form Data
function resetForm() {
    if (confirm("Do you want to reset form?")) {
        window.location.reload();
    }
}
function showErrors(errors, id_lbl = "lbl") {
    // Loop through each error field in the errors object
    for (const fieldName in errors) {

        if (errors.hasOwnProperty(fieldName)) {
            const errorMessage = errors[fieldName];
            const errorElement = document.getElementById(`${id_lbl}-${fieldName}`);
            if (errorElement) {
                // Update the span element with the error message
                errorElement.innerHTML = errorMessage;
                // Optionally, add a CSS class to highlight the error, e.g., errorElement.classList.add('text-danger');
            }
        }
    }
}

function hideErrors(class_name = "err-lbl") {
    const errorLabels = document.querySelectorAll(`.${class_name}`); // Select all elements with class 'err-lbl'

    errorLabels.forEach((label) => {
        label.innerHTML = ""; // Clear innerHTML of each error label
    });
}

function validateNumberInput(input) {
    // Allow only digits and decimal points
    input.value = input.value.replace(/[^\d.]/g, '');
}


function getCookie(name) {
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieArray = decodedCookie.split(';');
    const cookieName = name + "=";

    for (let cookie of cookieArray) {
        let c = cookie.trim();
        if (c.indexOf(cookieName) === 0) {
            return c.substring(cookieName.length, c.length);
        }
    }
    return null; // Return null if the cookie is not found
}

function toasterNotification(options) {
    Toastify({
        text: options?.message,
        duration: 3000,
        close: true,
        gravity: "top", // `top` or `bottom`
        position: "right", // `left`, `center` or `right`
        stopOnFocus: true, // Prevents dismissing of toast on hover
        style: {
            background: `${options?.type === 'success' ? "#72BF78" : "#FF4545"}`,
        },
        // onClick: function () { } // Callback after click
    }).showToast();
}

function filterCriterias(filters = []) {

    if (filters != []) {
        // Create an object to hold the values
        let filteredObject = {};
        // Loop through the filters to get values from DOM elements
        filters.forEach(filter => {
            let element = document.getElementById(filter); // Get the element by ID
            if (element && element.value) { // Check if element exists and has a non-empty value
                filteredObject[filter] = element.value; // Use the filter name as the key
            }
        });
        // Return the object as a JSON string
        return filteredObject;
    }
    return {};
}

function uuid_v4() {
    // Generate 16 random bytes (128 bits)
    const data = crypto.getRandomValues(new Uint8Array(16));

    // Set the version to 4 (UUID v4)
    data[6] = (data[6] & 0x0f) | 0x40;

    // Set the variant to RFC 4122
    data[8] = (data[8] & 0x3f) | 0x80;

    // Format as UUID (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
    return [...data]
        .map((b, i) =>
            [4, 6, 8, 10].includes(i) ? `-${b.toString(16).padStart(2, '0')}` : b.toString(16).padStart(2, '0')
        )
        .join('');
}

/**
 * Escapes special characters in a string to make it safe for use in code.
 * Specifically, it escapes single quotes, double quotes, and backslashes.
 * @param {string} str - The input string to be escaped.
 * @returns {string} - The escaped string.
 */
function escapeSpecialCharacters(str) {
    if (typeof str !== 'string') {
        throw new TypeError('Input must be a string');
    }
    // Escape single quotes, double quotes, and backslashes
    return str.replace(/['"\\]/g, '\\$&');
}

// Debounce function
function debounce(func, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer); // Clear the previous timeout
        timer = setTimeout(() => func.apply(this, args), delay); // Set a new timeout
    };
}

// Feed Acitvity

let currentActivityModule = '';
let currentActivityRecordId = 0;
let currentActivityData = [];

function openActivitySidebar(moduleName, recordId, title = 'Activity Feed', subtitle = 'Latest updates') {
    if (!moduleName || !recordId) return;

    currentActivityModule = moduleName;
    currentActivityRecordId = Number(recordId || 0);

    const sidebar = document.getElementById('activitySidebar');
    const backdrop = document.getElementById('activitySidebarBackdrop');
    const titleEl = document.getElementById('activitySidebarTitle');
    const subTitleEl = document.getElementById('activitySidebarSubTitle');
    const searchEl = document.getElementById('activitySidebarSearch');

    if (titleEl) titleEl.textContent = title;
    if (subTitleEl) subTitleEl.textContent = subtitle;
    if (searchEl) searchEl.value = '';

    if (sidebar) sidebar.classList.add('show');
    if (backdrop) backdrop.classList.add('show');

    document.body.style.overflow = 'hidden';

    fetchActivityFeed(moduleName, currentActivityRecordId, 'activitySidebarBody');
}

function closeActivitySidebar() {
    const sidebar = document.getElementById('activitySidebar');
    const backdrop = document.getElementById('activitySidebarBackdrop');

    if (sidebar) sidebar.classList.remove('show');
    if (backdrop) backdrop.classList.remove('show');

    document.body.style.overflow = '';
}

async function fetchActivityFeed(moduleName, recordId, containerId = 'activitySidebarBody') {
    if (!moduleName || !recordId) return;

    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="activity-sidebar-loading">Loading activity...</div>`;
    }

    try {
        const authToken = validateUserAuthToken();
        if (!authToken) return;

        const response = await fetch(`${apiURL}activities/${moduleName}/${recordId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`

            }
        });

        const data = await response.json();

        if (!response.ok || data.status !== true) {
            throw new Error(data.message || 'Failed to fetch activity feed.');
        }

        currentActivityData = data.data || [];
        renderActivityFeed(currentActivityData, containerId);
    } catch (error) {
        console.error(error);
        if (container) {
            container.innerHTML = `<div class="activity-empty-state">Unable to load activity feed.</div>`;
        }
    }
}

function renderActivityFeed(activities = [], containerId = 'activitySidebarBody') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!activities.length) {
        container.innerHTML = `<div class="activity-empty-state">No activity found.</div>`;
        return;
    }

    let html = `<div class="activity-feed-list compact">`;

    activities.forEach(activity => {
        html += `
            <div class="activity-item compact"
                 data-activity-text="${escapeHtmlAttr((activity.message || '') + ' ' + (activity.full_name || ''))}">
                
                <div class="activity-icon compact">
                    ${getActivityIcon(activity.action_type || '')}
                </div>

                <div class="activity-content compact">
                    <div class="activity-message compact">
                        ${escapeHtml(activity.message || 'Activity updated')}
                    </div>
                    <div class="activity-meta compact">
                        <span>${escapeHtml(activity.full_name || 'System')}</span>
                        <span class="activity-dot">•</span>
                        <span>${formatAppDateTime(activity.created_at)}</span>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;

    container.innerHTML = html;
}

function formatAppDateTime(dateTimeValue) {
    if (!dateTimeValue) return '-';

    const dateObj = new Date(dateTimeValue);
    if (isNaN(dateObj.getTime())) return dateTimeValue;

    const formattedDate = typeof formatAppDate === 'function'
        ? formatAppDate(dateTimeValue)
        : `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`;

    let hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${formattedDate} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}




function escapeHtml(value = '') {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function escapeHtmlAttr(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function repeatAndAppendSkeletonContent(elementId, htmlContent, repeatCount) {
    if (!elementId || typeof elementId !== "string") {
        console.error("Skeleton Helper - Invalid element ID provided.");
        return;
    }

    const targetElement = document.getElementById(elementId);

    if (!targetElement) {
        console.error(`Skeleton Helper - No element found with ID: ${elementId}`);
        return;
    }

    if (!Number.isInteger(repeatCount) || repeatCount <= 0) {
        console.error("Skeleton Helper - Repeat count must be a positive integer.");
        return;
    }

    let repeatedContent = "";
    for (let i = 0; i < repeatCount; i++) {
        repeatedContent += htmlContent;
    }

    // Try tbody only if this is a table
    const targetTbody = targetElement.querySelector("tbody");
    if (targetTbody) {
        targetTbody.innerHTML = repeatedContent;
    } else {
        targetElement.innerHTML = repeatedContent; // fallback for divs
    }
}