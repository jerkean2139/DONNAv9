import type { ActivityEventView, ObjectiveView, PlanRecordView } from '../types';
import { DonnaAvatar } from './DonnaAvatar';
import { Kicker } from './ui';

export type KitchenState =
  | { kind: 'loading' }
  | { kind: 'ready'; events: ActivityEventView[] }
  | { kind: 'error'; message: string };

interface Props {
  objective: ObjectiveView;
  state: KitchenState;
  onClose: () => void;
}

// Plain-language line for each recorded event type. Unknown types fall back to
// the raw type so a new event never disappears from the thread.
const EVENT_TEXT: Record<string, string> = {
  'task.created': 'Created a task for it.',
  'task.planned': 'Planned the task.',
  'task.assigned': 'Assigned the task to a worker.',
  'worker.started': 'Started working.',
  'tool.called': 'Called a tool.',
  'artifact.created': 'Produced an artifact.',
  'approval.requested': 'Asked for human approval.',
  'approval.decided': 'Approval was decided.',
  'task.blocked': 'Got blocked and needs help.',
  'task.retried': 'Retrying the task.',
  'task.completed': 'Finished the task.',
  'task.failed': 'The task failed.',
  'memory.updated': 'Updated memory.',
  'node.health_changed': 'A compute node changed health.',
  'system.alert': 'Raised a system alert.',
};

type Speaker = 'you' | 'donna' | 'worker' | 'checker';

interface Line {
  key: string;
  speaker: Speaker;
  name: string;
  text: string;
  at?: string;
  taskId?: string;
}

function eventLine(e: ActivityEventView, outcome: string): Line {
  const speaker: Speaker =
    e.actor.type === 'human'
      ? 'you'
      : e.actor.type === 'orchestrator'
        ? 'donna'
        : e.actor.type === 'checker'
          ? 'checker'
          : 'worker';
  const name =
    speaker === 'you'
      ? 'You'
      : speaker === 'donna'
        ? 'Donna'
        : speaker === 'checker'
          ? 'Checker'
          : `Worker · ${e.actor.id}`;
  const text = e.type === 'objective.created' ? `“${outcome}”` : (EVENT_TEXT[e.type] ?? e.type);
  return {
    key: e.id,
    speaker,
    name,
    text,
    at: e.createdAt,
    ...(e.taskId !== undefined ? { taskId: e.taskId } : {}),
  };
}

/** Donna's plan for the objective, as one line in her voice. */
function planLine(record: PlanRecordView): Line {
  const tasks = record.plan?.tasks.length ?? 0;
  const text =
    record.status === 'drafting'
      ? 'Drafting a plan for this…'
      : record.status === 'proposed'
        ? `Proposed a plan with ${tasks} task${tasks === 1 ? '' : 's'}: ${record.plan?.summary ?? ''}`
        : record.status === 'approved'
          ? `Plan approved — set up ${tasks} task${tasks === 1 ? '' : 's'}.`
          : record.status === 'dismissed'
            ? 'Plan dismissed.'
            : 'Couldn’t put a plan together.';
  return { key: `plan-${record.id}`, speaker: 'donna', name: 'Donna', text };
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function Message({ line }: { line: Line }) {
  const mine = line.speaker === 'you';
  return (
    <li className={`flex animate-rise gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
      {line.speaker === 'donna' ? (
        <DonnaAvatar size={30} className="h-[30px] w-[30px] self-start object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-[30px] w-[30px] shrink-0 self-start items-center justify-center rounded-full font-mono text-[11px] ${
            mine ? 'bg-accent text-surface' : 'bg-raised text-muted ring-1 ring-edge'
          }`}
        >
          {line.name.charAt(0)}
        </span>
      )}
      <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2">
          <Kicker className={mine ? 'text-accent' : 'text-muted'}>{line.name}</Kicker>
          {line.at !== undefined && (
            <time dateTime={line.at} className="font-mono text-[10px] text-faint">
              {formatTime(line.at)}
            </time>
          )}
        </div>
        <div
          className={`mt-1 rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
            mine ? 'bg-accent/15 text-ink' : 'bg-raised text-ink ring-1 ring-edge'
          }`}
        >
          {line.text}
          {line.taskId !== undefined && (
            <span className="ml-2 whitespace-nowrap font-mono text-[10px] text-faint">
              task {line.taskId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The kitchen: the working thread behind one objective — what you asked, what
 * Donna planned, and each step she and her workers recorded, in order. Built
 * from real records only, so it never shows work that didn't happen.
 */
export function KitchenThread({ objective, state, onClose }: Props) {
  let lines: Line[] = [];
  if (state.kind === 'ready') {
    lines = state.events.map((e) => eventLine(e, objective.requestedOutcome));
    if (objective.plan !== undefined && objective.plan !== null) {
      // Planning starts when the objective is created, so it follows that line.
      const at = lines.findIndex((l) => l.speaker === 'you');
      lines.splice(at + 1, 0, planLine(objective.plan));
    }
  }

  return (
    <aside
      aria-label="Kitchen thread"
      className="fixed inset-0 z-40 flex flex-col bg-surface lg:static lg:z-10 lg:w-[min(42vw,560px)] lg:shrink-0 lg:border-l lg:border-edge lg:bg-panel/60"
    >
      <header className="safe-top shrink-0 border-b border-edge px-5 pb-3 pt-4 lg:px-6 lg:pt-7">
        <div className="flex items-center justify-between gap-3">
          <Kicker className="text-accent">In the kitchen</Kicker>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-ink"
          >
            Close
          </button>
        </div>
        <p className="mt-2 font-serif text-[22px] leading-tight text-ink">
          {objective.requestedOutcome}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6">
        {state.kind === 'loading' ? (
          <p className="font-serif text-[17px] italic text-muted">Pulling up the thread…</p>
        ) : state.kind === 'error' ? (
          <p role="alert" className="text-[14px] text-danger">
            {state.message}
          </p>
        ) : lines.length === 0 ? (
          <p className="font-serif text-[17px] italic text-muted">Nothing recorded here yet.</p>
        ) : (
          <ol className="space-y-5" aria-label="Thread messages">
            {lines.map((l) => (
              <Message key={l.key} line={l} />
            ))}
          </ol>
        )}
      </div>

      <footer className="safe-bottom shrink-0 border-t border-edge px-5 py-3 text-[11px] leading-snug text-faint lg:px-6">
        Specialist agents arrive with the Agent Factory. Until then, this shows each step Donna and
        her workers record.
      </footer>
    </aside>
  );
}
