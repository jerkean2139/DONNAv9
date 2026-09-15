import {
  EVENT_TYPES,
  EXECUTION_CLASSES,
  OBJECTIVE_STATUSES,
  RISK_LEVELS,
  SCOPES,
  SOURCE_CONFIDENCE,
  TASK_STATUSES,
} from '@donna/core-domain';
import { describe, expect, it } from 'vitest';

import {
  eventTypeEnum,
  executionClassEnum,
  objectiveStatusEnum,
  riskLevelEnum,
  scopeEnum,
  sourceConfidenceEnum,
  taskStatusEnum,
} from './schema/enums.js';
import {
  approvals,
  auditEvents,
  delegations,
  events,
  featureFlags,
  idempotencyKeys,
  memberships,
  objectives,
  organizations,
  projects,
  taskDependencies,
  tasks,
  teams,
  users,
} from './schema/index.js';

/**
 * Drift guard: the Postgres enums must exactly mirror the `@donna/core-domain`
 * string unions. If someone changes a domain enum without updating the schema
 * (or vice versa), these fail — keeping the authoritative store and the domain
 * model in lockstep.
 */
describe('schema enums mirror core-domain', () => {
  it('scope', () => expect(scopeEnum.enumValues).toEqual([...SCOPES]));
  it('objective status', () =>
    expect(objectiveStatusEnum.enumValues).toEqual([...OBJECTIVE_STATUSES]));
  it('risk level', () => expect(riskLevelEnum.enumValues).toEqual([...RISK_LEVELS]));
  it('task status', () => expect(taskStatusEnum.enumValues).toEqual([...TASK_STATUSES]));
  it('execution class', () =>
    expect(executionClassEnum.enumValues).toEqual([...EXECUTION_CLASSES]));
  it('event type', () => expect(eventTypeEnum.enumValues).toEqual([...EVENT_TYPES]));
  it('source confidence', () =>
    expect(sourceConfidenceEnum.enumValues).toEqual([...SOURCE_CONFIDENCE]));
});

describe('control-plane tables are defined and org-scoped', () => {
  const orgScoped = [
    users,
    teams,
    memberships,
    projects,
    objectives,
    tasks,
    taskDependencies,
    events,
    approvals,
    delegations,
    auditEvents,
    idempotencyKeys,
  ];

  it('every business-state table carries organization_id', () => {
    for (const table of orgScoped) {
      expect(table).toHaveProperty('organizationId');
    }
  });

  it('organizations is the tenancy root', () => {
    expect(organizations).toHaveProperty('id');
    expect(organizations).toHaveProperty('slug');
  });

  it('feature flags may be global (nullable organization_id)', () => {
    expect(featureFlags).toHaveProperty('organizationId');
    expect(featureFlags).toHaveProperty('key');
  });

  it('tasks carry durable-job control columns', () => {
    for (const col of [
      'idempotencyKey',
      'retryCount',
      'maxRetries',
      'leaseOwner',
      'leaseExpiresAt',
      'heartbeatAt',
      'checkpoint',
    ]) {
      expect(tasks).toHaveProperty(col);
    }
  });
});
