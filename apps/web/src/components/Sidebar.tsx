import type { ReactNode } from 'react';

import type { ControlPlaneHealth, NavSection } from '../types';
import { DonnaAvatar } from './DonnaAvatar';
import { Presence } from './Presence';

interface Props {
  sections: NavSection[];
  active: string;
  onSelect: (key: string) => void;
  health: ControlPlaneHealth;
  account?: ReactNode;
}

/** Desktop navigation. On phones the TabBar takes over. */
export function Sidebar({ sections, active, onSelect, health, account }: Props) {
  return (
    <nav
      aria-label="Sections"
      className="hidden w-60 shrink-0 flex-col border-r border-edge bg-panel md:flex"
    >
      <div className="flex items-center gap-3 px-4 py-5">
        <DonnaAvatar size={40} />
        <div className="leading-tight">
          <div className="font-semibold text-ink">Donna</div>
          <Presence health={health} />
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 px-2">
        {sections.map(({ key, label, icon: Icon, live }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-current={active === key ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                active === key
                  ? 'bg-raised text-ink'
                  : 'text-muted hover:bg-raised/60 hover:text-ink'
              }`}
            >
              <Icon width={18} height={18} />
              <span className="flex-1">{label}</span>
              {!live && (
                <span className="text-[10px] uppercase tracking-wide text-faint">Soon</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {account !== undefined && <div className="border-t border-edge px-4 py-3">{account}</div>}
    </nav>
  );
}
