import { Bell, Brain, DatabaseBackup, FlaskConical, History, Languages, Palette, Settings, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { MenuRow } from '@/components/ui/MenuRow';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import {
  countActiveAutomations, countDueVocab, countVocab, db, getAgentMemory, getLastImport, getResearchProjects, getResearchTargets,
  getSemesters, getSettings,
} from '@/lib/data';
import { formatDayMonth } from '@/lib/format';
import { readText, readTheme } from '@/lib/settings';
import { zonedParts } from '@/lib/time';

export const metadata: Metadata = { title: 'Saya' };
const THEME = { auto: 'Tema otomatis', light: 'Tema terang', dark: 'Tema gelap' } as const;

export default async function SayaPage() {
  const user = await requireUser();
  const s = await db();
  const [settings, semesters, projects, targets, vocab, due, automations, memory, lastImport] = await Promise.all([
    getSettings(s, ['profile_name', 'profile_program', 'theme', 'briefing_time', 'quiet_hours']), getSemesters(s), getResearchProjects(s),
    getResearchTargets(s), countVocab(s), countDueVocab(s), countActiveAutomations(s), getAgentMemory(s), getLastImport(s),
  ]);
  const name = readText(settings.profile_name);
  const program = readText(settings.profile_program);
  const sem = semesters.find((x) => x.is_active);
  const quiet = Array.isArray(settings.quiet_hours) ? String(settings.quiet_hours[0]).replace(':', '.') : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Saya" />
      <Link href="/pengaturan/profil" className="card flex min-h-[72px] items-center gap-3.5 p-4 hover:ring-1 hover:ring-accent">
        <Avatar name={name || user.email} size={48} />
        <span className="min-w-0">
          <span className="block font-display text-[18px] font-bold">{name || 'Isi nama kamu'}</span>
          <span className="block truncate text-[13px] text-muted">{[program, sem?.name].filter(Boolean).join(' · ') || user.email}</span>
        </span>
      </Link>

      <Section title="Ruang kerja">
        <div className="card rows overflow-hidden">
          <MenuRow href="/riset" icon={FlaskConical} title="Riset"
            detail={projects.length ? `${projects.length} proyek · ${targets.length} target` : 'Target, literatur, bimbingan'} />
          <MenuRow href="/bahasa" icon={Languages} title="Bahasa Inggris"
            detail={vocab ? `${due} kata siap diulang · ${vocab} kata` : 'Belum ada kosakata'} />
          <MenuRow href="/otomasi" icon={Zap} title="Otomasi" detail={automations ? `${automations} aturan aktif` : 'Belum ada aturan aktif'} />
        </div>
      </Section>

      <Section title="Ra dan aplikasi">
        <div className="card rows overflow-hidden">
          <MenuRow href="/pengaturan/memori" icon={Brain} title="Memori Ra" detail={memory.length ? `${memory.length} catatan · alias, aturan merchant, kebiasaan` : 'Alias akun, aturan merchant, kebiasaan'} />
          <MenuRow href="/pengaturan/log-agen" icon={History} title="Log Agen" detail="Semua aksi Ra, bisa dibatalkan" />
          <MenuRow href="/pengaturan/tampilan" icon={Palette} title="Tampilan" detail={`${THEME[readTheme(settings.theme)]} · privasi saldo`} />
          <MenuRow href="/pengaturan/notifikasi" icon={Bell} title="Notifikasi"
            detail={`Briefing ${readText(settings.briefing_time).replace(':', '.') || '06.30'}${quiet ? ` · jam tenang ${quiet}` : ''}`} />
          <MenuRow href="/pengaturan/impor" icon={DatabaseBackup} title="Cadangan & impor"
            detail={lastImport ? `Impor terakhir ${formatDayMonth(zonedParts(lastImport.created_at).date)}` : 'Belum pernah impor'} />
          <MenuRow href="/pengaturan" icon={Settings} title="Pengaturan lain" detail="Kategori dan budget, pemeriksaan saldo, keluar" />
        </div>
      </Section>
    </div>
  );
}
