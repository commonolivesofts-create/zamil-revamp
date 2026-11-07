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
  cacheKey = "hr-employees",
}) {
  const listId = useId();
  const statusId = useId();
  const controlRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [popupStyle, setPopupStyle] = useState(null);
  const search = useSettled(query.trim(), 250);
  const pendingSearch = open && search !== query.trim();
  const results = useResource(
    open ? `${cacheKey}:${search.toLowerCase()}` : null,
    (signal) => searchService(search, { signal }),
  );
  const matches =
    !pendingSearch && results.status === "ready" ? results.data.items : [];

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
    : pendingSearch || results.status === "loading"
      ? PICKER_TEXT.searching
      : results.status === "error"
        ? PICKER_TEXT.failed
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
      setActive((index) => Math.min(matches.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      pick(matches[active]);
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
          disabled={disabled}
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
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
          {(pendingSearch || results.status === "loading") && (
            <li className="zrv-hr-combo__none" role="presentation">
              {PICKER_TEXT.searching}
            </li>
          )}
          {!pendingSearch && results.status === "error" && (
            <li className="zrv-hr-combo__none" role="presentation">
              {PICKER_TEXT.failed}
            </li>
          )}
          {matches.map((employee, index) => (
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
          {!pendingSearch && results.status === "ready" && !matches.length && (
            <li className="zrv-hr-combo__none" role="presentation">
              {PICKER_TEXT.noMatch}
            </li>
          )}
        </ul>,
        document.body,
      )}
      <span
        id={statusId}
        className="zrv-hr-sr"
        role="status"
        aria-live="polite"
      >
        {status}
      </span>
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}
