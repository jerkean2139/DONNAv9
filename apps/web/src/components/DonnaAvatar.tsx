/** Donna's face — the same artwork as the app icon (`public/donna.svg`). */
export function DonnaAvatar({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/donna-face.svg"
      alt="Donna"
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-raised ring-1 ring-accent/30 ${className}`}
    />
  );
}
