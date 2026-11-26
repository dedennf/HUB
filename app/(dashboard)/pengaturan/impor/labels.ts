// Nama tabel dalam bahasa Indonesia untuk ringkasan impor dan pemulihan.
export const TABLE_LABEL: Record<string, string> = {
  accounts: 'Akun', categories: 'Kategori', transactions: 'Transaksi', investments: 'Investasi', bills: 'Tagihan',
  savings_goals: 'Target tabungan', debts: 'Utang & piutang', sinking_funds: 'Biaya sejati', semesters: 'Semester',
  courses: 'Mata kuliah', course_schedules: 'Jadwal kelas', materials: 'Materi', tasks: 'Tugas', task_work_slots: 'Rencana kerja',
  holidays: 'Libur', research_projects: 'Proyek riset', research_needs: 'Kebutuhan riset', research_ideas: 'Ide riset',
  research_targets: 'Target riset', readings: 'Literatur', supervisions: 'Bimbingan', events: 'Acara', agent_memory: 'Memori Ra',
  settings: 'Pengaturan', automations: 'Otomasi', vocab: 'Kosakata', vocab_reviews: 'Riwayat review kata',
  writing_submissions: 'Tulisan', mistake_patterns: 'Pola kesalahan', practice_sessions: 'Sesi latihan',
};
export const tableLabel = (t: string) => TABLE_LABEL[t] ?? t;
