import Link from 'next/link';

/** Tab berlatar --track, aktif putih, tinggi 40 px (target sentuh dijaga 44 px oleh wadah). */
export function SegmentedTabs({ items, current, label }: { items: { key: string; label: string; href: string }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="grid rounded-[14px] bg-track p-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined}
          className={`flex min-h-11 items-center justify-center rounded-[10px] px-1 text-[13px] ${t.key === current ? 'bg-surface font-semibold text-fg shadow-card' : 'text-muted'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
