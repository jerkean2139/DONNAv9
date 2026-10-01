import { useState } from 'react';

import type { ObjectiveView, PlanView } from '../types';
import { Check, Kicker } from './ui';

const PLAN_ERRORS: Record<string, string> = {
  declined: 'That one tripped my safety checks — try rephrasing it.',
  too_long: 'The plan ran long. Try narrowing the outcome a little.',
  invalid_plan: 'I couldn’t put a sensible plan together.',
  empty_plan: 'I couldn’t find concrete tasks in that.',
  unavailable: 'I couldn’t reach my model just now.',
  timed_out: 'Planning took too long and stopped.',
};

function fmt(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function destination(plan: PlanView): string {
  const parts: string[] = [];
  if (plan.client.kind !== 'none') {
    parts.push(plan.client.kind === 'new' ? `${plan.client.name} (new)` : plan.client.name);
  }
  parts.push(plan.project.kind === 'new' ? `${plan.project.name} (new)` : plan.project.name);
  if (plan.sprint !== null) {
    const { name, startsOn, endsOn } = plan.sprint;
    parts.push(startsOn && endsOn ? `${name} · ${fmt(startsOn)}–${fmt(endsOn)}` : name);
  }
  return parts.join(' / ');
}

interface Props {
  objective: ObjectiveView;
  onApprove: (taskIndexes: number[]) => Promise<void>;
  onDismiss: () => Promise<void>;
  onRetry: () => Promise<void>;
  onOpenProject: (projectId: string) => void;
}

/** Donna's plan for one agenda item, in whatever state it's in. */
export function PlanCard({ objective, onApprove, onDismiss, onRetry, onOpenProject }: Props) {
  const record = objective.plan;
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  if (record === undefined || record === null) return null;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  if (record.status === 'drafting') {
    return (
      <p role="status" className="mt-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent" aria-hidden="true" />
        <Kicker className="text-accent">Donna is drafting a plan…</Kicker>
      </p>
    );
  }

  if (record.status === 'failed') {
    return (
      <div className="mt-3">
        <p className="font-serif text-[17px] italic text-muted">
          {PLAN_ERRORS[record.error ?? ''] ?? 'I couldn’t draft a plan for this.'}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(onRetry)}
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
        >
          Try again →
        </button>
      </div>
    );
  }

  if (record.status === 'dismissed') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void act(onRetry)}
        className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-accent"
      >
        Plan dismissed · Plan it again →
      </button>
    );
  }

  if (record.status === 'approved' && record.projectId !== null) {
    const p = objective.progress;
    const plan = record.plan;
    return (
      <button
        type="button"
        onClick={() => onOpenProject(record.projectId!)}
        className="group mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left"
      >
        <Kicker className="text-accent">
          Planned into {plan ? destination(plan).replace(/ \(new\)/g, '') : 'a project'} →
        </Kicker>
        {p && p.total > 0 && (
          <Kicker>
            {p.done}/{p.total} done
          </Kicker>
        )}
      </button>
    );
  }

  const plan = record.plan;
  if (record.status !== 'proposed' || plan === null) return null;
  const selected = plan.tasks.map((_t, i) => i).filter((i) => !excluded.has(i));

  return (
    <section aria-label="Donna’s plan" className="mt-4 animate-rise border-l-2 border-accent pl-4">
      <Kicker className="text-accent">Donna’s plan</Kicker>
      <p className="mt-2 font-serif text-[19px] italic leading-snug text-ink/90">{plan.summary}</p>
      <p className="mt-3">
        <Kicker className="text-muted">{destination(plan)}</Kicker>
      </p>
      <ul className="mt-3">
        {plan.tasks.map((t, i) => (
          <li
            key={`${i}-${t.title}`}
            className="flex items-start gap-3 border-b border-edge/60 py-2.5"
          >
            <span className="pt-0.5">
              <Check
                done={!excluded.has(i)}
                label={`Include ${t.title}`}
                onToggle={() =>
                  setExcluded((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block break-words text-[15px] leading-snug ${
                  excluded.has(i) ? 'text-faint line-through' : 'text-ink'
                }`}
              >
                {t.title}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-3">
                {t.owner === 'donna' && <Kicker className="text-accent">I’ll draft this</Kicker>}
                {t.subtasks.length > 0 && (
                  <Kicker>
                    {t.subtasks.length} subtask{t.subtasks.length === 1 ? '' : 's'}
                  </Kicker>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {plan.questions.length > 0 && (
        <div className="mt-4">
          <Kicker>Worth confirming</Kicker>
          <ul className="mt-1 space-y-1">
            {plan.questions.map((q) => (
              <li key={q} className="font-serif text-[16px] italic text-muted">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 flex items-center gap-5">
        <button
          type="button"
          disabled={busy || selected.length === 0}
          onClick={() => void act(() => onApprove(selected))}
          className="rounded-full bg-ink px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-surface transition-opacity disabled:opacity-40"
        >
          {busy
            ? 'Setting it up…'
            : `Approve ${selected.length === plan.tasks.length ? 'plan' : `${selected.length} task${selected.length === 1 ? '' : 's'}`}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(onDismiss)}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint hover:text-ink"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
