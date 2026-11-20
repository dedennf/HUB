import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatRupiah } from '@/lib/money';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted">{children}</p>;
}

export function Money({ value, signed = false, className = '' }: { value: number; signed?: boolean; className?: string }) {
  const tone = signed ? (value < 0 ? 'text-danger' : value > 0 ? 'text-positive' : '') : '';
  return <span className={`tabular-nums ${tone} ${className}`}>{formatRupiah(value)}</span>;
}

export function PageTitle({ title, kicker, right }: { title: string; kicker?: string; right?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        {kicker && <div className="text-xs uppercase tracking-wide text-muted">{kicker}</div>}
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className="tab" aria-current={t.key === current ? 'page' : undefined}>{t.label}</Link>
      ))}
    </div>
  );
}
