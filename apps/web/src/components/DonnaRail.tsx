import type { ReactNode } from 'react';

import type { ApprovalView, ObjectiveView, WorkItemView } from '../types';

interface Props {
  objective: ObjectiveView;
  work: WorkItemView[];
  approvals: ApprovalView[];
  alerts: string[];
  nextAction: string;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-edge px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-2 text-sm text-ink">{children}</div>
    </section>
  );
}

export function DonnaRail({ objective, work, approvals, alerts, nextAction }: Props) {
  const blockers = work.filter((w) => w.state === 'blocked');
  return (
    <aside className="overflow-auto border-l border-edge bg-panel" aria-label="Donna rail">
      <Group title="Objective">{objective.requestedOutcome}</Group>
      <Group title="Active work">
        {work.length} item{work.length === 1 ? '' : 's'} in progress
      </Group>
      <Group title="Blockers">
        {blockers.length === 0 ? (
          <span className="text-muted">None</span>
        ) : (
          <ul className="space-y-1">
            {blockers.map((b) => (
              <li key={b.id}>{b.label}</li>
            ))}
          </ul>
        )}
      </Group>
      <Group title="Approvals">
        {approvals.length === 0 ? (
          <span className="text-muted">None pending</span>
        ) : (
          <ul className="space-y-1">
            {approvals.map((a) => (
              <li key={a.id}>
                <span className="text-ink">{a.action}</span>{' '}
                <span className="text-red-400">({a.risk})</span>
              </li>
            ))}
          </ul>
        )}
      </Group>
      <Group title="Alerts">
        {alerts.length === 0 ? (
          <span className="text-muted">None</span>
        ) : (
          <ul className="space-y-1">
            {alerts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </Group>
      <Group title="Next recommended action">{nextAction}</Group>
    </aside>
  );
}
