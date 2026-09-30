import type { ObjectiveView } from '../types';

/** Wide-screen side panel: live counts of your objectives. */
export function GlanceCard({ objectives }: { objectives: ObjectiveView[] }) {
  const count = (s: ObjectiveView['status']) => objectives.filter((o) => o.status === s).length;
  const stats = [
    { label: 'Drafts', value: count('draft') },
    { label: 'In progress', value: count('active') },
    { label: 'Blocked', value: count('blocked') },
  ];
  return (
    <aside aria-label="At a glance" className="hidden w-72 shrink-0 p-5 pt-10 lg:block">
      <div className="rounded-2xl border border-edge bg-panel p-5 shadow-card">
        <div className="text-xs font-medium uppercase tracking-wider text-faint">At a glance</div>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] text-faint">{s.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
