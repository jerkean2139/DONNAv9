/** Donna's face — the same portrait as the app icons (`public/images/donna-ai-chief-of-staff-portrait.jpg`). */
export function DonnaAvatar({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/donna-ai-chief-of-staff-avatar.jpg"
      alt="Donna, your AI chief of staff"
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-raised object-cover ring-1 ring-accent/40 ${className}`}
    />
  );
}
