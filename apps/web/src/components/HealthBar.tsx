import type { ReactNode } from 'react';

import type { HealthView } from '../types';
import { DonnaAvatar } from './DonnaAvatar';

const PLANE_COLOR: Record<HealthView['controlPlane'], string> = {
  ok: 'text-accent',
  checking: 'text-muted',
  degraded: 'text-amber-400',
  down: 'text-red-400',
};

export function HealthBar({ health, account }: { health: HealthView; account?: ReactNode }) {
  return (
    <header className="safe-top safe-x flex items-center gap-3 border-b border-edge bg-panel pb-2 text-xs text-muted">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <DonnaAvatar size={24} />
        Donna
      </span>
      <span>
        <span className="hidden sm:inline">control plane: </span>
        <span className={PLANE_COLOR[health.controlPlane]}>{health.controlPlane}</span>
      </span>
      <span className="hidden sm:inline" title="Sample data — not yet live">
        {health.activeJobs} active jobs (sample)
      </span>
      <span className="ml-auto flex items-center gap-3">
        {health.nodes.map((n) => (
          <span key={n.name} className="hidden md:inline" title="Sample data — not yet live">
            {n.name}: {n.mode}/{n.health}
          </span>
        ))}
        {account}
      </span>
    </header>
  );
}
