import type { Role } from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import type { PrincipalContext } from '@donna/policy';
import { and, eq } from 'drizzle-orm';

import type { VerifiedIdentity } from './token-verifier.js';

/**
 * Turns a verified token identity into the trusted {@link PrincipalContext} the
 * policy engine consumes. Authority (org, role, teams) comes from OUR database,
 * never from the token — server-side RBAC (Technical Plan §6; the token proves
 * who, the DB decides what they may do).
 */
export interface PrincipalResolver {
  resolve(identity: VerifiedIdentity): Promise<PrincipalContext | null>;
}

/**
 * Postgres-backed resolver. Maps the provider subject to a user via
 * `external_auth_id`, then reads the user's membership in their organization for
 * the role and team scope. A user with no membership resolves to `null` (no
 * access — least privilege), as does an unknown subject.
 */
export class DrizzlePrincipalResolver implements PrincipalResolver {
  constructor(private readonly db: DonnaDatabase) {}

  async resolve(identity: VerifiedIdentity): Promise<PrincipalContext | null> {
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.externalAuthId, identity.subject))
      .limit(1);
    const user = users[0];
    if (user === undefined) return null;

    const memberships = await this.db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, user.id),
          eq(schema.memberships.organizationId, user.organizationId),
        ),
      );
    // Prefer the org-level membership (no team) for the principal's role.
    const primary = memberships.find((m) => m.teamId === null) ?? memberships[0];
    if (primary === undefined) return null;

    const teamIds = memberships.map((m) => m.teamId).filter((t): t is string => t !== null);

    // Project access comes from OUR database, not the token (least privilege):
    // the projects this user is a member of, scoped to their organization.
    const projectRows = await this.db
      .select({ projectId: schema.projectMemberships.projectId })
      .from(schema.projectMemberships)
      .where(
        and(
          eq(schema.projectMemberships.userId, user.id),
          eq(schema.projectMemberships.organizationId, user.organizationId),
        ),
      );
    const projectIds = projectRows.map((r) => r.projectId);

    return {
      userId: user.id,
      organizationId: user.organizationId,
      role: primary.role as Role,
      actorKind: 'human',
      teamIds,
      projectIds,
    };
  }
}
