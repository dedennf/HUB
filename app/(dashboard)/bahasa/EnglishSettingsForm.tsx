'use client';
import { useActionState } from 'react';
import { saveEnglishSettings } from './actions';

/** SPEC 10.1: tujuan, level, waktu harian, tingkat koreksi. D-60: target band dan tanggal tes IELTS. */
export function EnglishSettingsForm({ v }: { v: { level: string; goal: string; dailyMinutes: number; correction: string; targetBand: number; testDate: string | null } }) {
  const [state, action, pending] = useActionState(saveEnglishSettings, { ok: false });
  return (
    <form action={action} className="grid grid-cols-2 gap-3">
      <label><span className="label">Tujuan</span>
        <select name="english_goal" defaultValue={v.goal} className="input">
          <option value="academic_general">Akademik + umum</option><option value="toefl">TOEFL</option><option value="ielts">IELTS</option>
          <option value="conversation">Percakapan</option><option value="career">Karier</option>
        </select>
      </label>
      <label><span className="label">Level</span>
        <select name="english_level" defaultValue={v.level} className="input">
          <option value="beginner">Pemula</option><option value="intermediate">Menengah</option><option value="upper_intermediate">Menengah atas</option>
        </select>
      </label>
      <label><span className="label">Waktu harian (menit)</span><input name="english_daily_minutes" type="number" min={5} max={180} defaultValue={v.dailyMinutes} className="input" /></label>
      <label><span className="label">Tingkat koreksi</span>
        <select name="english_correction_level" defaultValue={v.correction} className="input">
          <option value="important_only">Hanya yang penting</option><option value="all">Semua</option><option value="off">Mati</option>
        </select>
      </label>
      <label><span className="label">Target band IELTS</span>
        <select name="english_target_band" defaultValue={String(v.targetBand)} className="input">
          {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((b) => <option key={b} value={b}>{b.toLocaleString('id-ID')}</option>)}
        </select>
      </label>
      <label><span className="label">Tanggal tes (opsional)</span><input name="english_test_date" type="date" defaultValue={v.testDate ?? ''} className="input" /></label>
      <div className="col-span-2 flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</button>
        {state.message && <span role="status" className={`text-[13px] ${state.ok ? 'text-positive' : 'text-negative'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
