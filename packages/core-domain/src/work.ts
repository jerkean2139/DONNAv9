/**
 * The client work hierarchy: Client → Project → Sprint → Task → Subtask, with
 * attachments (uploaded files or links such as Google Drive) on every level.
 *
 * This is the user's planning structure. It is distinct from the orchestrator's
 * execution `Task` (task.ts), which is a unit of work Donna dispatches.
 */

export const CLIENT_STATUSES = ['active', 'paused', 'archived'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const WORK_ITEM_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const ATTACHMENT_KINDS = ['link', 'file'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Where an attachment hangs in the hierarchy. */
export const ATTACHMENT_TARGETS = ['client', 'project', 'sprint', 'task'] as const;
export type AttachmentTarget = (typeof ATTACHMENT_TARGETS)[number];

/** Recognized link providers, so the UI can label a link ("Drive", "Figma"…). */
export type LinkProvider =
  | 'google_drive'
  | 'google_docs'
  | 'google_sheets'
  | 'google_slides'
  | 'dropbox'
  | 'onedrive'
  | 'notion'
  | 'figma'
  | 'loom'
  | 'github'
  | 'web';

/**
 * Classify a URL by host. Pure and total: anything unrecognized is `web`.
 * Returns null for a value that is not an absolute http(s) URL, which callers
 * treat as invalid input (attachments never store `javascript:` or `data:`).
 */
export function detectLinkProvider(raw: string): LinkProvider | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (host === 'docs.google.com') {
    if (url.pathname.startsWith('/spreadsheets')) return 'google_sheets';
    if (url.pathname.startsWith('/presentation')) return 'google_slides';
    return 'google_docs';
  }
  if (host === 'drive.google.com') return 'google_drive';
  if (is('dropbox.com')) return 'dropbox';
  if (is('onedrive.live.com') || is('1drv.ms') || is('sharepoint.com')) return 'onedrive';
  if (is('notion.so') || is('notion.site')) return 'notion';
  if (is('figma.com')) return 'figma';
  if (is('loom.com')) return 'loom';
  if (is('github.com')) return 'github';
  return 'web';
}

/** Who does a task: you (or your team), or Donna herself. */
export const WORK_ITEM_OWNERS = ['you', 'donna'] as const;
export type WorkItemOwner = (typeof WORK_ITEM_OWNERS)[number];

/** Lifecycle of the draft Donna writes for a task she owns. */
export const DRAFT_STATUSES = ['none', 'drafting', 'ready', 'failed'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/**
 * Lifecycle of Donna's plan for an objective: she drafts it, you review it,
 * and only on approval does it become clients, projects, sprints and tasks.
 */
export const PLAN_STATUSES = ['drafting', 'proposed', 'approved', 'dismissed', 'failed'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
