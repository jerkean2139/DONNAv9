/**
 * Initial user roles (Technical Plan §6.3, Build Bible doc 01). Roles are
 * supplemented by resource- and action-level permissions — a role alone is
 * never the authorization decision (see `@donna/policy`).
 */
export const ROLES = [
  'owner',
  'admin',
  'executive',
  'team_lead',
  'team_member',
  'contractor',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
