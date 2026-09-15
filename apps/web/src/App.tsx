import { useMemo, useState } from 'react';

import { ActiveWorkspace } from './components/ActiveWorkspace';
import { CommandBar } from './components/CommandBar';
import { ContextNav } from './components/ContextNav';
import { DonnaRail } from './components/DonnaRail';
import { HealthBar } from './components/HealthBar';
import {
  MOCK_ALERTS,
  MOCK_APPROVALS,
  MOCK_HEALTH,
  MOCK_NEXT_ACTION,
  MOCK_OBJECTIVE,
  MOCK_WORK,
  NAV_SECTIONS,
} from './data/mock';
import type { ObjectiveView } from './types';

let draftSeq = 0;

export function App() {
  const [activeKey, setActiveKey] = useState('today');
  const [drafts, setDrafts] = useState<ObjectiveView[]>([]);

  const activeSection = useMemo(
    () => NAV_SECTIONS.find((s) => s.key === activeKey) ?? NAV_SECTIONS[0]!,
    [activeKey],
  );

  function handleCommand(text: string) {
    // Locally stage the outcome as a draft objective. Once the API is wired,
    // this POSTs to /objectives (policy-gated) and the draft comes back via the
    // event stream instead of local state.
    draftSeq += 1;
    setDrafts((prev) => [
      { id: `draft-${draftSeq}`, requestedOutcome: text, status: 'draft' },
      ...prev,
    ]);
  }

  return (
    <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-surface text-ink">
      <HealthBar health={MOCK_HEALTH} />
      <div className="grid min-h-0 grid-cols-[220px_1fr_300px]">
        <ContextNav sections={NAV_SECTIONS} active={activeKey} onSelect={setActiveKey} />
        <ActiveWorkspace
          section={activeSection}
          objective={MOCK_OBJECTIVE}
          drafts={drafts}
          work={MOCK_WORK}
        />
        <DonnaRail
          objective={MOCK_OBJECTIVE}
          work={MOCK_WORK}
          approvals={MOCK_APPROVALS}
          alerts={MOCK_ALERTS}
          nextAction={MOCK_NEXT_ACTION}
        />
      </div>
      <CommandBar onSubmit={handleCommand} />
    </div>
  );
}
