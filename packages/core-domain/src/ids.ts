/**
 * Branded identifier types.
 *
 * These are compile-time-only brands over `string`; they add no runtime cost
 * but prevent accidentally passing, say, a `TaskId` where an `ObjectiveId` is
 * expected. Keeping IDs distinct matters because the whole control plane is
 * built on cross-referencing Objectives, Tasks and Events (Technical Plan §3).
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type UserId = Brand<string, 'UserId'>;
export type TeamId = Brand<string, 'TeamId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type ObjectiveId = Brand<string, 'ObjectiveId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type EventId = Brand<string, 'EventId'>;
export type DelegationId = Brand<string, 'DelegationId'>;
export type ApprovalId = Brand<string, 'ApprovalId'>;
export type ComputeNodeId = Brand<string, 'ComputeNodeId'>;

/** Correlation/causation identifiers threaded through the event stream. */
export type CorrelationId = Brand<string, 'CorrelationId'>;

/**
 * Idempotency key protecting side-effecting task execution from duplication on
 * retry (Technical Plan §5, Build Bible V2-021).
 */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
