// View-model types for the command experience. These mirror the control-plane
// domain shapes; the typed client returns these directly. (apps/web stays
// behind the API boundary — it never imports @donna/db or @donna/policy;
// Technical Plan §2.)

export type ObjectiveStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'cancelled';

export interface ObjectiveView {
  id: string;
  requestedOutcome: string;
  status: ObjectiveStatus;
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
