import type { HealthView } from '../types';

export function HealthBar({ health }: { health: HealthView }) {
  return (
    <header className="flex items-center gap-4 border-b border-edge bg-panel px-4 py-2 text-xs text-muted">
      <span className="font-semibold text-ink">Donna</span>
      <span>
        control plane:{' '}
        <span className={health.controlPlane === 'ok' ? 'text-accent' : 'text-red-400'}>
          {health.controlPlane}
        </span>
      </span>
      <span>{health.activeJobs} active jobs</span>
      <span className="ml-auto flex gap-3">
        {health.nodes.map((n) => (
          <span key={n.name}>
            {n.name}: {n.mode}/{n.health}
          </span>
        ))}
      </span>
    </header>
  );
}
