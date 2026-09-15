import type { Role } from '@donna/core-domain';

/** Raised when a verified Clerk payload does not match the expected shape. */
export class ClerkPayloadError extends Error {
  constructor(message: string) {
    super(`Invalid Clerk payload: ${message}`);
    this.name = 'ClerkPayloadError';
  }
}

/** A verified Clerk webhook envelope: an event type plus its data object. */
export interface ClerkEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

export interface MembershipSync {
  readonly clerkOrgId: string;
  readonly orgName: string;
  readonly orgSlug: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
}

export interface UserUpdate {
  readonly clerkUserId: string;
  readonly email: string;
  readonly displayName: string;
}

export interface OrgUpdate {
  readonly clerkOrgId: string;
  readonly name: string;
  readonly slug: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') {
    throw new ClerkPayloadError(`"${key}" must be a non-empty string`);
  }
  return value;
}

/** Parse a verified envelope: `{ type, data }`. */
export function parseClerkEvent(payload: unknown): ClerkEvent {
  if (!isRecord(payload)) throw new ClerkPayloadError('event must be an object');
  if (typeof payload['type'] !== 'string') throw new ClerkPayloadError('missing event type');
  if (!isRecord(payload['data'])) throw new ClerkPayloadError('missing event data');
  return { type: payload['type'], data: payload['data'] };
}

/**
 * Map a Clerk organization role to a DONNA role, least-privilege by default: an
 * org admin maps to `admin`, everyone else to `team_member`. `owner` is never
 * granted from a webhook — it is a deliberate, in-app assignment.
 */
export function mapClerkRole(clerkRole: string): Role {
  return clerkRole === 'org:admin' || clerkRole === 'admin' ? 'admin' : 'team_member';
}

function displayNameFrom(record: Record<string, unknown>, fallback: string): string {
  const first = typeof record['first_name'] === 'string' ? record['first_name'] : '';
  const last = typeof record['last_name'] === 'string' ? record['last_name'] : '';
  const name = `${first} ${last}`.trim();
  return name === '' ? fallback : name;
}

/** Parse an `organizationMembership.created`/`.updated` event. */
export function parseMembershipSync(data: Record<string, unknown>): MembershipSync {
  const org = data['organization'];
  const userData = data['public_user_data'];
  if (!isRecord(org)) throw new ClerkPayloadError('missing organization');
  if (!isRecord(userData)) throw new ClerkPayloadError('missing public_user_data');
  const email = str(userData, 'identifier');
  return {
    clerkOrgId: str(org, 'id'),
    orgName: str(org, 'name'),
    orgSlug: str(org, 'slug'),
    clerkUserId: str(userData, 'user_id'),
    email,
    displayName: displayNameFrom(userData, email),
    role: mapClerkRole(typeof data['role'] === 'string' ? data['role'] : ''),
  };
}

/** Parse the primary email from a `user.*` event's `email_addresses`. */
function primaryEmail(data: Record<string, unknown>): string {
  const list = data['email_addresses'];
  const primaryId = data['primary_email_address_id'];
  if (Array.isArray(list)) {
    const chosen =
      list.find((e) => isRecord(e) && e['id'] === primaryId) ?? list.find((e) => isRecord(e));
    if (isRecord(chosen) && typeof chosen['email_address'] === 'string') {
      return chosen['email_address'];
    }
  }
  throw new ClerkPayloadError('no email address on user');
}

/** Parse a `user.updated` (or `user.created`) event. */
export function parseUserUpdate(data: Record<string, unknown>): UserUpdate {
  const clerkUserId = str(data, 'id');
  const email = primaryEmail(data);
  return { clerkUserId, email, displayName: displayNameFrom(data, email) };
}

/** Parse an `organization.updated` (or `.created`) event. */
export function parseOrgUpdate(data: Record<string, unknown>): OrgUpdate {
  return { clerkOrgId: str(data, 'id'), name: str(data, 'name'), slug: str(data, 'slug') };
}

/** Parse the deleted subject id from a `*.deleted` event. */
export function parseDeletedId(data: Record<string, unknown>): string {
  return str(data, 'id');
}

/** Parse just the org + user ids from a membership event (e.g. `.deleted`). */
export function parseMembershipRef(data: Record<string, unknown>): {
  readonly clerkOrgId: string;
  readonly clerkUserId: string;
} {
  const org = data['organization'];
  const userData = data['public_user_data'];
  if (!isRecord(org)) throw new ClerkPayloadError('missing organization');
  if (!isRecord(userData)) throw new ClerkPayloadError('missing public_user_data');
  return { clerkOrgId: str(org, 'id'), clerkUserId: str(userData, 'user_id') };
}
