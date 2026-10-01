import type { ControlPlaneClient } from '../api/client';
import type { WorkItemView } from '../types';
import { Check, InlineAdd, Kicker } from './ui';

interface Props {
  client: ControlPlaneClient;
  projectId: string;
  sprintId: string | null;
  /** All tasks and subtasks of the project (subtasks are counted, not listed). */
  all: WorkItemView[];
  onChange: (all: WorkItemView[]) => void;
  onOpen: (taskId: string) => void;
  addLabel: string;
}

/** The top-level tasks of one sprint (or the backlog), with check-off and add. */
export function TaskList({ client, projectId, sprintId, all, onChange, onOpen, addLabel }: Props) {
  const tasks = all.filter((t) => t.parentId === null && t.sprintId === sprintId);

  async function toggle(task: WorkItemView) {
    const status = task.status === 'done' ? 'todo' : 'done';
    onChange(all.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await client.updateTask(task.id, { status });
    } catch {
      onChange(all); // revert on failure
    }
  }

  return (
    <div>
      <ul>
        {tasks.map((t) => {
          const subs = all.filter((s) => s.parentId === t.id);
          const subsDone = subs.filter((s) => s.status === 'done').length;
          return (
            <li key={t.id} className="flex items-start gap-3 border-b border-edge/60 py-3.5">
              <span className="pt-0.5">
                <Check
                  done={t.status === 'done'}
                  onToggle={() => void toggle(t)}
                  label={`Complete ${t.title}`}
                />
              </span>
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="group min-w-0 flex-1 text-left"
              >
                <span
                  className={`block break-words text-[16px] leading-snug ${
                    t.status === 'done' ? 'text-faint line-through decoration-faint' : 'text-ink'
                  }`}
                >
                  {t.title}
                </span>
                {(subs.length > 0 || t.status === 'in_progress' || t.owner === 'donna') && (
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {t.owner === 'donna' && (
                      <Kicker className="text-accent">
                        {t.draftStatus === 'ready'
                          ? 'Donna · draft ready'
                          : t.draftStatus === 'drafting'
                            ? 'Donna · writing…'
                            : 'Donna'}
                      </Kicker>
                    )}
                    {t.status === 'in_progress' && (
                      <Kicker className="text-accent">In progress</Kicker>
                    )}
                    {subs.length > 0 && (
                      <Kicker>
                        {subsDone}/{subs.length} subtasks
                      </Kicker>
                    )}
                  </span>
                )}
              </button>
              <span aria-hidden="true" className="pt-0.5 text-faint">
                →
              </span>
            </li>
          );
        })}
      </ul>
      <InlineAdd
        label={addLabel}
        placeholder="Add a task…"
        onAdd={async (title) => {
          const task = await client.createTask(projectId, { title, sprintId });
          onChange([...all, task]);
        }}
      />
    </div>
  );
}
