import type { ControlPlaneClient } from '../api/client';
import type { Navigate } from '../route';
import { Empty, Folio, Kicker, LoadState, Page, PageTitle, Row, SectionHead, useLoad } from './ui';

/** Every project, labeled with its client. */
export function ProjectsView({
  client,
  navigate,
}: {
  client: ControlPlaneClient;
  navigate: Navigate;
}) {
  const { data, error } = useLoad(async () => {
    const [projects, clients] = await Promise.all([client.listProjects(), client.listClients()]);
    return { projects, clientName: new Map(clients.map((c) => [c.id, c.name])) };
  }, [client]);

  return (
    <Page>
      <Folio left="The docket" right="All projects" />
      <PageTitle>Projects</PageTitle>
      <section className="mt-10" aria-labelledby="all-projects">
        <SectionHead id="all-projects" label="All projects" count={data?.projects.length ?? 0} />
        {data === null ? (
          <LoadState error={error} />
        ) : data.projects.length === 0 ? (
          <Empty>No projects yet — add one from a client.</Empty>
        ) : (
          <ul aria-label="Projects">
            {data.projects.map((p, i) => (
              <Row
                key={p.id}
                index={i}
                title={p.name}
                meta={
                  <Kicker>
                    {p.clientId !== null
                      ? (data.clientName.get(p.clientId) ?? 'Client')
                      : 'Internal'}
                  </Kicker>
                }
                onOpen={() => navigate({ view: 'project', id: p.id })}
              />
            ))}
          </ul>
        )}
        <p className="mt-6">
          <button
            type="button"
            onClick={() => navigate({ view: 'clients' })}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
          >
            + New project from a client →
          </button>
        </p>
      </section>
    </Page>
  );
}
