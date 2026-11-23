/** Simbol Ra: bintang empat sudut dari public/brand/ra-avatar.svg. */
export function RaMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="14 14 36 36" className={className} fill="currentColor">
      <path d="M32 14 Q32 32 50 32 Q32 32 32 50 Q32 32 14 32 Q32 32 32 14 Z" />
    </svg>
  );
}

/** Avatar Ra: lingkaran accent dengan bintang putih. */
export function RaAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent" style={{ width: size, height: size }}>
      <RaMark size={Math.round(size * 0.5)} />
    </span>
  );
}
