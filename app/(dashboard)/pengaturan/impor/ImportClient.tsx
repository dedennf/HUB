'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { formatRupiah } from '@/lib/money';
import type { ImportOverrides } from '@/lib/legacy/schema';
import { previewImport, runImport, type ImportOutcome, type ImportPreview } from './actions';

const LABEL: Record<string, string> = {
  accounts: 'Akun', categories: 'Kategori', transactions: 'Transaksi', investments: 'Investasi', bills: 'Tagihan',
  savings_goals: 'Target tabungan', debts: 'Utang & piutang', sinking_funds: 'Biaya sejati', semesters: 'Semester',
  courses: 'Mata kuliah', course_schedules: 'Jadwal kelas', materials: 'Materi', tasks: 'Tugas', task_work_slots: 'Rencana kerja',
  holidays: 'Libur', research_projects: 'Proyek riset', research_needs: 'Kebutuhan riset', research_ideas: 'Ide riset',
  research_targets: 'Target riset', readings: 'Literatur', supervisions: 'Bimbingan', events: 'Acara', agent_memory: 'Catatan untuk asisten',
};
const label = (t: string) => LABEL[t] ?? t;

const EMPTY: ImportOverrides = { transactionDates: {}, semesterDates: {}, billAccounts: {} };

export function ImportClient() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
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
        <div className="card">
          <h2 className="h2">Impor selesai</h2>
          <p className="text-sm">{Object.entries(outcome.inserted).filter(([, n]) => n > 0).map(([t, n]) => `${label(t)} ${n}`).join(', ') || 'Tidak ada data baru (semua sudah pernah diimpor).'}</p>
        </div>
        <div className="card">
          <h2 className="h2">Pencocokan saldo dengan app lama</h2>
          <p className={`mb-2 text-sm ${allMatch ? 'text-positive' : 'text-danger'}`}>{allMatch ? 'Semua saldo cocok.' : 'Ada saldo yang berbeda. Periksa transaksi akun tersebut.'}</p>
          <div className="list">
            {outcome.balances.map((b) => (
              <div key={b.name} className="row text-sm">
                <span>{b.name}</span>
                <span className={b.actual === b.expected ? '' : 'text-danger'}>{b.actual == null ? 'tidak ditemukan' : formatRupiah(b.actual)} (app lama {formatRupiah(b.expected)})</span>
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
      <div className="card">
        <label className="block">
          <span className="label">File cadangan (hub-pribadi-YYYY-MM-DD.json)</span>
          <input type="file" accept="application/json,.json" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="mt-2 text-xs text-muted">File hanya dibaca untuk impor dan tidak disimpan di server.</p>
      </div>
      {pending && <p className="text-sm text-muted">Memproses...</p>}
      {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {preview && text && (
        <>
          <div className="card">
            <h2 className="h2">Isi {fileName}</h2>
            {preview.exported && <p className="mb-2 text-xs text-muted">Diekspor {new Date(preview.exported).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</p>}
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.counts).map(([t, c]) => (
                <span key={t} className="chip">{label(t)}: {c.total}{c.new !== c.total ? ` (${c.new} baru)` : ''}</span>
              ))}
            </div>
          </div>
          {preview.blockers.length > 0 && (
            <div className="card border-danger"><h2 className="h2 text-danger">Impor tidak bisa dilanjutkan</h2>{preview.blockers.map((b) => <p key={b} className="text-sm">{b}</p>)}</div>
          )}
          {preview.warnings.length > 0 && (
            <div className="card border-warn">
              <h2 className="h2">Perlu dicek ({preview.warnings.length})</h2>
              <ul className="grid gap-3">
                {preview.warnings.map((w) => (
                  <li key={w.key} className="rounded-lg bg-warn/10 p-3 text-sm">
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
          <div className="card">
            <p className="mb-3 text-sm">{preview.newRows} data baru akan disimpan dalam satu langkah. Jika gagal, tidak ada yang tersimpan.</p>
            <button className="btn btn-primary" disabled={pending || preview.blockers.length > 0 || preview.newRows === 0} onClick={doImport}>
              {preview.newRows === 0 ? 'Semua data sudah pernah diimpor' : 'Impor sekarang'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
