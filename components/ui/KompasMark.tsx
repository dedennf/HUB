/** Simbol Kompas monokrom (public/brand/kompas-mark.svg), ikut warna teks. */
export function KompasMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" className={className}>
      <mask id="kompas-mark-mask">
        <rect width="64" height="64" fill="#fff" />
        <circle cx="45.4" cy="18.6" r="6.5" fill="#000" />
      </mask>
      <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="3.5" mask="url(#kompas-mark-mask)" />
      <path d="M40.5 23.5 L34.8 34.8 L32 32 L29.2 29.2 Z" fill="currentColor" />
      <path d="M23.5 40.5 L29.2 29.2 L32 32 L34.8 34.8 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M45.4 13.4 Q45.4 18.6 50.6 18.6 Q45.4 18.6 45.4 23.8 Q45.4 18.6 40.2 18.6 Q45.4 18.6 45.4 13.4 Z" fill="currentColor" />
    </svg>
  );
}

/** Logo Kompas: ikon app + wordmark "kompas". */
export function KompasLogo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-fg text-bg">
        <KompasMark size={26} />
      </span>
      <span className="font-display text-[18px] font-extrabold tracking-tight">kompas</span>
    </span>
  );
}
