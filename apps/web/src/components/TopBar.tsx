import type { ReactNode } from 'react';

import type { ControlPlaneHealth } from '../types';
import { Presence } from './Presence';

/** Phone app bar: Donna's wordmark and presence; account on the right. Her
 * face lives in the brief itself, beside what she says. */
export function TopBar({ health, account }: { health: ControlPlaneHealth; account?: ReactNode }) {
  return (
    <header className="safe-top relative z-10 shrink-0 md:hidden">
      <div className="safe-x flex h-12 items-center gap-2.5">
        <span className="font-serif text-[22px] italic leading-none text-ink">Donna</span>
        <div className="ml-auto flex items-center gap-3">
          <Presence health={health} />
          {account}
        </div>
      </div>
    </header>
  );
}
