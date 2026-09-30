import type { ReactNode } from 'react';

import type { ApprovalView, ObjectiveView, WorkItemView } from '../types';
import { DonnaAvatar } from './DonnaAvatar';

interface Props {
  objective: ObjectiveView | null;
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
    <aside
      className="border-t border-edge bg-panel md:overflow-auto md:border-l md:border-t-0"
      aria-label="Donna rail"
    >
      <section className="flex items-center gap-3 border-b border-edge px-4 py-4">
        <DonnaAvatar size={48} />
        <div>
          <div className="text-sm font-semibold text-ink">Donna</div>
          <div className="text-xs text-muted">Here&apos;s where things stand.</div>
        </div>
      </section>
      <Group title="Objective">
        {objective === null ? (
          <span className="text-muted">None yet</span>
        ) : (
          objective.requestedOutcome
        )}
      </Group>
      <Group title="Active work (sample)">
        {work.length} item{work.length === 1 ? '' : 's'} in progress
      </Group>
      <Group title="Blockers (sample)">
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
      <Group title="Approvals (sample)">
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
      <Group title="Alerts (sample)">
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
      <Group title="Next recommended action (sample)">{nextAction}</Group>
    </aside>
  );
}
