// UI-UX §5.2 expense entry — the most important screen (FR-CAP-01…08, FR-POL-02/03).
// Receipt on the start side, form on the end side, live policy checklist; Save is disabled while
// any rule BLOCKs, and the server re-checks on save (the engine is authoritative).
import type {
  ExpenseDto,
  ExpenseTypeDto,
  ReceiptUploadResponse,
  TripRef,
} from '@expensehub/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Receipt as ReceiptIcon, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm, type UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { Tag } from '../../components/ui/Tag';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { applyServerErrors } from '../../lib/form-errors';
import { formatDate, formatSar, riyadhDate } from '../../lib/format';
import { useDebouncedValue } from '../../lib/use-debounced';
import { ChargeAccountLine } from './ChargeAccountLine';
import {
  emptyForm,
  FORM_FIELDS,
  formFromExpense,
  prefillFromReceipt,
  receiptFromExpense,
  receiptFromUpload,
  toExpenseInput,
  type AttachedReceipt,
  type ExpenseFormValues,
  trimRate,
  type PrefillField,
} from './form';
import {
  useCaptureTypes,
  useCostCenters,
  useCreateExpense,
  useCurrencies,
  useDeleteExpenses,
  useExpense,
  useExpenseEvaluation,
  useMyQuickPays,
  useMyTrips,
  useUpdateExpense,
  useUploadReceipt,
} from './hooks';
import { PolicyChecklist } from './PolicyChecklist';
import { ReceiptPane } from './ReceiptPane';
import { TypeTiles } from './TypeTiles';

const PREFILL_TINT = 'border-brand/50 bg-brand/5';
const EXPENSE_ENTRY_STEPS = [
  { id: 'expense-entry-type', key: 'type' },
  { id: 'expense-entry-details', key: 'details' },
  { id: 'expense-entry-receipt', key: 'receipt' },
] as const;

export function ExpenseEntryPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const expenseId = id ? Number(id) : null;
  const existing = useExpense(expenseId);

  if (expenseId !== null && existing.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="eh-expense-entry__skeleton">
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-[560px]" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-72" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }
  if (expenseId !== null && !existing.data) {
    return (
      <Card>
        <EmptyState
          icon={ReceiptIcon}
          title={t('expenses.entry.notFound')}
          body={t('expenses.entry.notFoundBody')}
          action={
            <Button asChild variant="secondary">
              <Link to="/expenses">{t('expenses.entry.backToList')}</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  return <ExpenseEditor key={expenseId ?? 'new'} expense={existing.data ?? null} />;
}

function ExpenseEditor({ expense }: { expense: ExpenseDto | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const types = useCaptureTypes();
  const currencies = useCurrencies();
  const trips = useMyTrips();
  const quickPays = useMyQuickPays();
  const costCenters = useCostCenters();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const remove = useDeleteExpenses();
  const upload = useUploadReceipt();

  const form = useForm<ExpenseFormValues>({
    defaultValues: expense ? formFromExpense(expense) : emptyForm(),
  });
  const { register, control, watch, setValue, getValues, handleSubmit, setError, reset } = form;
  const { errors, dirtyFields, isSubmitted, isDirty } = form.formState;

  const [receipt, setReceipt] = useState<AttachedReceipt | null>(
    expense ? receiptFromExpense(expense) : null,
  );
  const [prefilled, setPrefilled] = useState<Set<PrefillField>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  // DB-06 / OQ-06: NONE = on a submitted report; LIMITED = info requested (amount, type, date,
  // currency locked). Lines of a report go back to that report after saving.
  const readOnly = expense?.editMode === 'NONE';
  const limited = expense?.editMode === 'LIMITED';
  const backTo = expense?.reportId ? `/reports/${expense.reportId}` : '/expenses';

  const values = watch();
  const type: ExpenseTypeDto | undefined = types.data?.find((x) => x.typeId === values.typeId);
  const category = type?.category;

  // Live checklist: debounce on the serialised input so typing settles before we ask.
  const { input, issues } = toExpenseInput(values, category, receipt?.receiptId ?? null);
  const inputKey = JSON.stringify(input);
  const debouncedKey = useDebouncedValue(inputKey, 350);
  const debouncedInput = useMemo(() => JSON.parse(debouncedKey) as typeof input, [debouncedKey]);
  const evaluation = useExpenseEvaluation(debouncedInput, expense?.expenseId ?? null);
  const ev = input ? evaluation.data : undefined;
  const settled = inputKey === debouncedKey && !evaluation.isFetching;
  const blocked = ev?.level === 'BLOCK';

  // Errors: the user's own submit/server errors, the shared contract, then live API checks.
  const liveIssues =
    evaluation.error instanceof ApiError && evaluation.error.code === 'VALIDATION'
      ? ((evaluation.error.details as { issues?: { path: string; message: string }[] })?.issues ??
        [])
      : [];
  const fieldError = (name: keyof ExpenseFormValues): string | undefined => {
    if (errors[name]?.message) return errors[name].message;
    const local = issues.find((i) => i.path === name)?.message;
    if (local && (dirtyFields[name] || isSubmitted)) return local;
    return liveIssues.find((i) => i.path === name)?.message;
  };

  const untint = (name: PrefillField) =>
    setPrefilled((s) => {
      if (!s.has(name)) return s;
      const next = new Set(s);
      next.delete(name);
      return next;
    });

  const onFile = async (file: File) => {
    let result: ReceiptUploadResponse;
    try {
      result = await upload.mutateAsync(file);
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }
    setReceipt(receiptFromUpload(result));
    const { values: fill, filled } = prefillFromReceipt(getValues(), result);
    for (const [k, v] of Object.entries(fill)) {
      setValue(k as keyof ExpenseFormValues, v as never, { shouldDirty: true });
    }
    setPrefilled(new Set(filled));
    if (result.qr.valid) toast.success(t('expenses.receipt.toastQr'));
    else if (filled.length) toast.info(t('expenses.receipt.toastOcr'));
  };

  const save = (another: boolean) =>
    handleSubmit(async () => {
      if (!input) {
        for (const issue of issues) {
          if ((FORM_FIELDS as readonly string[]).includes(issue.path)) {
            setError(issue.path as keyof ExpenseFormValues, { message: issue.message });
          }
        }
        if (values.typeId === null)
          setError('typeId', { message: t('expenses.form.typeRequired') });
        return;
      }
      try {
        if (expense) {
          await update.mutateAsync({
            id: expense.expenseId,
            body: { ...input, version: expense.version },
          });
          toast.success(t('expenses.entry.updated'));
        } else {
          await create.mutateAsync(input);
          toast.success(t('expenses.entry.created'));
        }
        if (another) {
          reset({ ...emptyForm(), typeId: values.typeId, tripId: values.tripId });
          setReceipt(null);
          setPrefilled(new Set());
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          void navigate(backTo);
        }
      } catch (err) {
        if (applyServerErrors(err, setError, FORM_FIELDS)) return;
        if (err instanceof ApiError && err.code === 'POLICY_BLOCK') {
          await queryClient.invalidateQueries({ queryKey: ['expenses', 'validate'] });
          toast.error(t('expenses.entry.blocked'));
          return;
        }
        toast.error(
          err instanceof ApiError && err.code === 'VERSION_CONFLICT'
            ? t('expenses.entry.conflict')
            : (err as Error).message,
        );
      }
    })();

  const onDelete = async () => {
    if (!expense) return;
    try {
      await remove.mutateAsync([expense.expenseId]);
      toast.success(t('expenses.list.deleted', { count: 1 }));
      void navigate('/expenses');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saving = create.isPending || update.isPending;
  const canSave = !readOnly && input !== null && ev !== undefined && !blocked && !upload.isPending;
  const warnings = ev?.results.filter((r) => r.level === 'WARN').length ?? 0;
  const showJustification =
    type?.justificationReq ||
    !!values.justification ||
    ev?.results.some((r) => r.rule === 'LIMIT' && r.level !== 'PASS');
  const defaultCostCenter = ev?.segments.find((s) => s.segment === 'COST_CENTER');
  const selectedTrip = trips.data?.find((trip) => String(trip.tripId) === values.tripId);
  const previewTitle =
    values.merchant.trim() || type?.name || t('expenses.entry.preview.titlePlaceholder');
  const previewSubtitle =
    values.description.trim() || t('expenses.entry.preview.purposePlaceholder');
  const previewAmountIsSar = !!ev?.amountSar;
  const previewAmount = previewAmountIsSar
    ? formatSar(ev!.amountSar)
    : category === 'STANDARD' && values.amount.trim()
      ? `${values.currency} ${values.amount}`
      : t('expenses.entry.preview.noValue');
  const detailsComplete = Boolean(
    input &&
    type &&
    values.expenseDate &&
    values.description.trim() &&
    (category === 'STANDARD'
      ? values.merchant.trim() && Number(values.amount) > 0
      : category === 'MILEAGE' && Number(values.quantity) > 0),
  );
  const completedSteps = [Boolean(type), detailsComplete, Boolean(receipt)];

  const goToStep = (index: number) => {
    setActiveStep(index);
    document
      .getElementById(EXPENSE_ENTRY_STEPS[index]!.id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link to={backTo} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft aria-hidden className="size-3.5 rtl:rotate-180" />
            {expense?.reportId ? t('nav.reports') : t('nav.expenses')}
          </Link>
        }
        title={expense ? t('expenses.entry.editTitle') : t('expenses.entry.newTitle')}
        description={t('expenses.entry.description')}
      />

      {(readOnly || limited) && (
        <Card className="mb-6 flex items-center gap-3 border-info/30 p-4 text-sm">
          <Lock aria-hidden className="size-4 shrink-0 text-info" />
          {readOnly ? t('expenses.entry.onReport') : t('expenses.entry.infoMode')}
        </Card>
      )}

      <nav className="eh-expense-entry__steps" aria-label={t('expenses.entry.stepsLabel')}>
        {EXPENSE_ENTRY_STEPS.map((step, index) => (
          <button
            key={step.id}
            type="button"
            aria-current={activeStep === index ? 'step' : undefined}
            aria-controls={step.id}
            onClick={() => goToStep(index)}
          >
            <span className="eh-expense-entry__step-number">{index + 1}</span>
            <span className="eh-expense-entry__step-copy">
              <b>{t(`expenses.entry.steps.${step.key}`)}</b>
              <small>
                {t(completedSteps[index] ? 'expenses.entry.stepDone' : 'expenses.entry.stepTodo')}
              </small>
            </span>
          </button>
        ))}
      </nav>

      <div className="eh-expense-entry__layout">
        <div className="eh-expense-entry__form-column">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
            className="eh-expense-entry__form"
            aria-label={expense ? t('expenses.entry.editTitle') : t('expenses.entry.newTitle')}
          >
            <Card className="eh-expense-entry__details-card p-3.5 sm:p-4">
              <fieldset disabled={readOnly} className="space-y-3">
                <section
                  id="expense-entry-type"
                  className="eh-expense-entry__section eh-expense-entry__type-section"
                >
                  {types.isPending ? (
                    <div className="eh-expense-entry__type-skeleton">
                      {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-11" />
                      ))}
                    </div>
                  ) : (
                    <Controller
                      control={control}
                      name="typeId"
                      render={({ field }) => (
                        <TypeTiles
                          types={types.data ?? []}
                          value={field.value}
                          onChange={(v) => field.onChange(v)}
                          disabled={readOnly || limited}
                          error={fieldError('typeId')}
                        />
                      )}
                    />
                  )}
                </section>

                <section id="expense-entry-details" className="eh-expense-entry__section">
                  <h2 className="eh-expense-entry__section-title">
                    {t('expenses.entry.steps.details')}
                  </h2>
                  {type ? (
                    <div className="eh-expense-entry__details-fields motion-safe:animate-fade-in">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('expenses.form.date')} error={fieldError('expenseDate')}>
                          <Input
                            type="date"
                            readOnly={limited}
                            max={riyadhDate()}
                            className={cn(prefilled.has('expenseDate') && PREFILL_TINT)}
                            {...register('expenseDate', { onChange: () => untint('expenseDate') })}
                          />
                        </Field>
                        {category === 'STANDARD' && (
                          <Field label={t('expenses.form.merchant')} error={fieldError('merchant')}>
                            <Input
                              autoComplete="off"
                              className={cn(prefilled.has('merchant') && PREFILL_TINT)}
                              {...register('merchant', { onChange: () => untint('merchant') })}
                            />
                          </Field>
                        )}
                        {category === 'MILEAGE' && (
                          <Field
                            label={t('expenses.form.km')}
                            error={fieldError('quantity')}
                            hint={
                              type.unitRateSar &&
                              t('expenses.form.kmRate', {
                                rate: formatSar(trimRate(type.unitRateSar)),
                              })
                            }
                          >
                            <Input
                              inputMode="decimal"
                              readOnly={limited}
                              className="tabular"
                              {...register('quantity')}
                            />
                          </Field>
                        )}
                      </div>

                      {category === 'STANDARD' && (
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                          <Field
                            label={t('expenses.form.amount')}
                            error={fieldError('amount')}
                            hint={
                              values.currency !== 'SAR' && ev?.amountSar && ev.fxRateDate ? (
                                <span className="tabular">
                                  {t('expenses.form.sarEquivalent', {
                                    amount: formatSar(ev.amountSar),
                                    rate: Number(ev.fxRate).toString(),
                                    date: formatDate(ev.fxRateDate),
                                  })}
                                </span>
                              ) : undefined
                            }
                          >
                            <Input
                              inputMode="decimal"
                              placeholder="0.00"
                              readOnly={limited}
                              className={cn(
                                'h-12 text-lg font-semibold tabular',
                                prefilled.has('amount') && PREFILL_TINT,
                              )}
                              {...register('amount', { onChange: () => untint('amount') })}
                            />
                          </Field>
                          <Field label={t('expenses.form.currency')} error={fieldError('currency')}>
                            {limited ? (
                              <Input className="h-12" readOnly {...register('currency')} />
                            ) : (
                              <Select className="h-12" {...register('currency')}>
                                {(currencies.data ?? ['SAR']).map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                        </div>
                      )}

                      {category === 'MILEAGE' && (
                        <CalculatedAmount
                          quantity={ev?.quantity ?? null}
                          unitRateSar={ev?.unitRateSar ?? null}
                          amountSar={ev?.amountSar ?? null}
                        />
                      )}

                      <Field label={t('expenses.form.purpose')} error={fieldError('description')}>
                        <Input
                          placeholder={t('expenses.form.purposePlaceholder')}
                          {...register('description')}
                        />
                      </Field>

                      {type.attendeesReq && (
                        <Field
                          label={t('expenses.form.attendees')}
                          error={fieldError('attendees')}
                          hint={t('expenses.form.attendeesHint')}
                        >
                          <Input {...register('attendees')} />
                        </Field>
                      )}

                      {showJustification && (
                        <Field
                          label={
                            type.justificationReq
                              ? t('expenses.form.justification')
                              : t('expenses.form.justificationOptional')
                          }
                          error={fieldError('justification')}
                        >
                          <textarea
                            rows={3}
                            className="w-full rounded-input border border-border bg-surface px-3 py-2 text-sm shadow-card focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 aria-[invalid=true]:border-block"
                            {...register('justification')}
                          />
                        </Field>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label={t('expenses.form.costCenter')}
                          error={fieldError('costCenter')}
                          hint={t('expenses.form.costCenterHint')}
                        >
                          <Select {...register('costCenter')}>
                            <option value="">
                              {defaultCostCenter && !values.costCenter
                                ? t('expenses.form.costCenterDefaultIs', {
                                    value: defaultCostCenter.value,
                                    name: defaultCostCenter.description ?? '',
                                  })
                                : t('expenses.form.costCenterDefault')}
                            </option>
                            {costCenters.data?.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.value} · {c.description}
                              </option>
                            ))}
                            {values.costCenter &&
                              costCenters.data &&
                              !costCenters.data.some((c) => c.value === values.costCenter) && (
                                <option value={values.costCenter}>{values.costCenter}</option>
                              )}
                          </Select>
                        </Field>
                        <TripField
                          label={t('expenses.form.trip')}
                          register={register}
                          trips={trips.data ?? []}
                          error={fieldError('tripId')}
                        />
                      </div>

                      {(quickPays.data?.length ?? 0) > 0 && (
                        <Field
                          label={t('expenses.form.quickPay')}
                          error={fieldError('quickPayId')}
                          hint={t('expenses.form.quickPayHint')}
                        >
                          <Select {...register('quickPayId')}>
                            <option value="">{t('expenses.form.none')}</option>
                            {quickPays.data?.map((q) => (
                              <option key={q.quickPayId} value={q.quickPayId}>
                                {q.elementName} · {formatSar(q.amountSar)} ·{' '}
                                {formatDate(q.effectiveDate)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}

                      {category === 'STANDARD' && type.vatEligible && ev?.vatRecovery && (
                        <Controller
                          control={control}
                          name="taxInvoice"
                          render={({ field }) => (
                            <div className="flex items-center justify-between gap-4 rounded-input border border-border px-4 py-3">
                              <div>
                                <label htmlFor="tax-invoice" className="text-sm font-medium">
                                  {t('expenses.form.taxInvoice')}
                                </label>
                                <p className="text-xs text-muted">
                                  {t('expenses.form.taxInvoiceHint')}
                                </p>
                              </div>
                              <Switch
                                id="tax-invoice"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={readOnly}
                              />
                            </div>
                          )}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">{t('expenses.policy.chooseType')}</p>
                  )}
                </section>
              </fieldset>

              {ev && ev.segments.length > 0 && (
                <div className="mt-6">
                  <ChargeAccountLine segments={ev.segments} />
                </div>
              )}
            </Card>

            <section
              id="expense-entry-receipt"
              className="eh-expense-entry__section eh-expense-entry__receipt-section"
            >
              <ReceiptPane
                receipt={receipt}
                uploading={upload.isPending}
                readOnly={readOnly}
                onFile={(file) => void onFile(file)}
                onRemove={() => {
                  setReceipt(null);
                  setPrefilled(new Set());
                }}
              />
            </section>

            {/* UI-UX §5.2 footer: Save · Save & add another · Cancel. Sticky above the tab bar. */}
            {!readOnly && (
              <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
                <Card className="flex items-center gap-2 p-2.5 shadow-raised sm:gap-3 sm:p-3">
                  <div
                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:gap-2"
                    aria-live="polite"
                  >
                    {ev && blocked && (
                      <Tag tone="block" className="w-fit whitespace-nowrap">
                        {t('expenses.policy.overall.BLOCK')}
                        <span className="sr-only"> — {t('expenses.entry.fixBlocks')}</span>
                      </Tag>
                    )}
                    {ev && !blocked && warnings > 0 && (
                      <Tag tone="warn" className="w-fit whitespace-nowrap">
                        {t('expenses.entry.warnings', { count: warnings })}
                      </Tag>
                    )}
                    {ev && !blocked && warnings === 0 && (
                      <Tag tone="pass" className="w-fit whitespace-nowrap">
                        {t('expenses.entry.allClear')}
                      </Tag>
                    )}
                    {ev?.amountSar && (
                      <span className="whitespace-nowrap font-semibold tabular">
                        {formatSar(ev.amountSar)}
                      </span>
                    )}
                  </div>
                  {expense && expense.reportId === null && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-block"
                      aria-label={t('expenses.entry.delete')}
                      title={t('expenses.entry.delete')}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="hidden sm:inline-flex"
                    onClick={() => void navigate(backTo)}
                  >
                    {t('setup.cancel')}
                  </Button>
                  {!expense && (
                    <Button
                      variant="secondary"
                      className="hidden sm:inline-flex"
                      disabled={!canSave || saving}
                      onClick={() => void save(true)}
                    >
                      {t('expenses.entry.saveAnother')}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    loading={saving}
                    disabled={!canSave}
                    title={blocked ? t('expenses.entry.fixBlocks') : undefined}
                  >
                    {t('expenses.entry.save')}
                  </Button>
                </Card>
              </div>
            )}
          </form>
        </div>

        <aside className="eh-expense-entry__aside">
          <ExpenseDraftPreview
            number={
              expense
                ? t('expenses.entry.preview.recordNumber', { id: expense.expenseId })
                : t('expenses.entry.preview.draftNumber')
            }
            status={t(
              expense
                ? isDirty
                  ? 'expenses.entry.preview.editing'
                  : 'expenses.entry.preview.saved'
                : 'expenses.entry.preview.notSaved',
            )}
            title={previewTitle}
            titleIsPlaceholder={!values.merchant.trim() && !type}
            subtitle={previewSubtitle}
            typeName={type?.name ?? t('expenses.form.type')}
            date={
              values.expenseDate
                ? formatDate(values.expenseDate)
                : t('expenses.entry.preview.noValue')
            }
            amountLabel={t(
              previewAmountIsSar ? 'expenses.policy.totalSar' : 'expenses.form.amount',
            )}
            amount={previewAmount}
            costCenter={
              values.costCenter || defaultCostCenter?.value || t('expenses.entry.preview.noValue')
            }
            trip={selectedTrip?.destination || t('expenses.form.none')}
            receiptAttached={!!receipt}
            policyLevel={ev?.level}
          />
          <PolicyChecklist
            evaluation={ev}
            checking={!!input && !settled}
            waitingForType={!type}
            currency={values.currency}
            amount={values.amount}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('expenses.entry.deleteTitle')}
        body={t('expenses.entry.deleteBody')}
        confirmLabel={t('expenses.entry.delete')}
        onConfirm={() => void onDelete()}
        pending={remove.isPending}
      />
    </div>
  );
}

function ExpenseDraftPreview({
  number,
  status,
  title,
  titleIsPlaceholder,
  subtitle,
  typeName,
  date,
  amountLabel,
  amount,
  costCenter,
  trip,
  receiptAttached,
  policyLevel,
}: {
  number: string;
  status: string;
  title: string;
  titleIsPlaceholder: boolean;
  subtitle: string;
  typeName: string;
  date: string;
  amountLabel: string;
  amount: string;
  costCenter: string;
  trip: string;
  receiptAttached: boolean;
  policyLevel?: 'PASS' | 'WARN' | 'BLOCK';
}) {
  const { t } = useTranslation();
  const fields = [
    [t('expenses.form.date'), date],
    [amountLabel, amount],
    [t('expenses.form.costCenter'), costCenter],
    [t('expenses.form.trip'), trip],
  ];

  return (
    <article className="eh-expense-preview" aria-label={number}>
      <div className="eh-expense-preview__top">
        <span>{number}</span>
        <span className="eh-expense-preview__status">{status}</span>
      </div>
      <div className="eh-expense-preview__heading">
        <p>{typeName}</p>
        <h2 className={titleIsPlaceholder ? 'is-empty' : undefined}>{title}</h2>
        <span>{subtitle}</span>
      </div>
      <div className="eh-expense-preview__badges">
        <span>
          {receiptAttached
            ? t('expenses.entry.preview.receiptAttached')
            : t('expenses.entry.preview.receiptMissing')}
        </span>
        {policyLevel && (
          <span className={`is-${policyLevel.toLowerCase()}`}>
            {t(`expenses.policy.overall.${policyLevel}`)}
          </span>
        )}
      </div>
      <dl className="eh-expense-preview__grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function TripField({
  label,
  register,
  trips,
  error,
}: {
  label: string;
  register: UseFormRegister<ExpenseFormValues>;
  trips: TripRef[];
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <Field
      label={label}
      error={error}
      hint={trips.length === 0 ? t('expenses.form.noTrips') : undefined}
    >
      <Select {...register('tripId')} disabled={trips.length === 0}>
        <option value="">{t('expenses.form.none')}</option>
        {trips.map((trip) => (
          <option key={trip.tripId} value={trip.tripId}>
            {t('expenses.form.tripOption', {
              destination: trip.destination ?? t('expenses.form.trip'),
              from: formatDate(trip.startDate),
              to: formatDate(trip.endDate),
              days: trip.days,
            })}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** MILEAGE: km × rate = amount (read-only, from the engine). */
function CalculatedAmount({
  quantity,
  unitRateSar,
  amountSar,
}: {
  quantity: string | null;
  unitRateSar: string | null;
  amountSar: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-2 rounded-input border border-dashed border-border bg-surface-2/50 px-4 py-3"
      data-testid="calculated-amount"
    >
      <p className="text-sm text-muted tabular">
        {quantity && unitRateSar
          ? `${quantity} ${t('expenses.form.kmUnit')} × ${formatSar(trimRate(unitRateSar))}`
          : t('expenses.form.enterKm')}
      </p>
      <p className="text-lg font-semibold tabular">{amountSar ? formatSar(amountSar) : 'SAR —'}</p>
    </div>
  );
}
