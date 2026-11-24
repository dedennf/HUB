'use client';
import { useActionState } from 'react';
import { saveSchedule, type SaveState } from '../actions';

export function ScheduleForm({ v }: { v: { briefing: string; recap: string; vocab: string; quietStart: string; quietEnd: string } }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveSchedule, { ok: false });
  const field = (name: string, label: string, value: string) => (
    <label><span className="label">{label}</span><input type="time" name={name} defaultValue={value} required className="input" /></label>
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {field('briefing_time', 'Briefing pagi', v.briefing)}
        {field('recap_time', 'Rekap malam', v.recap)}
        {field('vocab_review_time', 'Review kosakata', v.vocab)}
      </div>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="label mb-1">Jam tenang (notifikasi ditunda, kecuali tenggat yang jatuh di jam itu)</legend>
        {field('quiet_start', 'Mulai', v.quietStart)}
        {field('quiet_end', 'Selesai', v.quietEnd)}
      </fieldset>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan jadwal'}</button>
        {state.message && <span role="status" className={`text-[13px] ${state.ok ? 'text-positive' : 'text-negative'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
