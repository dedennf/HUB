'use client';
import { useState, useTransition } from 'react';
import { formatDateId, formatDateTimeId } from '@/lib/time';
import { previewRestore, runRestore, type RestoreOutcome, type RestorePreview, type RestoreSource } from './actions';
import { tableLabel } from './labels';

/** Pemulihan dari cadangan Kompas: hanya menambah data yang hilang, tidak menimpa atau menghapus (D-70). */
export function RestoreClient({ stored }: { stored: { name: string; date: string }[] }) {
  const [source, setSource] = useState<RestoreSource | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const check = (src: RestoreSource, label: string) => start(async () => {
    setError(''); setOutcome(null); setPreview(null); setSource(src); setSourceLabel(label);
    const r = await previewRestore(src);
    if (!r.ok) { setError(r.message); return; }
    setPreview(r);
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    check({ kind: 'file', text: await file.text() }, file.name);
  };

  const restore = () => start(async () => {
    if (!source) return;
    setError('');
    const r = await runRestore(source);
    if (!r.ok) { setError(r.message); return; }
    setOutcome(r); setPreview(null);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {stored.length > 0 && (
          <label className="min-w-[200px] flex-1">
            <span className="label">Dari cadangan otomatis</span>
            <select className="input" defaultValue="" disabled={pending}
              onChange={(e) => { const s = stored.find((x) => x.name === e.target.value); if (s) check({ kind: 'stored', name: s.name }, `cadangan ${formatDateId(s.date, { day: 'numeric', month: 'long', year: 'numeric' })}`); }}>
              <option value="" disabled>Pilih tanggal</option>
              {stored.map((s) => <option key={s.name} value={s.name}>{formatDateId(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</option>)}
            </select>
          </label>
        )}
        <label className="btn cursor-pointer">
          Pilih file cadangan
          <input type="file" accept="application/json,.json" className="sr-only" disabled={pending} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {pending && <p role="status" className="text-[13px] text-muted">Memeriksa {sourceLabel || 'cadangan'}...</p>}
      {error && <p role="alert" className="text-[13px] text-negative">{error}</p>}

      {preview && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-[13px]">Cadangan dibuat {formatDateTimeId(preview.exported)}. Data yang sudah ada tidak ditimpa dan tidak dihapus.</p>
          <ul className="rows mt-2">
            {preview.counts.map((c) => (
              <li key={c.table} className="flex min-h-9 items-center justify-between gap-3 text-[13px]">
                <span>{tableLabel(c.table)}</span>
                <span className="num">{c.missing ? <b className="text-accent">+{c.missing}</b> : <span className="text-muted">lengkap</span>} <span className="text-muted">/ {c.total}</span></span>
              </li>
            ))}
          </ul>
          {preview.mergedCategories > 0 && <p className="mt-2 text-[12px] text-muted">{preview.mergedCategories} kategori bawaan digabung ke kategori yang sama di Kompas.</p>}
          {preview.ignored.length > 0 && <p className="mt-1 text-[12px] text-muted">Diabaikan: {preview.ignored.join(', ')}.</p>}
          <p className="mt-1 text-[12px] text-muted">Pengaturan dan pola kesalahan yang sudah ada tetap memakai nilai sekarang.</p>
          <div className="mt-3">
            {preview.missing > 0
              ? <button className="btn btn-primary" disabled={pending} onClick={restore}>{pending ? 'Memulihkan...' : `Pulihkan ${preview.missing} data yang hilang`}</button>
              : <p className="text-[13px] text-positive">Tidak ada data yang hilang. Semua isi cadangan ini sudah ada di Kompas.</p>}
          </div>
        </div>
      )}

      {outcome && (
        <div className="rounded-xl border border-line p-3 text-[13px]">
          <p className="font-semibold">Pemulihan selesai.</p>
          <p className="mt-1">{outcome.inserted.filter((x) => x.n > 0).map((x) => `${tableLabel(x.table)} ${x.n}`).join(', ') || 'Tidak ada data baru.'}</p>
          <p className={`mt-1 ${outcome.balancesOk ? 'text-positive' : 'text-negative'}`}>{outcome.balancesOk ? 'Saldo semua akun konsisten dengan transaksinya.' : 'Ada saldo yang tidak cocok. Cek Pengaturan, Pemeriksaan saldo.'}</p>
        </div>
      )}
    </div>
  );
}
