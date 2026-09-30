import type { SVGProps } from 'react';

/** The composer's send arrow — the only icon; everything else is typographic. */
export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}
