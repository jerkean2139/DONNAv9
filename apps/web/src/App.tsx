import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ApiError, type ControlPlaneClient } from './api/client';
import { ClientsView } from './components/ClientsView';
import { ClientView } from './components/ClientView';
import { CommandBar, type CommandStatus } from './components/CommandBar';
import { GlanceCard } from './components/GlanceCard';
import { MoreView } from './components/MoreView';
import { ProjectsView } from './components/ProjectsView';
import { ProjectView } from './components/ProjectView';
import { SectionPlaceholder } from './components/SectionPlaceholder';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { TasksView } from './components/TasksView';
import { TaskView } from './components/TaskView';
import { TodayView } from './components/TodayView';
import { TopBar } from './components/TopBar';
import { PRIMARY_TABS, SECTIONS } from './data/sections';
import { routeFor, type Route } from './route';
import type { AuthMode, ControlPlaneHealth, ObjectiveView } from './types';

const HEALTH_POLL_MS = 30_000;
const NOTICE_MS = 3_000;

interface Props {
  client: ControlPlaneClient;
  /** How requests are signed; 'unconfigured' disables commands up front. */
  authMode?: AuthMode;
  /** The signed-in user's control (e.g. Clerk's UserButton or a dev badge). */
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

export function App({ client, authMode = 'dev', account }: Props) {
  const [route, setRoute] = useState<Route>({ view: 'today' });
  // The tab you're in. Drilling down (client → project → task) stays in the
  // tab you started from, like an iOS navigation stack.
  const [tab, setTab] = useState('today');
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useCallback((next: Route) => {
    setRoute(next);
    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
  }, []);
  const selectSection = useCallback(
    (key: string) => {
      setTab(key);
      navigate(routeFor(key));
    },
    [navigate],
  );
  const [objectives, setObjectives] = useState<ObjectiveView[]>([]);
  const [loading, setLoading] = useState(authMode !== 'unconfigured');
  const [health, setHealth] = useState<ControlPlaneHealth>('checking');
  const [status, setStatus] = useState<CommandStatus>({ kind: 'idle' });
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>();

  const checkHealth = useCallback(async () => {
    try {
      const res = await client.health();
      setHealth(res.status === 'ok' ? 'ok' : 'degraded');
    } catch {
      setHealth('down');
    }
  }, [client]);

  useEffect(() => {
    void checkHealth();
    const timer = setInterval(() => void checkHealth(), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [checkHealth]);

  useEffect(() => {
    if (authMode === 'unconfigured') return;
    let cancelled = false;
    client.listObjectives().then(
      (list) => {
        if (cancelled) return;
        setObjectives(list);
        setLoading(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setStatus({ kind: 'error', message: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, authMode]);

  // Confirmations fade on their own; errors stay until the next action.
  useEffect(() => {
    if (status.kind !== 'notice') return;
    const timer = setTimeout(() => setStatus({ kind: 'idle' }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [status]);

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
      setStatus({ kind: 'notice', message: 'Got it — it’s on the agenda.' });
      return true;
    } catch (error) {
      setStatus({ kind: 'error', message: describeError(error) });
      return false;
    }
  }

  const tabs = SECTIONS.filter((s) => PRIMARY_TABS.includes(s.key));
  const overflow = SECTIONS.filter((s) => !PRIMARY_TABS.includes(s.key));
  const active = route.view === 'more' ? 'more' : tab;
  const moreActive = active === 'more' || overflow.some((s) => s.key === active);

  let view: ReactNode;
  switch (route.view) {
    case 'today':
      view = (
        <TodayView
          objectives={objectives}
          loading={loading}
          authMode={authMode}
          onSuggest={(text) => setPrefill({ text, nonce: Date.now() })}
        />
      );
      break;
    case 'clients':
      view = <ClientsView client={client} navigate={navigate} />;
      break;
    case 'client':
      view = <ClientView key={route.id} client={client} id={route.id} navigate={navigate} />;
      break;
    case 'projects':
      view = <ProjectsView client={client} navigate={navigate} />;
      break;
    case 'project':
      view = <ProjectView key={route.id} client={client} id={route.id} navigate={navigate} />;
      break;
    case 'tasks':
      view = <TasksView client={client} navigate={navigate} />;
      break;
    case 'task':
      view = <TaskView key={route.id} client={client} id={route.id} navigate={navigate} />;
      break;
    case 'more':
      view = <MoreView sections={overflow} onSelect={selectSection} />;
      break;
    case 'section': {
      const section = SECTIONS.find((s) => s.key === route.key);
      view =
        section === undefined ? null : (
          <SectionPlaceholder section={section} index={SECTIONS.indexOf(section)} />
        );
      break;
    }
  }

  return (
    <div className="grain ember-wash relative flex h-dvh flex-col bg-surface text-ink">
      <TopBar health={health} account={account} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          sections={SECTIONS}
          active={active}
          onSelect={selectSection}
          health={health}
          account={account}
        />
        <main className="relative z-10 flex min-w-0 flex-1 flex-col" aria-label="Workspace">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {view}
          </div>
          {/* The composer speaks to Donna; it lives on the brief. */}
          {route.view === 'today' && (
            <CommandBar
              onSubmit={handleCommand}
              status={status}
              {...(prefill !== undefined ? { prefill } : {})}
              {...(authMode === 'unconfigured' ? { disabledReason: 'Sign-in required' } : {})}
            />
          )}
        </main>
        {route.view === 'today' && <GlanceCard objectives={objectives} />}
      </div>
      <TabBar tabs={tabs} active={active} moreActive={moreActive} onSelect={selectSection} />
    </div>
  );
}
