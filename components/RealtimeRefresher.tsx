'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

/**
 * Sinkron antar perangkat: setiap perubahan baris milik pengguna (lewat Supabase Realtime, tunduk RLS)
 * membuat halaman dimuat ulang dari server. Juga menyegarkan saat tab kembali aktif atau online.
 */
export function RealtimeRefresher() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');

  useEffect(() => {
    const supabase = getBrowserClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel('hub-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, refresh)
      .subscribe((s: string) => setStatus(s === 'SUBSCRIBED' ? 'live' : s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? 'offline' : 'connecting'));
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const label = status === 'live' ? 'Tersinkron' : status === 'offline' ? 'Offline' : 'Menyambung...';
  return (
    <span className="chip" title="Status sinkron antar perangkat" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-positive' : status === 'offline' ? 'bg-danger' : 'bg-warn'}`} />
      {label}
    </span>
  );
}
