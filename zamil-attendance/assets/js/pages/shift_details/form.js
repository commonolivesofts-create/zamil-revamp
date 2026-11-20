const FORM_ROOT_URL = (() => {
    const raw =
        typeof baseURL !== "undefined" && baseURL
            ? String(baseURL)
            : `${window.location.origin}/`;
    return raw.endsWith("/") ? raw : `${raw}/`;
})();

document.addEventListener("DOMContentLoaded", () => {
    const shiftSelectionForm = document.getElementById("shiftSelectionForm");
    const shiftSelect = document.getElementById("shift_uuid_select");
    const detailForm = document.getElementById("shiftDetailForm");
    const saveBtn = document.getElementById("saveShiftDetailBtn");

    if (shiftSelect && shiftSelectionForm) {
        shiftSelect.addEventListener("change", () => {
            const selectedValue = String(shiftSelect.value || "").trim();

            if (selectedValue === "") {
                window.location.href = `${FORM_ROOT_URL}shift-details/create`;
                return;
            }

            window.location.href = `${FORM_ROOT_URL}shift-details/create?shift_uuid=${encodeURIComponent(
                selectedValue,
            )}`;
        });
    }

    if (detailForm && saveBtn) {
        detailForm.addEventListener("submit", () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
        });
    }
});