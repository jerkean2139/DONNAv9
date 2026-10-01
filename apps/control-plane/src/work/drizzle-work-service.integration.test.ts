import { randomUUID } from 'node:crypto';

import { createDatabase, runDrizzleMigrations, schema, type DonnaDatabase } from '@donna/db';
import { afterAll, beforeAll } from 'vitest';

import { DrizzleWorkService } from './drizzle-work-service.js';
import { describeWorkServiceContract } from './work-service.contract.js';

// Live-database run of the WorkService contract, skipped unless
// TEST_DATABASE_URL points at a throwaway Postgres. Never point it at production.
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

let db: DonnaDatabase;

if (TEST_DATABASE_URL) {
  beforeAll(async () => {
    await runDrizzleMigrations(TEST_DATABASE_URL);
    db = createDatabase(TEST_DATABASE_URL);
  });
  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });
}

async function seedOrg(): Promise<{ org: string; userId: string }> {
  const org = randomUUID();
  const userId = randomUUID();
  await db.insert(schema.organizations).values({ id: org, name: 'Org', slug: `org-${org}` });
  await db
    .insert(schema.users)
    .values({ id: userId, organizationId: org, email: `${userId}@x.com`, displayName: 'U' });
  return { org, userId };
}

describeWorkServiceContract(
  'postgres',
  async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    return { work: new DrizzleWorkService(db), org: a.org, userId: a.userId, otherOrg: b.org };
  },
  Boolean(TEST_DATABASE_URL),
);
