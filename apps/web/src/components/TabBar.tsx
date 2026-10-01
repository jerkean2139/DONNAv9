import type { NavSection } from '../types';

interface Props {
  tabs: NavSection[];
  active: string;
  /** True when the active section lives under "More". */
  moreActive: boolean;
  onSelect: (key: string) => void;
}

/** Phone tab bar — words, not icons; an ember tick marks where you are. */
export function TabBar({ tabs, active, moreActive, onSelect }: Props) {
  const items = [
    ...tabs.map((t) => ({ key: t.key, label: t.label })),
    { key: 'more', label: 'More' },
  ];
  return (
    <nav
      aria-label="Tabs"
      className="safe-bottom relative z-10 shrink-0 border-t border-edge/70 bg-surface/90 backdrop-blur md:hidden"
    >
      <ul className="safe-x flex justify-between">
        {items.map(({ key, label }) => {
          const selected = key === 'more' ? moreActive : active === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={selected ? 'page' : undefined}
                className={`relative flex flex-col items-center px-1 pb-2 pt-3 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  selected ? 'text-ink' : 'text-faint'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0 h-[3px] w-5 rounded-full bg-accent transition-opacity ${
                    selected ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
