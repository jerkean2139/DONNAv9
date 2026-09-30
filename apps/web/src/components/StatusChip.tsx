import type { ObjectiveStatus } from '../types';

const STYLE: Record<ObjectiveStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-accent/10 text-accent ring-accent/25' },
  active: { label: 'In progress', className: 'bg-success/10 text-success ring-success/25' },
  blocked: { label: 'Blocked', className: 'bg-warning/10 text-warning ring-warning/25' },
  completed: { label: 'Done', className: 'bg-edge text-muted ring-edge' },
  cancelled: { label: 'Cancelled', className: 'bg-edge text-faint ring-edge' },
};

export function StatusChip({ status }: { status: ObjectiveStatus }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.className}`}
    >
      {s.label}
    </span>
  );
}
