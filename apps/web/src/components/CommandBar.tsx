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
 * doc 08). A cream slab on the dark page: the one thing that's always yours to
 * write on. The user expresses an outcome; Donna turns it into an objective.
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
      className="safe-x relative z-10 shrink-0 pb-3 pt-2"
    >
      {status.kind !== 'idle' && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`mx-auto mb-2 max-w-2xl animate-rise font-mono text-[11px] uppercase tracking-[0.12em] ${
            status.kind === 'error' ? 'text-danger' : 'text-accent'
          }`}
        >
          {status.kind === 'sending' ? 'Sending to Donna…' : status.message}
        </p>
      )}
      <div
        className={`mx-auto flex max-w-2xl items-center gap-2 rounded-[22px] py-1.5 pl-5 pr-1.5 transition-colors ${
          disabled ? 'bg-raised' : 'bg-ink shadow-[0_18px_40px_-18px_rgba(255,91,46,0.45)]'
        }`}
      >
        <input
          ref={inputRef}
          aria-label="Command Donna"
          placeholder={disabledReason ?? 'Tell Donna what you need…'}
          value={value}
          disabled={sending || disabled}
          enterKeyHint="send"
          onChange={(e) => setValue(e.target.value)}
          className={`min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none md:text-[15px] ${
            disabled
              ? 'text-muted placeholder:text-faint'
              : 'text-surface placeholder:text-surface/45'
          }`}
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-surface transition-[opacity,transform] active:scale-95 disabled:opacity-25"
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}
