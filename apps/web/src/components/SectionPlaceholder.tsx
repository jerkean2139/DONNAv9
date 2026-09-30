import type { NavSection } from '../types';

/** An honest "not connected yet" page for sections without live data. */
export function SectionPlaceholder({ section, index }: { section: NavSection; index: number }) {
  return (
    <div className="safe-x mx-auto w-full max-w-2xl pb-8 pt-4 md:px-10 md:pt-14">
      <div className="flex items-center justify-between border-b border-edge pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        <span>Section {String(index + 1).padStart(2, '0')}</span>
        <span className="text-accent">Not connected yet</span>
      </div>
      <h1 className="mt-6 font-serif text-[52px] leading-[0.95] text-ink md:text-[68px]">
        {section.label}
      </h1>
      <p className="mt-5 font-serif text-[22px] italic leading-snug text-muted">{section.blurb}</p>
      <p className="mt-8 border-t border-edge pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
        Coming to the brief soon — Donna
      </p>
    </div>
  );
}
