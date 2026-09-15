import type { NavSection, ObjectiveView, WorkItemView } from '../types';

interface Props {
  section: NavSection;
  objective: ObjectiveView;
  drafts: ObjectiveView[];
  work: WorkItemView[];
}

export function ActiveWorkspace({ section, objective, drafts, work }: Props) {
  return (
    <main className="min-w-0 overflow-auto p-6" aria-label="Active workspace">
      <h1 className="text-lg font-semibold text-ink">{section.label}</h1>

      <section className="mt-4 rounded-lg border border-edge bg-panel p-4">
        <div className="text-xs uppercase tracking-wide text-muted">Current objective</div>
        <div className="mt-1 text-ink">{objective.requestedOutcome}</div>
        <div className="mt-1 text-xs text-muted">status: {objective.status}</div>
      </section>

      <section className="mt-4">
        <div className="text-xs uppercase tracking-wide text-muted">Active work</div>
        <ul className="mt-2 space-y-2">
          {work.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between rounded border border-edge bg-panel px-3 py-2 text-sm"
            >
              <span className="text-ink">{w.label}</span>
              <span className="text-muted">
                {w.worker} · {w.state}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {drafts.length > 0 && (
        <section className="mt-4">
          <div className="text-xs uppercase tracking-wide text-muted">New objectives (draft)</div>
          <ul className="mt-2 space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded border border-accent/40 bg-panel px-3 py-2 text-sm text-ink"
              >
                {d.requestedOutcome}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
