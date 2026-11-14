import { CalendarDays, CheckCircle2, CircleHelp, Clock3, GraduationCap, Send } from 'lucide-react';
import { useState } from 'react';
import type { MyAssessment } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet } from '../lib/data';
import { fmtDate } from '../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Kpi,
  PageHeader,
  Skeleton,
  Tabs,
} from '../components/ui';

type AssessmentState = 'open' | 'marking' | 'released' | 'notready';
type Filter = 'all' | AssessmentState;

const STATE_LABEL: Record<AssessmentState, string> = {
  open: 'Ready to take',
  marking: 'Awaiting practical mark',
  released: 'Result released',
  notready: 'Not open yet',
};
const STATE_TONE: Record<AssessmentState, 'warn' | 'info' | 'ok' | 'neutral'> = {
  open: 'warn',
  marking: 'info',
  released: 'ok',
  notready: 'neutral',
};

function AssessmentsLoading() {
  return (
    <div className="th-assessments__loading" role="status" aria-live="polite">
      <span className="sr-only">Loading assessments</span>
      <div className="th-assessments__loading-head">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-44" />
      </div>
      <div className="th-assessments__loading-stats">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>
      <Card className="th-assessments__loading-panel">
        <div className="th-assessments__loading-bar">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64" />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div className="th-assessments__loading-row" key={i}>
            <Skeleton className="size-10 rounded-xl" />
            <div>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function Assessments() {
  const list = useGet<MyAssessment[]>(['assessments'], '/assessments');
  const [taking, setTaking] = useState<MyAssessment | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  if (!list.data)
    return list.error ? (
      <div className="th-assessments">
        <PageHeader animatedTitle breadcrumb="Learning & development" title="Assessments" />
        <Alert tone="bad">{list.error.message}</Alert>
      </div>
    ) : (
      <AssessmentsLoading />
    );
  if (taking) return <TakeExam a={taking} onDone={() => setTaking(null)} />;

  const counts: Record<AssessmentState, number> = {
    open: list.data.filter((a) => a.state === 'open').length,
    marking: list.data.filter((a) => a.state === 'marking').length,
    released: list.data.filter((a) => a.state === 'released').length,
    notready: list.data.filter((a) => a.state === 'notready').length,
  };
  const tabs: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: list.data.length },
    { value: 'open', label: 'Ready', count: counts.open },
    { value: 'marking', label: 'Awaiting mark', count: counts.marking },
    { value: 'released', label: 'Results', count: counts.released },
    { value: 'notready', label: 'Not open', count: counts.notready },
  ];
  const rows = filter === 'all' ? list.data : list.data.filter((a) => a.state === filter);

  return (
    <div className="th-assessments">
      <PageHeader animatedTitle breadcrumb="Learning & development" title="Assessments" />
      <div className="th-assessments__stats">
        <Kpi
          label="Ready to take"
          value={counts.open}
          tone={counts.open ? 'ok' : undefined}
          sub="Available assessments"
        />
        <Kpi label="Awaiting practical mark" value={counts.marking} sub="Theory submitted" />
        <Kpi
          label="Results released"
          value={counts.released}
          sub={`${list.data.filter((a) => a.passed).length} passed`}
        />
        <Kpi label="Not open yet" value={counts.notready} sub="Attendance or session pending" />
      </div>
      <Card className="th-assessments__panel">
        <CardHead title="Your assessments" sub="Tests and results from your training sessions." />
        <div className="th-assessments__tabs">
          <Tabs value={filter} onChange={setFilter} tabs={tabs} />
        </div>
        {rows.length ? (
          <div className="th-assessments__list">
            {rows.map((a, index) => (
              <article
                key={a.requestId}
                className={`th-assessments__item is-${a.state}`}
                style={{ '--th-assessment-index': index } as React.CSSProperties}
              >
                <div className="th-assessments__icon" aria-hidden="true">
                  {a.state === 'released' ? (
                    <CheckCircle2 />
                  ) : a.state === 'open' ? (
                    <CircleHelp />
                  ) : a.state === 'marking' ? (
                    <Clock3 />
                  ) : (
                    <GraduationCap />
                  )}
                </div>
                <div className="th-assessments__details">
                  <div className="th-assessments__title-row">
                    <h2>{a.session.title}</h2>
                    <Badge tone={STATE_TONE[a.state]} dot>
                      {STATE_LABEL[a.state]}
                    </Badge>
                  </div>
                  <div className="th-assessments__meta">
                    <span>
                      <CalendarDays />
                      {fmtDate(a.session.startDate)}
                    </span>
                    <span>
                      <GraduationCap />
                      {a.session.skillName}
                    </span>
                  </div>
                  <div className="th-assessments__threshold">
                    Pass mark <b>Theory {a.passTheory}%</b>
                    {a.passPractical != null && (
                      <>
                        <i /> <b>Practical {a.passPractical}/10</b>
                      </>
                    )}
                  </div>
                </div>
                <div className="th-assessments__scores">
                  {a.theory != null && (
                    <span>
                      <small>Theory</small>
                      <b>{a.theory}%</b>
                    </span>
                  )}
                  {a.practical != null && (
                    <span>
                      <small>Practical</small>
                      <b>{a.practical}/10</b>
                    </span>
                  )}
                  {a.passed != null && (
                    <Badge tone={a.passed ? 'ok' : 'bad'}>{a.passed ? 'Passed' : 'Not passed'}</Badge>
                  )}
                </div>
                {a.state === 'open' && (
                  <Button
                    className="th-assessments__start"
                    variant="primary"
                    onClick={() => setTaking(a)}
                    icon={<Send className="size-3.5" />}
                  >
                    Start test
                  </Button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={<GraduationCap className="size-5" />}
            title={filter === 'all' ? 'No assessments yet' : 'No assessments in this group'}
          >
            {filter === 'all'
              ? 'Assessments will appear here when they are available for your training sessions.'
              : 'Choose another status to see your other assessments.'}
          </Empty>
        )}
      </Card>
    </div>
  );
}

function TakeExam({ a, onDone }: { a: MyAssessment; onDone: () => void }) {
  const [ans, setAns] = useState<Record<number, number>>({});
  const submit = useAction(
    () =>
      api.post<{ theory: number }>(`/assessments/${a.session.id}/submit`, {
        answers: a.questions.map((_, i) => ans[i]),
      }),
    {
      success: (r) => `Submitted · theory ${r.theory}% — waiting for the practical mark`,
      invalidate: [['assessments']],
      onSuccess: onDone,
    },
  );
  const done = Object.keys(ans).length;
  return (
    <div className="th-assessments th-assessments--exam">
      <PageHeader
        animatedTitle
        breadcrumb="Learning & development / Assessments"
        title={a.session.title}
        sub={`${a.questions.length} questions · one attempt · pass mark ${a.passTheory}%`}
        actions={<Button onClick={onDone}>Back to assessments</Button>}
      />
      <Alert tone="info" className="th-assessments__notice">
        Answers are final once submitted.
      </Alert>
      <div className="th-assessments__questions">
        {a.questions.map((q, i) => (
          <Card className="th-assessments__question" key={q.id}>
            <CardHead
              title={
                <span className="th-assessments__question-title">
                  <i>{String(i + 1).padStart(2, '0')}</i>
                  {q.text}
                </span>
              }
            />
            <div className="th-assessments__choices">
              {q.choices.map((choice, j) => (
                <button
                  key={j}
                  type="button"
                  aria-pressed={ans[i] === j}
                  onClick={() => setAns({ ...ans, [i]: j })}
                  className={cn('th-assessments__choice', ans[i] === j && 'is-selected')}
                >
                  <span>{'ABCDEF'[j]}</span>
                  {choice}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="th-assessments__submit-wrap">
        <Card className="th-assessments__submit">
          <span>
            <b>
              {done}/{a.questions.length}
            </b>{' '}
            answered
          </span>
          <Button
            variant="primary"
            disabled={done < a.questions.length}
            loading={submit.isPending}
            onClick={() => submit.mutate(undefined)}
            icon={<Send className="size-4" />}
          >
            Submit assessment
          </Button>
        </Card>
      </div>
    </div>
  );
}
