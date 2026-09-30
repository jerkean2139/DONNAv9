import { useEffect, useRef, useState, type FormEvent } from 'react';

import { SendIcon } from './icons';

export type CommandStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'notice'; message: string }
  | { kind: 'error'; message: string };

interface Props {
  /** Resolves true when the command was accepted (the input then clears). */
  onSubmit: (text: string) => Promise<boolean>;
  status?: CommandStatus;
  /** Why commands can't be sent right now; disables the composer. */
  disabledReason?: string;
  /** Text to place in the composer (e.g. from a suggestion), with a nonce. */
  prefill?: { text: string; nonce: number };
}

/**
 * The persistent command composer — the primary interaction surface (UX spec
 * doc 08). The user expresses an outcome; Donna turns it into an objective.
 */
export function CommandBar({
  onSubmit,
  status = { kind: 'idle' },
  disabledReason,
  prefill,
}: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = status.kind === 'sending';
  const disabled = disabledReason !== undefined;

  useEffect(() => {
    if (prefill === undefined) return;
    setValue(prefill.text);
    inputRef.current?.focus();
  }, [prefill]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '' || sending || disabled) return;
    if (await onSubmit(trimmed)) setValue('');
  }

  const canSend = value.trim() !== '' && !sending && !disabled;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="safe-x shrink-0 border-t border-edge/70 bg-surface pb-3 pt-2 md:border-t-0 md:pb-5"
    >
      {status.kind !== 'idle' && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`mx-auto mb-2 max-w-2xl px-1 text-xs ${
            status.kind === 'error' ? 'text-danger' : 'text-muted'
          }`}
        >
          {status.kind === 'sending' ? 'Sending to Donna…' : status.message}
        </p>
      )}
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-edge bg-panel py-1.5 pl-4 pr-1.5 shadow-card focus-within:border-accent/60">
        <input
          ref={inputRef}
          aria-label="Command Donna"
          placeholder={disabledReason ?? 'Tell Donna an outcome…'}
          value={value}
          disabled={sending || disabled}
          enterKeyHint="send"
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint disabled:opacity-70 md:text-sm"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-surface transition-opacity disabled:opacity-30"
        >
          <SendIcon width={18} height={18} strokeWidth={2.25} />
        </button>
      </div>
    </form>
  );
}
