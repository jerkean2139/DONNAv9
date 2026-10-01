/**
 * @donna/adapter-gmail
 *
 * Gmail `CapabilityAdapter` (Technical Plan §7): Google OAuth for a user's
 * account (gmail.compose scope only — Donna cannot read the mailbox) and
 * drafting/sending plain-text mail through the Gmail REST API.
 */
export * from './gmail-adapter.js';
export * from './google-oauth.js';
export * from './mime.js';
