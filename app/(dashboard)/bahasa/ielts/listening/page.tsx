import type { Metadata } from 'next';
import { IeltsListener } from '@/components/english/ielts/IeltsListener';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { ttsModel } from '@/lib/english/tts';

export const metadata: Metadata = { title: 'IELTS Listening' };

export default async function IeltsListeningPage() {
  await requireUser();
  const { data } = await (await db()).from('listening_sets').select('id,title,section,best_score,attempts').not('audio_path', 'is', null).order('created_at', { ascending: false }).limit(6);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Listening" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <p className="-mt-2 text-[13px] text-muted">Latihan IELTS Listening versi pendek · sekitar 8 menit · ada transkrip dan terjemahan setelah dinilai</p>
      {!ttsModel() && <p className="rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">GEMINI_TTS_MODEL belum diisi di Vercel, jadi audio belum bisa dibuat. Isi dengan model TTS dari daftar diagnosa, mis. gemini-3.8-flash-tts, lalu Redeploy.</p>}
      <IeltsListener recent={data ?? []} />
    </div>
  );
}
