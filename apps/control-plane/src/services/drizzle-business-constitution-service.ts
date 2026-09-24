import { and, desc, eq, sql } from 'drizzle-orm';

import { schema, type DonnaDatabase } from '@donna/db';

export type ConstitutionRow = typeof schema.businessConstitutions.$inferSelect;
export type ConstitutionRuleRow = typeof schema.constitutionRules.$inferSelect;

export interface ConstitutionRuleInput {
  readonly kind: ConstitutionRuleRow['kind'];
  readonly key: string;
  readonly statement: string;
  readonly action?: string;
  readonly thresholdMinor?: number;
  readonly currency?: string;
  readonly requiresApproval?: boolean;
  readonly neverAutonomous?: boolean;
  readonly structuredValue?: unknown;
}

export interface ConstitutionProposal {
  readonly constitution: ConstitutionRow;
  readonly rules: readonly ConstitutionRuleRow[];
}

export class DrizzleBusinessConstitutionService {
  constructor(private readonly db: DonnaDatabase) {}

  async propose(
    organizationId: string,
    proposedByUserId: string,
    rules: readonly ConstitutionRuleInput[],
    title = 'Business Constitution',
  ): Promise<ConstitutionProposal> {
    return this.db.transaction(async (tx) => {
      const [versionRow] = await tx.execute(
        sql`select coalesce(max(version), 0)::int + 1 as version
            from business_constitutions
            where organization_id = ${organizationId}`,
      );
      const version = Number(versionRow!.version);
      const [constitution] = await tx
        .insert(schema.businessConstitutions)
        .values({ organizationId, version, title, proposedByUserId, status: 'proposed' })
        .returning();

      const insertedRules = rules.length === 0 ? [] : await tx
        .insert(schema.constitutionRules)
        .values(rules.map((rule) => ({
          organizationId,
          constitutionId: constitution!.id,
          kind: rule.kind,
          key: rule.key,
          statement: rule.statement,
          ...(rule.action !== undefined ? { action: rule.action } : {}),
          ...(rule.thresholdMinor !== undefined ? { thresholdMinor: rule.thresholdMinor } : {}),
          ...(rule.currency !== undefined ? { currency: rule.currency } : {}),
          ...(rule.requiresApproval !== undefined ? { requiresApproval: rule.requiresApproval } : {}),
          ...(rule.neverAutonomous !== undefined ? { neverAutonomous: rule.neverAutonomous } : {}),
          ...(rule.structuredValue !== undefined ? { structuredValue: rule.structuredValue } : {}),
        })))
        .returning();

      return { constitution: constitution!, rules: insertedRules };
    });
  }

  async approve(
    organizationId: string,
    constitutionId: string,
    approvedByUserId: string,
    actorKind: 'human' | 'agent' | 'system',
  ): Promise<ConstitutionProposal | null> {
    if (actorKind !== 'human') return null;

    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(schema.businessConstitutions)
        .where(and(
          eq(schema.businessConstitutions.organizationId, organizationId),
          eq(schema.businessConstitutions.id, constitutionId),
          eq(schema.businessConstitutions.status, 'proposed'),
        ))
        .limit(1);
      if (candidate === undefined) return null;

      await tx.update(schema.businessConstitutions)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(and(
          eq(schema.businessConstitutions.organizationId, organizationId),
          eq(schema.businessConstitutions.status, 'approved'),
        ));

      const [approved] = await tx.update(schema.businessConstitutions)
        .set({ status: 'approved', approvedByUserId, approvedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(schema.businessConstitutions.organizationId, organizationId),
          eq(schema.businessConstitutions.id, constitutionId),
        ))
        .returning();

      const activeRules = await tx.select().from(schema.constitutionRules)
        .where(and(
          eq(schema.constitutionRules.organizationId, organizationId),
          eq(schema.constitutionRules.constitutionId, constitutionId),
        ));
      return { constitution: approved!, rules: activeRules };
    });
  }

  async getActive(organizationId: string): Promise<ConstitutionProposal | null> {
    const [constitution] = await this.db.select().from(schema.businessConstitutions)
      .where(and(
        eq(schema.businessConstitutions.organizationId, organizationId),
        eq(schema.businessConstitutions.status, 'approved'),
      ))
      .orderBy(desc(schema.businessConstitutions.version))
      .limit(1);
    if (constitution === undefined) return null;

    const activeRules = await this.db.select().from(schema.constitutionRules)
      .where(and(
        eq(schema.constitutionRules.organizationId, organizationId),
        eq(schema.constitutionRules.constitutionId, constitution.id),
      ));
    return { constitution, rules: activeRules };
  }
}
