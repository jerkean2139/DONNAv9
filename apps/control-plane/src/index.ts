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
export { DrizzleObjectiveService } from './services/drizzle-objective-service.js';
export {
  InMemoryTaskDispatcher,
  DrizzleTaskDispatcher,
  type TaskDispatcher,
  type DispatchInput,
  type DispatchResult,
} from './services/task-dispatcher.js';
export {
  GraphileWorkQueue,
  InMemoryWorkQueue,
  createGraphileWorkQueue,
  type WorkQueue,
  type JobAdder,
} from './services/work-queue.js';
export {
  objectiveToRow,
  rowToObjective,
  taskToRow,
  rowToTask,
  buildWorkOrder,
  type WorkOrderHints,
} from './db/mappers.js';
export { devPrincipalFromHeaders } from './principal.js';
export { OBJECTIVE_CREATE_ACTION, TASK_DISPATCH_ACTION } from './actions.js';
export {
  devAuthenticator,
  jwtAuthenticator,
  type Authenticator,
  type AuthOutcome,
  type JwtAuthenticatorDeps,
} from './auth/authenticate.js';
export {
  verifyToken,
  TokenInvalidError,
  MfaRequiredError,
  type VerifierConfig,
  type VerifiedIdentity,
} from './auth/token-verifier.js';
export { DrizzlePrincipalResolver, type PrincipalResolver } from './auth/principal-resolver.js';
