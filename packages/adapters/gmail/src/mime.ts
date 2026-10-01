/**
 * Plain-text RFC 5322 message building for the Gmail API's `raw` field.
 * Addresses and the subject are validated so caller text can never inject
 * headers (no CR/LF anywhere in a header value).
 */

export class MailValidationError extends Error {
  constructor(
    readonly code: 'invalid_recipient' | 'no_recipient' | 'invalid_subject' | 'empty_body',
  ) {
    super(code);
    this.name = 'MailValidationError';
  }
}

export interface MailMessage {
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly subject: string;
  /** Plain-text body. */
  readonly body: string;
}

/** Most recipients Donna will put on one message. */
export const MAX_RECIPIENTS = 20;
export const MAX_SUBJECT_LENGTH = 300;
export const MAX_BODY_LENGTH = 100_000;

// Deliberately conservative: local@domain.tld, no spaces, no display names.
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isEmailAddress(value: string): boolean {
  return value.length <= 254 && ADDRESS.test(value);
}

/** Splits "a@x.com, b@y.com; c@z.com" into trimmed, non-empty parts. */
export function parseAddressList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Validates and normalizes a message; throws {@link MailValidationError}. */
export function validateMessage(message: MailMessage): MailMessage {
  const to = message.to.map((a) => a.trim()).filter((a) => a !== '');
  const cc = (message.cc ?? []).map((a) => a.trim()).filter((a) => a !== '');
  if (to.length === 0) throw new MailValidationError('no_recipient');
  if (to.length + cc.length > MAX_RECIPIENTS) throw new MailValidationError('invalid_recipient');
  if (![...to, ...cc].every(isEmailAddress)) throw new MailValidationError('invalid_recipient');
  const subject = message.subject.trim();
  if (subject === '' || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    throw new MailValidationError('invalid_subject');
  }
  if (message.body.trim() === '' || message.body.length > MAX_BODY_LENGTH) {
    throw new MailValidationError('empty_body');
  }
  return { to, cc, subject, body: message.body };
}

function base64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** RFC 2047 encoded-word for a non-ASCII header value. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`;
}

/** Wraps base64 at 76 columns, as RFC 2045 requires. */
function wrap(b64: string): string {
  return b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

/** The base64url-encoded RFC 5322 message the Gmail API expects as `raw`. */
export function buildRawMessage(message: MailMessage): string {
  const m = validateMessage(message);
  const headers = [
    `To: ${m.to.join(', ')}`,
    ...(m.cc !== undefined && m.cc.length > 0 ? [`Cc: ${m.cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];
  const body = m.body.replace(/\r?\n/g, '\r\n');
  const rfc822 = `${headers.join('\r\n')}\r\n\r\n${wrap(base64(body))}\r\n`;
  return Buffer.from(rfc822, 'utf8').toString('base64url');
}
