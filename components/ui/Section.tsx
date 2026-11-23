import Link from 'next/link';
import type { ReactNode } from 'react';

/** Judul seksi + tautan kanan opsional, lalu isi. */
export function Section({ title, href, linkLabel = 'Semua', action, children, className = '' }: {
  title: string; href?: string; linkLabel?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex min-h-11 items-center justify-between gap-2">
        <h2 className="h-section">{title}</h2>
        {href ? <Link href={href} className="inline-flex min-h-11 min-w-11 items-center justify-end text-[13px] font-semibold text-accent">{linkLabel}</Link> : action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-[13px] text-muted">{children}</p>;
}

export function PageHeader({ title, kicker, back, right }: { title: string; kicker?: string; back?: { href: string; label: string }; right?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-1 inline-flex min-h-11 min-w-11 items-center pr-2 text-[13px] font-semibold text-accent">‹ {back.label}</Link>}
        {kicker && <p className="text-[13px] text-muted">{kicker}</p>}
        <h1 className="h-page">{title}</h1>
      </div>
      {right}
    </header>
  );
}
