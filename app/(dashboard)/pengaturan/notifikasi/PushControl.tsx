'use client';
import { useEffect, useState } from 'react';

type State = 'checking' | 'unsupported' | 'ios_install' | 'denied' | 'off' | 'on' | 'busy';

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const deviceLabel = () => {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? 'Android' : isIos() ? 'iPhone' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Perangkat';
  const br = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : /firefox/i.test(ua) ? 'Firefox' : 'Browser';
  return `${os} · ${br}`;
};

/** Tombol "Aktifkan notifikasi" per perangkat (SPEC 9), dengan petunjuk khusus iPhone. */
export function PushControl({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>('checking');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(isIos() && !standalone() ? 'ios_install' : 'unsupported'); return;
      }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.getRegistration('/');
      setState((await reg?.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  const enable = async () => {
    setState('busy'); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sub.toJSON(), device_label: deviceLabel() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setState('on'); setMsg('Notifikasi aktif di perangkat ini.');
    } catch (e) {
      setState('off'); setMsg(`Gagal mengaktifkan: ${(e as Error).message}`);
    }
  };
  const disable = async () => {
    setState('busy'); setMsg(null);
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setState('off'); setMsg('Notifikasi dimatikan di perangkat ini.');
  };
  const test = async () => {
    setMsg('Mengirim...');
    const res = await fetch('/api/push/test', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Terkirim ke ${data.devices ?? 0} perangkat.` : data.error ?? 'Gagal mengirim.');
  };

  return (
    <div className="flex flex-col gap-3">
      {state === 'ios_install' && (
        <p className="rounded-2xl bg-info-bg p-3 text-[13px] text-info-fg">
          Di iPhone, notifikasi baru bisa aktif setelah Kompas ditambahkan ke Layar Utama: ketuk tombol Bagikan di Safari, pilih <strong>Tambah ke Layar Utama</strong>, lalu buka Kompas dari ikon itu dan kembali ke halaman ini.
        </p>
      )}
      {state === 'unsupported' && <p className="text-[13px] text-muted">Browser ini belum mendukung notifikasi push. Notifikasi tetap muncul di lonceng.</p>}
      {state === 'denied' && <p className="text-[13px] text-warn-fg">Izin notifikasi diblokir. Buka pengaturan situs di browser, izinkan notifikasi untuk Kompas, lalu muat ulang halaman.</p>}
      {!vapidKey && <p className="text-[13px] text-warn-fg">Kunci VAPID belum diisi di server, jadi push belum bisa diaktifkan.</p>}
      <div className="flex flex-wrap gap-3">
        {(state === 'off' || state === 'busy') && vapidKey && <button type="button" className="btn btn-primary" onClick={enable} disabled={state === 'busy'}>{state === 'busy' ? 'Menyiapkan...' : 'Aktifkan notifikasi'}</button>}
        {state === 'on' && <>
          <button type="button" className="btn btn-primary" onClick={test}>Kirim notifikasi uji</button>
          <button type="button" className="btn" onClick={disable}>Matikan di perangkat ini</button>
        </>}
      </div>
      {state === 'checking' && <p className="text-[13px] text-muted" role="status">Memeriksa perangkat...</p>}
      {msg && <p role="status" className="text-[13px]">{msg}</p>}
    </div>
  );
}
