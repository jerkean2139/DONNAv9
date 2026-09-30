import type { AuthMode, ObjectiveView } from '../types';
import { LockIcon } from './icons';
import { StatusChip } from './StatusChip';

const SUGGESTIONS = [
  'Follow up with this week’s warm leads',
  'Prep the board update for Friday',
  'Plan next week’s priorities',
];

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function summary(objectives: ObjectiveView[]): string {
  const open = objectives.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
  if (open.length === 0) return 'Nothing in motion yet. What should we get done?';
  const blocked = open.filter((o) => o.status === 'blocked').length;
  const base = `${open.length} objective${open.length === 1 ? '' : 's'} in motion`;
  return blocked > 0 ? `${base} · ${blocked} blocked` : `${base}.`;
}

interface Props {
  objectives: ObjectiveView[];
  loading: boolean;
  authMode: AuthMode;
  onSuggest: (text: string) => void;
}

export function TodayView({ objectives, loading, authMode, onSuggest }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-5 md:pt-10">
      <section>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {greeting(new Date())}.
          </h1>
          <p className="mt-0.5 text-sm text-muted">{summary(objectives)}</p>
        </div>
      </section>

      {authMode === 'unconfigured' && (
        <section
          role="note"
          className="mt-6 flex gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4"
        >
          <LockIcon className="mt-0.5 shrink-0 text-warning" width={20} height={20} />
          <div className="text-sm">
            <div className="font-medium text-ink">Sign-in isn’t set up yet</div>
            <p className="mt-1 text-muted">
              Donna needs a Clerk publishable key before she can take commands. Add{' '}
              <code className="rounded bg-raised px-1 py-0.5 text-[12px] text-ink">
                CLERK_PUBLISHABLE_KEY
              </code>{' '}
              to the API service in Railway, then reload.
            </p>
          </div>
        </section>
      )}

      <section className="mt-8" aria-labelledby="objectives-heading">
        <h2
          id="objectives-heading"
          className="px-1 text-xs font-medium uppercase tracking-wider text-faint"
        >
          Objectives
        </h2>

        {loading ? (
          <ul className="mt-3 space-y-2" aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="h-[60px] animate-pulse rounded-2xl bg-panel" />
            ))}
          </ul>
        ) : objectives.length === 0 && authMode === 'unconfigured' ? (
          <p className="mt-3 px-1 text-sm text-faint">
            Your objectives will appear here once sign-in is set up.
          </p>
        ) : objectives.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-edge p-5">
            <p className="text-sm text-muted">
              Tell me an outcome and I’ll turn it into an objective. For example:
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onSuggest(s)}
                    className="rounded-full border border-edge bg-panel px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent/50 disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="mt-3 space-y-2" aria-label="Objectives">
            {objectives.map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-2xl border border-edge bg-panel px-4 py-3.5 shadow-card"
              >
                <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink">
                  {o.requestedOutcome}
                </span>
                <StatusChip status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
