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
export { devPrincipalFromHeaders } from './principal.js';
export { OBJECTIVE_CREATE_ACTION } from './actions.js';
