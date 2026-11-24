import type { CSSProperties } from 'react';

/** Balok abu untuk keadaan memuat (radius 6 px). */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-[6px] bg-line motion-reduce:animate-none ${className}`} style={style} />;
}
