import type { NavSection } from '../types';

interface Props {
  sections: NavSection[];
  active: string;
  onSelect: (key: string) => void;
}

/** A sidebar on desktop; a horizontally scrolling tab strip on phones. */
export function ContextNav({ sections, active, onSelect }: Props) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge bg-panel p-2 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r"
      aria-label="Context"
    >
      {sections.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onSelect(s.key)}
          className={`shrink-0 whitespace-nowrap rounded px-3 py-2 text-left text-sm ${
            active === s.key ? 'bg-edge text-ink' : 'text-muted hover:bg-edge/50'
          }`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
