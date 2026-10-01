/**
 * Outbound email Donna prepares from a task. Saving to Gmail drafts leaves the
 * final send to the person; sending is client-facing comms and always needs an
 * explicit human confirmation (authority level 3).
 */
export const EMAIL_MODES = ['draft', 'send'] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];

/**
 * `pending` is recorded before Gmail is called, so an interrupted send is never
 * silently retried; `done` and `failed` are terminal.
 */
export const EMAIL_STATUSES = ['pending', 'done', 'failed'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
