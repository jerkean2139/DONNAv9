import { useState, type FormEvent } from 'react';

export type CommandStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'notice'; message: string }
  | { kind: 'error'; message: string };

interface Props {
  /** Resolves true when the command was accepted (the input then clears). */
  onSubmit: (text: string) => Promise<boolean>;
  status?: CommandStatus;
}

/**
 * The persistent command bar — the primary interaction surface (UX spec doc 08).
 * The user expresses an outcome; Donna turns it into an objective. Voice, attach
 * and screen-context affordances arrive in the Phase 10 UX work.
 */
export function CommandBar({ onSubmit, status = { kind: 'idle' } }: Props) {
  const [value, setValue] = useState('');
  const sending = status.kind === 'sending';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '' || sending) return;
    if (await onSubmit(trimmed)) setValue('');
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="border-t border-edge bg-panel p-3">
      <input
        aria-label="Command Donna"
        placeholder="Tell Donna an outcome…"
        value={value}
        disabled={sending}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent disabled:opacity-60"
      />
      {status.kind !== 'idle' && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-xs ${status.kind === 'error' ? 'text-red-400' : 'text-muted'}`}
        >
          {status.kind === 'sending' ? 'Sending to Donna…' : status.message}
        </p>
      )}
    </form>
  );
}
