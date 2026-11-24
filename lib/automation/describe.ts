// Aturan otomasi dalam bahasa manusia (SPEC 8.4): untuk halaman Otomasi dan ringkasan kartu.
const EVENT: Record<string, string> = {
  'transaction.created': 'saat ada transaksi baru', 'task.created': 'saat ada tugas baru', 'task.completed': 'saat tugas selesai',
  'research.progress_updated': 'saat progres riset berubah', 'vocab.created': 'saat ada kosakata baru', 'bill.created': 'saat ada tagihan baru',
};
const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Jadwal cron dalam bahasa manusia untuk pola yang umum. */
export function describeCron(cron: string): string {
  const [m, h, dom, mon, dow] = cron.trim().split(/\s+/);
  if (cron.trim() === '*/5 * * * *') return 'Dicek tiap 5 menit';
  const time = /^\d+$/.test(h) && /^\d+$/.test(m) ? `jam ${h.padStart(2, '0')}.${m.padStart(2, '0')}` : '';
  if (dom === '*' && mon === '*' && dow === '*') return `Tiap hari ${time}`.trim();
  if (dom === '*' && mon === '*' && /^\d$/.test(dow)) return `Tiap ${DOW[Number(dow) % 7]} ${time}`.trim();
  if (/^\d+$/.test(dom) && mon === '*' && dow === '*') return `Tiap tanggal ${dom} ${time}`.trim();
  return `Jadwal ${cron}`;
}

export function describeTrigger(t: Record<string, unknown>): string {
  if (t.type === 'schedule') return describeCron(String(t.cron));
  if (t.type === 'event') return EVENT[String(t.event)] ? EVENT[String(t.event)][0].toUpperCase() + EVENT[String(t.event)].slice(1) : String(t.event);
  if (t.type === 'threshold') return `Saat saldo ${String(t.account)} ${String(t.op)} Rp${Number(t.value).toLocaleString('id-ID')}`;
  return '';
}

export function describeAction(a: Record<string, unknown>): string {
  if (a.type === 'system') return String(a.description ?? '');
  if (a.type === 'notify') return `Kirim notifikasi "${String(a.title)}"`;
  if (a.type === 'agent_task') return `Ra: ${String(a.instruction)}`;
  if (a.type === 'add_transaction') {
    const x = (a.args ?? {}) as Record<string, unknown>;
    return `Catat ${x.kind === 'income' ? 'pemasukan' : 'pengeluaran'} Rp${Number(x.amount ?? 0).toLocaleString('id-ID')}${x.account ? ` dari ${String(x.account)}` : ''}`;
  }
  return '';
}

