import { randomUUID } from 'node:crypto';

import type { PlanStatus } from '@donna/core-domain';
import { schema, type DonnaDatabase } from '@donna/db';
import { and, eq, inArray } from 'drizzle-orm';

import type { Plan } from './plan.js';

export interface PlanRecord {
  readonly id: string;
  readonly objectiveId: string;
  /** `drafting` that stalled past the timeout reads as `failed` / `timed_out`. */
  readonly status: PlanStatus;
  readonly plan: Plan | null;
  readonly error: string | null;
  readonly model: string | null;
  readonly projectId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A plan still drafting after this long is treated as failed (restart, crash). */
export const PLAN_TIMEOUT_MS = 5 * 60 * 1000;

export type PlanTransition =
  | {
      readonly status: 'proposed';
      readonly plan: Plan;
      readonly model: string;
      readonly costUsd: number;
    }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'approved'; readonly projectId: string; readonly approvedBy: string }
  | { readonly status: 'dismissed' };

/** One plan per objective, tenant-scoped like every store. */
export interface PlanStore {
  get(org: string, objectiveId: string): Promise<PlanRecord | null>;
  list(org: string, objectiveIds: readonly string[]): Promise<PlanRecord[]>;
  /** Start (or restart) drafting; replaces any previous plan for the objective. */
  startDrafting(org: string, objectiveId: string): Promise<PlanRecord>;
  transition(org: string, objectiveId: string, to: PlanTransition): Promise<PlanRecord | null>;
}

function effective<T extends { status: PlanStatus; error: string | null; updatedAt: string }>(
  r: T,
  now = Date.now(),
): T {
  return r.status === 'drafting' && now - Date.parse(r.updatedAt) > PLAN_TIMEOUT_MS
    ? { ...r, status: 'failed', error: 'timed_out' }
    : r;
}

type Stored = PlanRecord & { readonly org: string };

export class InMemoryPlanStore implements PlanStore {
  private readonly rows = new Map<string, Stored>();

  private view(row: Stored): PlanRecord {
    return effective({
      id: row.id,
      objectiveId: row.objectiveId,
      status: row.status,
      plan: row.plan,
      error: row.error,
      model: row.model,
      projectId: row.projectId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async get(org: string, objectiveId: string): Promise<PlanRecord | null> {
    const row = this.rows.get(objectiveId);
    return row !== undefined && row.org === org ? this.view(row) : null;
  }

  async list(org: string, objectiveIds: readonly string[]): Promise<PlanRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.org === org && objectiveIds.includes(r.objectiveId))
      .map((r) => this.view(r));
  }

  async startDrafting(org: string, objectiveId: string): Promise<PlanRecord> {
    const now = new Date().toISOString();
    const row: Stored = {
      org,
      id: randomUUID(),
      objectiveId,
      status: 'drafting',
      plan: null,
      error: null,
      model: null,
      projectId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(objectiveId, row);
    return this.view(row);
  }

  async transition(
    org: string,
    objectiveId: string,
    to: PlanTransition,
  ): Promise<PlanRecord | null> {
    const row = this.rows.get(objectiveId);
    if (row === undefined || row.org !== org) return null;
    const next: Stored = {
      ...row,
      status: to.status,
      updatedAt: new Date().toISOString(),
      ...(to.status === 'proposed' ? { plan: to.plan, model: to.model, error: null } : {}),
      ...(to.status === 'failed' ? { error: to.error } : {}),
      ...(to.status === 'approved' ? { projectId: to.projectId } : {}),
    };
    this.rows.set(objectiveId, next);
    return this.view(next);
  }
}

type PlanRow = typeof schema.objectivePlans.$inferSelect;

const toRecord = (r: PlanRow): PlanRecord =>
  effective({
    id: r.id,
    objectiveId: r.objectiveId,
    status: r.status,
    plan: (r.plan as Plan | null) ?? null,
    error: r.error,
    model: r.model,
    projectId: r.projectId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });

/** Postgres-backed {@link PlanStore}; every query repeats the tenant predicate. */
export class DrizzlePlanStore implements PlanStore {
  constructor(private readonly db: DonnaDatabase) {}

  async get(org: string, objectiveId: string): Promise<PlanRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.objectivePlans)
      .where(
        and(
          eq(schema.objectivePlans.organizationId, org),
          eq(schema.objectivePlans.objectiveId, objectiveId),
        ),
      )
      .limit(1);
    return row === undefined ? null : toRecord(row);
  }

  async list(org: string, objectiveIds: readonly string[]): Promise<PlanRecord[]> {
    if (objectiveIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.objectivePlans)
      .where(
        and(
          eq(schema.objectivePlans.organizationId, org),
          inArray(schema.objectivePlans.objectiveId, [...objectiveIds]),
        ),
      );
    return rows.map(toRecord);
  }

  async startDrafting(org: string, objectiveId: string): Promise<PlanRecord> {
    const now = new Date();
    const [row] = await this.db
      .insert(schema.objectivePlans)
      .values({ organizationId: org, objectiveId, status: 'drafting' })
      .onConflictDoUpdate({
        target: schema.objectivePlans.objectiveId,
        set: {
          status: 'drafting',
          plan: null,
          error: null,
          model: null,
          costUsd: null,
          projectId: null,
          approvedBy: null,
          approvedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        // Never let a conflict on another tenant's row be rewritten.
        setWhere: eq(schema.objectivePlans.organizationId, org),
      })
      .returning();
    if (row === undefined) throw new Error('plan_conflict');
    return toRecord(row);
  }

  async transition(
    org: string,
    objectiveId: string,
    to: PlanTransition,
  ): Promise<PlanRecord | null> {
    const now = new Date();
    const [row] = await this.db
      .update(schema.objectivePlans)
      .set({
        status: to.status,
        updatedAt: now,
        ...(to.status === 'proposed'
          ? { plan: to.plan, model: to.model, costUsd: to.costUsd, error: null }
          : {}),
        ...(to.status === 'failed' ? { error: to.error } : {}),
        ...(to.status === 'approved'
          ? { projectId: to.projectId, approvedBy: to.approvedBy, approvedAt: now }
          : {}),
      })
      .where(
        and(
          eq(schema.objectivePlans.organizationId, org),
          eq(schema.objectivePlans.objectiveId, objectiveId),
        ),
      )
      .returning();
    return row === undefined ? null : toRecord(row);
  }
}
