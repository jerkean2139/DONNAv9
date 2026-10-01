import type { ControlPlaneClient } from '../api/client';
import type { Navigate } from '../route';
import { Attachments } from './Attachments';
import {
  Crumbs,
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

/** One client: its files & links, and its projects. */
export function ClientView({
  client,
  id,
  navigate,
}: {
  client: ControlPlaneClient;
  id: string;
  navigate: Navigate;
}) {
  const { data, error, setData } = useLoad(() => client.getClient(id), [client, id]);

  return (
    <Page>
      <Folio
        left={
          <Crumbs
            items={[
              { label: 'Clients', onClick: () => navigate({ view: 'clients' }) },
              { label: data?.client.name ?? '…' },
            ]}
          />
        }
        right="Client"
      />
      {data === null ? (
        <LoadState error={error} />
      ) : (
        <>
          <PageTitle>{data.client.name}</PageTitle>
          <div className="mt-3">
            <Kicker className="text-muted">
              {data.client.status} · {data.projects.length} project
              {data.projects.length === 1 ? '' : 's'}
            </Kicker>
          </div>

          <section className="mt-10" aria-labelledby="projects-heading">
            <SectionHead id="projects-heading" label="Projects" count={data.projects.length} />
            <InlineAdd
              label="New project name"
              placeholder="Add a project…"
              serif
              onAdd={async (name) => {
                const project = await client.createProject(name, id);
                setData({ ...data, projects: [...data.projects, project] });
              }}
            />
            {data.projects.length === 0 ? (
              <Empty>No projects for {data.client.name} yet.</Empty>
            ) : (
              <ul aria-label="Projects">
                {data.projects.map((p, i) => (
                  <Row
                    key={p.id}
                    index={i}
                    title={p.name}
                    onOpen={() => navigate({ view: 'project', id: p.id })}
                  />
                ))}
              </ul>
            )}
          </section>

          <Attachments
            client={client}
            target={{ type: 'client', id }}
            items={data.attachments}
            onChange={(attachments) => setData({ ...data, attachments })}
          />
        </>
      )}
    </Page>
  );
}
