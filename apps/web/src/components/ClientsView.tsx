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
  useLoad,
} from './ui';

/** The client roster — the top of the hierarchy. */
export function ClientsView({
  client,
  navigate,
}: {
  client: ControlPlaneClient;
  navigate: Navigate;
}) {
  const { data, error, setData } = useLoad(() => client.listClients(), [client]);

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
    </Page>
  );
}
