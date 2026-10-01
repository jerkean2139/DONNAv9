import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ApiError } from '../api/client';

/** Mono small-caps label — the briefing's section furniture. */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.18em] text-faint ${className}`}>
      {children}
    </span>
  );
}

/** Top rule with a left label and optional right note, like a newspaper folio. */
export function Folio({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge pb-2">
      <div className="min-w-0">{typeof left === 'string' ? <Kicker>{left}</Kicker> : left}</div>
      {right !== undefined && <Kicker className="shrink-0">{right}</Kicker>}
    </div>
  );
}

export interface Crumb {
  label: string;
  onClick?: () => void;
}

/** Breadcrumb trail in the folio: CLIENTS / ACME / WEBSITE. */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-2">
          {i > 0 && <Kicker className="text-faint/60">/</Kicker>}
          {c.onClick ? (
            <button type="button" onClick={c.onClick} className="hover:text-ink">
              <Kicker className="text-muted hover:text-ink">{c.label}</Kicker>
            </button>
          ) : (
            <Kicker className="text-ink/80">{c.label}</Kicker>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-6 break-words font-serif text-[44px] leading-[0.98] text-ink md:text-[60px]">
      {children}
    </h1>
  );
}

/** Section header: mono label on the left, a zero-padded count on the right. */
export function SectionHead({
  id,
  label,
  count,
  action,
}: {
  id?: string;
  label: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2">
      <h2 id={id} className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
        {count !== undefined && (
          <span className="ml-2 text-faint">({String(count).padStart(2, '0')})</span>
        )}
      </h2>
      {action}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="safe-x mx-auto w-full max-w-2xl pb-10 pt-4 md:px-10 md:pt-14">{children}</div>
  );
}

/**
 * One-line "add" field: type, press Enter. Rejections stay in the field with
 * the API's reason underneath, so nothing typed is lost.
 */
export function InlineAdd({
  label,
  placeholder,
  onAdd,
  serif = false,
}: {
  label: string;
  placeholder: string;
  onAdd: (text: string) => Promise<unknown>;
  serif?: boolean;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (text === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(text);
      setValue('');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="border-b border-edge/60">
      <div className="flex items-center gap-3 py-3">
        <span aria-hidden="true" className="font-mono text-sm text-accent">
          +
        </span>
        <input
          aria-label={label}
          value={value}
          disabled={busy}
          placeholder={placeholder}
          enterKeyHint="done"
          onChange={(e) => setValue(e.target.value)}
          className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint ${
            serif ? 'font-serif text-[22px]' : 'text-[16px]'
          }`}
        />
        {value.trim() !== '' && (
          <button
            type="submit"
            disabled={busy}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        )}
      </div>
      {error !== null && (
        <p role="alert" className="pb-2 font-mono text-[11px] text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** A round checkbox; filled ember when done. */
export function Check({
  done,
  onToggle,
  label,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-colors ${
        done ? 'border-accent bg-accent text-surface' : 'border-ink/40 hover:border-accent'
      }`}
    >
      {done && (
        <svg
          viewBox="0 0 24 24"
          width={13}
          height={13}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

const ERROR_TEXT: Record<string, string> = {
  name_required: 'Give it a name first.',
  title_required: 'Give it a title first.',
  name_too_long: 'That name is too long.',
  invalid_url: 'That doesn’t look like a web link (https://…).',
  invalid_date: 'That date doesn’t exist.',
  ends_before_starts: 'The sprint ends before it starts.',
  subtasks_are_one_level: 'Subtasks can’t have subtasks.',
  file_too_large: 'Files can be up to 10 MB.',
  empty_file: 'That file is empty.',
  forbidden: 'You don’t have permission to do that.',
};

/** Plain-language text for an API failure. */
export function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Not signed in.';
    return ERROR_TEXT[err.code] ?? `Couldn’t save that (${err.code}).`;
  }
  return 'Couldn’t reach Donna. Check your connection.';
}

/** Load data for a view; `reload` re-runs it after a change. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const run = useCallback(load, deps);

  useEffect(() => {
    let cancelled = false;
    run().then(
      (d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      },
      (err: unknown) => {
        if (!cancelled) setError(describe(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [run, nonce]);

  return { data, error, reload: () => setNonce((n) => n + 1), setData };
}

export function LoadState({ error }: { error: string | null }) {
  return error !== null ? (
    <p role="alert" className="py-6 font-serif text-[20px] italic text-danger">
      {error}
    </p>
  ) : (
    <div aria-hidden="true" className="space-y-3 py-6">
      <div className="h-6 w-2/3 animate-pulse rounded bg-raised" />
      <div className="h-6 w-1/2 animate-pulse rounded bg-raised" />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-5 font-serif text-[20px] italic text-faint">{children}</p>;
}

/** Numbered row button used by every list in the hierarchy. */
export function Row({
  index,
  title,
  meta,
  onOpen,
}: {
  index: number;
  title: ReactNode;
  meta?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li
      className="animate-rise border-b border-edge/60"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="group grid w-full grid-cols-[2.75rem_1fr_auto] items-baseline gap-x-2 py-4 text-left"
      >
        <span className="font-serif text-[28px] leading-none text-accent">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0">
          <span className="block break-words font-serif text-[24px] leading-tight text-ink">
            {title}
          </span>
          {meta !== undefined && <span className="mt-1 block">{meta}</span>}
        </span>
        <span
          aria-hidden="true"
          className="text-accent transition-transform group-hover:translate-x-1"
        >
          →
        </span>
      </button>
    </li>
  );
}
