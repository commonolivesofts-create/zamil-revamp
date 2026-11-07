import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { useResource } from "@/features/security-administration/useAdminData.js";
import { PICKER_TEXT } from "../../hrRecruitmentText.js";
import { initials } from "../hrFormat.js";
import { useSettled } from "../useSettled.js";

// Searchable employee picker (ARIA combobox with a listbox). Arrow keys move
// through the options, Enter picks, Escape closes; results come from the
// employee search service as the user types. `tight` is the denser variant
// (no avatar, list under the input); `cacheKey` separates the cached results
// of search services that return different employee shapes.
export function EmployeePicker({
  id,
  label,
  required = false,
  value,
  onPick,
  error,
  describedBy,
  searchService,
  placeholder = PICKER_TEXT.placeholder,
  tight = false,
  disabled = false,
  loading = false,
  loadingLabel,
  cacheKey = "hr-employees",
}) {
  const listId = useId();
  const statusId = useId();
  const controlRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [popupStyle, setPopupStyle] = useState(null);
  const fieldLabel = typeof label === "string" ? label.toLocaleLowerCase() : "field";
  const search = useSettled(query.trim(), 250);
  const pendingSearch = open && search !== query.trim();
  const results = useResource(
    open ? `${cacheKey}:${search.toLowerCase()}` : null,
    (signal) => searchService(search, { signal }),
  );
  const matches =
    !loading && !pendingSearch && results.status === "ready" ? results.data.items : [];
  // Keep large employee, department and job-title masters cheap to paint. Users
  // can narrow the list by typing, while keyboard navigation stays within the
  // same visible results as the pointer.
  const maxVisibleMatches = 80;
  const visibleMatches = matches.slice(0, maxVisibleMatches);
  const hasMoreMatches = matches.length > visibleMatches.length;
  const waitingForOptions = loading || (open && (pendingSearch || results.status === "loading"));
  const failedToLoad = open && !loading && results.status === "error";
  const fieldLoadingLabel = loadingLabel ?? `Loading ${fieldLabel} options…`;
  const fieldStatus = loading
    ? fieldLoadingLabel
    : pendingSearch || (open && results.status === "loading")
      ? `Loading ${fieldLabel} options…`
      : failedToLoad
        ? `Couldn’t load ${fieldLabel} options.`
        : "";

  useEffect(() => {
    if (!open) return undefined;
    const positionPopup = () => {
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect) return;
      const theme = window.getComputedStyle(controlRef.current);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const openUp = below < 180 && above > below;
      setPopupStyle({
        "--zrv-hr-accent": theme.getPropertyValue("--zrv-hr-accent"),
        "--zrv-hr-accent-text": theme.getPropertyValue("--zrv-hr-accent-text"),
        "--zrv-hr-shadow": theme.getPropertyValue("--zrv-hr-shadow"),
        fontFamily: theme.fontFamily,
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 2147483647,
        maxHeight: Math.max(100, Math.min(280, openUp ? above : below)),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    };
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [open]);
  const status = !open
    ? ""
    : waitingForOptions
      ? fieldStatus
      : results.status === "error"
        ? fieldStatus
        : PICKER_TEXT.results(matches.length);

  const pick = (employee) => {
    onPick(employee);
    setQuery("");
    setOpen(false);
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => visibleMatches.length ? Math.min(visibleMatches.length - 1, index + 1) : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => visibleMatches.length ? Math.max(0, index - 1) : 0);
    } else if (event.key === "Enter" && open && visibleMatches[active]) {
      event.preventDefault();
      pick(visibleMatches[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div
      className={`zrv-hr-combo${tight ? " zrv-hr-combo--tight" : ""}${error ? " zrv-hr-is-bad" : ""}`}
    >
      <label htmlFor={id}>
        {label}
        {required && (
          <i className="zrv-hr-req" aria-hidden="true">
            *
          </i>
        )}
      </label>
      <div className="zrv-hr-combo__in" ref={controlRef}>
        {!tight && (
          <span className="zrv-hr-combo__av" aria-hidden="true">
            {initials(value?.name)}
          </span>
        )}
        <input
          id={id}
          role="combobox"
          className={`ux-input zrv-hr-input${value?.employeeNumber && !open ? " zrv-hr-combo__selected" : ""}`}
          autoComplete="off"
          placeholder={placeholder}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          aria-busy={waitingForOptions || undefined}
          disabled={disabled || loading}
          aria-activedescendant={open && visibleMatches[active] ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={[
            error ? `${id}-error` : null,
            describedBy,
            statusId,
          ]
            .filter(Boolean)
            .join(" ")}
          value={open ? query : (value?.name ?? query)}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
              setActive(0);
            }
          }}
          // A typed search that was not picked is not a selection: clear it (legacy
          // rejected an employee number that did not match the list).
          onBlur={() => setTimeout(() => { setOpen(false); setQuery(""); }, 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && popupStyle && createPortal(
        <ul
          className="zrv-hr-combo__list"
          style={popupStyle}
          id={listId}
          role="listbox"
          aria-label={label}
        >
          {waitingForOptions && (
            <li className="zrv-hr-combo__none" role="presentation">
              {fieldStatus}
            </li>
          )}
          {!waitingForOptions && results.status === "error" && (
            <li className="zrv-hr-combo__none" role="presentation">
              {PICKER_TEXT.failed}
            </li>
          )}
          {visibleMatches.map((employee, index) => (
            <li
              key={`${employee.employeeId}-${index}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "zrv-hr-is-active" : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(employee);
              }}
            >
              <b>{employee.name}</b>
              {[employee.employeeNumber, PICKER_TEXT.option(employee)].filter(
                Boolean,
              ).length > 0 && (
                <small>
                  {[employee.employeeNumber, PICKER_TEXT.option(employee)]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              )}
            </li>
          ))}
          {!waitingForOptions && results.status === "ready" && !matches.length && (
            <li className="zrv-hr-combo__none" role="presentation">
              {PICKER_TEXT.noMatch}
            </li>
          )}
          {!waitingForOptions && hasMoreMatches && (
            <li className="zrv-hr-combo__none" role="presentation">
              Showing the first {maxVisibleMatches} of {matches.length}. Type to narrow the list.
            </li>
          )}
        </ul>,
        document.body,
      )}
      <span
        id={statusId}
        className={fieldStatus ? `zrv-hr-field-loading${failedToLoad ? " zrv-hr-field-loading--error" : ""}` : "zrv-hr-sr"}
        role="status"
        aria-live="polite"
      >
        {fieldStatus ? <><i aria-hidden="true" />{fieldStatus}{failedToLoad && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={results.reload}>Retry</button>}</> : status}
      </span>
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}
