import { describe, expect, it } from 'vitest';

import {
  ClerkPayloadError,
  mapClerkRole,
  parseClerkEvent,
  parseDeletedId,
  parseMembershipRef,
  parseMembershipSync,
  parseOrgUpdate,
  parseUserUpdate,
} from './clerk-events.js';

const membershipData = {
  role: 'org:admin',
  organization: { id: 'org_clerk1', name: 'Acme', slug: 'acme' },
  public_user_data: {
    user_id: 'user_clerk1',
    identifier: 'j@x.com',
    first_name: 'Jeremy',
    last_name: 'K',
  },
};

describe('parseClerkEvent', () => {
  it('extracts type and data', () => {
    const e = parseClerkEvent({ type: 'user.updated', data: { id: 'u1' } });
    expect(e.type).toBe('user.updated');
    expect(e.data).toEqual({ id: 'u1' });
  });

  it('rejects a payload without type or data', () => {
    expect(() => parseClerkEvent({ data: {} })).toThrow(ClerkPayloadError);
    expect(() => parseClerkEvent({ type: 'x' })).toThrow(ClerkPayloadError);
    expect(() => parseClerkEvent(42)).toThrow(ClerkPayloadError);
  });
});

describe('mapClerkRole', () => {
  it('maps org admin to admin and everything else to team_member (least privilege)', () => {
    expect(mapClerkRole('org:admin')).toBe('admin');
    expect(mapClerkRole('org:member')).toBe('team_member');
    expect(mapClerkRole('org:owner')).toBe('team_member');
    expect(mapClerkRole('')).toBe('team_member');
  });
});

describe('parseMembershipSync', () => {
  it('maps org, user and role from a membership event', () => {
    const m = parseMembershipSync(membershipData);
    expect(m).toEqual({
      clerkOrgId: 'org_clerk1',
      orgName: 'Acme',
      orgSlug: 'acme',
      clerkUserId: 'user_clerk1',
      email: 'j@x.com',
      displayName: 'Jeremy K',
      role: 'admin',
    });
  });

  it('falls back to the email as display name when no names are present', () => {
    const m = parseMembershipSync({
      ...membershipData,
      public_user_data: { user_id: 'u', identifier: 'a@b.com' },
    });
    expect(m.displayName).toBe('a@b.com');
  });

  it('rejects a membership event missing the organization', () => {
    expect(() => parseMembershipSync({ public_user_data: {} })).toThrow(ClerkPayloadError);
  });
});

describe('parseUserUpdate', () => {
  it('picks the primary email', () => {
    const u = parseUserUpdate({
      id: 'user_clerk1',
      primary_email_address_id: 'em2',
      email_addresses: [
        { id: 'em1', email_address: 'old@x.com' },
        { id: 'em2', email_address: 'new@x.com' },
      ],
      first_name: 'J',
    });
    expect(u.email).toBe('new@x.com');
    expect(u.clerkUserId).toBe('user_clerk1');
  });

  it('throws when no email is present', () => {
    expect(() => parseUserUpdate({ id: 'u', email_addresses: [] })).toThrow(ClerkPayloadError);
  });
});

describe('parseOrgUpdate / parseDeletedId / parseMembershipRef', () => {
  it('parses org update', () => {
    expect(parseOrgUpdate({ id: 'o', name: 'N', slug: 's' })).toEqual({
      clerkOrgId: 'o',
      name: 'N',
      slug: 's',
    });
  });

  it('parses a deleted id and a membership ref', () => {
    expect(parseDeletedId({ id: 'user_x', deleted: true })).toBe('user_x');
    expect(parseMembershipRef(membershipData)).toEqual({
      clerkOrgId: 'org_clerk1',
      clerkUserId: 'user_clerk1',
    });
  });
});
