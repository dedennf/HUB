import { Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Tombol + bulat 44 px untuk menambah data. */
export function AddButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} title={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-accent hover:border-accent">
      <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
    </Link>
  );
}

/** Judul seksi + tautan kanan opsional, lalu isi. `add` menampilkan tombol + di kanan. */
export function Section({ title, href, linkLabel = 'Semua', action, add, children, className = '' }: {
  title: string; href?: string; linkLabel?: string; action?: ReactNode; add?: { href: string; label: string }; children: ReactNode; className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex min-h-11 items-center justify-between gap-2">
        <h2 className="h-section">{title}</h2>
        <span className="flex items-center gap-1">
          {href ? <Link href={href} className="inline-flex min-h-11 min-w-11 items-center justify-end text-[13px] font-semibold text-accent">{linkLabel}</Link> : action}
          {add && <AddButton href={add.href} label={add.label} />}
        </span>
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
