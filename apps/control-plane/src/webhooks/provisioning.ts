import { randomUUID } from 'node:crypto';

import type { Role } from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import { and, eq, isNull } from 'drizzle-orm';

import {
  parseMembershipRef,
  parseMembershipSync,
  parseOrgUpdate,
  parseUserUpdate,
  parseDeletedId,
  type ClerkEvent,
  type MembershipSync,
} from './clerk-events.js';

/**
 * Applies Clerk provisioning events to our tables (Technical Plan §6/§8). This
 * is how a verified identity becomes an authorizable principal: a Clerk org
 * membership upserts an organization, a user (with `external_auth_id`), and the
 * membership row the auth resolver reads for the role. Unknown event types are a
 * no-op success, so Clerk does not retry them.
 */
export interface ProvisioningService {
  handle(event: ClerkEvent): Promise<{ readonly handled: boolean }>;
}

/** Drizzle-backed provisioning; each membership sync runs in one transaction. */
export class DrizzleProvisioningService implements ProvisioningService {
  constructor(private readonly db: DonnaDatabase) {}

  async handle(event: ClerkEvent): Promise<{ readonly handled: boolean }> {
    switch (event.type) {
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await this.syncMembership(parseMembershipSync(event.data));
        return { handled: true };
      case 'organizationMembership.deleted': {
        const ref = parseMembershipRef(event.data);
        await this.removeMembership(ref.clerkOrgId, ref.clerkUserId);
        return { handled: true };
      }
      case 'user.created':
      case 'user.updated':
        await this.updateUser(parseUserUpdate(event.data));
        return { handled: true };
      case 'user.deleted':
        await this.revokeUser(parseDeletedId(event.data));
        return { handled: true };
      case 'organization.created':
      case 'organization.updated':
        await this.upsertOrganization(parseOrgUpdate(event.data));
        return { handled: true };
      default:
        return { handled: false };
    }
  }

  /** Upsert org + user + org-level membership so the member is authorizable. */
  private async syncMembership(m: MembershipSync): Promise<void> {
    await this.db.transaction(async (tx) => {
      const orgId = await upsertOrg(tx, m.clerkOrgId, m.orgName, m.orgSlug);
      const userId = await upsertUser(tx, m.clerkUserId, orgId, m.email, m.displayName);
      await upsertMembership(tx, orgId, userId, m.role);
    });
  }

  private async updateUser(u: {
    clerkUserId: string;
    email: string;
    displayName: string;
  }): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ email: u.email, displayName: u.displayName, updatedAt: new Date() })
      .where(eq(schema.users.externalAuthId, u.clerkUserId));
  }

  private async upsertOrganization(o: {
    clerkOrgId: string;
    name: string;
    slug: string;
  }): Promise<void> {
    await upsertOrg(this.db, o.clerkOrgId, o.name, o.slug);
  }

  private async removeMembership(clerkOrgId: string, clerkUserId: string): Promise<void> {
    const org = await orgIdByExternal(this.db, clerkOrgId);
    const userId = await userIdByExternal(this.db, clerkUserId);
    if (org === null || userId === null) return;
    await this.db
      .delete(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.organizationId, org),
          isNull(schema.memberships.teamId),
        ),
      );
  }

  /** Revoke access without deleting history: clear the external id. */
  private async revokeUser(clerkUserId: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ externalAuthId: null, updatedAt: new Date() })
      .where(eq(schema.users.externalAuthId, clerkUserId));
  }
}

type Tx = DonnaDatabase | Parameters<Parameters<DonnaDatabase['transaction']>[0]>[0];

async function orgIdByExternal(db: Tx, externalId: string): Promise<string | null> {
  const rows = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.externalAuthId, externalId))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function userIdByExternal(db: Tx, externalId: string): Promise<string | null> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.externalAuthId, externalId))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function upsertOrg(db: Tx, externalId: string, name: string, slug: string): Promise<string> {
  const existing = await orgIdByExternal(db, externalId);
  if (existing !== null) {
    await db
      .update(schema.organizations)
      .set({ name, slug, updatedAt: new Date() })
      .where(eq(schema.organizations.id, existing));
    return existing;
  }
  const id = randomUUID();
  await db.insert(schema.organizations).values({ id, name, slug, externalAuthId: externalId });
  return id;
}

async function upsertUser(
  db: Tx,
  externalId: string,
  organizationId: string,
  email: string,
  displayName: string,
): Promise<string> {
  const existing = await userIdByExternal(db, externalId);
  if (existing !== null) {
    await db
      .update(schema.users)
      .set({ organizationId, email, displayName, updatedAt: new Date() })
      .where(eq(schema.users.id, existing));
    return existing;
  }
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, organizationId, email, displayName, externalAuthId: externalId });
  return id;
}

async function upsertMembership(
  db: Tx,
  organizationId: string,
  userId: string,
  role: Role,
): Promise<void> {
  const existing = await db
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
  const found = existing[0];
  if (found !== undefined) {
    await db.update(schema.memberships).set({ role }).where(eq(schema.memberships.id, found.id));
    return;
  }
  await db.insert(schema.memberships).values({ organizationId, userId, teamId: null, role });
}
