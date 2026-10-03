import { useState } from 'react';

import type { ControlPlaneClient } from '../api/client';
import type { Navigate } from '../route';
import {
  Empty,
  Folio,
  InlineAdd,
  Kicker,
  LoadState,
  Page,
  PageTitle,
  Row,
  SectionHead,
  describe,
  useLoad,
} from './ui';

/** Matches the server's demo marker (control-plane `demo/demo-data.ts`). */
const DEMO_MARKER = 'Demo client: fictional data for demos.';

/** The client roster — the top of the hierarchy. */
export function ClientsView({
  client,
  navigate,
}: {
  client: ControlPlaneClient;
  navigate: Navigate;
}) {
  const { data, error, setData, reload } = useLoad(() => client.listClients(), [client]);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const hasDemo = (data ?? []).some((c) => (c.notes ?? '').startsWith(DEMO_MARKER));

  async function toggleDemo() {
    setDemoBusy(true);
    setDemoError(null);
    try {
      if (hasDemo) await client.removeDemo();
      else await client.loadDemo();
      reload();
    } catch (err) {
      setDemoError(describe(err));
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <Page>
      <Folio left="The roster" />
      <PageTitle>Clients</PageTitle>
      <p className="mt-4 font-serif text-[20px] italic leading-snug text-muted">
        Everyone you do the work for. Clients hold projects, projects run in sprints, sprints hold
        tasks — and every level keeps its own files and links.
      </p>

      <section className="mt-10" aria-labelledby="clients-heading">
        <SectionHead id="clients-heading" label="All clients" count={data?.length ?? 0} />
        <InlineAdd
          label="New client name"
          placeholder="Add a client…"
          serif
          onAdd={async (name) => {
            const created = await client.createClient(name);
            setData([...(data ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
          }}
        />
        {data === null ? (
          <LoadState error={error} />
        ) : data.length === 0 ? (
          <Empty>No clients yet. Add your first one above.</Empty>
        ) : (
          <ul aria-label="Clients">
            {data.map((c, i) => (
              <Row
                key={c.id}
                index={i}
                title={c.name}
                meta={
                  <Kicker>
                    {c.projectCount} project{c.projectCount === 1 ? '' : 's'}
                    {c.status !== 'active' ? ` · ${c.status}` : ''}
                  </Kicker>
                }
                onOpen={() => navigate({ view: 'client', id: c.id })}
              />
            ))}
          </ul>
        )}
      </section>

      {data !== null && (
        <section className="mt-10" aria-label="Demo data">
          <SectionHead label="Demo data" />
          <div className="flex items-center gap-4 py-4">
            <p className="min-w-0 flex-1 text-[14px] leading-snug text-muted">
              {hasDemo
                ? 'Summit Ridge Roofing is a fictional demo client. Remove it and everything under it in one click.'
                : 'Load a fictional client with three projects, dated sprints, tasks and subtasks to show how DONNA runs the work.'}
            </p>
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => void toggleDemo()}
              className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] disabled:opacity-50 ${
                hasDemo ? 'text-faint hover:text-danger' : 'text-accent'
              }`}
            >
              {demoBusy ? 'Working…' : hasDemo ? 'Remove demo' : 'Load demo client →'}
            </button>
          </div>
          {demoError !== null && (
            <p role="alert" className="font-mono text-[11px] text-danger">
              {demoError}
            </p>
          )}
        </section>
      )}
    </Page>
  );
}
