import type { AuthMode, ObjectiveView } from '../types';
import { DonnaAvatar } from './DonnaAvatar';
import { PlanCard } from './PlanCard';
import { StatusChip } from './StatusChip';
import { PAGE_WIDTH } from './ui';

const SUGGESTIONS = [
  'Follow up with this week’s warm leads',
  'Prep the board update for Friday',
  'Plan next week’s priorities',
];

function partOfDay(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function dayOfYear(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

/** Donna's read on the day, in her own voice. */
function donnaSays(objectives: ObjectiveView[], authMode: AuthMode): string {
  if (authMode === 'unconfigured') return 'I’m ready when you are — I just can’t sign you in yet.';
  const open = objectives.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
  if (open.length === 0) return 'Nothing’s on fire. Tell me what we’re getting done.';
  const blocked = open.filter((o) => o.status === 'blocked').length;
  const n = `${open.length} thing${open.length === 1 ? '' : 's'} in motion`;
  return blocked > 0 ? `${n}. ${blocked} need${blocked === 1 ? 's' : ''} you.` : `${n}. I’m on it.`;
}

export interface PlanActions {
  approve: (objectiveId: string, taskIndexes: number[]) => Promise<void>;
  dismiss: (objectiveId: string) => Promise<void>;
  retry: (objectiveId: string) => Promise<void>;
  openProject: (projectId: string) => void;
}

interface Props {
  objectives: ObjectiveView[];
  loading: boolean;
  authMode: AuthMode;
  onSuggest: (text: string) => void;
  /** Whether Donna can plan (a model is configured). */
  planner?: boolean;
  plans?: PlanActions;
  /** Open an objective's kitchen thread (the work behind it). */
  onOpenKitchen?: (objectiveId: string) => void;
  /** The objective whose kitchen thread is open, if any. */
  kitchenId?: string | null;
  now?: Date;
}

export function TodayView({
  objectives,
  loading,
  authMode,
  onSuggest,
  planner = false,
  plans,
  onOpenKitchen,
  kitchenId = null,
  now = new Date(),
}: Props) {
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const date = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  return (
    <div className={`safe-x mx-auto w-full ${PAGE_WIDTH} pb-8 md:px-10`}>
      {/* Masthead */}
      <header className="pt-4 md:pt-14">
        <div className="flex items-center justify-between border-b border-edge pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
          <span>The Daily Brief</span>
          <span>No. {dayOfYear(now)}</span>
        </div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          {weekday} · {date}
        </p>
        <h1 className="mt-2 font-serif text-[52px] leading-[0.95] tracking-[-0.01em] text-ink md:text-[68px]">
          Good <em className="text-accent">{partOfDay(now)}</em>.
        </h1>
        <div className="mt-5 flex items-start gap-3">
          <DonnaAvatar size={36} className="mt-0.5" />
          <div>
            <p className="font-serif text-[22px] leading-snug text-ink/90">
              {donnaSays(objectives, authMode)}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              — Donna
            </p>
          </div>
        </div>
      </header>

      {authMode === 'unconfigured' && (
        <aside role="note" className="mt-8 animate-rise border-l-2 border-accent pl-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Editor’s note · Setup
          </p>
          <p className="mt-2 font-serif text-[20px] leading-snug text-ink">
            Sign-in isn’t set up yet.
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            Add{' '}
            <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-ink">
              CLERK_PUBLISHABLE_KEY
            </code>{' '}
            to the API service in Railway, then reload — and I’m all yours.
          </p>
        </aside>
      )}

      {authMode !== 'unconfigured' && !planner && (
        <aside role="note" aria-label="Planning" className="mt-8 border-l-2 border-edge pl-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Editor’s note · Planning
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            I’ll track what you tell me, but I can’t plan or draft yet. Add{' '}
            <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-ink">
              ANTHROPIC_API_KEY
            </code>{' '}
            to the API service in Railway and I’ll turn each outcome into a plan.
          </p>
        </aside>
      )}

      {/* The agenda */}
      <section className="mt-10" aria-labelledby="agenda-heading">
        <div className="flex items-baseline justify-between border-b border-edge pb-2">
          <h2
            id="agenda-heading"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
          >
            The Agenda
          </h2>
          <span className="font-mono text-[10px] tracking-[0.18em] text-faint">
            ({String(objectives.length).padStart(2, '0')})
          </span>
        </div>

        {loading ? (
          <ul aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-4 border-b border-edge/60 py-5">
                <span className="h-7 w-8 animate-pulse rounded bg-raised" />
                <span className="h-5 flex-1 animate-pulse rounded bg-raised" />
              </li>
            ))}
          </ul>
        ) : objectives.length === 0 && authMode === 'unconfigured' ? (
          <p className="py-6 font-serif text-[20px] italic text-faint">
            Your agenda prints here once I can sign you in.
          </p>
        ) : objectives.length === 0 ? (
          <div className="py-6">
            <p className="font-serif text-[26px] italic leading-tight text-muted">
              The agenda is clear.
            </p>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Try one of these
            </p>
            <ul className="mt-2">
              {SUGGESTIONS.map((s) => (
                <li key={s} className="border-b border-edge/60">
                  <button
                    type="button"
                    onClick={() => onSuggest(s)}
                    className="group flex w-full items-center justify-between gap-3 py-3.5 text-left font-serif text-[20px] leading-snug text-ink/85 transition-colors hover:text-ink"
                  >
                    {s}
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
          </div>
        ) : (
          <ol aria-label="Objectives">
            {objectives.map((o, i) => (
              <li
                key={o.id}
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                className="grid animate-rise grid-cols-[2.75rem_1fr] gap-x-2 border-b border-edge/60 py-4"
              >
                <span className="font-serif text-[30px] leading-none text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="text-[17px] leading-snug text-ink">{o.requestedOutcome}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <StatusChip status={o.status} />
                    {onOpenKitchen !== undefined && (
                      <button
                        type="button"
                        onClick={() => onOpenKitchen(o.id)}
                        aria-pressed={kitchenId === o.id}
                        aria-label={`In the kitchen: ${o.requestedOutcome}`}
                        className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                          kitchenId === o.id ? 'text-accent' : 'text-faint hover:text-muted'
                        }`}
                      >
                        In the kitchen →
                      </button>
                    )}
                  </div>
                  {plans !== undefined && (
                    <PlanCard
                      objective={o}
                      onApprove={(idx) => plans.approve(o.id, idx)}
                      onDismiss={() => plans.dismiss(o.id)}
                      onRetry={() => plans.retry(o.id)}
                      onOpenProject={plans.openProject}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
