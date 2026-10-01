import { useEffect, useState, type ReactNode } from 'react';

import { ApiError, type ControlPlaneClient } from '../api/client';
import type { GmailStatus, OutboundEmailView, WorkItemView } from '../types';
import { Kicker, SectionHead } from './ui';

const EMAIL_ERRORS: Record<string, string> = {
  no_recipient: 'Who’s it to? Add at least one address.',
  invalid_recipient: 'One of those addresses doesn’t look right.',
  invalid_subject: 'Give it a subject (one line).',
  empty_body: 'There’s nothing to send yet.',
  gmail_not_connected: 'Connect Gmail first.',
  gmail_reconnect: 'Gmail needs reconnecting — Google signed me out.',
  send_in_progress: 'That’s already sending — give it a moment.',
  gmail_failed: 'Gmail didn’t take it. Nothing was sent — try again.',
  gmail_unconfigured: 'Gmail isn’t set up on this deployment.',
  insufficient_authority: 'Your role can save drafts but not send email.',
  kill_switch: 'Outgoing email is paused for your organization.',
  confirmation_required: 'Confirm before sending.',
};

function errorText(err: unknown): string {
  if (err instanceof ApiError) return EMAIL_ERRORS[err.code] ?? `Gmail said no (${err.code}).`;
  return 'Couldn’t reach Donna. Nothing was sent.';
}

/**
 * Splits Donna's draft into email fields: leading `To:`, `Cc:` and `Subject:`
 * lines (optionally bold) become fields; the rest is the body.
 */
export function splitDraft(draft: string): {
  to: string;
  cc: string;
  subject: string;
  body: string;
} {
  const out = { to: '', cc: '', subject: '', body: '' };
  const lines = draft.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  for (; i < lines.length; i++) {
    const m = /^\s*\**\s*(to|cc|subject)\s*:\s*\**\s*(.*?)\s*\**\s*$/i.exec(lines[i]!);
    if (m === null) break;
    out[m[1]!.toLowerCase() as 'to' | 'cc' | 'subject'] = m[2]!;
  }
  out.body = lines.slice(i).join('\n').trim();
  return out;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-baseline gap-3 border-b border-edge/60 py-2">
      <Kicker className="w-16 shrink-0">{label}</Kicker>
      {children}
    </label>
  );
}

const INPUT =
  'min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint';
const ACTION = 'font-mono text-[10px] uppercase tracking-[0.16em]';

interface Props {
  client: ControlPlaneClient;
  task: WorkItemView;
}

/**
 * Email a task out through the person's own Gmail: save it to their Gmail
 * drafts, or send it after an explicit confirmation of exactly who it goes to.
 * Donna only ever has compose access — she can't read the inbox.
 */
export function EmailTask({ client, task }: Props) {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [emails, setEmails] = useState<OutboundEmailView[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'send' | 'connect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnect, setReconnect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client.gmailStatus().then(
      (s) => !cancelled && setGmail(s),
      () => {},
    );
    client.listEmails(task.id).then(
      (list) => !cancelled && setEmails(list),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [client, task.id]);

  function start() {
    const fromDraft = task.draft != null && task.draftStatus === 'ready';
    setForm(
      fromDraft ? splitDraft(task.draft!) : { to: '', cc: '', subject: task.title, body: '' },
    );
    setConfirming(false);
    setError(null);
    setOpen(true);
  }

  async function connect() {
    setBusy('connect');
    setError(null);
    try {
      window.location.assign(await client.connectGmail());
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  async function deliver(mode: 'draft' | 'send') {
    setBusy(mode);
    setError(null);
    setReconnect(false);
    try {
      const email = await client.emailTask(task.id, {
        to: form.to,
        ...(form.cc.trim() !== '' ? { cc: form.cc } : {}),
        subject: form.subject,
        body: form.body,
        mode,
        ...(mode === 'send' ? { confirm: true } : {}),
      });
      setEmails((list) => [email, ...list]);
      setOpen(false);
      setConfirming(false);
    } catch (err) {
      setError(errorText(err));
      setConfirming(false);
      if (err instanceof ApiError && err.code === 'gmail_reconnect') setReconnect(true);
      // A failed attempt is still on the record; show it.
      client.listEmails(task.id).then(setEmails, () => {});
    } finally {
      setBusy(null);
    }
  }

  const recipients = [form.to, form.cc].filter((s) => s.trim() !== '').join(', ');

  return (
    <section className="mt-10" aria-label="Email">
      <SectionHead
        label="Email"
        {...(emails.length > 0 ? { count: emails.length } : {})}
        action={
          !open ? (
            <button type="button" onClick={start} className={`${ACTION} text-accent`}>
              {task.draftStatus === 'ready' ? 'Email this draft →' : 'Write an email →'}
            </button>
          ) : undefined
        }
      />

      {emails.length > 0 && (
        <ul className="mt-2">
          {emails.map((e) => (
            <li key={e.id} className="border-b border-edge/60 py-2.5">
              <span className="block truncate text-[15px] text-ink">{e.subject}</span>
              <Kicker className={e.status === 'failed' ? 'text-danger' : ''}>
                {e.status === 'failed'
                  ? `Didn’t ${e.mode === 'send' ? 'send' : 'save'} · ${when(e.createdAt)}`
                  : e.status === 'pending'
                    ? 'Sending…'
                    : e.mode === 'send'
                      ? `Sent to ${e.to.join(', ')} · ${when(e.completedAt ?? e.createdAt)}`
                      : `In your Gmail drafts · ${when(e.completedAt ?? e.createdAt)}`}
              </Kicker>
            </li>
          ))}
        </ul>
      )}

      {open && gmail !== null && !gmail.connected && (
        <div className="mt-4 rounded-lg border border-edge bg-panel p-4">
          <p className="font-serif text-[19px] leading-snug text-ink">
            Connect your Gmail and I’ll put this in your drafts or send it from your address.
          </p>
          <p className="mt-1 text-[13px] text-faint">
            I only get permission to write and send — I can’t read your inbox.
          </p>
          <div className="mt-3 flex gap-5">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void connect()}
              className={`${ACTION} text-accent`}
            >
              {busy === 'connect' ? 'Opening Google…' : 'Connect Gmail →'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={`${ACTION} text-faint`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && gmail?.connected === true && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
        >
          <Kicker>From {gmail.email}</Kicker>
          <Field label="To">
            <input
              aria-label="To"
              type="text"
              inputMode="email"
              autoComplete="email"
              value={form.to}
              placeholder="name@company.com"
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className={INPUT}
            />
          </Field>
          <Field label="Cc">
            <input
              aria-label="Cc"
              type="text"
              inputMode="email"
              value={form.cc}
              onChange={(e) => setForm({ ...form, cc: e.target.value })}
              className={INPUT}
            />
          </Field>
          <Field label="Subject">
            <input
              aria-label="Subject"
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={INPUT}
            />
          </Field>
          <textarea
            aria-label="Message"
            value={form.body}
            rows={10}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="mt-3 w-full resize-y rounded-lg border border-edge bg-panel p-3 text-[15px] leading-relaxed text-ink outline-none focus:border-accent/60"
          />

          {!confirming ? (
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void deliver('draft')}
                className={`${ACTION} text-ink`}
              >
                {busy === 'draft' ? 'Saving…' : 'Save to Gmail drafts'}
              </button>
              <button type="submit" disabled={busy !== null} className={`${ACTION} text-accent`}>
                Send…
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${ACTION} text-faint`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div
              role="alertdialog"
              aria-label="Confirm send"
              className="mt-3 rounded-lg border border-accent/50 p-4"
            >
              <p className="font-serif text-[19px] leading-snug text-ink">
                Send “{form.subject}” to {recipients || 'nobody yet'}?
              </p>
              <p className="mt-1 text-[13px] text-faint">
                It goes out now from {gmail.email}. This can’t be undone.
              </p>
              <div className="mt-3 flex gap-5">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void deliver('send')}
                  className={`${ACTION} text-accent`}
                >
                  {busy === 'send' ? 'Sending…' : 'Send now'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className={`${ACTION} text-faint`}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {error !== null && (
        <p role="alert" className="mt-2 font-mono text-[11px] text-danger">
          {error}
          {reconnect && (
            <button
              type="button"
              onClick={() => void connect()}
              className="ml-3 uppercase tracking-[0.16em] text-accent"
            >
              Reconnect →
            </button>
          )}
        </p>
      )}
    </section>
  );
}
