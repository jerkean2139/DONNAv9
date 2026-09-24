import type { ApprovalView, HealthView, NavSection, WorkItemView } from '../types';

// Placeholder data for the panels not yet backed by the API (objectives and
// control-plane health are live). Clearly mock — replaced by live event/task
// projections (Technical Plan §4.2).

export const NAV_SECTIONS: NavSection[] = [
  { key: 'today', label: 'Today' },
  { key: 'projects', label: 'Projects' },
  { key: 'people', label: 'People' },
  { key: 'leads', label: 'Leads' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'memory', label: 'Memory & Knowledge' },
  { key: 'automations', label: 'Automations' },
];

export const MOCK_WORK: WorkItemView[] = [
  { id: 'w1', label: 'Draft launch checklist', worker: 'local-ai', state: 'running' },
  { id: 'w2', label: 'Audit Route 40 repo', worker: 'coding-agent', state: 'checking' },
  { id: 'w3', label: 'Confirm domain DNS', worker: 'human', state: 'blocked' },
];

export const MOCK_APPROVALS: ApprovalView[] = [
  { id: 'a1', action: 'Deploy Route 40 to production', risk: 'high' },
];

export const MOCK_ALERTS: string[] = ['Omen node offline (travel) — routing to Dell/API'];

export const MOCK_NEXT_ACTION = 'Review the launch checklist Donna drafted';

export const MOCK_HEALTH: HealthView = {
  controlPlane: 'ok',
  activeJobs: 3,
  nodes: [
    { name: 'Dell', mode: 'AUTO', health: 'healthy' },
    { name: 'Omen', mode: 'OFF', health: 'offline' },
  ],
};
