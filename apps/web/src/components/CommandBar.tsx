import { useState, type FormEvent } from 'react';

interface Props {
  onSubmit: (text: string) => void;
}

/**
 * The persistent command bar — the primary interaction surface (UX spec doc 08).
 * The user expresses an outcome; Donna turns it into an objective. Voice, attach
 * and screen-context affordances arrive in the Phase 10 UX work.
 */
export function CommandBar({ onSubmit }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '') return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-edge bg-panel p-3">
      <input
        aria-label="Command Donna"
        placeholder="Tell Donna an outcome…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
      />
    </form>
  );
}
