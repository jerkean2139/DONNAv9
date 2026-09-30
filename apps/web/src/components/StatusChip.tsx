import type { ObjectiveStatus } from '../types';

const STYLE: Record<ObjectiveStatus, { label: string; dot: string; text: string }> = {
  draft: { label: 'Draft', dot: 'border border-ink/60', text: 'text-muted' },
  active: { label: 'In motion', dot: 'bg-accent animate-breathe', text: 'text-accent' },
  blocked: { label: 'Blocked', dot: 'bg-warning', text: 'text-warning' },
  completed: { label: 'Done', dot: 'bg-success', text: 'text-success' },
  cancelled: { label: 'Cancelled', dot: 'bg-faint', text: 'text-faint line-through' },
};

export function StatusChip({ status }: { status: ObjectiveStatus }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
