import type { ControlPlaneClient } from '../api/client';
import type { Navigate } from '../route';
import { Empty, Folio, Kicker, LoadState, Page, PageTitle, SectionHead, useLoad } from './ui';

/** Every open task across your projects, grouped by project. */
export function TasksView({
  client,
  navigate,
}: {
  client: ControlPlaneClient;
  navigate: Navigate;
}) {
  const { data, error } = useLoad(() => client.listOpenTasks(), [client]);
  const groups =
    data === null
      ? []
      : data.projects
          .map((p) => {
            // Each task followed by its own open subtasks.
            const mine = data.tasks.filter((t) => t.projectId === p.id);
            const ordered = mine
              .filter((t) => t.parentId === null || !mine.some((m) => m.id === t.parentId))
              .flatMap((t) => [t, ...mine.filter((s) => s.parentId === t.id)]);
            return { project: p, tasks: ordered };
          })
          .filter((g) => g.tasks.length > 0);

  return (
    <Page>
      <Folio left="The to-do column" right="Open tasks" />
      <PageTitle>Tasks</PageTitle>
      {data === null ? (
        <LoadState error={error} />
      ) : groups.length === 0 ? (
        <Empty>Nothing open. Add tasks from a project’s sprints.</Empty>
      ) : (
        groups.map(({ project, tasks }) => (
          <section key={project.id} className="mt-10" aria-label={project.name}>
            <SectionHead
              label={project.name}
              count={tasks.length}
              action={
                <button
                  type="button"
                  onClick={() => navigate({ view: 'project', id: project.id })}
                  className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
                >
                  Open →
                </button>
              }
            />
            <ul>
              {tasks.map((t) => (
                <li key={t.id} className="border-b border-edge/60">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'task', id: t.id })}
                    className="flex w-full items-baseline justify-between gap-3 py-3 text-left"
                  >
                    <span className="min-w-0 break-words text-[16px] text-ink">
                      {t.parentId !== null && <span className="text-faint">↳ </span>}
                      {t.title}
                    </span>
                    {t.status === 'in_progress' && (
                      <Kicker className="shrink-0 text-accent">In progress</Kicker>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Page>
  );
}
