import type { NavSection, ObjectiveView, WorkItemView } from '../types';

interface Props {
  section: NavSection;
  /** The most recent objective, or null before the first one exists. */
  objective: ObjectiveView | null;
  objectives: ObjectiveView[];
  work: WorkItemView[];
  /** Open an objective's kitchen thread. */
  onOpenObjective: (id: string) => void;
}

export function ActiveWorkspace({ section, objective, objectives, work, onOpenObjective }: Props) {
  return (
    <main className="min-w-0 p-4 sm:p-6 xl:p-8" aria-label="Active workspace">
      <h1 className="text-lg font-semibold text-ink">{section.label}</h1>

      <section className="mt-4 rounded-lg border border-edge bg-panel p-4">
        <div className="text-xs uppercase tracking-wide text-muted">Selected objective</div>
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
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onOpenObjective(o.id)}
                  aria-current={objective?.id === o.id ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-3 rounded border bg-panel px-3 py-2 text-left text-sm hover:border-accent ${
                    objective?.id === o.id ? 'border-accent' : 'border-edge'
                  }`}
                >
                  <span className="min-w-0 break-words text-ink">{o.requestedOutcome}</span>
                  <span className="shrink-0 text-muted">{o.status}</span>
                </button>
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
              className="flex items-center justify-between gap-3 rounded border border-edge bg-panel px-3 py-2 text-sm"
            >
              <span className="min-w-0 text-ink">{w.label}</span>
              <span className="shrink-0 text-muted">
                {w.worker} · {w.state}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
