import { Check, PenSquare, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Exam, Session } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet } from '../lib/data';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  Toggle,
} from '../components/ui';
import { SessionStrip } from './attendance';

type TS = Session & { learners: number };

export default function Exams() {
  const [params, setParams] = useSearchParams();
  const list = useGet<TS[]>(['trainer-sessions'], '/trainer/sessions');
  const sel =
    Number(params.get('session')) ||
    list.data?.find((s) => !s.resultsReleased)?.id ||
    list.data?.[0]?.id ||
    null;

  if (!list.data && list.isPending) return <ExamLoading />;

  return (
    <div className="th-exams">
      <PageHeader animatedTitle breadcrumb="Trainer" title="Exam builder" />
      {list.error && <Alert tone="bad">{list.error.message}</Alert>}
      {list.data && !list.data.length ? (
        <Card className="th-exams__empty">
          <Empty icon={<PenSquare className="size-5" />} title="You are not training any sessions yet">
            Sessions assigned to you will appear here, ready for exam setup.
          </Empty>
        </Card>
      ) : list.data ? (
        <>
          <SessionStrip
            list={list.data}
            sel={sel}
            onSelect={(id) => setParams({ session: String(id) })}
            status={(s) =>
              s.resultsReleased
                ? 'Results released'
                : s.examStatus
                  ? s.examStatus === 'PUBLISHED'
                    ? 'Published'
                    : 'Draft'
                  : 'No exam yet'
            }
          />
          {sel && <Builder id={sel} />}
        </>
      ) : null}
    </div>
  );
}

function ExamLoading() {
  return (
    <div className="th-exams" role="status" aria-live="polite">
      <span className="sr-only">Loading exam builder</span>
      <PageHeader animatedTitle breadcrumb="Trainer" title="Exam builder" />
      <div className="th-exams__loading-sessions">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="th-exams__loading-grid">
        <Card className="th-exams__loading-panel">
          <div className="th-exams__loading-head">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-7 w-24" />
          </div>
          {Array.from({ length: 3 }, (_, i) => (
            <div className="th-exams__loading-question" key={i}>
              <Skeleton className="size-8 rounded-lg" />
              <div>
                <Skeleton className="h-3.5 w-52" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            </div>
          ))}
        </Card>
        <div className="th-exams__loading-side">
          <Card className="th-exams__loading-panel">
            <div className="th-exams__loading-head">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="mt-4 h-9 w-full" />
              <Skeleton className="mt-2 h-9 w-full" />
              <Skeleton className="mt-4 h-9 w-full" />
            </div>
          </Card>
          <Card className="th-exams__loading-panel">
            <div className="th-exams__loading-head">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Builder({ id }: { id: number }) {
  const exam = useGet<Exam | null>(['exam', id], `/trainer/sessions/${id}/exam`);
  const inv = [['exam', id], ['trainer-sessions']];
  const create = useAction(() => api.post(`/trainer/sessions/${id}/exam`), {
    success: 'Exam created',
    invalidate: inv,
  });
  const publish = useAction(
    (p: boolean) => api.post(`/trainer/sessions/${id}/exam/publish`, { publish: p }),
    {
      success: (r) =>
        (r as Exam).status === 'PUBLISHED'
          ? 'Published — learners who attended are notified'
          : 'Back to draft',
      invalidate: inv,
    },
  );
  const del = useAction((qid: number) => api.del(`/trainer/sessions/${id}/exam/questions/${qid}`), {
    success: 'Question removed',
    invalidate: inv,
  });
  const [cfg, setCfg] = useState<{ passTheory: number; passPractical: number; hasPractical: boolean } | null>(
    null,
  );
  const saveCfg = useAction(() => api.put(`/trainer/sessions/${id}/exam`, cfg), {
    success: 'Pass marks saved',
    invalidate: inv,
    onSuccess: () => setCfg(null),
  });

  if (exam.isPending) return <BuilderLoading />;
  if (exam.error) return <Alert tone="bad">{exam.error.message}</Alert>;
  const e = exam.data;
  if (!e) {
    return (
      <Card className="th-exams__create">
        <div className="th-exams__create-icon">
          <PenSquare aria-hidden="true" />
        </div>
        <div className="th-exams__create-copy">
          <h2>Create the session exam</h2>
          <p>Build a theory test, set pass marks, and publish it for learners who attended.</p>
        </div>
        <Button
          variant="primary"
          loading={create.isPending}
          onClick={() => create.mutate(undefined)}
          icon={<Plus className="size-4" />}
        >
          Create exam
        </Button>
      </Card>
    );
  }

  const draft = e.status === 'DRAFT' && !e.released;
  const c = cfg ?? { passTheory: e.passTheory, passPractical: e.passPractical, hasPractical: e.hasPractical };
  return (
    <div className="th-exams__builder">
      <Card className="th-exams__panel th-exams__questions">
        <CardHead
          title={
            <span className="th-exams__panel-title">
              Questions <Badge tone="neutral">{e.questions.length}</Badge>
            </span>
          }
          sub={
            e.released
              ? 'Results released'
              : `${e.submissions} submission${e.submissions === 1 ? '' : 's'} received`
          }
          actions={
            !e.released &&
            (draft ? (
              <>
                <Badge tone="warn" dot>
                  Draft
                </Badge>
                <Button
                  size="sm"
                  variant="primary"
                  loading={publish.isPending}
                  onClick={() => publish.mutate(true)}
                  icon={<Send className="size-3.5" />}
                >
                  Publish exam
                </Button>
              </>
            ) : (
              <>
                {e.submissions === 0 && (
                  <Button
                    size="sm"
                    onClick={() => publish.mutate(false)}
                    icon={<Undo2 className="size-3.5" />}
                  >
                    Back to draft
                  </Button>
                )}
                <Badge tone="ok" dot>
                  Published
                </Badge>
              </>
            ))
          }
          className="th-exams__panel-head"
        />
        {e.questions.length ? (
          <div className="th-exams__question-list">
            {e.questions.map((q, i) => (
              <article className="th-exams__question" key={q.id}>
                <div className="th-exams__question-top">
                  <span className="th-exams__question-number">{String(i + 1).padStart(2, '0')}</span>
                  <h2>{q.text}</h2>
                  {draft && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="th-exams__remove"
                      onClick={() => del.mutate(q.id)}
                      aria-label={`Remove question ${i + 1}`}
                    >
                      <Trash2 className="size-3.5 text-bad" />
                    </Button>
                  )}
                </div>
                <div className="th-exams__answers">
                  {q.choices.map((ch, j) => {
                    const correct = j === q.correctIndex;
                    return (
                      <div key={j} className={cn('th-exams__answer', correct && 'is-correct')}>
                        <span className="th-exams__answer-letter">{'ABCDEF'[j]}</span>
                        <span className="th-exams__answer-text">{ch}</span>
                        {correct && (
                          <span className="th-exams__correct">
                            <Check aria-hidden="true" />
                            Correct
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="th-exams__question-empty">
            <Empty icon={<PenSquare className="size-5" />} title="No questions added yet">
              Add questions using the editor. You can review them here before publishing.
            </Empty>
          </div>
        )}
      </Card>

      <aside className="th-exams__sidebar" aria-label="Exam setup">
        {draft ? (
          <QuestionForm id={id} />
        ) : (
          <Alert tone="info" className="th-exams__locked-note">
            {e.released
              ? 'Results have been released and this exam is closed.'
              : 'To change questions, move the exam back to draft before anyone submits.'}
          </Alert>
        )}
        <Card className="th-exams__panel th-exams__settings">
          <CardHead
            title="Pass marks"
            sub="Set the minimum score required to pass."
            className="th-exams__panel-head"
          />
          <div className="th-exams__settings-fields">
            <Field label="Theory pass (%)">
              <Input
                type="number"
                min={0}
                max={100}
                disabled={e.released}
                value={c.passTheory}
                onChange={(x) => setCfg({ ...c, passTheory: Number(x.target.value) })}
              />
            </Field>
            <Field label="Practical pass (0–10)">
              <Input
                type="number"
                min={0}
                max={10}
                disabled={e.released || !c.hasPractical}
                value={c.passPractical}
                onChange={(x) => setCfg({ ...c, passPractical: Number(x.target.value) })}
              />
            </Field>
            <label className="th-exams__practical-toggle">
              <Toggle
                checked={c.hasPractical}
                disabled={e.released}
                onChange={(v) => setCfg({ ...c, hasPractical: v })}
                label="Practical part"
              />
              <span>
                <b>Practical part</b>
                <small>Trainer enters a practical score out of 10.</small>
              </span>
            </label>
          </div>
          {cfg && (
            <div className="th-exams__settings-actions">
              <Button
                variant="primary"
                size="sm"
                loading={saveCfg.isPending}
                onClick={() => saveCfg.mutate(undefined)}
              >
                Save pass marks
              </Button>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

function BuilderLoading() {
  return (
    <div className="th-exams__builder th-exams__builder-loading" aria-label="Loading session exam">
      <Card className="th-exams__loading-panel">
        <div className="th-exams__loading-head">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-7 w-24" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div className="th-exams__loading-question" key={i}>
            <Skeleton className="size-8 rounded-lg" />
            <div>
              <Skeleton className="h-3.5 w-52" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          </div>
        ))}
      </Card>
      <div className="th-exams__loading-side">
        <Card className="th-exams__loading-panel">
          <div className="th-exams__loading-head">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="mt-4 h-9 w-full" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
        </Card>
        <Card className="th-exams__loading-panel">
          <div className="th-exams__loading-head">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuestionForm({ id }: { id: number }) {
  const [text, setText] = useState('');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [err, setErr] = useState<Record<string, string>>({});
  const answerChoices = choices.map((choice) => choice.trim()).filter(Boolean);
  const correctIndex = choices.slice(0, correct).filter((choice) => choice.trim()).length;
  const canAdd = text.trim().length >= 5 && answerChoices.length >= 2 && !!choices[correct]?.trim();
  const add = useAction(
    () => api.post(`/trainer/sessions/${id}/exam/questions`, { text, choices: answerChoices, correctIndex }),
    {
      success: 'Question added',
      invalidate: [['exam', id]],
      onSuccess: () => {
        setText('');
        setChoices(['', '', '', '']);
        setCorrect(0);
        setErr({});
      },
      onError: (e) => setErr({ ...e.fields, _: e.message }),
    },
  );
  return (
    <Card className="th-exams__panel th-exams__form">
      <CardHead
        title="Add a question"
        sub="Write a prompt, add 2–6 choices, and mark the right answer."
        className="th-exams__panel-head"
      />
      <div className="th-exams__form-body">
        <Field label="Question" error={err.text}>
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter the theory question"
          />
        </Field>
        <fieldset className="th-exams__choice-set">
          <legend>
            Answer choices <span>Select the correct answer</span>
          </legend>
          <div className="th-exams__choice-editors">
            {choices.map((choice, i) => (
              <div key={i} className={cn('th-exams__choice-editor', correct === i && 'is-correct')}>
                <label className="th-exams__choice-pick" title={`Mark choice ${'ABCDEF'[i]} as correct`}>
                  <input
                    type="radio"
                    name={`correct-${id}`}
                    checked={correct === i}
                    onChange={() => setCorrect(i)}
                    aria-label={`Choice ${'ABCDEF'[i]} is correct`}
                  />
                  <span>{'ABCDEF'[i]}</span>
                </label>
                <Input
                  placeholder={`Choice ${'ABCDEF'[i]}`}
                  value={choice}
                  onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </div>
            ))}
          </div>
        </fieldset>
        {choices.length < 6 && (
          <Button
            className="th-exams__add-choice"
            size="sm"
            variant="soft"
            onClick={() => setChoices([...choices, ''])}
            icon={<Plus className="size-3.5" />}
          >
            Add choice
          </Button>
        )}
        {(err.choices || err.correctIndex || (err._ && !err.text)) && (
          <Alert tone="bad">{err.choices ?? err.correctIndex ?? err._}</Alert>
        )}
        <Button
          variant="primary"
          className="th-exams__add-question"
          loading={add.isPending}
          disabled={!canAdd}
          onClick={() => add.mutate(undefined)}
          icon={<Plus className="size-4" />}
        >
          Add question
        </Button>
      </div>
    </Card>
  );
}
