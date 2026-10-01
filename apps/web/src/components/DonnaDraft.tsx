import { useEffect, useState } from 'react';

import type { ControlPlaneClient } from '../api/client';
import type { WorkItemView } from '../types';
import { DonnaAvatar } from './DonnaAvatar';
import { Kicker, SectionHead, describe } from './ui';

const DRAFT_POLL_MS = 2_500;

const DRAFT_ERRORS: Record<string, string> = {
  declined: 'That one tripped my safety checks.',
  too_long: 'It ran too long — try splitting the task.',
  empty_draft: 'I came up empty on that one.',
  unavailable: 'I couldn’t reach my model just now.',
  timed_out: 'That took too long and stopped.',
};

interface Props {
  client: ControlPlaneClient;
  task: WorkItemView;
  /** Whether Donna can draft at all (a model is configured). */
  planner: boolean;
  onChange: (task: WorkItemView) => void;
}

/**
 * Donna's written deliverable for a task — the email, outline or brief —
 * ready to review and copy. Any task can be handed to her.
 */
export function DonnaDraft({ client, task, planner, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const status = task.draftStatus ?? 'none';

  // Check back while she's writing.
  useEffect(() => {
    if (status !== 'drafting') return;
    const timer = setInterval(() => {
      client.getTask(task.id).then(
        (d) => onChange(d.task),
        () => {},
      );
    }, DRAFT_POLL_MS);
    return () => clearInterval(timer);
  }, [status, client, task.id, onChange]);

  async function start() {
    setError(null);
    try {
      onChange(await client.draftTask(task.id));
    } catch (err) {
      setError(describe(err));
    }
  }

  async function copy() {
    if (task.draft == null) return;
    try {
      await navigator.clipboard.writeText(task.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Couldn’t copy — select the text instead.');
    }
  }

  if (!planner && status === 'none') return null;

  return (
    <section className="mt-10" aria-label="Donna’s draft">
      <SectionHead
        label="Donna’s draft"
        action={
          status === 'ready' ? (
            <button
              type="button"
              onClick={() => void copy()}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          ) : undefined
        }
      />
      {status === 'none' && (
        <button
          type="button"
          onClick={() => void start()}
          className="mt-4 flex items-center gap-3 text-left"
        >
          <DonnaAvatar size={32} />
          <span>
            <span className="block font-serif text-[20px] text-ink">Have Donna draft this</span>
            <Kicker>She’ll write it up for you to review</Kicker>
          </span>
        </button>
      )}
      {status === 'drafting' && (
        <p role="status" className="mt-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent" aria-hidden="true" />
          <Kicker className="text-accent">Donna is writing…</Kicker>
        </p>
      )}
      {status === 'failed' && (
        <p className="mt-4 font-serif text-[17px] italic text-muted">
          {DRAFT_ERRORS[task.draftError ?? ''] ?? 'I couldn’t finish that draft.'}
        </p>
      )}
      {task.draft != null && status !== 'drafting' && (
        <div className="mt-4 whitespace-pre-wrap break-words rounded-lg border border-edge bg-panel p-4 text-[15px] leading-relaxed text-ink/90">
          {task.draft}
        </div>
      )}
      {(status === 'ready' || status === 'failed') && planner && (
        <button
          type="button"
          onClick={() => void start()}
          className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-accent"
        >
          {status === 'failed' ? 'Try again →' : 'Redraft →'}
        </button>
      )}
      {error !== null && (
        <p role="alert" className="mt-2 font-mono text-[11px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
