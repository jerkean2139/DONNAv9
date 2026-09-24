import type { NavSection, ObjectiveView, WorkItemView } from '../types';

interface Props {
  section: NavSection;
  /** The most recent objective, or null before the first one exists. */
  objective: ObjectiveView | null;
  objectives: ObjectiveView[];
  work: WorkItemView[];
}

export function ActiveWorkspace({ section, objective, objectives, work }: Props) {
  return (
    <main className="min-w-0 overflow-auto p-6" aria-label="Active workspace">
      <h1 className="text-lg font-semibold text-ink">{section.label}</h1>

      <section className="mt-4 rounded-lg border border-edge bg-panel p-4">
        <div className="text-xs uppercase tracking-wide text-muted">Current objective</div>
        {objective === null ? (
          <div className="mt-1 text-muted">
            No objectives yet — tell Donna an outcome in the command bar below.
          </div>
        ) : (
          <>
            <div className="mt-1 text-ink">{objective.requestedOutcome}</div>
            <div className="mt-1 text-xs text-muted">status: {objective.status}</div>
          </>
        )}
      </section>

      {objectives.length > 0 && (
        <section className="mt-4">
          <div className="text-xs uppercase tracking-wide text-muted">Objectives</div>
          <ul className="mt-2 space-y-2" aria-label="Objectives">
            {objectives.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between rounded border border-edge bg-panel px-3 py-2 text-sm"
              >
                <span className="text-ink">{o.requestedOutcome}</span>
                <span className="text-muted">{o.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <div className="text-xs uppercase tracking-wide text-muted">Active work (sample)</div>
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
    </main>
  );
}
