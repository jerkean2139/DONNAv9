/**
 * Access scopes. Every scoped business-state record carries an
 * `organization_id` plus one of these scopes (Technical Plan §3.1,
 * Build Bible V2-004). Enforcement is server-side; these types only describe
 * the shape.
 */
export const SCOPES = ['PRIVATE', 'PROJECT', 'TEAM', 'ORGANIZATION'] as const;

export type Scope = (typeof SCOPES)[number];

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}
