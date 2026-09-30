import type { ObjectiveView } from '../types';

/** Wide-screen margin column: the day's numbers, set like a newspaper box score. */
export function GlanceCard({ objectives }: { objectives: ObjectiveView[] }) {
  const count = (s: ObjectiveView['status']) => objectives.filter((o) => o.status === s).length;
  const stats = [
    { label: 'Drafts', value: count('draft') },
    { label: 'In motion', value: count('active') },
    { label: 'Blocked', value: count('blocked') },
  ];
  return (
    <aside
      aria-label="By the numbers"
      className="relative z-10 hidden w-72 shrink-0 px-8 pt-14 xl:block"
    >
      <div className="border-b border-edge pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        By the numbers
      </div>
      <dl>
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-baseline justify-between border-b border-edge/60 py-4"
          >
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              {s.label}
            </dt>
            <dd className="font-serif text-[40px] leading-none text-ink">
              {String(s.value).padStart(2, '0')}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
