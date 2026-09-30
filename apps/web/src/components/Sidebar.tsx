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

/** Desktop navigation — a numbered index, like a table of contents. */
export function Sidebar({ sections, active, onSelect, health, account }: Props) {
  return (
    <nav
      aria-label="Sections"
      className="relative z-10 hidden w-64 shrink-0 flex-col border-r border-edge md:flex"
    >
      <div className="px-6 pb-8 pt-7">
        <div className="flex items-center gap-3">
          <DonnaAvatar size={36} />
          <span className="font-serif text-[34px] italic leading-none text-ink">Donna</span>
        </div>
        <div className="mt-3">
          <Presence health={health} />
        </div>
      </div>
      <ul className="flex-1 px-3">
        {sections.map(({ key, label, live }, i) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-current={active === key ? 'page' : undefined}
              className={`group flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                active === key ? 'text-ink' : 'text-faint hover:text-muted'
              }`}
            >
              <span
                className={`font-mono text-[10px] ${active === key ? 'text-accent' : 'text-faint'}`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 font-mono text-xs uppercase tracking-[0.16em]">{label}</span>
              {!live && (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint/70">
                  Soon
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {account !== undefined && <div className="px-6 py-5">{account}</div>}
    </nav>
  );
}
