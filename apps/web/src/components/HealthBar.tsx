import type { ReactNode } from 'react';

import type { HealthView } from '../types';

const PLANE_COLOR: Record<HealthView['controlPlane'], string> = {
  ok: 'text-accent',
  checking: 'text-muted',
  degraded: 'text-amber-400',
  down: 'text-red-400',
};

interface Props {
  health: HealthView;
  account?: ReactNode;
  kitchenOpen: boolean;
  onToggleKitchen: () => void;
}

export function HealthBar({ health, account, kitchenOpen, onToggleKitchen }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-edge bg-panel px-4 py-2 text-xs text-muted">
      <span className="text-sm font-semibold text-ink">Donna</span>
      <span>
        control plane:{' '}
        <span className={PLANE_COLOR[health.controlPlane]}>{health.controlPlane}</span>
      </span>
      <span className="hidden md:inline" title="Sample data — not yet live">
        {health.activeJobs} active jobs (sample)
      </span>
      <span className="ml-auto flex items-center gap-3">
        {health.nodes.map((n) => (
          <span key={n.name} className="hidden lg:inline" title="Sample data — not yet live">
            {n.name}: {n.mode}/{n.health}
          </span>
        ))}
        <button
          type="button"
          aria-pressed={kitchenOpen}
          onClick={onToggleKitchen}
          className={`rounded border px-2.5 py-1 text-xs ${
            kitchenOpen
              ? 'border-accent bg-accent/20 text-ink'
              : 'border-edge text-muted hover:text-ink'
          }`}
        >
          Kitchen
        </button>
        {account}
      </span>
    </header>
  );
}
