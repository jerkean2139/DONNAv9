import type { ReactNode } from 'react';

import type { ControlPlaneHealth } from '../types';
import { DonnaAvatar } from './DonnaAvatar';
import { Presence } from './Presence';

/** Phone app bar: Donna's identity and presence, account on the right. */
export function TopBar({ health, account }: { health: ControlPlaneHealth; account?: ReactNode }) {
  return (
    <header className="safe-top shrink-0 border-b border-edge/70 bg-surface/90 backdrop-blur md:hidden">
      <div className="safe-x flex h-14 items-center gap-3">
        <DonnaAvatar size={34} />
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-semibold text-ink">Donna</div>
          <Presence health={health} />
        </div>
        <div className="ml-auto">{account}</div>
      </div>
    </header>
  );
}
