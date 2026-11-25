'use client';
import { useEffect, useRef, useState } from 'react';
import { brandDomain, logoUrl } from '@/lib/brands';
import type { Account } from '@/lib/types';
import { Avatar, type AvatarTone } from './Avatar';

const TONE: Record<Account['type'], AvatarTone> = { bank: 'bank', ewallet: 'ewallet', cash: 'cash', investment: 'invest' };

/** Logo bank atau e-wallet bila dikenali, selain itu (atau saat offline) lingkaran inisial. */
export function AccountLogo({ name, type, domain, size = 40 }: { name: string; type: Account['type']; domain?: string | null; size?: number }) {
  const d = type === 'cash' ? null : brandDomain(name, domain);
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // jaringan memblokir layanan ikon tanpa galat (mis. firewall kampus): anggap gagal setelah 4 detik
  useEffect(() => {
    if (!d) return;
    const t = setTimeout(() => { if (!img.current?.complete || !img.current.naturalWidth) setFailed(true); }, 4000);
    return () => clearTimeout(t);
  }, [d]);
  if (!d || failed) return <Avatar name={name} tone={TONE[type]} size={size} />;
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={logoUrl(d)} alt="" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setFailed(true); }} />
    </span>
  );
}
