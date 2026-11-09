import { PenSquare, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Exam, Session } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet } from '../lib/data';
import { Alert, Badge, Button, Card, CardHead, Empty, Field, Input, PageHeader, Spinner, Textarea, Toggle } from '../components/ui';
import { SessionStrip } from './attendance';

type TS = Session & { learners: number };

export default function Exams() {
  const [params, setParams] = useSearchParams();
  const list = useGet<TS[]>(['trainer-sessions'], '/trainer/sessions');
  const sel = Number(params.get('session')) || list.data?.find((s) => !s.resultsReleased)?.id || list.data?.[0]?.id || null;
  if (!list.data) return <Spinner />;
  return (
    <>
      <PageHeader eyebrow="Trainer" title="Exam builder" sub="One multiple-choice theory test per session, plus an optional practical mark. Publish opens it to learners who attended; it cannot be unpublished once someone has submitted." />
      {!list.data.length ? <Card><Empty icon={<PenSquare className="size-5" />} title="You are not training any session" /></Card> : (
        <>
          <SessionStrip list={list.data} sel={sel} onSelect={(id) => setParams({ session: String(id) })} status={(s) => (s.resultsReleased ? 'Released' : s.examStatus ? (s.examStatus === 'PUBLISHED' ? 'Published' : 'Draft') : 'No exam')} />
          {sel && <Builder id={sel} />}
        </>
      )}
    </>
  );
}

function Builder({ id }: { id: number }) {
  const exam = useGet<Exam | null>(['exam', id], `/trainer/sessions/${id}/exam`);
  const inv = [['exam', id], ['trainer-sessions']];
  const create = useAction(() => api.post(`/trainer/sessions/${id}/exam`), { success: 'Exam created', invalidate: inv });
  const publish = useAction((p: boolean) => api.post(`/trainer/sessions/${id}/exam/publish`, { publish: p }), { success: (r) => ((r as Exam).status === 'PUBLISHED' ? 'Published — learners who attended are notified' : 'Back to draft'), invalidate: inv });
  const del = useAction((qid: number) => api.del(`/trainer/sessions/${id}/exam/questions/${qid}`), { success: 'Question removed', invalidate: inv });
  const [cfg, setCfg] = useState<{ passTheory: number; passPractical: number; hasPractical: boolean } | null>(null);
  const saveCfg = useAction(() => api.put(`/trainer/sessions/${id}/exam`, cfg), { success: 'Pass marks saved', invalidate: inv, onSuccess: () => setCfg(null) });
  if (exam.isPending) return <Spinner />;
  const e = exam.data;
  if (!e) return <Card><Empty title="No exam for this session yet"><Button variant="primary" className="mt-2" loading={create.isPending} onClick={() => create.mutate(undefined)} icon={<Plus className="size-4" />}>Create exam</Button></Empty></Card>;
  const draft = e.status === 'DRAFT' && !e.released;
  const c = cfg ?? { passTheory: e.passTheory, passPractical: e.passPractical, hasPractical: e.hasPractical };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHead title={`Questions · ${e.questions.length}`} sub={e.released ? 'Results released' : `Status: ${e.status.toLowerCase()} · ${e.submissions} submission(s)`} actions={!e.released && (draft
          ? <Button size="sm" variant="primary" loading={publish.isPending} onClick={() => publish.mutate(true)} icon={<Send className="size-3.5" />}>Publish</Button>
          : <>{e.submissions === 0 && <Button size="sm" onClick={() => publish.mutate(false)} icon={<Undo2 className="size-3.5" />}>Unpublish</Button>}<Badge tone="ok">Published</Badge></>)} />
        {e.questions.map((q, i) => (
          <div key={q.id} className="border-b border-line-2 px-4 py-3 last:border-0">
            <div className="flex gap-2"><b className="flex-1 text-[12.5px]">{i + 1}. {q.text}</b>{draft && <Button size="sm" variant="ghost" onClick={() => del.mutate(q.id)} aria-label="Remove question"><Trash2 className="size-3.5 text-bad" /></Button>}</div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {q.choices.map((ch, j) => <div key={j} className={cn('rounded-lg border px-2.5 py-1.5 text-[12px]', j === q.correctIndex ? 'border-req bg-req-bg font-semibold text-req-ink' : 'border-line')}><b className="mr-1.5 text-muted">{'ABCDEF'[j]}</b>{ch}</div>)}
            </div>
          </div>
        ))}
        {!e.questions.length && <Empty title="No questions yet" />}
      </Card>
      <div className="space-y-4">
        {draft ? <QuestionForm id={id} /> : <Alert tone="info">{e.released ? 'Results are released; the exam is closed.' : 'Unpublish (before anyone submits) to change questions.'}</Alert>}
        <Card>
          <CardHead title="Pass marks" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Theory pass (%)"><Input type="number" min={0} max={100} disabled={e.released} value={c.passTheory} onChange={(x) => setCfg({ ...c, passTheory: Number(x.target.value) })} /></Field>
            <Field label="Practical pass (0–10)"><Input type="number" min={0} max={10} disabled={e.released || !c.hasPractical} value={c.passPractical} onChange={(x) => setCfg({ ...c, passPractical: Number(x.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2"><Toggle checked={c.hasPractical} disabled={e.released} onChange={(v) => setCfg({ ...c, hasPractical: v })} label="Practical part" /> Has a practical part marked by the trainer</label>
          </div>
          {cfg && <div className="border-t border-line-2 px-4 py-3 text-right"><Button variant="primary" size="sm" loading={saveCfg.isPending} onClick={() => saveCfg.mutate(undefined)}>Save</Button></div>}
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
  const add = useAction(() => api.post(`/trainer/sessions/${id}/exam/questions`, { text, choices: choices.filter((c) => c.trim()), correctIndex: correct }), {
    success: 'Question added',
    invalidate: [['exam', id]],
    onSuccess: () => { setText(''); setChoices(['', '', '', '']); setCorrect(0); setErr({}); },
    onError: (e) => setErr({ ...e.fields, _: e.message }),
  });
  return (
    <Card>
      <CardHead title="Add a question" sub="2–6 choices; tick the correct one" />
      <div className="space-y-3 p-4">
        <Field label="Question" error={err.text}><Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Choice ${'ABCDEF'[i]} is correct`} className="accent-[var(--color-req)]" />
            <Input placeholder={`Choice ${'ABCDEF'[i]}`} value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
        {choices.length < 6 && <button className="text-[12px] font-semibold text-req" onClick={() => setChoices([...choices, ''])}>+ Add choice</button>}
        {(err.choices || err.correctIndex || (err._ && !err.text)) && <Alert tone="bad">{err.choices ?? err.correctIndex ?? err._}</Alert>}
        <Button variant="primary" className="w-full" loading={add.isPending} disabled={text.trim().length < 5} onClick={() => add.mutate(undefined)} icon={<Plus className="size-4" />}>Add question</Button>
      </div>
    </Card>
  );
}
