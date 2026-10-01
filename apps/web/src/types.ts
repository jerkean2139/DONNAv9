// View-model types for the command experience. These mirror the control-plane
// domain shapes; once the API is wired, the typed client returns these directly.
// (apps/web stays behind the API boundary — it never imports @donna/db or
// @donna/policy; Technical Plan §2.)

export type ObjectiveStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'cancelled';

export interface ObjectiveView {
  id: string;
  requestedOutcome: string;
  status: ObjectiveStatus;
}

export interface WorkItemView {
  id: string;
  label: string;
  worker: string;
  state: 'running' | 'blocked' | 'checking' | 'awaiting_approval';
}

export interface ApprovalView {
  id: string;
  action: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export interface HealthView {
  controlPlane: 'ok' | 'checking' | 'degraded' | 'down';
  activeJobs: number;
  nodes: {
    name: string;
    mode: 'AUTO' | 'OFF' | 'LOCAL_ONLY';
    health: 'healthy' | 'degraded' | 'offline';
  }[];
}

export interface NavSection {
  key: string;
  label: string;
}

/** One recorded step in an objective's activity thread (the kitchen view). */
export interface ActivityEventView {
  id: string;
  type: string;
  actor: { type: 'human' | 'orchestrator' | 'adapter' | 'checker'; id: string };
  /** ISO-8601 timestamp. */
  createdAt: string;
  taskId?: string;
}
