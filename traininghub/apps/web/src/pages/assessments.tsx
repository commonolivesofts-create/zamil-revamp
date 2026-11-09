import { GraduationCap, Send } from 'lucide-react';
import { useState } from 'react';
import type { MyAssessment } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet } from '../lib/data';
import { fmtDate } from '../lib/format';
import { Alert, Badge, Button, Card, CardHead, Empty, PageHeader, Spinner } from '../components/ui';

export default function Assessments() {
  const list = useGet<MyAssessment[]>(['assessments'], '/assessments');
  const [taking, setTaking] = useState<MyAssessment | null>(null);
  if (!list.data) return <Spinner />;
  if (taking) return <TakeExam a={taking} onDone={() => setTaking(null)} />;
  const label = {
    open: ['Open — take it now', 'warn'],
    marking: ['Submitted · waiting for practical mark', 'info'],
    released: ['Result released', 'ok'],
    notready: ['Not open yet', 'neutral'],
  } as const;
  return (
    <>
      <PageHeader
        eyebrow="My learning"
        title="Assessments"
        sub="After attendance is locked, the theory test opens. The trainer adds the practical mark and releases results; a pass raises your skill level."
      />
      <Card>
        {list.data.map((a) => (
          <div
            key={a.requestId}
            className="flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-3.5 last:border-0"
          >
            <div className="min-w-52 flex-1">
              <b className="text-[13px]">{a.session.title}</b>
              <div className="text-[11.5px] text-muted">
                {fmtDate(a.session.startDate)} · {a.session.skillName} · pass: theory {a.passTheory}%
                {a.passPractical ? `, practical ${a.passPractical}/10` : ''}
              </div>
            </div>
            <Badge tone={label[a.state][1]}>{label[a.state][0]}</Badge>
            {a.theory != null && (
              <span className="text-[12px] tabular">
                Theory <b>{a.theory}%</b>
              </span>
            )}
            {a.practical != null && (
              <span className="text-[12px] tabular">
                Practical <b>{a.practical}/10</b>
              </span>
            )}
            {a.passed != null && (
              <Badge tone={a.passed ? 'ok' : 'bad'}>{a.passed ? 'Passed' : 'Not passed'}</Badge>
            )}
            {a.state === 'open' && (
              <Button variant="primary" size="sm" onClick={() => setTaking(a)}>
                Start test
              </Button>
            )}
          </div>
        ))}
        {!list.data.length && (
          <Empty icon={<GraduationCap className="size-5" />} title="No assessments yet">
            They appear after you attend a session that has an exam.
          </Empty>
        )}
      </Card>
    </>
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
    <>
      <PageHeader
        eyebrow="Assessment"
        title={a.session.title}
        sub={`${a.questions.length} questions · one attempt · pass mark ${a.passTheory}%`}
        actions={<Button onClick={onDone}>Back</Button>}
      />
      <Alert tone="info" className="mb-4">
        Answers are final once submitted.
      </Alert>
      <div className="space-y-3">
        {a.questions.map((q, i) => (
          <Card key={q.id}>
            <CardHead title={`${i + 1}. ${q.text}`} />
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {q.choices.map((c, j) => (
                <button
                  key={j}
                  onClick={() => setAns({ ...ans, [i]: j })}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[12.5px] transition',
                    ans[i] === j ? 'border-req bg-accent-soft font-semibold' : 'border-line hover:bg-hover',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-bold',
                      ans[i] === j ? 'bg-req text-white' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {'ABCDEF'[j]}
                  </span>
                  {c}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="sticky bottom-4 mt-4 flex justify-end">
        <Card className="flex items-center gap-3 px-4 py-2.5">
          <span className="text-[12px] text-muted">
            {done}/{a.questions.length} answered
          </span>
          <Button
            variant="primary"
            disabled={done < a.questions.length}
            loading={submit.isPending}
            onClick={() => submit.mutate(undefined)}
            icon={<Send className="size-4" />}
          >
            Submit
          </Button>
        </Card>
      </div>
    </>
  );
}
