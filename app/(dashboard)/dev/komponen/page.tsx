import { CalendarCheck, TrendingDown } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ActionBar } from '@/components/ra/ActionBar';
import { ActionCard } from '@/components/ra/ActionCard';
import { ChatBubble } from '@/components/ra/ChatBubble';
import { OfflineBanner } from '@/components/ra/OfflineBanner';
import { ReceiptScanning } from '@/components/ra/ReceiptScanning';
import { RecordingView } from '@/components/ra/RecordingView';
import { PageHeader, Section } from '@/components/ui/Section';
import { UndoDemo } from './UndoDemo';

/**
 * Galeri komponen Ra yang belum punya data asli (tersambung di fase agen).
 * Hanya ada saat pengembangan: di production halaman ini 404, jadi data contoh tidak pernah tampil di app sungguhan (DESIGN 8).
 */
export default function KomponenPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="Galeri komponen Ra" kicker="Khusus pengembangan · data contoh" />
      <Section title="ChatBubble + ActionCard + ActionBar">
        <div className="flex flex-col gap-3">
          <ChatBubble from="user" voiceSeconds={7}>contoh: tadi beli bensin 30rb pakai gopay, terus tugas laporan dikumpul jumat jam 12 malem</ChatBubble>
          <ChatBubble from="ra">Oke, ada 2 hal. Cek dulu sebelum disimpan.</ChatBubble>
          <ActionCard icon={TrendingDown} tone="expense" kindLabel="Pengeluaran" value="Rp30.000" chips={[{ label: 'Transportasi' }, { label: 'GoPay' }, { label: 'Hari ini' }]} />
          <ActionCard icon={CalendarCheck} tone="task" kindLabel="Tugas baru" value="Laporan contoh"
            chips={[{ label: 'Mata kuliah contoh' }, { label: 'Jum 27 Nov · 23.59', doubtful: true, onEditLabel: 'tenggat' }]}
            note={'"Jam 12 malem" dibaca 23.59. Ketuk untuk ubah.'} />
          <ActionBar count={2} />
        </div>
      </Section>
      <Section title="OfflineBanner"><OfflineBanner /></Section>
      <Section title="RecordingView"><div className="card"><RecordingView seconds={7} levels={[0.3, 0.6, 0.9, 0.5, 0.7, 0.4, 0.8, 0.6, 0.3, 0.5, 0.9, 0.4]} /></div></Section>
      <Section title="ReceiptScanning"><ReceiptScanning /></Section>
      <Section title="UndoToast"><UndoDemo /></Section>
    </div>
  );
}
