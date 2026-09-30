import type { NavSection } from '../types';
import { ChevronIcon } from './icons';

/** Phone "More" tab: the sections that don't fit in the tab bar. */
export function MoreView({
  sections,
  onSelect,
}: {
  sections: NavSection[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">More</h1>
      <ul className="mt-6 divide-y divide-edge overflow-hidden rounded-2xl border border-edge bg-panel">
        {sections.map(({ key, label, icon: Icon }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] text-ink active:bg-raised"
            >
              <Icon width={20} height={20} className="text-accent" />
              <span className="flex-1">{label}</span>
              <ChevronIcon width={18} height={18} className="text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
