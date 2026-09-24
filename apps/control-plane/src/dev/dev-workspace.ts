import { randomUUID } from 'node:crypto';

import { schema, type DonnaDatabase } from '@donna/db';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * The identity the web app uses while the development header shim is active.
 * NOT production auth — only ever built when no identity provider is configured
 * (APP_ENV=development). It lets the deployed UI exercise the real API end to
 * end before Clerk is wired.
 */
export interface DevPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: 'owner';
}

const DEV_ORG_SLUG = 'donna-dev-workspace';
const DEV_USER_EMAIL = 'dev@donna.local';

/** A throwaway principal for the in-memory (no database) development path. */
export function inMemoryDevPrincipal(): DevPrincipal {
  return { userId: randomUUID(), organizationId: randomUUID(), role: 'owner' };
}

/**
 * Idempotently ensure a development organization, user, and org-level owner
 * membership exist, so objectives created through the dev shim satisfy the
 * tenancy foreign keys. Safe to run on every boot.
 */
export async function ensureDevWorkspace(db: DonnaDatabase): Promise<DevPrincipal> {
  return db.transaction(async (tx) => {
    const orgs = await tx
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, DEV_ORG_SLUG))
      .limit(1);
    let organizationId = orgs[0]?.id;
    if (organizationId === undefined) {
      organizationId = randomUUID();
      await tx
        .insert(schema.organizations)
        .values({ id: organizationId, name: 'DONNA Dev Workspace', slug: DEV_ORG_SLUG });
    }

    const users = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.organizationId, organizationId),
          eq(schema.users.email, DEV_USER_EMAIL),
        ),
      )
      .limit(1);
    let userId = users[0]?.id;
    if (userId === undefined) {
      userId = randomUUID();
      await tx
        .insert(schema.users)
        .values({ id: userId, organizationId, email: DEV_USER_EMAIL, displayName: 'Dev User' });
    }

    const memberships = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.organizationId, organizationId),
          isNull(schema.memberships.teamId),
        ),
      )
      .limit(1);
    if (memberships[0] === undefined) {
      await tx
        .insert(schema.memberships)
        .values({ organizationId, userId, teamId: null, role: 'owner' });
    }

    return { userId, organizationId, role: 'owner' as const };
  });
}
