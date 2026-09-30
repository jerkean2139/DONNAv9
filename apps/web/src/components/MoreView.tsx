import type { NavSection } from '../types';

/** Phone "More" tab: the sections that don't fit in the tab bar. */
export function MoreView({
  sections,
  onSelect,
}: {
  sections: NavSection[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="safe-x mx-auto w-full max-w-2xl pb-8 pt-4">
      <div className="border-b border-edge pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        Index
      </div>
      <h1 className="mt-6 font-serif text-[52px] leading-[0.95] text-ink">More</h1>
      <ul className="mt-6">
        {sections.map(({ key, label, blurb }) => (
          <li key={key} className="border-b border-edge/60">
            <button
              type="button"
              onClick={() => onSelect(key)}
              className="group flex w-full items-center gap-4 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[26px] leading-tight text-ink">{label}</span>
                <span className="mt-0.5 block truncate text-[13px] text-faint">{blurb}</span>
              </span>
              <span
                aria-hidden="true"
                className="text-accent transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
