import { randomUUID } from 'node:crypto';

import { InMemoryWorkService } from './in-memory-work-service.js';
import { describeWorkServiceContract } from './work-service.contract.js';

describeWorkServiceContract('in-memory', async () => ({
  work: new InMemoryWorkService(),
  org: randomUUID(),
  userId: randomUUID(),
  otherOrg: randomUUID(),
  makeObjective: async () => randomUUID(),
}));
