/**
 * Local compute node modes (Technical Plan §9, Build Bible V2-018).
 *
 * Local machines are compute workers, never authoritative infrastructure; the
 * cloud control plane stays available with every node offline (V2-016).
 */
export const NODE_MODES = ['AUTO', 'OFF', 'LOCAL_ONLY'] as const;
export type NodeMode = (typeof NODE_MODES)[number];

export const NODE_HEALTH = ['healthy', 'degraded', 'offline'] as const;
export type NodeHealth = (typeof NODE_HEALTH)[number];

/**
 * Whether the company/team router may dispatch new work to a node.
 *
 * `AUTO` + `healthy` only. `OFF` drains, `LOCAL_ONLY` reserves the machine for
 * its local owner, and any non-healthy node (including a missed heartbeat that
 * flips it to `offline`) is removed from routing.
 */
export function isDispatchable(mode: NodeMode, health: NodeHealth): boolean {
  return mode === 'AUTO' && health === 'healthy';
}
