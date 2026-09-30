import type { ControlPlaneHealth } from '../types';

const PRESENCE: Record<ControlPlaneHealth, { label: string; dot: string }> = {
  ok: { label: 'Online', dot: 'bg-success' },
  checking: { label: 'Connecting…', dot: 'bg-faint' },
  degraded: { label: 'Degraded', dot: 'bg-warning' },
  down: { label: 'Offline', dot: 'bg-danger' },
};

/** Donna's availability, driven by the live control-plane health check. */
export function Presence({ health }: { health: ControlPlaneHealth }) {
  const p = PRESENCE[health];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} aria-hidden="true" />
      {p.label}
    </span>
  );
}
