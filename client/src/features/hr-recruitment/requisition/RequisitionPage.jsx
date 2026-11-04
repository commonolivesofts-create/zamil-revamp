import { useState } from "react";
import { useNavigate } from "react-router";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import useAuth from "@/features/auth/useAuth.js";
import { useResource } from "@/features/security-administration/useAdminData.js";
import usePermissions from "@/features/access/usePermissions.js";
import { ConfirmDialog } from "@/features/security-administration/components/AdminUi.jsx";
import { COMMON_TEXT, REQUISITION_TEXT as T } from "../hrRecruitmentText.js";
import {
  attachmentsSupported,
  hrRecruitmentServices,
} from "../hrRecruitmentService.js";
import { businessToday, enDate } from "../shared/hrFormat.js";
import { useRecruitmentForm } from "../shared/useRecruitmentForm.js";
import { RecruitmentLoader } from "../shared/components/RecruitmentLoader.jsx";
import { NewFormDialog } from "../shared/components/RecruitmentDialogs.jsx";
import {
  Orbit,
  Pill,
  RecruitmentShell,
  StepHead,
  Tilt,
} from "../shared/components/RecruitmentShell.jsx";
import { EmployeePicker } from "../shared/components/EmployeePicker.jsx";
import { fieldProps } from "@/features/security-administration/adminForms.js";
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from "../hrRecruitmentActions.js";
import {
  ChoiceCards,
  ExpTrack,
  FileDrop,
  HrField,
  MultiTiles,
  Review,
  SearchableLookup,
  TagInput,
} from "../shared/components/RecruitmentInputs.jsx";
import {
  blankRequisition,
  EDUCATION_FIELDS,
  EXPERIENCE_BANDS,
  isRequisitionLocked,
  leadTime,
  requisitionFormFromRecord,
  requisitionPayload,
  requisitionProgress,
  REQUISITION_VALIDATION_FIELDS,
} from "./requisitionModel.js";

const BASE = "/hr/recruitment/requisition";
const service = hrRecruitmentServices.requisitions;

export default function RequisitionPage() {
  return (
    <RecruitmentLoader
      current="requisition"
      title={T.title}
      param="requisitionId"
      load={service.getById}
      loadLookups={(signal) => service.getLookups({ signal })}
    >
      {({ lookups, lookupStatus, reloadLookups, record, editorKey }) => (
        <RequisitionEditor
          key={editorKey}
          lookups={lookups}
          lookupStatus={lookupStatus}
          reloadLookups={reloadLookups}
          record={record}
        />
      )}
    </RecruitmentLoader>
  );
}

const nameOf = (options, id) =>
  options.find((option) => option.id === id)?.name ?? "";

function RequisitionEditor({
  lookups,
  lookupStatus,
  reloadLookups,
  record: savedRecord,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const permissions = usePermissions();
  const today = businessToday();
  const loggedInName = user?.fullName?.trim() || "";
  const editor = useRecruitmentForm({
    basePath: BASE,
    idKey: "requisitionId",
    record: savedRecord,
    initialForm: savedRecord
      ? requisitionFormFromRecord(savedRecord, today)
      : blankRequisition(today),
    validationFields: REQUISITION_VALIDATION_FIELDS,
  });
  const { form, set, record, step, setStep } = editor;
  const [dialog, setDialog] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [furthestUnlocked, setFurthestUnlocked] = useState(0);
  const locked = isRequisitionLocked(record?.status) && !lookups.capabilities?.canManageTicket;
  const canSave = record
    ? permissions.can(ACTIONS.REQUISITION_UPDATE)
    : permissions.can(ACTIONS.REQUISITION_CREATE);
  const canDelete = Boolean(
    record &&
    record.status === "Draft" &&
    permissions.can(ACTIONS.REQUISITION_DELETE),
  );
  const canRemoveAttachment = permissions.can(
    ACTIONS.REQUISITION_MANAGE_ATTACHMENTS,
  );
  // The backend trims the name and echoes it back; send it trimmed so the echo matches.
  const budgetName = form.replacementFor.trim();
  const budget = useResource(
    budgetName ? `hr-requisition-budget:${budgetName}` : null,
    (signal) => service.getBudget(budgetName, { signal }),
  );
  const progress = requisitionProgress(form);
  const unlockedStep = Math.max(furthestUnlocked, progress.unlockedStep);
  // Keep completed steps available when an earlier answer is edited again.
  if (unlockedStep > furthestUnlocked) setFurthestUnlocked(unlockedStep);
  // Navigation state must not open a future step on an incomplete form.
  if (step > unlockedStep) setStep(unlockedStep);
  const continueStep = () => {
    const missing = progress.missing.filter((check) => check.step === step);
    if (!missing.length) return true;
    setShowErrors(true);
    editor.reject(step);
    return false;
  };
  const errors = {
    ...(showErrors ? Object.fromEntries(progress.missing.map((check) => [check.key, `Please complete ${check.label}.`])) : {}),
    ...editor.fieldErrors,
  };
  const lead = leadTime(today, form.neededDate);
  const department =
    form.departmentName || nameOf(lookups.departments, form.departmentId);
  const departmentsLoading = lookupStatus === "loading";
  const lookupErrors = lookups.lookupErrors ?? [];
  const lookupNotice =
    lookupStatus === "loading" ? (
      <p className="zrv-admin-state" role="status">
        Loading form options… You can start filling the other fields.
      </p>
    ) : lookupStatus === "error" || lookupErrors.length ? (
      <div className="zrv-admin-state zrv-admin-state--error" role="alert">
        <p>
          Some form options could not be loaded. You can still enter job title
          and replacement details directly; retry to reload available choices.
        </p>
        <button type="button" className="btn-secondary" onClick={reloadLookups}>
          Retry
        </button>
      </div>
    ) : null;
  const bands = EXPERIENCE_BANDS;
  const statusLabel = T.status[record?.status ?? "NEW"];
  const isDraft = !record || record.status === "Draft";
  const saveLabel = isDraft ? T.primary : "Save Changes";
  const packageValue =
    form.totalPackage !== ""
      ? form.totalPackage
      : (budget.data?.totalPackage ?? "");
  const body = () =>
    requisitionPayload({ ...form, totalPackage: packageValue });
  const updateJobTitle = (jobTitle, selectedJob = null) => {
    const job = selectedJob ?? lookups.jobs.find(
      (item) => item.name.toLowerCase() === jobTitle.trim().toLowerCase(),
    );
    const patch = { jobTitle, jobId: job?.id ?? "" };
    if (job?.departmentId) {
      const dept = lookups.departments.find(
        (item) => item.id === job.departmentId,
      );
      patch.departmentId = dept?.id ?? "";
      patch.departmentName = dept?.name ?? "";
    } else if (job && form.jobId !== job.id) {
      patch.departmentId = "";
      patch.departmentName = "";
    } else if (
      !job &&
      form.jobId &&
      form.jobTitle.trim().toLowerCase() !== jobTitle.trim().toLowerCase()
    ) {
      patch.departmentId = "";
      patch.departmentName = "";
    }
    editor.patch(patch);
  };

  const save = async () => {
    if (saving || editor.pending) return;
    if (progress.missing.length) {
      setShowErrors(true);
      editor.reject(progress.firstStep);
      return;
    }
    setSaving(true);
    try {
      return await editor.perform(
        async ({ saved }) => {
          const result = await service.saveDraft(
            editor.recordId,
            body(),
            form.requestDate || today,
            form.attachments,
          );
          saved(result);
          return result;
        },
        { success: (result) => T.saved(result.requisitionNumber, result.status) },
      );
    } finally {
      setSaving(false);
    }
  };

  const saveFromReview = () => {
    if (progress.missing.length) {
      setShowErrors(true);
      editor.reject(progress.firstStep);
      return;
    }
    save();
  };
  const removeAttachment = async (file) => {
    if (!record?.requisitionId || !file?.attachmentId || !canRemoveAttachment)
      return;
    const outcome = await editor.perform(
      async () => {
        await service.removeAttachment(record.requisitionId, file.attachmentId);
        return true;
      },
      { success: T.files.removed(file.fileName) },
    );
    if (outcome.status === "success") {
      editor.resetToSaved(record, {
        ...form,
        attachments: form.attachments.filter(
          (item) => item.attachmentId !== file.attachmentId,
        ),
      });
    }
  };
  const deleteDraft = () =>
    editor
      .perform(
        async () => {
          await service.deleteDraft(record.requisitionId);
          return true;
        },
        { success: T.deleted },
      )
      .then((outcome) => {
        if (outcome.status === "success") navigate(BASE, { replace: true });
      });
  // Leaving with unsaved answers asks first (New form and Report).
  const leave = (path) =>
    editor.dirty ? setDialog({ path }) : navigate(path);

  // The primary button saves, so the toolbar has no second Save.
  const tools = [
    {
      icon: "printer",
      label: COMMON_TEXT.print,
      onClick: () => window.print(),
    },
    {
      icon: "chart-column",
      label: COMMON_TEXT.report,
      onClick: () => leave(`${BASE}/report`),
    },
    ...(canDelete
      ? [
          {
            icon: "trash-2",
            label: T.deleteAction,
            onClick: () => setDialog("delete"),
            disabled: editor.pending,
          },
        ]
      : []),
    {
      icon: "file-plus",
      label: T.report.newRequisition,
      onClick: () => leave(BASE),
    },
    {
      icon: "house",
      label: COMMON_TEXT.home,
      onClick: () => navigate("/dashboard"),
    },
  ];
  const ticketStatus = record?.ticketStatus || T.ticket.open;
  const selectedEducation = EDUCATION_FIELDS.filter(
    ([key]) => form[key] === "yes",
  ).map(([, label]) => label);
  const skillList = form.skills
    ? form.skills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const selectedEducationCodes = EDUCATION_FIELDS.filter(
    ([key]) => form[key] === "yes",
  ).map(([key]) => key);
  const educationOptions = EDUCATION_FIELDS.map(([code, name], index) => ({
    code,
    name,
    level: index + 1,
  }));
  const experienceOptions = bands.map((code) => ({ code, name: code }));
  const reviewChecks = new Map(progress.checks.map((check) => [check.key, check.ok]));
  const reviewField = (label, value, checkKey = null) => {
    const hasValue = value !== null && value !== undefined && String(value).trim() !== "" && value !== COMMON_TEXT.dash;
    return {
      label,
      value: hasValue ? value : "",
      hasValue,
      required: checkKey ? reviewChecks.has(checkKey) : false,
      complete: checkKey ? Boolean(reviewChecks.get(checkKey)) : hasValue,
    };
  };
  const reviewSections = [
    {
      title: "Position and request details",
      rows: [
        reviewField(T.labels.requester, form.requesterName),
        reviewField(T.labels.requestDate, enDate(form.requestDate)),
        reviewField(T.labels.jobTitle, form.jobTitle, "jobTitle"),
        reviewField(T.labels.department, department, "departmentId"),
        reviewField(T.labels.neededDate, enDate(form.neededDate), "neededDate"),
        ...(record ? [
          reviewField(T.labels.ticketStatus, <Pill tone={record.ticketStatus === "Close" ? "ok" : "warn"}>{T.report.ticketStatus[record.ticketStatus || "Open"]}</Pill>),
          ...(record.acceptedDate ? [reviewField("Offer accepted date", enDate(record.acceptedDate))] : []),
          ...(record.closedDate ? [reviewField("Filled / closed date", enDate(record.closedDate))] : []),
        ] : []),
      ],
    },
    {
      title: "Reason and budget",
      rows: [
        reviewField(T.labels.reason, form.reason === "REPLACEMENT" ? "Replacement" : form.reason === "ADDITION" ? "Additional headcount" : "", "reason"),
        reviewField(form.reason === "REPLACEMENT" ? T.labels.replacementFor : T.labels.additionReason,
          form.reason === "REPLACEMENT" ? form.replacementFor : form.reason === "ADDITION" ? form.additionReason : "",
          form.reason === "REPLACEMENT" ? "replacementFor" : form.reason === "ADDITION" ? "additionReason" : null),
        reviewField(T.labels.budgeted, form.budgeted === "yes" ? "Yes" : form.budgeted === "no" ? "No" : "", "budgeted"),
        reviewField(T.labels.budgetedSalary, form.budgeted === "yes" ? form.budgetedSalary : "", "budgetedSalary"),
        reviewField(T.labels.basicSalary, packageValue),
        reviewField(T.labels.remark, form.remark),
      ],
    },
    {
      title: "Candidate requirements",
      rows: [
        reviewField(T.labels.education, selectedEducation.join(", "), "educationCodes"),
        reviewField(T.labels.gccExperience, form.gccExp, "gccExp"),
        reviewField(T.labels.workExperience, form.workExp, "workExp"),
        reviewField(T.labels.skills, form.skills, "skills"),
        reviewField(T.labels.otherRequirements, form.otherRequirements),
      ],
    },
    ...(attachmentsSupported ? [{
      title: "Supporting documents",
      rows: [reviewField(T.review.attachments, form.attachments.length ? T.review.files(form.attachments.length) : "")],
    }] : []),
  ];
  const steps = T.tabNames.map((name, index) => {
    if (index === T.tabNames.length - 1)
      return [
        name,
        progress.missing.length
          ? T.tabHints.open(progress.missing.length)
          : T.tabHints.ready,
      ];
    const checks = progress.checks.filter((check) => check.step === index);
    return [
      name,
      T.tabHints.required(
        checks.filter((check) => check.ok).length,
        checks.length,
      ),
    ];
  });

  return (
    <>
      <RecruitmentShell
        current="requisition"
        title={T.title}
        flowStatus={
          record
            ? [record.requisitionNumber, statusLabel]
                .filter(Boolean)
                .join(" · ")
            : null
        }
        tools={tools}
        primary={{
          label: saving ? "Saving…" : saveLabel,
          icon: "save",
          onClick: () => (step === 3 ? saveFromReview() : save()),
          disabled: !canSave,
        }}
        // The owner requested a button only; approval integration belongs to the senior developer.
        secondaryAction={canSave && (!record || ["Draft", "Rejected"].includes(record.status))
          ? {
              label: "Submit for Approval",
              icon: "send",
              onClick: () => editor.showNotice(
                "The approval workflow is pending setup. This requisition has not been submitted.",
              ),
            }
          : null}
        feedback={editor.feedback}
        feedbackMode="toast"
        onDismissFeedback={editor.dismiss}
        lookupNotice={lookupNotice}
        locked={locked}
        pending={editor.pending}
        pendingMessage={saving ? "Saving personnel requisition" : null}
        banner={isDraft ? <p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span><strong>Save Draft</strong> stores your requisition without starting the approval workflow.</span></p> : null}
        focusError={editor.focusError}
        steps={steps}
        step={step}
        onStep={setStep}
        lockedSteps={steps.map((_, index) => index > unlockedStep)}
        onContinue={continueStep}
        doneSteps={progress.doneSteps}
        finalLabel={saving ? "Saving…" : saveLabel}
        onFinal={saveFromReview}
        side={
          <>
            <Tilt aria-label={T.card.label}>
              <div className="zrv-hr-dark__top">
                <span className="zrv-hr-mono">
                  {record?.requisitionNumber || T.card.numberPending}
                </span>
                <span className="zrv-hr-dark__status">{statusLabel}</span>
              </div>
              <h3
                className={`zrv-hr-dark__title${form.jobTitle.trim() ? "" : " zrv-hr-is-empty"}`}
              >
                {form.jobTitle.trim() || T.card.jobTitle}
              </h3>
              <div
                className={`zrv-hr-dark__sub${department ? "" : " zrv-hr-is-empty"}`}
              >
                {department || T.card.department}
              </div>
              <div className="zrv-hr-dark__badges">
                {form.reason && (
                  <span className="zrv-hr-is-solid">
                    {form.reason === "REPLACEMENT"
                      ? T.card.replacement
                      : T.card.addition}
                  </span>
                )}
                {form.budgeted && (
                  <span>
                    {form.budgeted === "yes"
                      ? T.card.budgeted
                      : T.card.notBudgeted}
                  </span>
                )}
                {form.reason === "REPLACEMENT" &&
                  form.replacementFor.trim() && (
                    <span>
                      {T.card.replacementFor(form.replacementFor.trim())}
                    </span>
                  )}
                {record && <span>{T.ticket.status(ticketStatus)}</span>}
              </div>
              <div className="zrv-hr-dark__grid">
                <div>
                  <small>{T.card.neededBy}</small>
                  <b>
                    {form.neededDate
                      ? enDate(form.neededDate)
                      : COMMON_TEXT.dash}
                  </b>
                </div>
                <div>
                  <small>{T.card.education}</small>
                  <b>{selectedEducation.join(", ") || COMMON_TEXT.dash}</b>
                </div>
                {[
                  [T.labels.gccExperience, form.gccExp],
                  [T.labels.workExperience, form.workExp],
                ].map(([label, code]) => (
                  <div key={label}>
                    <small>{label}</small>
                    <b>{code || COMMON_TEXT.dash}</b>
                  </div>
                ))}
              </div>
              <div className="zrv-hr-dark__chips">
                {skillList.slice(0, 6).map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
                {skillList.length > 6 && <span>+{skillList.length - 6}</span>}
              </div>
            </Tilt>
            <Orbit
              done={progress.done}
              total={progress.total}
              hint={
                progress.missing.length
                  ? COMMON_TEXT.next(
                      progress.missing.slice(0, 2).map((check) => check.label),
                    )
                  : T.orbitReady
              }
            />
          </>
        }
      >
        {step === 0 && (
          <>
            <StepHead {...T.heads[0]} />
            <div className="zrv-hr-grid zrv-hr-is-4">
              <HrField id="rq-requester" label={T.labels.requester}>
                <input
                  id="rq-requester"
                  className="ux-input zrv-hr-input"
                  value={record?.requesterName || loggedInName}
                  readOnly
                  aria-readonly="true"
                />
              </HrField>
              <HrField id="rq-request-date" label={T.labels.requestDate} error={errors.requestDate}>
                <input
                  {...fieldProps("rq-request-date", { error: errors.requestDate })}
                  className="ux-input zrv-hr-input"
                  value={form.requestDate ? enDate(form.requestDate) : ""}
                  readOnly
                  aria-readonly="true"
                />
              </HrField>
              <HrField
                id="rq-title"
                label={T.labels.jobTitle}
                required
                error={errors.jobTitle}
              >
                <SearchableLookup
                  id="rq-title"
                  value={form.jobId}
                  customValue={form.jobTitle}
                  options={lookups.jobs.map((item) => ({
                    code: item.id,
                    id: item.id,
                    name: item.name,
                    departmentId: item.departmentId,
                  }))}
                  onChange={(option) => updateJobTitle(option.name, option)}
                  onInputChange={updateJobTitle}
                  error={errors.jobTitle}
                  required
                  placeholder={T.placeholders.jobTitle}
                />
              </HrField>
              <HrField
                id="rq-dept"
                label={T.labels.department}
                required
                error={errors.departmentId}
              >
                <SearchableLookup
                  id="rq-dept"
                  value={form.departmentId}
                  disabled={departmentsLoading}
                  loading={departmentsLoading}
                  placeholder={
                    departmentsLoading
                      ? T.placeholders.loadingDepartments
                      : T.placeholders.department
                  }
                  onChange={(dept) => {
                    editor.patch({
                      departmentId: dept?.id ?? "",
                      departmentName: dept?.name ?? "",
                    });
                  }}
                  options={lookups.departments.map((item) => ({
                    code: item.id,
                    id: item.id,
                    name: item.name,
                  }))}
                  required
                  error={errors.departmentId}
                />
              </HrField>
              <HrField
                id="rq-need"
                label={T.labels.neededDate}
                required
                error={errors.neededDate}
                hint={lead && <Pill tone={lead.tone || "ok"}>{lead.text}</Pill>}
              >
                <input
                  {...fieldProps("rq-need", {
                    error: errors.neededDate,
                    hint: lead?.text,
                  })}
                  type="date"
                  className="ux-input zrv-hr-input"
                  value={form.neededDate}
                  onChange={set("neededDate")}
                  aria-required="true"
                />
              </HrField>
              <HrField id="rq-remark" label={T.labels.remark} error={errors.remark} wide>
                <textarea
                  {...fieldProps("rq-remark", { error: errors.remark })}
                  className="ux-textarea zrv-hr-input"
                  value={form.remark}
                  onChange={set("remark")}
                  placeholder={T.placeholders.remark}
                />
              </HrField>
            </div>
            {attachmentsSupported &&
              (canSave ||
                canRemoveAttachment ||
                form.attachments.length > 0) && (
                <>
                  <div className="zrv-hr-sep" />
                  <FileDrop
                    files={form.attachments}
                    onChange={set("attachments")}
                    onRemove={removeAttachment}
                    canRemoveSaved={canRemoveAttachment && Boolean(record)}
                    disabled={!canSave || editor.pending}
                  />
                </>
              )}
          </>
        )}

        {step === 1 && (
          <>
            <StepHead {...T.heads[1]} />
            <ChoiceCards
              compact
              label={T.labels.reason}
              value={form.reason}
              onChange={(reason) =>
                editor.patch({
                  reason,
                  replacementFor:
                    reason === "REPLACEMENT" ? form.replacementFor : "",
                  totalPackage: reason === form.reason ? form.totalPackage : "",
                })
              }
              error={errors.reason}
              options={[
                {
                  value: "REPLACEMENT",
                  icon: "users",
                  ...T.reasons.REPLACEMENT,
                },
                { value: "ADDITION", icon: "plus", ...T.reasons.ADDITION },
              ]}
            />
            {form.reason === "REPLACEMENT" && (
              <div className="zrv-hr-reveal zrv-hr-mt">
                <div
                  className={`zrv-hr-field${errors.replacementFor ? " zrv-hr-is-bad" : ""}`}
                >
                  <EmployeePicker
                    id="rq-rep"
                    label={T.labels.replacementFor}
                    required
                    tight
                    value={
                      form.replacementFor ? { name: form.replacementFor } : null
                    }
                    onPick={(employee) =>
                      editor.patch({
                        replacementFor: employee.name,
                        totalPackage: "",
                      })
                    }
                    error={errors.replacementFor}
                    placeholder={T.placeholders.replacementFor}
                    cacheKey="requisition-replacement-employees"
                    searchService={(query, options) =>
                      query
                        ? service.searchReplacementEmployees(query, options)
                        : {
                            items: lookups.replacements.map((name, index) => ({
                              employeeId: String(index),
                              name,
                            })),
                          }
                    }
                  />
                </div>
              </div>
            )}
            {form.reason === "ADDITION" && (
              <div className="zrv-hr-reveal zrv-hr-mt">
                <HrField
                  id="rq-add"
                  label={T.labels.additionReason}
                  required
                  error={errors.additionReason}
                >
                  <textarea
                    {...fieldProps("rq-add", { error: errors.additionReason })}
                    className="ux-textarea zrv-hr-input"
                    value={form.additionReason}
                    onChange={set("additionReason")}
                    placeholder={T.placeholders.additionReason}
                    aria-required="true"
                  />
                </HrField>
              </div>
            )}
            <div className="zrv-hr-sep" />
            <ChoiceCards
              compact
              label={T.labels.budgeted}
              value={form.budgeted}
              onChange={set("budgeted")}
              error={errors.budgeted}
              options={[
                { value: "yes", icon: "check", ...T.budget.yes },
                { value: "no", icon: "wallet", ...T.budget.no },
              ]}
            />
            <div className="zrv-hr-grid zrv-hr-mt">
              {form.budgeted === "yes" && (
                <div className="zrv-hr-reveal">
                  <HrField
                    id="rq-bud"
                    label={T.labels.budgetedSalary}
                    required
                    error={errors.budgetedSalary}
                  >
                    <input
                      {...fieldProps("rq-bud", {
                        error: errors.budgetedSalary,
                      })}
                      type="number"
                      min="0"
                      inputMode="decimal"
                      className="ux-input zrv-hr-input"
                      value={form.budgetedSalary}
                      onChange={set("budgetedSalary")}
                      placeholder={T.placeholders.budgetedSalary}
                      aria-required="true"
                    />
                  </HrField>
                </div>
              )}
              <HrField id="rq-basic" label={T.labels.basicSalary} error={errors.totalPackage}>
                <div className="zrv-hr-lock">
                  <input
                    {...fieldProps("rq-basic", { error: errors.totalPackage })}
                    className="ux-input zrv-hr-input"
                    readOnly
                    value={packageValue}
                    placeholder={T.placeholders.basicSalary}
                  />
                  <OrvexaIcon name="lock" size={17} />
                </div>
              </HrField>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepHead {...T.heads[2]} />
            <MultiTiles
              label={T.labels.education}
              options={educationOptions}
              value={selectedEducationCodes}
              onChange={(codes) =>
                editor.patch(
                  Object.fromEntries(
                    EDUCATION_FIELDS.map(([key]) => [
                      key,
                      codes.includes(key) ? "yes" : "no",
                    ]),
                  ),
                )
              }
              error={errors.educationCodes}
            />
            <div className="zrv-hr-sep" />
            <div className="zrv-hr-grid">
              <ExpTrack
                label={T.labels.gccExperience}
                options={experienceOptions}
                value={form.gccExp}
                onChange={set("gccExp")}
                error={errors.gccExp}
              />
              <ExpTrack
                label={T.labels.workExperience}
                options={experienceOptions}
                value={form.workExp}
                onChange={set("workExp")}
                error={errors.workExp}
              />
            </div>
            <div className="zrv-hr-sep" />
            <div className="zrv-hr-grid">
              <HrField
                id="rq-skills"
                label={T.labels.skills}
                required
                wide
                hint={T.hints.skills}
                error={errors.skills}
              >
                <TagInput
                  id="rq-skills"
                  value={skillList}
                  onChange={(skills) => set("skills")(skills.join(", "))}
                  placeholder={T.placeholders.skills}
                  invalid={Boolean(errors.skills)}
                  describedBy={
                    errors.skills ? "rq-skills-error" : "rq-skills-hint"
                  }
                />
              </HrField>
              <HrField id="rq-other" label={T.labels.otherRequirements} error={errors.otherRequirements} wide>
                <textarea
                  {...fieldProps("rq-other", { error: errors.otherRequirements })}
                  className="ux-textarea zrv-hr-input"
                  value={form.otherRequirements}
                  onChange={set("otherRequirements")}
                  placeholder={T.placeholders.otherRequirements}
                />
              </HrField>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <StepHead {...T.heads[3]} />
            <Review
              sections={reviewSections}
              complete={progress.done}
              total={progress.total}
              reference={record?.requisitionNumber || "New requisition"}
              approvalStatus={statusLabel}
            />
          </>
        )}
      </RecruitmentShell>

      {dialog?.path && (
        <NewFormDialog
          onConfirm={() => {
            const { path } = dialog;
            setDialog(null);
            navigate(path);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title={T.deleteTitle}
          description={T.deleteBody}
          confirmLabel={T.deleteAction}
          pending={editor.pending}
          feedback={editor.feedback}
          onConfirm={deleteDraft}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
