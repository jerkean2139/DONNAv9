import { useState, type FormEvent } from 'react';

import type { ControlPlaneClient } from '../api/client';
import type { Navigate } from '../route';
import type { SprintView } from '../types';
import { Attachments } from './Attachments';
import { TaskList } from './TaskList';
import {
  Crumbs,
  Folio,
  Kicker,
  LoadState,
  Page,
  PageTitle,
  SectionHead,
  describe,
  useLoad,
} from './ui';

function dateRange(s: SprintView): string | null {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (s.startsOn && s.endsOn) return `${fmt(s.startsOn)} – ${fmt(s.endsOn)}`;
  if (s.startsOn) return `From ${fmt(s.startsOn)}`;
  if (s.endsOn) return `Until ${fmt(s.endsOn)}`;
  return null;
}

/** One project: sprints (each with its tasks), the backlog, and files & links. */
export function ProjectView({
  client,
  id,
  navigate,
}: {
  client: ControlPlaneClient;
  id: string;
  navigate: Navigate;
}) {
  const { data, error, setData } = useLoad(() => client.getProject(id), [client, id]);

  return (
    <Page>
      <Folio
        left={
          <Crumbs
            items={[
              { label: 'Clients', onClick: () => navigate({ view: 'clients' }) },
              ...(data?.client
                ? [
                    {
                      label: data.client.name,
                      onClick: () => navigate({ view: 'client', id: data.client!.id }),
                    },
                  ]
                : []),
              { label: data?.project.name ?? '…' },
            ]}
          />
        }
        right="Project"
      />
      {data === null ? (
        <LoadState error={error} />
      ) : (
        <>
          <PageTitle>{data.project.name}</PageTitle>
          <div className="mt-3">
            <Kicker className="text-muted">
              {data.sprints.length} sprint{data.sprints.length === 1 ? '' : 's'} ·{' '}
              {data.tasks.filter((t) => t.parentId === null && t.status !== 'done').length} open
              tasks
            </Kicker>
          </div>

          {data.sprints.map((s) => (
            <section key={s.id} className="mt-10" aria-label={s.name}>
              <SectionHead
                label={s.name}
                action={
                  <Kicker className={s.status === 'active' ? 'text-accent' : ''}>
                    {dateRange(s) ?? s.status}
                  </Kicker>
                }
              />
              <TaskList
                client={client}
                projectId={id}
                sprintId={s.id}
                all={data.tasks}
                onChange={(tasks) => setData({ ...data, tasks })}
                onOpen={(taskId) => navigate({ view: 'task', id: taskId })}
                addLabel={`New task in ${s.name}`}
              />
            </section>
          ))}

          <section className="mt-10" aria-label="Backlog">
            <SectionHead label="Backlog" />
            <TaskList
              client={client}
              projectId={id}
              sprintId={null}
              all={data.tasks}
              onChange={(tasks) => setData({ ...data, tasks })}
              onOpen={(taskId) => navigate({ view: 'task', id: taskId })}
              addLabel="New backlog task"
            />
          </section>

          <NewSprint
            onCreate={async (input) => {
              const sprint = await client.createSprint(id, input);
              setData({ ...data, sprints: [...data.sprints, sprint] });
            }}
          />

          <Attachments
            client={client}
            target={{ type: 'project', id }}
            items={data.attachments}
            onChange={(attachments) => setData({ ...data, attachments })}
          />
        </>
      )}
    </Page>
  );
}

function NewSprint({
  onCreate,
}: {
  onCreate: (input: { name: string; startsOn?: string; endsOn?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === '') return;
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        ...(startsOn !== '' ? { startsOn } : {}),
        ...(endsOn !== '' ? { endsOn } : {}),
      });
      setOpen(false);
      setName('');
      setStartsOn('');
      setEndsOn('');
    } catch (err) {
      setError(describe(err));
    }
  }

  if (!open) {
    return (
      <p className="mt-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
        >
          + New sprint
        </button>
      </p>
    );
  }

  const dateClass =
    'w-full rounded-md border border-edge bg-panel px-3 py-2 font-mono text-[13px] text-ink outline-none [color-scheme:dark] focus:border-accent';
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mt-8 border-l-2 border-accent pl-4"
      aria-label="New sprint"
    >
      <Kicker className="text-accent">New sprint</Kicker>
      <input
        aria-label="Sprint name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sprint 1"
        className="mt-2 w-full border-b border-edge bg-transparent py-2 font-serif text-[24px] text-ink outline-none placeholder:text-faint focus:border-accent"
      />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <Kicker>Starts</Kicker>
          <input
            type="date"
            aria-label="Starts on"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={`mt-1 ${dateClass}`}
          />
        </label>
        <label className="block">
          <Kicker>Ends</Kicker>
          <input
            type="date"
            aria-label="Ends on"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={`mt-1 ${dateClass}`}
          />
        </label>
      </div>
      {error !== null && (
        <p role="alert" className="mt-2 font-mono text-[11px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-4">
        <button
          type="submit"
          className="rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-surface"
        >
          Create sprint
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
