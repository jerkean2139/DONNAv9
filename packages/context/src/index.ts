/**
 * @donna/context
 *
 * The Context Packet builder (Technical Plan §12, Build Bible doc 05) — budgeted,
 * cache-ordered working context assembled per objective/task. Pure logic, no I/O.
 * The ranking inputs (authoritative state, retrieved knowledge/memory, skills,
 * recent events) are supplied by the orchestrator's retrieval layer.
 */
export * from './packet.js';
