import { isRole } from '@donna/core-domain';
import type { ActorKind, PrincipalContext } from '@donna/policy';

/**
 * TEMPORARY development principal extraction.
 *
 * This is NOT production authentication. Real auth (Supabase Auth + MFA,
 * server-side session validation) arrives in a later phase; until then, dev
 * clients pass identity via `x-donna-*` headers. The policy engine still makes
 * every authorization decision — this only assembles the trusted principal the
 * server would otherwise derive from a verified session.
 */

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function csv(value: unknown): string[] {
  const raw = firstString(value);
  if (raw === undefined || raw === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function devPrincipalFromHeaders(headers: Record<string, unknown>): PrincipalContext | null {
  const userId = firstString(headers['x-donna-user-id']);
  const organizationId = firstString(headers['x-donna-org-id']);
  const roleRaw = firstString(headers['x-donna-role']);

  if (userId === undefined || organizationId === undefined || roleRaw === undefined) return null;
  if (!isRole(roleRaw)) return null;

  const actorKind: ActorKind =
    firstString(headers['x-donna-actor-kind']) === 'human' ? 'human' : 'agent';

  return {
    userId,
    organizationId,
    role: roleRaw,
    actorKind,
    teamIds: csv(headers['x-donna-teams']),
    projectIds: csv(headers['x-donna-projects']),
  };
}
