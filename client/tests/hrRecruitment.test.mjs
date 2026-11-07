// HR forms use the existing authenticated backend contracts. These tests cover
// frontend field mapping and permissions without Oracle, browser storage or demo records.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { apiClient } from "../src/services/api/apiClient.js";
import { registeredModules, registry } from "../src/config/registry/index.js";
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from "../src/features/hr-recruitment/hrRecruitmentActions.js";
import {
  hrRecruitmentServices,
  createHrRecruitmentServices,
  segment,
} from "../src/features/hr-recruitment/hrRecruitmentService.js";
import {
  blankRequisition,
  requisitionPayload,
  requisitionProgress,
  REQUISITION_VALIDATION_FIELDS,
} from "../src/features/hr-recruitment/requisition/requisitionModel.js";
import { activeRecruitmentErrors, recruitmentValidation } from "../src/features/hr-recruitment/shared/recruitmentFieldErrors.js";
import {
  blankInterview,
  interviewPayload,
  validateInterview,
  SPEC_KEYS,
  COMP_KEYS,
} from "../src/features/hr-recruitment/interview/interviewModel.js";
import {
  blankOffer,
  offerPayload,
  validateOffer,
  BENEFIT_KEYS,
} from "../src/features/hr-recruitment/offer/offerModel.js";

const TODAY = "2026-10-28";
const rated = (keys) =>
  Object.fromEntries(keys.map((key) => [key, { rating: 4, remark: "" }]));

test("server validation targets the relevant requisition fields and clears on edits", () => {
  const form = { ...blankRequisition(TODAY), budgetedSalary: "-1", additionReason: "bad" };
  const validation = recruitmentValidation({ code: "VALIDATION_ERROR", details: [
    { field: "budgetedSal", message: '"budgetedSal" must be greater than or equal to 0' },
    { field: "body.reason", message: '"reason" is invalid' },
    { field: "highSchool", message: '"highSchool" is invalid' },
  ] }, REQUISITION_VALIDATION_FIELDS, form);
  assert.equal(validation.step, 1);
  assert.deepEqual(activeRecruitmentErrors(validation.errors, form), {
    budgetedSalary: "Budgeted salary must be greater than or equal to 0",
    additionReason: "Reason for addition is invalid",
    educationCodes: "Education is invalid",
  });
  const corrected = { ...form, budgetedSalary: "100", diploma: "yes" };
  assert.deepEqual(activeRecruitmentErrors(validation.errors, corrected), { additionReason: "Reason for addition is invalid" });
  assert.equal(recruitmentValidation({ code: "FORBIDDEN" }, REQUISITION_VALIDATION_FIELDS, form), null);
  assert.equal(recruitmentValidation({ code: "VALIDATION_ERROR", details: [{ field: "unknown", message: "Invalid request" }] }, REQUISITION_VALIDATION_FIELDS, form), null);
});

test("requisition steps unlock in order, including conditional budget requirements", () => {
  const form = blankRequisition(TODAY);
  assert.equal(requisitionProgress(form).unlockedStep, 0);
  Object.assign(form, { diploma: "yes", gccExp: "0 - 2", workExp: "2 - 5", skills: "Inspection" });
  // Completing later fields cannot skip Position.
  assert.equal(requisitionProgress(form).unlockedStep, 0);
  Object.assign(form, { jobTitle: "Inspector", departmentName: "Quality" });
  assert.equal(requisitionProgress(form).unlockedStep, 1);
  Object.assign(form, { reason: "ADDITION", additionReason: "New production line", budgeted: "yes" });
  assert.equal(requisitionProgress(form).unlockedStep, 1);
  form.budgetedSalary = "5000";
  assert.equal(requisitionProgress(form).unlockedStep, 3);
  form.skills = "";
  assert.equal(requisitionProgress(form).unlockedStep, 2);
  form.reason = "REPLACEMENT";
  assert.equal(requisitionProgress(form).unlockedStep, 1);
  form.replacementFor = "Employee A";
  assert.equal(requisitionProgress(form).unlockedStep, 2);
  form.skills = "Inspection";
  assert.equal(requisitionProgress(form).unlockedStep, 3);
});

test("the active registry grants HR routes only through the backend form resources", () => {
  assert.deepEqual(
    registeredModules.map((module) => module.code),
    [
      "COMMON",
      "SECURITY_ADMINISTRATION",
      // Backend-owned probation, orientation and employee report permissions.
      "HR",
      // Session-only employee services behind VITE_FEATURE_HR_EMPLOYEE_SERVICES (hrEmployeeServices.test.mjs).
      "HR_EMPLOYEE_SERVICES",
      // Workflow Manager M1 (workflowManager.test.mjs); no HR routes.
      "WORKFLOW_MANAGER",
    ],
  );
  for (const key of Object.values(ACTIONS))
    assert.ok(
      registry.permissions.some((permission) => permission.key === key),
      key,
    );
  assert.equal(hrRecruitmentServices.client, apiClient);
  assert.equal(hrRecruitmentServices.requisitions.client, undefined);
});

test("requisition starts blank with today as needed date and maps answers to backend names", () => {
  const blank = blankRequisition(TODAY);
  assert.equal(blank.requestDate, TODAY);
  assert.equal(blank.neededDate, TODAY);
  assert.equal(blank.requesterName, "");
  assert.equal(requisitionProgress(blank).missing.length > 0, true);
  const payload = requisitionPayload({
    ...blank,
    jobId: "12",
    jobTitle: " Inspector ",
    departmentId: "4",
    departmentName: " Quality ",
    reason: "REPLACEMENT",
    replacementFor: "Employee A",
    additionReason: "ignored",
    budgeted: "no",
    budgetedSalary: "9000",
    skills: " SPC ",
    otherRequirements: "",
    remark: "",
    totalPackage: "",
    highSchool: "no",
    diploma: "yes",
    higherDiploma: "no",
    degree: "no",
    masterDegree: "no",
    gccExp: "2 - 5",
    workExp: "5 - 10",
    ticketStatusChanged: false,
  });
  assert.deepEqual(payload, {
    jobId: "12",
    jobName: "Inspector",
    deptId: "4",
    deptName: "Quality",
    dateNeeded: TODAY,
    reasonOfReq: "Replacement",
    replacementFor: "Employee A",
    reason: "",
    budgeted: "N",
    budgetedSal: "",
    highSchool: "N",
    diploma: "Y",
    higherDiploma: "N",
    degree: "N",
    masterDegree: "N",
    gccExp: "2 - 5",
    workExp: "5 - 10",
    skills: "SPC",
    other: "",
    remark: "",
    totalPackage: "",
  });
});

test("interview payload keeps API field names, scores and required assessment answers", () => {
  const form = {
    ...blankInterview(TODAY),
    requisitionNumber: "PR-100",
    preScreeningDate: TODAY,
    divisionCode: "Food",
    interviewTypeCode: "Personal",
    candidateName: "Candidate",
    payroll: "300000003618177",
    spec: rated(SPEC_KEYS),
    comp: rated(COMP_KEYS),
    outcome: "PASSED",
  };
  assert.equal(validateInterview(form).valid, true);
  const payload = interviewPayload(form);
  assert.equal(payload.requisitionNumber, "PR-100");
  assert.equal(payload.preScreeningDate, TODAY);
  assert.equal(payload.personalSpecification.conf.rating, 4);
  assert.equal(payload.competency.jrk.rating, 4);
  assert.equal(payload.outcome, "PASSED");
  assert.equal("assessmentNumber" in payload, false);
  assert.equal(validateInterview(blankInterview(TODAY)).valid, false);
});

test("employment offer starts empty, validates API-required values and serializes bilingual benefits", () => {
  const blank = blankOffer(TODAY);
  assert.equal(blank.offerDate, TODAY);
  assert.deepEqual(
    Object.keys(blank.benefits).sort(),
    [...BENEFIT_KEYS].sort(),
  );
  assert.equal(validateOffer(blank).valid, false);
  const payload = offerPayload({
    ...blank,
    position: " Inspector ",
    candidateNameEn: " Candidate ",
    division: "300000003618177",
    intNo: "INT-1",
    benefits: {
      ...blank.benefits,
      basic: { en: "6000", ar: "ستة آلاف", linked: true },
      start: { en: TODAY, ar: "١٤٤٨", linked: true },
    },
  });
  assert.equal(payload.position, "Inspector");
  assert.equal(payload.candidateNameEn, "Candidate");
  assert.deepEqual(payload.benefits.basic, {
    en: "6000",
    ar: "ستة آلاف",
    autoArabic: true,
  });
  assert.deepEqual(payload.benefits.start, {
    en: TODAY,
    ar: "١٤٤٨",
    autoArabic: true,
  });
  assert.equal(validateOffer({ ...blank, ...payload }).valid, true);
});

test("employment offer live preview keeps the branch layout and three signature spaces separate from print", async () => {
  const preview = await readFile(
    new URL("../src/features/hr-recruitment/offer/OfferLivePreview.jsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../src/features/hr-recruitment/offer/OfferPage.jsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../src/styles/hr-offer-letter.css", import.meta.url),
    "utf8",
  );

  assert.match(preview, /className="zrv-hr-paper zrv-offer-live"/);
  assert.equal((preview.match(/className="zrv-hr-paper__line"/g) ?? []).length, 3);
  assert.match(preview, /Saad Al Essa/);
  assert.match(preview, /Bader Alsulaim/);
  assert.match(page, /<OfferLivePreview\b/);
  assert.match(page, /<OfferLetter\b[^\n]*printSource \/>/);
  assert.match(styles, /\.zrv-hr--offer \.zrv-hr-side \.zrv-offer-letter--print-source \{ display: none; \}/);
  assert.match(styles, /\.zrv-hr--offer \.zrv-offer-letter--print-source \{ display: flex !important; \}/);
});

test("all recruitment services use the supplied API client and validate path IDs", async () => {
  const calls = [];
  const client = {
    get: async (path, options) => {
      calls.push(["GET", path, options]);
      if (path.endsWith("/job-titles"))
        return { data: [{ jobId: "1", name: "Inspector" }] };
      if (path.endsWith("/departments"))
        return { data: [{ deptId: "2", name: "Quality" }] };
      if (path.endsWith("/replacement-for")) return { data: ["Employee A"] };
      if (path.endsWith("/capabilities"))
        return { data: { canManageTicket: false } };
      throw new Error(`Unexpected lookup: ${path}`);
    },
  };
  const services = createHrRecruitmentServices({ client });
  assert.equal(services.client, client);
  const lookups = await services.requisitions.getLookups();
  assert.equal(lookups.requester, "");
  assert.deepEqual(lookups.jobs, [{ id: "1", name: "Inspector" }]);
  assert.deepEqual(
    calls.map((call) => call[1]),
    [
      "/hr/requisitions/lookups/job-titles",
      "/hr/requisitions/lookups/departments",
      "/hr/requisitions/lookups/replacement-for",
      "/hr/requisitions/lookups/capabilities",
    ],
  );
  assert.throws(
    () => segment("../1"),
    (error) => error.code === "INVALID_ID",
  );
  assert.throws(
    () => segment("0"),
    (error) => error.code === "INVALID_ID",
  );
  assert.equal(segment("1"), "1");
});

test("the three forms show no demo text and keep live API wiring", async () => {
  const shell = await readFile(
    new URL(
      "../src/features/hr-recruitment/shared/components/RecruitmentShell.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  const pages = await Promise.all(
    [
      "requisition/RequisitionPage.jsx",
      "interview/InterviewPage.jsx",
      "offer/OfferPage.jsx",
    ].map((page) =>
      readFile(
        new URL(`../src/features/hr-recruitment/${page}`, import.meta.url),
        "utf8",
      ),
    ),
  );
  const service = await readFile(
    new URL(
      "../src/features/hr-recruitment/hrRecruitmentService.js",
      import.meta.url,
    ),
    "utf8",
  );
  // The header badge is opt-in (onboarding screens on demo data only).
  assert.doesNotMatch(shell, /hrRecruitmentDemo/);
  assert.match(
    shell,
    /export function RecruitmentHeader\(\{ title, subtitle, breadcrumb = COMMON_TEXT\.breadcrumb, demo = false \}\)/,
  );
  for (const page of pages)
    assert.doesNotMatch(page, /hrRecruitmentDemo|demo=/);
  assert.match(
    service,
    /client: apiClient,\s*requisitionClient: apiClient,\s*interviewClient: apiClient,\s*offerClient: apiClient/,
  );
  assert.match(service, /const REQUISITIONS_BASE = ["']\/hr\/requisitions["']/);
  assert.match(
    service,
    /const INTERVIEWS_BASE = ["']\/hr\/interview-assessments["']/,
  );
  assert.match(service, /const OFFERS_BASE = ["']\/hr\/employment-offers["']/);
});
