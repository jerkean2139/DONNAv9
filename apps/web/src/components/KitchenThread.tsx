import type { ActivityEventView, ObjectiveView } from '../types';

export type KitchenState =
  | { kind: 'loading' }
  | { kind: 'ready'; events: ActivityEventView[] }
  | { kind: 'error'; message: string };

interface Props {
  objective: ObjectiveView | null;
  state: KitchenState;
  onClose: () => void;
}

// Plain-language line for each recorded event type. Unknown types fall back to
// the raw type so a new event never disappears from the thread.
const EVENT_TEXT: Record<string, string> = {
  'objective.created': 'Opened this objective.',
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

function speaker(actor: ActivityEventView['actor']): string {
  switch (actor.type) {
    case 'human':
      return 'You';
    case 'orchestrator':
      return 'Donna';
    case 'checker':
      return 'Checker';
    case 'adapter':
      return `Worker · ${actor.id}`;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Message({ event, outcome }: { event: ActivityEventView; outcome: string }) {
  const mine = event.actor.type === 'human';
  const who = speaker(event.actor);
  const text =
    event.type === 'objective.created'
      ? `Opened this objective: “${outcome}”`
      : (EVENT_TEXT[event.type] ?? event.type);
  return (
    <li className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          mine ? 'bg-accent text-surface' : 'bg-edge text-ink'
        }`}
      >
        {who.charAt(0)}
      </span>
      <div className={`flex max-w-[85%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2 text-xs text-muted">
          <span className="font-medium text-ink">{who}</span>
          <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
        </div>
        <div
          className={`mt-1 rounded-lg px-3 py-2 text-sm ${
            mine ? 'bg-accent/20 text-ink' : 'border border-edge bg-surface text-ink'
          }`}
        >
          {text}
          {event.taskId !== undefined && (
            <span className="ml-2 rounded bg-edge px-1.5 py-0.5 font-mono text-[11px] text-muted">
              task {event.taskId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The kitchen view: the working thread behind an objective — what Donna, her
 * workers and checkers recorded, in order. Built from the objective's event
 * log, so it only ever shows what actually happened.
 */
export function KitchenThread({ objective, state, onClose }: Props) {
  return (
    <section
      className="flex min-h-[70dvh] flex-col border-edge bg-panel lg:min-h-0 lg:border-l"
      aria-label="Kitchen thread"
    >
      <header className="flex items-start justify-between gap-3 border-b border-edge px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted">In the kitchen</div>
          <div className="mt-0.5 truncate text-sm text-ink">
            {objective === null ? 'No objective selected' : objective.requestedOutcome}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-muted hover:bg-edge hover:text-ink"
        >
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {objective === null ? (
          <p className="text-sm text-muted">
            Pick an objective to see the work happening behind it.
          </p>
        ) : state.kind === 'loading' ? (
          <p className="text-sm text-muted">Loading the thread…</p>
        ) : state.kind === 'error' ? (
          <p role="alert" className="text-sm text-red-400">
            {state.message}
          </p>
        ) : state.events.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded for this objective yet.</p>
        ) : (
          <ol className="space-y-4" aria-label="Thread messages">
            {state.events.map((e) => (
              <Message key={e.id} event={e} outcome={objective.requestedOutcome} />
            ))}
          </ol>
        )}
      </div>

      <footer className="border-t border-edge px-4 py-2 text-[11px] leading-snug text-muted">
        Specialist agents arrive with the Agent Factory. Until then, this thread shows each step
        Donna and her workers record.
      </footer>
    </section>
  );
}
