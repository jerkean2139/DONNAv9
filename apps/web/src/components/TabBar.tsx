import type { NavSection } from '../types';
import { MoreIcon } from './icons';

interface Props {
  tabs: NavSection[];
  active: string;
  /** True when the active section lives under "More". */
  moreActive: boolean;
  onSelect: (key: string) => void;
}

/** Phone bottom tab bar (iOS-style), clear of the home indicator. */
export function TabBar({ tabs, active, moreActive, onSelect }: Props) {
  const items = [
    ...tabs.map((t) => ({ key: t.key, label: t.label, Icon: t.icon })),
    { key: 'more', label: 'More', Icon: MoreIcon },
  ];
  return (
    <nav
      aria-label="Tabs"
      className="safe-bottom shrink-0 border-t border-edge/70 bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="flex">
        {items.map(({ key, label, Icon }) => {
          const selected = key === 'more' ? moreActive : active === key;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={selected ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 pb-1.5 pt-2 text-[11px] ${
                  selected ? 'text-accent' : 'text-faint'
                }`}
              >
                <Icon />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
