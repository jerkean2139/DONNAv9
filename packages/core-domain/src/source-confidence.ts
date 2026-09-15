/**
 * Source confidence classification. Preserved end-to-end so a database fact is
 * never silently conflated with an AI inference (Technical Plan §12,
 * Build Bible V2-022).
 */
export const SOURCE_CONFIDENCE = [
  'AUTHORITATIVE',
  'PRIMARY',
  'DERIVED',
  'INFERRED',
  'UNVERIFIED',
] as const;

export type SourceConfidence = (typeof SOURCE_CONFIDENCE)[number];
