'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addVocab, autofillVocab } from '@/app/(dashboard)/bahasa/actions';

type Fields = { term: string; meaning_id: string; definition_en: string; part_of_speech: string; example: string };
const EMPTY: Fields = { term: '', meaning_id: '', definition_en: '', part_of_speech: '', example: '' };

/**
 * Tambah kata ke bank kata. "Isi dengan Ra" meminta Gemini mengisi arti, definisi, dan contoh.
 * Hasilnya tampil di form dulu, baru tersimpan saat pengguna menekan Simpan.
 */
export function VocabForm({ initial, context, source, onSaved, compact = false }: {
  initial?: Partial<Fields>; context?: string; source?: { type: 'reading' | 'mistake' | 'manual'; ref?: string }; onSaved?: (term: string) => void; compact?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<Fields>({ ...EMPTY, ...initial });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filling, startFill] = useTransition();
  const [saving, startSave] = useTransition();
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const fill = () => startFill(async () => {
    setMsg(null);
    const r = await autofillVocab(f.term, context);
    if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
    setF({ term: r.data.term || f.term, meaning_id: r.data.meaning_id, definition_en: r.data.definition_en, part_of_speech: r.data.part_of_speech, example: r.data.example });
  });
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      const r = await addVocab({ ...f, source_type: source?.type ?? 'manual', source_ref: source?.ref });
      if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
      setMsg({ ok: true, text: `"${f.term}" tersimpan, muncul di review hari ini.` });
      onSaved?.(f.term);
      setF(EMPTY);
      router.refresh();
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1"><span className="label">Kata atau frasa</span><input value={f.term} onChange={set('term')} required maxLength={120} className="input" lang="en" autoComplete="off" /></label>
        <button type="button" className="btn" onClick={fill} disabled={!f.term.trim() || filling}>{filling ? 'Ra mengisi...' : 'Isi dengan Ra'}</button>
      </div>
      <label><span className="label">Arti (bahasa Indonesia)</span><input value={f.meaning_id} onChange={set('meaning_id')} maxLength={300} className="input" /></label>
      {!compact && <label><span className="label">Definisi (bahasa Inggris)</span><input value={f.definition_en} onChange={set('definition_en')} maxLength={500} className="input" lang="en" /></label>}
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-1"><span className="label">Jenis kata</span><input value={f.part_of_speech} onChange={set('part_of_speech')} maxLength={30} className="input" lang="en" /></label>
        <label className="col-span-2"><span className="label">Contoh kalimat</span><input value={f.example} onChange={set('example')} maxLength={500} className="input" lang="en" /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={saving || !f.term.trim()}>{saving ? 'Menyimpan...' : 'Simpan ke bank kata'}</button>
        {msg && <span role="status" className={`text-[13px] ${msg.ok ? 'text-positive' : 'text-negative'}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
