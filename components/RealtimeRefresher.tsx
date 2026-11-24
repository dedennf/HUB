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

  // Hanya tampil saat sinkron terputus, agar tidak mengganggu tampilan (DESIGN tidak memuat indikator ini).
  if (status !== 'offline') return null;
  return (
    <p role="status" className="fixed inset-x-4 top-3 z-40 mx-auto max-w-sm rounded-xl bg-warn-bg px-3 py-2 text-center text-[12px] text-warn-fg">
      Sinkron terputus. Perubahan dari perangkat lain muncul setelah tersambung lagi.
    </p>
  );
}
