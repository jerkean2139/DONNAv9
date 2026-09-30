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
