import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, type ControlPlaneClient } from './api/client';
import { ActiveWorkspace } from './components/ActiveWorkspace';
import { CommandBar, type CommandStatus } from './components/CommandBar';
import { ContextNav } from './components/ContextNav';
import { DonnaRail } from './components/DonnaRail';
import { HealthBar } from './components/HealthBar';
import {
  MOCK_ALERTS,
  MOCK_APPROVALS,
  MOCK_HEALTH,
  MOCK_NEXT_ACTION,
  MOCK_WORK,
  NAV_SECTIONS,
} from './data/mock';
import type { HealthView, ObjectiveView } from './types';

const HEALTH_POLL_MS = 30_000;

interface Props {
  client: ControlPlaneClient;
  /** Rendered at the right of the health bar (e.g. the signed-in user). */
  account?: ReactNode;
}

/** Plain-language explanation of an API failure for the command bar. */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Not signed in — sign in to send commands to Donna.';
    if (error.code === 'no_account')
      return 'Signed in, but your account is not provisioned in DONNA yet.';
    if (error.code === 'mfa_required') return 'Multi-factor authentication is required.';
    if (error.status === 403) return 'You are not allowed to create that objective.';
    return `The API refused the request (${error.code}).`;
  }
  return 'Could not reach the DONNA API.';
}

export function App({ client, account }: Props) {
  const [activeKey, setActiveKey] = useState('today');
  const [objectives, setObjectives] = useState<ObjectiveView[]>([]);
  const [controlPlane, setControlPlane] = useState<HealthView['controlPlane']>('checking');
  const [status, setStatus] = useState<CommandStatus>({ kind: 'idle' });

  const activeSection = useMemo(
    () => NAV_SECTIONS.find((s) => s.key === activeKey) ?? NAV_SECTIONS[0]!,
    [activeKey],
  );

  const checkHealth = useCallback(async () => {
    try {
      const res = await client.health();
      setControlPlane(res.status === 'ok' ? 'ok' : 'degraded');
    } catch {
      setControlPlane('down');
    }
  }, [client]);

  useEffect(() => {
    void checkHealth();
    const timer = setInterval(() => void checkHealth(), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [checkHealth]);

  useEffect(() => {
    let cancelled = false;
    client.listObjectives().then(
      (list) => {
        if (!cancelled) setObjectives(list);
      },
      (error: unknown) => {
        if (!cancelled) setStatus({ kind: 'error', message: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function handleCommand(text: string): Promise<boolean> {
    setStatus({ kind: 'sending' });
    try {
      // The command bar captures the outcome; its definition of done is refined
      // with Donna afterwards, so the draft starts with a placeholder.
      const result = await client.createObjective({
        requestedOutcome: text,
        definitionOfDone: 'To be defined with Donna',
      });
      if (result.status === 'approval_required') {
        setStatus({
          kind: 'notice',
          message: `Needs approval before it can start (${result.reason}).`,
        });
        return true;
      }
      setObjectives((prev) => [result.objective, ...prev]);
      setStatus({ kind: 'notice', message: 'Objective created.' });
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: describeError(error) });
      return false;
    }
  }

  const current = objectives[0] ?? null;

  return (
    <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-surface text-ink">
      <HealthBar health={{ ...MOCK_HEALTH, controlPlane }} account={account} />
      <div className="grid min-h-0 grid-cols-[220px_1fr_300px]">
        <ContextNav sections={NAV_SECTIONS} active={activeKey} onSelect={setActiveKey} />
        <ActiveWorkspace
          section={activeSection}
          objective={current}
          objectives={objectives}
          work={MOCK_WORK}
        />
        <DonnaRail
          objective={current}
          work={MOCK_WORK}
          approvals={MOCK_APPROVALS}
          alerts={MOCK_ALERTS}
          nextAction={MOCK_NEXT_ACTION}
        />
      </div>
      <CommandBar onSubmit={handleCommand} status={status} />
    </div>
  );
}
