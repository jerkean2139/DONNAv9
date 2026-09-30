/** Donna's face — the same artwork as the app icon (`public/donna.svg`). */
export function DonnaAvatar({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/donna.svg"
      alt="Donna"
      width={size}
      height={size}
      className={`shrink-0 rounded-full ring-1 ring-accent/40 ${className}`}
    />
  );
}
