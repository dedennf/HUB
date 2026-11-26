'use client';
import Link from 'next/link';
import { ImportPreview } from '@/components/ui/ImportPreview';
import { useState, useTransition } from 'react';
import { formatRupiah } from '@/lib/money';
import type { ImportOverrides } from '@/lib/legacy/schema';
import { tableLabel } from './labels';
import { previewImport, runImport, type ImportOutcome, type ImportPreview as PreviewData } from './actions';

const label = tableLabel;

const EMPTY: ImportOverrides = { transactionDates: {}, semesterDates: {}, billAccounts: {} };

export function ImportClient() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState<ImportOverrides>(EMPTY);
  const [pending, start] = useTransition();

  const check = (t: string, o: ImportOverrides) => start(async () => {
    setError('');
    const r = await previewImport(t, o);
    if (!r.ok) { setError(r.message); setPreview(null); return; }
    setPreview(r);
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setOutcome(null);
    setOverrides(EMPTY);
    setFileName(file.name);
    const t = await file.text();
    setText(t);
    check(t, EMPTY);
  };

  const doImport = () => start(async () => {
    if (!text) return;
    setError('');
    const r = await runImport(text, overrides);
    if (!r.ok) { setError(r.message); return; }
    setOutcome(r);
  });

  const setTxDate = (id: string, v: string) => setOverrides((o) => ({ ...o, transactionDates: { ...o.transactionDates, [id]: v } }));
  const setSem = (n: string, k: 'start' | 'end', v: string) =>
    setOverrides((o) => ({ ...o, semesterDates: { ...o.semesterDates, [n]: { start: o.semesterDates[n]?.start ?? '', end: o.semesterDates[n]?.end ?? '', [k]: v } } }));
  const setBill = (id: string, v: string) => setOverrides((o) => ({ ...o, billAccounts: { ...o.billAccounts, [id]: v } }));

  if (outcome) {
    const allMatch = outcome.balances.every((b) => b.actual === b.expected);
    return (
      <div className="grid gap-4">
        <div className="card p-4">
          <h2 className="h-section mb-2">Impor selesai</h2>
          <p className="text-[13px]">{Object.entries(outcome.inserted).filter(([, n]) => n > 0).map(([t, n]) => `${label(t)} ${n}`).join(', ') || 'Tidak ada data baru (semua sudah pernah diimpor).'}</p>
        </div>
        <div className="card p-4">
          <h2 className="h-section mb-2">Pencocokan saldo dengan app lama</h2>
          <p className={`mb-2 text-[13px] font-semibold ${allMatch ? 'text-positive' : 'text-negative'}`}>{allMatch ? 'Semua saldo cocok.' : 'Ada saldo yang berbeda. Periksa transaksi akun tersebut.'}</p>
          <div className="rows">
            {outcome.balances.map((b) => (
              <div key={b.name} className="flex min-h-11 items-center justify-between gap-3 text-[13px]">
                <span>{b.name}</span>
                <span className={b.actual === b.expected ? '' : 'text-negative'}>{b.actual == null ? 'tidak ditemukan' : formatRupiah(b.actual)} (app lama {formatRupiah(b.expected)})</span>
              </div>
            ))}
          </div>
        </div>
        <Link href="/" className="btn btn-primary w-fit">Ke Beranda</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <label className="block">
          <span className="label">File cadangan (hub-pribadi-YYYY-MM-DD.json)</span>
          <input type="file" accept="application/json,.json" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="mt-2 text-[12px] text-muted">File hanya dibaca untuk impor dan tidak disimpan di server.</p>
      </div>
      {pending && <p className="text-[13px] text-muted">Memproses...</p>}
      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-[13px] text-danger-fg">{error}</p>}
      {preview && text && (
        <>
          <ImportPreview
            fileName={fileName}
            exported={preview.exported ? `${new Date(preview.exported).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` : null}
            counts={Object.entries(preview.counts).map(([t, c]) => ({ label: label(t), total: c.total, fresh: c.new }))}
          />
          {preview.blockers.length > 0 && (
            <div role="alert" className="card p-4"><h2 className="h-section mb-2 text-negative">Impor tidak bisa dilanjutkan</h2>{preview.blockers.map((b) => <p key={b} className="text-[13px]">{b}</p>)}</div>
          )}
          {preview.warnings.length > 0 && (
            <div className="card p-4">
              <h2 className="h-section mb-2">Perlu dicek ({preview.warnings.length})</h2>
              <ul className="grid gap-3">
                {preview.warnings.map((w) => (
                  <li key={w.key} className="rounded-xl bg-warn-bg p-3 text-[13px] text-warn-fg">
                    <p>{w.text}</p>
                    {w.fix === 'tx_date' && w.ref && (
                      <label className="mt-2 block"><span className="label">Tanggal yang benar (kosongkan jika memang benar)</span>
                        <input type="date" className="input max-w-xs" value={overrides.transactionDates[w.ref] ?? ''} onChange={(e) => setTxDate(w.ref!, e.target.value)} /></label>
                    )}
                    {w.fix === 'semester' && w.ref && (
                      <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
                        <label><span className="label">Mulai</span><input type="date" className="input" value={overrides.semesterDates[w.ref]?.start ?? ''} onChange={(e) => setSem(w.ref!, 'start', e.target.value)} /></label>
                        <label><span className="label">Selesai</span><input type="date" className="input" value={overrides.semesterDates[w.ref]?.end ?? ''} onChange={(e) => setSem(w.ref!, 'end', e.target.value)} /></label>
                      </div>
                    )}
                    {w.fix === 'bill_account' && w.ref && (
                      <label className="mt-2 block"><span className="label">Bayar dari akun</span>
                        <select className="input max-w-xs" value={overrides.billAccounts[w.ref] ?? ''} onChange={(e) => setBill(w.ref!, e.target.value)}>
                          <option value="">Biarkan kosong</option>
                          {preview.accounts.map((a) => <option key={a.legacyId} value={a.legacyId}>{a.name}</option>)}
                        </select></label>
                    )}
                  </li>
                ))}
              </ul>
              <button className="btn mt-3" disabled={pending} onClick={() => check(text, overrides)}>Periksa ulang dengan perbaikan</button>
            </div>
          )}
          <div className="card p-4">
            <p className="mb-3 text-[13px]">{preview.newRows} data baru akan disimpan dalam satu langkah. Jika gagal, tidak ada yang tersimpan.</p>
            <button className="btn btn-primary" disabled={pending || preview.blockers.length > 0 || preview.newRows === 0} onClick={doImport}>
              {preview.newRows === 0 ? 'Semua data sudah pernah diimpor' : 'Impor data'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
