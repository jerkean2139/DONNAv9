import type { NavSection } from '../types';

/** An honest "not connected yet" state for sections without live data. */
export function SectionPlaceholder({ section }: { section: NavSection }) {
  const Icon = section.icon;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-6 pt-5 md:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{section.label}</h1>
      <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-edge px-6 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-raised text-accent">
          <Icon width={26} height={26} />
        </span>
        <p className="mt-4 max-w-xs text-sm text-muted">{section.blurb}</p>
        <span className="mt-4 rounded-full bg-raised px-3 py-1 text-xs text-faint">
          Not connected yet
        </span>
      </div>
    </div>
  );
}
