import { detectLinkProvider, type LinkProvider } from '@donna/core-domain';

import { WorkValidationError } from './types.js';

// Shared input rules, so the in-memory and Postgres services validate alike.

const MAX_NAME = 200;
const MAX_URL = 2048;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export function requireName(value: string, code = 'name_required'): string {
  const trimmed = value.trim();
  if (trimmed === '') throw new WorkValidationError(code);
  if (trimmed.length > MAX_NAME) throw new WorkValidationError('name_too_long');
  return trimmed;
}

/** A calendar date `YYYY-MM-DD` that actually exists, or a 400. */
export function requireDate(value: string): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new WorkValidationError('invalid_date');
  }
  const round = new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10);
  if (round !== value) throw new WorkValidationError('invalid_date');
  return value;
}

export function requireDateRange(startsOn?: string | null, endsOn?: string | null): void {
  if (startsOn && endsOn && endsOn < startsOn) throw new WorkValidationError('ends_before_starts');
}

/** An absolute http(s) URL (never `javascript:`/`data:`), with its provider. */
export function requireLink(url: string): { url: string; provider: LinkProvider } {
  const trimmed = url.trim();
  if (trimmed.length > MAX_URL) throw new WorkValidationError('url_too_long');
  const provider = detectLinkProvider(trimmed);
  if (provider === null) throw new WorkValidationError('invalid_url');
  return { url: trimmed, provider };
}

/** A default title for a link: host + path, trimmed. */
export function linkTitle(url: string): string {
  const u = new URL(url);
  const path = u.pathname === '/' ? '' : u.pathname;
  const title = `${u.hostname.replace(/^www\./, '')}${path}`;
  return title.length > 120 ? `${title.slice(0, 117)}…` : title;
}

/** A safe display filename: no path segments or control characters. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned === '') throw new WorkValidationError('filename_required');
  return cleaned.length > MAX_NAME ? cleaned.slice(0, MAX_NAME) : cleaned;
}

export function cleanContentType(value: string): string {
  const v = value.trim().toLowerCase();
  return MIME.test(v) ? v : 'application/octet-stream';
}
