/**
 * @donna/control-plane
 *
 * Control-plane API skeleton (Technical Plan §4.1). Wires request identity →
 * deterministic policy → objective/task state → event outbox. Auth is a dev
 * header shim for now; production auth (Supabase + MFA) lands in a later phase.
 */
export { buildServer, type ServerDeps } from './server.js';
export {
  InMemoryObjectiveService,
  type ObjectiveService,
  type CreateObjectiveInput,
} from './services/objective-service.js';
export {
  InMemoryTaskService,
  type TaskService,
  type CreateTaskInput,
} from './services/task-service.js';
export {
  GraphileWorkQueue,
  InMemoryWorkQueue,
  createGraphileWorkQueue,
  type WorkQueue,
  type JobAdder,
} from './services/work-queue.js';
export { devPrincipalFromHeaders } from './principal.js';
export { OBJECTIVE_CREATE_ACTION, TASK_DISPATCH_ACTION } from './actions.js';
