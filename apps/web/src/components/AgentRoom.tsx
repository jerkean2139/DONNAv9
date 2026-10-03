import { Fragment, useEffect, useState, type ReactNode } from 'react';

import type { AgentMessage, AgentProfile, AgentRun, AgentStatus } from '../data/sampleAgentRun';
import { DonnaAvatar } from './DonnaAvatar';
import { Kicker } from './ui';

const STATUS_TEXT: Record<AgentStatus, string> = {
  standing_by: 'Standing by',
  working: 'Working',
  waiting: 'Waiting',
  done: 'Done',
};

const STATUS_DOT: Record<AgentStatus, string> = {
  standing_by: 'bg-faint',
  working: 'bg-accent animate-breathe',
  waiting: 'bg-warning',
  done: 'bg-success',
};

/** Seconds between messages while playing. */
const PLAY_STEP_MS = 1_400;

function Badge({ agent, size = 28 }: { agent: AgentProfile; size?: number }) {
  if (agent.orchestrator === true) return <DonnaAvatar size={size} />;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[11px] text-ink ring-1 ring-edge"
    >
      {agent.name.charAt(0)}
    </span>
  );
}

/** The profile card shown when an agent is hovered, focused or tapped. */
function ProfileCard({ agent }: { agent: AgentProfile }) {
  return (
    <div
      role="tooltip"
      className="absolute left-0 top-full z-20 mt-2 w-80 max-w-full rounded-xl border border-edge bg-panel p-4 text-left shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <Badge agent={agent} size={36} />
        <div className="min-w-0">
          <div className="font-serif text-[20px] leading-tight text-ink">{agent.name}</div>
          <Kicker>{agent.role}</Kicker>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink">{agent.goal}</p>
      <Kicker className="mt-3 block">Duties</Kicker>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-muted">
        {agent.duties.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <Kicker className="mt-3 block">Allowed to touch</Kicker>
      <p className="mt-1 text-[12px] text-muted">{agent.allowedTools.join(' · ')}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-3 font-mono text-[10px] uppercase tracking-[0.12em]">
        <div>
          <dt className="text-faint">Status</dt>
          <dd className="mt-0.5 text-ink">{STATUS_TEXT[agent.status]}</dd>
        </div>
        <div>
          <dt className="text-faint">Budget</dt>
          <dd className="mt-0.5 text-ink">${agent.budgetUsd.toFixed(2)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-faint">Model</dt>
          <dd className="mt-0.5 normal-case tracking-normal text-ink">{agent.model}</dd>
        </div>
      </dl>
    </div>
  );
}

/** One agent in the roster; hover, focus or tap shows its profile. */
function RosterChip({
  agent,
  open,
  onOpen,
  onClose,
}: {
  agent: AgentProfile;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <li onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${agent.name}, ${agent.role}`}
        onFocus={onOpen}
        onBlur={onClose}
        onClick={() => (open ? onClose() : onOpen())}
        className="flex items-center gap-2 rounded-full border border-edge bg-raised/60 py-1 pl-1 pr-3 hover:border-accent/60"
      >
        <Badge agent={agent} size={24} />
        <span className="text-[13px] text-ink">{agent.name}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
      </button>
      {open && <ProfileCard agent={agent} />}
    </li>
  );
}

/** Message text with @tags highlighted when they name an agent in the run. */
function withMentions(text: string, agents: ReadonlyMap<string, AgentProfile>): ReactNode {
  return text.split(/(@[a-z]+)/g).map((part, i) => {
    const agent = part.startsWith('@') ? agents.get(part.slice(1)) : undefined;
    return agent === undefined ? (
      <Fragment key={i}>{part}</Fragment>
    ) : (
      <span key={i} className="rounded bg-accent/15 px-1 font-medium text-accent">
        @{agent.name}
      </span>
    );
  });
}

function formatAt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const KIND_LABEL: Partial<Record<AgentMessage['kind'], string>> = {
  spawn: 'Spun up',
  handoff: 'Handoff',
  check: 'Check',
  done: 'Wrap-up',
};

function RoomMessage({
  message,
  agents,
}: {
  message: AgentMessage;
  agents: ReadonlyMap<string, AgentProfile>;
}) {
  const from = agents.get(message.from);
  if (from === undefined) return null;
  if (message.kind === 'spawn') {
    return (
      <li className="flex animate-rise items-center gap-3 py-1">
        <span className="h-px flex-1 bg-edge" />
        <span className="max-w-[80%] text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {withMentions(message.text, agents)}
        </span>
        <span className="h-px flex-1 bg-edge" />
      </li>
    );
  }
  return (
    <li className="flex animate-rise gap-3">
      <Badge agent={from} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-ink">{from.name}</span>
          <Kicker>{from.role}</Kicker>
          {KIND_LABEL[message.kind] !== undefined && (
            <Kicker className="text-accent">{KIND_LABEL[message.kind]}</Kicker>
          )}
          <span className="font-mono text-[10px] text-faint">{formatAt(message.at)}</span>
        </div>
        <div
          className={`mt-1 rounded-2xl px-3.5 py-2 text-[14px] leading-snug text-ink ring-1 ${
            message.kind === 'check'
              ? 'bg-raised ring-warning/40'
              : message.kind === 'done'
                ? 'bg-raised ring-success/40'
                : 'bg-raised ring-edge'
          }`}
        >
          {withMentions(message.text, agents)}
        </div>
      </div>
    </li>
  );
}

/**
 * The agent room: Donna and the specialists she spins up, talking a goal
 * through to done. Plays a run message by message so you can follow who was
 * tagged and why, and hover any agent for its profile.
 */
export function AgentRoom({ run, sample = false }: { run: AgentRun; sample?: boolean }) {
  const agents = new Map(run.agents.map((a) => [a.id, a]));
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const total = run.messages.length;

  useEffect(() => {
    if (!playing || shown >= total) return;
    const timer = setTimeout(() => setShown((n) => Math.min(n + 1, total)), PLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, shown, total]);

  // Only agents that have been spun up (or Donna) are in the room so far.
  const visible = run.messages.slice(0, shown);
  const present = run.agents.filter(
    (a) =>
      a.orchestrator === true ||
      visible.some((m) => m.from === a.id || m.text.includes(`@${a.id}`)),
  );
  const finished = shown >= total;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-edge px-5 py-3 lg:px-6">
        {sample && (
          <p className="mb-2 rounded-md bg-warning/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
            Sample run. Specialist agents aren&rsquo;t live yet.
          </p>
        )}
        <Kicker>In the room · {present.length}</Kicker>
        <ul className="relative mt-2 flex flex-wrap gap-2" aria-label="Agents">
          {present.map((a) => (
            <RosterChip
              key={a.id}
              agent={a}
              open={openAgent === a.id}
              onOpen={() => setOpenAgent(a.id)}
              onClose={() => setOpenAgent((cur) => (cur === a.id ? null : cur))}
            />
          ))}
        </ul>
      </div>

      <ol
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6"
        aria-label="Agent conversation"
        aria-live="polite"
      >
        {visible.map((m) => (
          <RoomMessage key={m.id} message={m} agents={agents} />
        ))}
      </ol>

      <div className="flex shrink-0 items-center gap-4 border-t border-edge px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] lg:px-6">
        <button
          type="button"
          onClick={() => {
            if (finished) {
              setShown(1);
              setPlaying(true);
            } else setPlaying((p) => !p);
          }}
          className="text-accent"
        >
          {finished ? 'Replay' : playing ? 'Pause' : 'Play'}
        </button>
        {!finished && (
          <button
            type="button"
            onClick={() => {
              setShown(total);
              setPlaying(false);
            }}
            className="text-faint hover:text-ink"
          >
            Show all
          </button>
        )}
        <span className="ml-auto text-faint">
          {shown}/{total}
        </span>
      </div>
    </div>
  );
}
