import type { NavSection } from '../types';

interface Props {
  sections: NavSection[];
  active: string;
  onSelect: (key: string) => void;
}

export function ContextNav({ sections, active, onSelect }: Props) {
  return (
    <nav className="flex flex-col gap-1 border-r border-edge bg-panel p-2" aria-label="Context">
      {sections.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onSelect(s.key)}
          className={`rounded px-3 py-2 text-left text-sm ${
            active === s.key ? 'bg-edge text-ink' : 'text-muted hover:bg-edge/50'
          }`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
