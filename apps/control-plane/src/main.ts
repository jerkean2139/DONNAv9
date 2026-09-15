import { InMemoryEventBus } from '@donna/events';

import { buildServer } from './server.js';
import { InMemoryObjectiveService } from './services/objective-service.js';

/**
 * Process entrypoint. Uses the in-memory service for now; the Drizzle-backed
 * service + real event transport are injected here once the DB wiring lands.
 */
const bus = new InMemoryEventBus();
const app = buildServer({ objectiveService: new InMemoryObjectiveService(bus) });

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
