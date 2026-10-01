import { useState } from 'react';

import type { ControlPlaneClient } from '../api/client';
import type { Navigate } from '../route';
import type { WorkItemStatus, WorkItemView } from '../types';
import { Attachments } from './Attachments';
import { DonnaDraft } from './DonnaDraft';
import {
  Check,
  Crumbs,
  Folio,
  InlineAdd,
  Kicker,
  LoadState,
  Page,
  PageTitle,
  SectionHead,
  describe,
  useLoad,
} from './ui';

const STATUSES: { value: WorkItemStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

/** One task: status, sprint, subtasks, and files & links. */
export function TaskView({
  client,
  id,
  navigate,
  planner = false,
}: {
  client: ControlPlaneClient;
  id: string;
  navigate: Navigate;
  planner?: boolean;
}) {
  const { data, error, setData } = useLoad(async () => {
    const detail = await client.getTask(id);
    const project = await client.getProject(detail.task.projectId);
    return { ...detail, client: project.client, sprints: project.sprints };
  }, [client, id]);
  const [actionError, setActionError] = useState<string | null>(null);

  if (data === null) {
    return (
      <Page>
        <Folio
          left={
            <Crumbs
              items={[
                { label: 'Clients', onClick: () => navigate({ view: 'clients' }) },
                { label: '…' },
              ]}
            />
          }
        />
        <LoadState error={error} />
      </Page>
    );
  }

  const { task } = data;
  const parentSprint = data.sprints.find((s) => s.id === task.sprintId);

  async function patch(update: { status?: WorkItemStatus; sprintId?: string | null }) {
    if (data === null) return;
    setActionError(null);
    try {
      const updated = await client.updateTask(id, update);
      setData({ ...data, task: updated });
    } catch (err) {
      setActionError(describe(err));
    }
  }

  async function toggleSub(sub: WorkItemView) {
    if (data === null) return;
    const status = sub.status === 'done' ? 'todo' : 'done';
    setData({
      ...data,
      subtasks: data.subtasks.map((s) => (s.id === sub.id ? { ...s, status } : s)),
    });
    try {
      await client.updateTask(sub.id, { status });
    } catch (err) {
      setData(data);
      setActionError(describe(err));
    }
  }

  async function remove() {
    if (data === null) return;
    if (!window.confirm(`Delete “${task.title}” and its subtasks?`)) return;
    try {
      await client.deleteTask(id);
      navigate({ view: 'project', id: task.projectId });
    } catch (err) {
      setActionError(describe(err));
    }
  }

  return (
    <Page>
      <Folio
        left={
          <Crumbs
            items={[
              { label: 'Clients', onClick: () => navigate({ view: 'clients' }) },
              ...(data.client
                ? [
                    {
                      label: data.client.name,
                      onClick: () => navigate({ view: 'client', id: data.client!.id }),
                    },
                  ]
                : []),
              {
                label: data.project.name,
                onClick: () => navigate({ view: 'project', id: data.project.id }),
              },
            ]}
          />
        }
        right={task.parentId !== null ? 'Subtask' : 'Task'}
      />
      <PageTitle>{task.title}</PageTitle>

      <div role="radiogroup" aria-label="Status" className="mt-6 flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={task.status === s.value}
            onClick={() => void patch({ status: s.value })}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              task.status === s.value
                ? 'border-accent bg-accent text-surface'
                : 'border-edge text-muted hover:border-ink/40'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {task.parentId === null ? (
        <label className="mt-5 flex items-center gap-3">
          <Kicker>Sprint</Kicker>
          <select
            aria-label="Sprint"
            value={task.sprintId ?? ''}
            onChange={(e) =>
              void patch({ sprintId: e.target.value === '' ? null : e.target.value })
            }
            className="rounded-md border border-edge bg-panel px-2 py-1.5 font-mono text-[12px] text-ink outline-none [color-scheme:dark] focus:border-accent"
          >
            <option value="">Backlog</option>
            {data.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="mt-5">
          <Kicker>Sprint · {parentSprint?.name ?? 'Backlog'} (follows its task)</Kicker>
        </div>
      )}

      {actionError !== null && (
        <p role="alert" className="mt-3 font-mono text-[11px] text-danger">
          {actionError}
        </p>
      )}

      {task.parentId === null && (
        <section className="mt-10" aria-label="Subtasks">
          <SectionHead
            label="Subtasks"
            count={data.subtasks.length}
            action={
              data.subtasks.length > 0 ? (
                <Kicker>
                  {data.subtasks.filter((s) => s.status === 'done').length}/{data.subtasks.length}{' '}
                  done
                </Kicker>
              ) : undefined
            }
          />
          <ul>
            {data.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-edge/60 py-3">
                <Check
                  done={s.status === 'done'}
                  onToggle={() => void toggleSub(s)}
                  label={`Complete ${s.title}`}
                />
                <button
                  type="button"
                  onClick={() => navigate({ view: 'task', id: s.id })}
                  className={`min-w-0 flex-1 break-words text-left text-[15px] ${
                    s.status === 'done' ? 'text-faint line-through' : 'text-ink'
                  }`}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
          <InlineAdd
            label="New subtask"
            placeholder="Add a subtask…"
            onAdd={async (title) => {
              const sub = await client.createTask(task.projectId, { title, parentId: id });
              setData({ ...data, subtasks: [...data.subtasks, sub] });
            }}
          />
        </section>
      )}

      {task.parentId === null && (
        <DonnaDraft
          client={client}
          task={task}
          planner={planner}
          onChange={(updated) => setData((d) => (d === null ? d : { ...d, task: updated }))}
        />
      )}

      <Attachments
        client={client}
        target={{ type: 'task', id }}
        items={data.attachments}
        onChange={(attachments) => setData({ ...data, attachments })}
      />

      <p className="mt-12 border-t border-edge pt-4">
        <button
          type="button"
          onClick={() => void remove()}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-danger"
        >
          Delete {task.parentId !== null ? 'subtask' : 'task'}
        </button>
      </p>
    </Page>
  );
}
