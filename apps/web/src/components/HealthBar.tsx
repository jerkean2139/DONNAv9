import type { ReactNode } from 'react';

import type { HealthView } from '../types';

const PLANE_COLOR: Record<HealthView['controlPlane'], string> = {
  ok: 'text-accent',
  checking: 'text-muted',
  degraded: 'text-amber-400',
  down: 'text-red-400',
};

export function HealthBar({ health, account }: { health: HealthView; account?: ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b border-edge bg-panel px-4 py-2 text-xs text-muted">
      <span className="font-semibold text-ink">Donna</span>
      <span>
        control plane:{' '}
        <span className={PLANE_COLOR[health.controlPlane]}>{health.controlPlane}</span>
      </span>
      <span title="Sample data — not yet live">{health.activeJobs} active jobs (sample)</span>
      <span className="ml-auto flex items-center gap-3">
        {health.nodes.map((n) => (
          <span key={n.name} title="Sample data — not yet live">
            {n.name}: {n.mode}/{n.health}
          </span>
        ))}
        {account}
      </span>
    </header>
  );
}
