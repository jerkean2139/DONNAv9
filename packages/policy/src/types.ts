import type { AuthorityLevel, Role, Scope } from '@donna/core-domain';

/**
 * Whether the actor is a human executing directly or Donna/an agent acting
 * autonomously. Level-4 (NEVER_AUTONOMOUS) actions are permitted only for a
 * human (Technical Plan §6.2).
 */
export type ActorKind = 'human' | 'agent';

/**
 * The authenticated principal. This is trusted, typed input assembled by the
 * server from the session and memberships — never derived from external/model
 * content, which is untrusted data and cannot grant authority (Build Bible
 * V2-023).
 */
export interface PrincipalContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: Role;
  readonly actorKind: ActorKind;
  readonly teamIds: readonly string[];
  readonly projectIds: readonly string[];
}

/**
 * Capability categories that admins can independently pause via kill switches
 * (Technical Plan §6.4, Build Bible doc 06). Reads/research remain available.
 */
export type CapabilityCategory =
  'outbound_comms' | 'browser_actions' | 'deployments' | 'api_spend' | 'local_compute';

export interface ActionDescriptor {
  readonly name: string;
  readonly authorityLevel: AuthorityLevel;
  /** True when the action has external side effects (email, deploy, charge…). */
  readonly sideEffecting: boolean;
  readonly capability?: CapabilityCategory;
}

/** The resource being acted on. Scope + owning refs drive access decisions. */
export interface ResourceDescriptor {
  readonly organizationId: string;
  readonly scope: Scope;
  readonly ownerUserId?: string;
  readonly teamId?: string;
  readonly projectId?: string;
}

export interface KillSwitchState {
  readonly globalPause: boolean;
  readonly disabledCapabilities: readonly CapabilityCategory[];
}

export type PolicyEffect = 'allow' | 'deny' | 'requires_approval';

export type PolicyReason =
  | 'ok'
  | 'approval_required'
  | 'cross_tenant'
  | 'scope_denied'
  | 'insufficient_authority'
  | 'never_autonomous'
  | 'kill_switch';

export interface PolicyDecision {
  readonly effect: PolicyEffect;
  readonly reason: PolicyReason;
  readonly message: string;
}

export interface PolicyInput {
  readonly principal: PrincipalContext;
  readonly action: ActionDescriptor;
  readonly resource: ResourceDescriptor;
  /** Defaults to no kill switches engaged. */
  readonly killSwitches?: KillSwitchState;
  /** Defaults to DEFAULT_ROLE_CEILINGS. */
  readonly roleCeilings?: Readonly<Record<Role, AuthorityLevel>>;
}
