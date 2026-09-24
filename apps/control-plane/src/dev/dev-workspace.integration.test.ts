import { createDatabase, runDrizzleMigrations, type DonnaDatabase } from '@donna/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleObjectiveService } from '../services/drizzle-objective-service.js';
import { ensureDevWorkspace } from './dev-workspace.js';

// Live-database check, skipped unless TEST_DATABASE_URL points at a throwaway
// Postgres (see persistence.integration.test.ts). Never point it at production.
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_DATABASE_URL)('dev workspace bootstrap (integration)', () => {
  let db: DonnaDatabase;

  beforeAll(async () => {
    await runDrizzleMigrations(TEST_DATABASE_URL!);
    db = createDatabase(TEST_DATABASE_URL!);
  });

  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  });

  it('is idempotent across boots', async () => {
    const first = await ensureDevWorkspace(db);
    const second = await ensureDevWorkspace(db);
    expect(second).toEqual(first);
  });

  it('yields a principal that can persist objectives', async () => {
    const dev = await ensureDevWorkspace(db);
    const svc = new DrizzleObjectiveService(db);
    const objective = await svc.create(
      {
        requestedOutcome: 'Smoke-test the deploy',
        definitionOfDone: 'Visible in the UI',
        scope: 'ORGANIZATION',
        riskLevel: 'low',
      },
      { ...dev, actorKind: 'human', teamIds: [], projectIds: [] },
    );
    const listed = await svc.list(dev.organizationId, 50);
    expect(listed.map((o) => o.id)).toContain(objective.id);
  });
});
