import { createRecordAccessRegistry } from '../mapping/recordAccess.js';
import { createSourceHandlerRegistry } from '../mapping/sourceHandlers.js';

/*
 * The ONLY composition point for form-owned Workflow Manager integrations (G3-approved, M2-0).
 *
 * Each entry is an explicit import of a provider or handler exported by a business form's own
 * module, added in a reviewed change authorized for that form. Nothing registers itself on
 * import, and generic Workflow Manager code never imports business modules directly.
 *
 * Empty in M2-0: no business form is integrated. Consequently HANDLER data sources are refused
 * (M1 SOURCE_HANDLER_NOT_ALLOWED) and record access is unavailable for every form.
 */
export const sourceHandlerRegistry = createSourceHandlerRegistry([]);

export const recordAccessRegistry = createRecordAccessRegistry([]);
