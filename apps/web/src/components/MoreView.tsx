import { useEffect, useState } from 'react';

import type { ControlPlaneClient } from '../api/client';
import type { GmailStatus, NavSection } from '../types';
import { Kicker, PAGE_WIDTH, SectionHead, describe } from './ui';

/** The person's Gmail connection: connect, or see which address and disconnect. */
function GmailConnection({ client }: { client: ControlPlaneClient }) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.gmailStatus().then(setStatus, (err: unknown) => setError(describe(err)));
  }, [client]);

  async function act() {
    setBusy(true);
    setError(null);
    try {
      if (status?.connected === true) {
        await client.disconnectGmail();
        setStatus({ ...status, connected: false, email: null });
        setBusy(false);
      } else {
        window.location.assign(await client.connectGmail());
      }
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-4 border-b border-edge/60 py-4">
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[22px] leading-tight text-ink">Gmail</span>
        <Kicker className="mt-0.5 block truncate">
          {status === null
            ? 'Checking…'
            : status.connected
              ? `Connected · ${status.email ?? ''}`
              : 'Draft and send email from your address'}
        </Kicker>
        {error !== null && (
          <span role="alert" className="mt-1 block font-mono text-[11px] text-danger">
            {error}
          </span>
        )}
      </span>
      {status !== null && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act()}
          className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
            status.connected ? 'text-faint hover:text-danger' : 'text-accent'
          }`}
        >
          {status.connected ? 'Disconnect' : 'Connect →'}
        </button>
      )}
    </li>
  );
}

/** Phone "More" tab: the sections that don't fit in the tab bar, and connections. */
export function MoreView({
  sections,
  onSelect,
  client,
  gmail = false,
}: {
  sections: NavSection[];
  onSelect: (key: string) => void;
  client?: ControlPlaneClient;
  gmail?: boolean;
}) {
  return (
    <div className={`safe-x mx-auto w-full ${PAGE_WIDTH} pb-8 pt-4`}>
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
      {gmail && client !== undefined && (
        <section className="mt-10" aria-label="Connections">
          <SectionHead label="Connections" />
          <ul>
            <GmailConnection client={client} />
          </ul>
        </section>
      )}
    </div>
  );
}
