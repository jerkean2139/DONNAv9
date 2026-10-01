// View-model types for the command experience. These mirror the control-plane
// domain shapes; the typed client returns these directly. (apps/web stays
// behind the API boundary — it never imports @donna/db or @donna/policy;
// Technical Plan §2.)

export type ObjectiveStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'cancelled';

export interface ObjectiveView {
  id: string;
  requestedOutcome: string;
  status: ObjectiveStatus;
  projectId?: string;
  /** Donna's plan for it, when planning is on (from GET /objectives). */
  plan?: PlanRecordView | null;
  /** Tasks done / total among the tasks planned from it. */
  progress?: { done: number; total: number } | null;
}

// ── Donna's plans (mirrors control-plane planning/plan.ts + plan-store.ts) ───

export type PlanStatus = 'drafting' | 'proposed' | 'approved' | 'dismissed' | 'failed';

export interface PlanView {
  summary: string;
  client:
    | { kind: 'existing'; id: string; name: string }
    | { kind: 'new'; name: string }
    | { kind: 'none' };
  project: { kind: 'existing'; id: string; name: string } | { kind: 'new'; name: string };
  sprint: { name: string; startsOn: string | null; endsOn: string | null } | null;
  tasks: { title: string; subtasks: string[]; owner: 'you' | 'donna' }[];
  questions: string[];
}

export interface PlanRecordView {
  id: string;
  objectiveId: string;
  status: PlanStatus;
  plan: PlanView | null;
  error: string | null;
  projectId: string | null;
}

export type ControlPlaneHealth = 'ok' | 'checking' | 'degraded' | 'down';

/** How this deployment signs requests (from `GET /client-config`). */
export type AuthMode = 'clerk' | 'dev' | 'unconfigured';

export interface NavSection {
  key: string;
  label: string;
  /** True when the section is backed by live data. */
  live?: boolean;
  /** Donna's one-line pitch for the section while it is not connected yet. */
  blurb?: string;
}

// ── Client work hierarchy (mirrors control-plane work/types.ts) ─────────────

export type ClientStatus = 'active' | 'paused' | 'archived';
export type SprintStatus = 'planned' | 'active' | 'completed';
export type WorkItemStatus = 'todo' | 'in_progress' | 'done';
export type AttachmentTargetType = 'client' | 'project' | 'sprint' | 'task';

export interface ClientView {
  id: string;
  name: string;
  status: ClientStatus;
  notes: string | null;
  projectCount: number;
  createdAt: string;
}

export interface ProjectView {
  id: string;
  clientId: string | null;
  name: string;
  createdAt: string;
}

export interface SprintView {
  id: string;
  projectId: string;
  name: string;
  status: SprintStatus;
  startsOn: string | null;
  endsOn: string | null;
}

export interface WorkItemView {
  id: string;
  projectId: string;
  sprintId: string | null;
  parentId: string | null;
  title: string;
  status: WorkItemStatus;
  dueOn: string | null;
  position: number;
  objectiveId?: string | null;
  owner?: 'you' | 'donna';
  draft?: string | null;
  draftStatus?: 'none' | 'drafting' | 'ready' | 'failed';
  draftError?: string | null;
}

export interface AttachmentView {
  id: string;
  target: { type: AttachmentTargetType; id: string };
  kind: 'link' | 'file';
  title: string;
  url: string | null;
  provider: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface AttachmentTarget {
  type: AttachmentTargetType;
  id: string;
}

/** The signed-in person's Gmail connection. */
export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

/** An email saved to Gmail drafts or sent for a task. */
export interface OutboundEmailView {
  id: string;
  workItemId: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  mode: 'draft' | 'send';
  status: 'pending' | 'done' | 'failed';
  error: string | null;
  gmailDraftId: string | null;
  createdAt: string;
  completedAt: string | null;
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
