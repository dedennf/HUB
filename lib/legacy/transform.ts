// Mengubah cadangan app lama menjadi baris tabel baru (D-04 sampai D-15).
// Fungsi murni: tidak menyentuh database. Server action memberi konteks (peta id lama, kategori bawaan)
// lalu mengirim `payload` ke RPC import_legacy_backup.
import { KNOWN_COLLECTIONS, type ImportOverrides, type LegacyBackup } from './schema';
import { addDays, addMinutesToIso, isHhmm, isIsoDate, zonedToIso } from '../time';

export type Row = Record<string, unknown>;

export type ImportWarning =
  | { type: 'rounded'; table: string; legacyId: string; field: string; from: number; to: number }
  | { type: 'suspicious_tx_date'; legacyId: string; date: string; amount: number; note: string }
  | { type: 'semester_without_dates'; semester: number }
  | { type: 'bill_without_account'; legacyId: string; name: string }
  | { type: 'missing_reference'; table: string; legacyId: string; field: string; detail: string }
  | { type: 'invalid_value'; table: string; legacyId: string; field: string; value: string }
  | { type: 'skipped'; table: string; legacyId: string; reason: string };

export type TransformContext = {
  /** kunci `${source_table}:${legacy_id}` → uuid yang sudah ada dari impor sebelumnya */
  existingMap: Map<string, string>;
  /** slug kategori bawaan (mis. 'o_makan') → uuid kategori milik pengguna */
  categoryBySlug: Map<string, string>;
  newId?: () => string;
};

export type TransformResult = {
  payload: {
    tables: Record<string, Row[]>;
    category_updates: Row[];
    map: { source_table: string; legacy_id: string; new_id: string }[];
  };
  warnings: ImportWarning[];
  blockers: string[];
  counts: Record<string, { total: number; new: number }>;
  /** saldo akhir tiap akun menurut perhitungan app lama, untuk dicocokkan setelah impor */
  expectedBalances: { legacyId: string; name: string; balance: number }[];
  semesters: { number: number; start: string; end: string; isActive: boolean }[];
  accounts: { legacyId: string; name: string }[];
};

const ACCOUNT_TYPE: Record<string, string> = { bank: 'bank', ewallet: 'ewallet', tunai: 'cash', investasi: 'investment' };
const TX_KIND: Record<string, string> = { out: 'expense', in: 'income', tf: 'transfer' };
const TASK_KIND: Record<string, string> = { tugas: 'assignment', ujian: 'exam', kuis: 'quiz', praktikum: 'practicum' };
const PRIORITY: Record<string, string> = { rendah: 'low', sedang: 'medium', tinggi: 'high' };
const NEED_STATUS: Record<string, string> = { belum: 'open', diurus: 'in_progress', terpenuhi: 'fulfilled' };
const IDEA_STATUS: Record<string, string> = { mentah: 'raw', layak: 'viable', dibuang: 'discarded' };
const LIT_STATUS: Record<string, string> = { belum: 'unchecked', doi: 'doi_checked', halaman: 'page_checked', teks: 'fulltext_read' };
const LIT_INCLUSION: Record<string, string> = { pakai: 'use', ragu: 'maybe', tidak: 'exclude' };
const RECURRENCE: Record<string, string> = { tidak: 'none', harian: 'daily', mingguan: 'weekly', bulanan: 'monthly', tahunan: 'yearly' };
const BILL_FREQ: Record<string, string> = { bulanan: 'monthly', tahunan: 'yearly', sekali: 'once' };
const DEBT_DIR: Record<string, string> = { utang: 'payable', piutang: 'receivable' };

/** Rentang aman tanggal transaksi: 60 hari sebelum app dibuat sampai 1 hari setelah ekspor. */
const SUSPICIOUS_BEFORE_CREATED_DAYS = 60;

export function transformLegacyBackup(
  backup: LegacyBackup,
  ctx: TransformContext,
  overrides: ImportOverrides = { transactionDates: {}, semesterDates: {}, billAccounts: {} },
): TransformResult {
  const d = backup.data;
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const tables: Record<string, Row[]> = {};
  const map: TransformResult['payload']['map'] = [];
  const categoryUpdates: Row[] = [];
  const warnings: ImportWarning[] = [];
  const blockers: string[] = [];
  const counts: TransformResult['counts'] = {};

  // --- koleksi tak dikenal (D-16) ---
  for (const [key, value] of Object.entries(d)) {
    if (key === 'settings' || key === 'tomb') continue;
    if ((KNOWN_COLLECTIONS as readonly string[]).includes(key)) continue;
    if (Array.isArray(value) && value.length > 0) {
      blockers.push(`Koleksi "${key}" berisi ${value.length} data tetapi belum dikenali app baru. Impor dihentikan supaya data ini tidak hilang.`);
    }
  }

  // --- penugasan id: id lama yang sudah pernah diimpor memakai uuid lama dan barisnya dilewati ---
  const ids = new Map<string, string>();
  const isNew = new Set<string>();
  const idFor = (table: string, legacyId: string): string => {
    const key = `${table}:${legacyId}`;
    let id = ids.get(key);
    if (!id) {
      id = ctx.existingMap.get(key);
      if (!id) {
        id = newId();
        isNew.add(key);
      }
      ids.set(key, id);
    }
    return id;
  };
  const known = (table: string, legacyId: string) => !!legacyId && ids.has(`${table}:${legacyId}`);
  const ref = (table: string, legacyId: string) => (legacyId && ids.has(`${table}:${legacyId}`) ? ids.get(`${table}:${legacyId}`)! : null);

  const push = (target: string, source: string, legacyId: string, row: Row) => {
    const key = `${source}:${legacyId}`;
    counts[target] ??= { total: 0, new: 0 };
    counts[target].total++;
    if (!isNew.has(key)) return;
    counts[target].new++;
    (tables[target] ??= []).push(row);
    map.push({ source_table: source, legacy_id: legacyId, new_id: row.id as string });
  };

  const money = (table: string, legacyId: string, field: string, v: number): number => {
    const r = Math.round(v);
    if (r !== v) warnings.push({ type: 'rounded', table, legacyId, field, from: v, to: r });
    return r;
  };
  const date = (table: string, legacyId: string, field: string, v: string): string | null => {
    if (!v) return null;
    if (isIsoDate(v)) return v;
    warnings.push({ type: 'invalid_value', table, legacyId, field, value: v });
    return null;
  };
  const time = (v: string): string | null => (isHhmm(v) ? v : null);

  // ===== Keuangan =====
  d.accounts.forEach((a) => idFor('accounts', a.id));
  d.accounts.forEach((a, i) => {
    const type = ACCOUNT_TYPE[a.type];
    if (!type) warnings.push({ type: 'invalid_value', table: 'accounts', legacyId: a.id, field: 'type', value: a.type });
    push('accounts', 'accounts', a.id, {
      id: idFor('accounts', a.id),
      name: a.name || 'Akun tanpa nama',
      type: type ?? 'bank',
      opening_balance: money('accounts', a.id, 'open', a.open),
      aliases: a.alias.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      is_archived: a.archived,
      sort_order: i,
    });
  });

  // akun pengganti untuk transaksi yang akunnya sudah terhapus di app lama
  let placeholderAccount: string | null = null;
  const accountOrPlaceholder = (legacyAcc: string, txId: string, field: string): string => {
    const id = ref('accounts', legacyAcc);
    if (id) return id;
    warnings.push({ type: 'missing_reference', table: 'transactions', legacyId: txId, field, detail: 'akun tidak ditemukan, dipindah ke "Akun lama (terhapus)"' });
    if (!placeholderAccount) {
      placeholderAccount = idFor('accounts', '__deleted__');
      push('accounts', 'accounts', '__deleted__', {
        id: placeholderAccount, name: 'Akun lama (terhapus)', type: 'cash', opening_balance: 0,
        aliases: [], is_archived: true, sort_order: 999,
      });
    }
    return placeholderAccount;
  };

  const budgetByCat = new Map<string, number>();
  d.budgets.forEach((b) => budgetByCat.set(b.cat, money('budgets', b.id, 'limit', b.limit)));

  d.categories.forEach((c) => {
    const existing = ctx.categoryBySlug.get(c.id);
    const kind = c.kind === 'in' ? 'income' : 'expense';
    const fields = {
      name: c.name, icon: c.icon || null, color: c.color || null, keywords: c.keywords, subcategories: c.subs,
      sort_order: c.order, is_hidden: c.hidden, monthly_budget: budgetByCat.get(c.id) ?? null,
    };
    if (existing) {
      const key = `categories:${c.id}`;
      ids.set(key, existing);
      counts.categories ??= { total: 0, new: 0 };
      counts.categories.total++;
      if (!ctx.existingMap.has(key)) {
        categoryUpdates.push({ id: existing, ...fields });
        map.push({ source_table: 'categories', legacy_id: c.id, new_id: existing });
      }
      return;
    }
    push('categories', 'categories', c.id, { id: idFor('categories', c.id), slug: null, kind, is_default: false, ...fields });
  });

  const created = isIsoDate(d.settings.created) ? d.settings.created : null;
  const exported = backup.exported && !Number.isNaN(Date.parse(backup.exported)) ? new Date(backup.exported) : null;
  const exportedDate = exported ? exported.toISOString().slice(0, 10) : null;

  const groups = new Map<string, string>();
  for (const t of d.transactions) {
    const kind = TX_KIND[t.type];
    if (!kind) { warnings.push({ type: 'skipped', table: 'transactions', legacyId: t.id, reason: `jenis "${t.type}" tidak dikenal` }); continue; }
    const amount = money('transactions', t.id, 'amount', t.amount);
    if (amount <= 0) { warnings.push({ type: 'skipped', table: 'transactions', legacyId: t.id, reason: 'nominal nol atau negatif' }); continue; }

    let txDate = overrides.transactionDates[t.id] || t.date;
    if (!isIsoDate(txDate)) {
      warnings.push({ type: 'invalid_value', table: 'transactions', legacyId: t.id, field: 'date', value: t.date });
      txDate = created ?? exportedDate ?? '2000-01-01';
    }
    const tooOld = created && txDate < addDays(created, -SUSPICIOUS_BEFORE_CREATED_DAYS);
    const tooNew = exportedDate && txDate > addDays(exportedDate, 1);
    if ((tooOld || tooNew) && !overrides.transactionDates[t.id]) {
      warnings.push({ type: 'suspicious_tx_date', legacyId: t.id, date: t.date, amount, note: t.note });
    }

    const id = idFor('transactions', t.id);
    const accountId = accountOrPlaceholder(t.acc, t.id, 'acc');
    let toAccountId: string | null = null;
    let finalKind = kind;
    if (kind === 'transfer') {
      toAccountId = ref('accounts', t.to);
      if (!toAccountId || toAccountId === accountId) {
        warnings.push({ type: 'missing_reference', table: 'transactions', legacyId: t.id, field: 'to', detail: 'akun tujuan transfer tidak valid, dicatat sebagai pengeluaran' });
        finalKind = 'expense';
        toAccountId = null;
      }
    }
    let categoryId: string | null = null;
    if (finalKind !== 'transfer' && t.cat) {
      categoryId = ref('categories', t.cat);
      if (!categoryId) warnings.push({ type: 'missing_reference', table: 'transactions', legacyId: t.id, field: 'cat', detail: 'kategori tidak ditemukan, dikosongkan' });
    }
    let groupId: string | null = null;
    if (t.group) {
      groupId = groups.get(t.group) ?? ctx.existingMap.get(`tx_groups:${t.group}`) ?? null;
      if (!groupId) {
        groupId = newId();
        map.push({ source_table: 'tx_groups', legacy_id: t.group, new_id: groupId });
      }
      groups.set(t.group, groupId);
    }
    push('transactions', 'transactions', t.id, {
      id, kind: finalKind, amount, account_id: accountId, to_account_id: toAccountId, category_id: categoryId,
      subcategory: t.sub || null, merchant: null, note: t.note || null,
      occurred_at: zonedToIso(txDate, '12:00'), source: 'import', group_id: groupId,
    });
  }

  for (const v of d.investments) {
    push('investments', 'investments', v.id, {
      id: idFor('investments', v.id), account_id: null, instrument: v.kind || 'lainnya', name: v.name || 'Investasi',
      platform: v.platform || null, units: null,
      invested_amount: money('investments', v.id, 'cost', v.cost), current_value: money('investments', v.id, 'value', v.value),
      valued_at: null, note: v.note || null,
    });
  }

  for (const b of d.bills) {
    const frequency = BILL_FREQ[b.freq] ?? 'monthly';
    const next = date('bills', b.id, 'nextDue', b.nextDue);
    const legacyAcc = overrides.billAccounts[b.id] || b.acc;
    const accountId = legacyAcc ? ref('accounts', legacyAcc) : null;
    if (!accountId && b.active) warnings.push({ type: 'bill_without_account', legacyId: b.id, name: b.name });
    push('bills', 'bills', b.id, {
      id: idFor('bills', b.id), name: b.name || 'Tagihan', amount: money('bills', b.id, 'amount', b.amount), frequency,
      due_day: frequency === 'monthly' && next ? Number(next.slice(8)) : null,
      due_date: frequency !== 'monthly' ? next : null,
      next_due_date: next, default_account_id: accountId, category_id: b.cat ? ref('categories', b.cat) : null,
      is_recurring: frequency !== 'once', is_active: b.active, note: b.note || null,
    });
  }

  for (const g of d.goals) {
    push('savings_goals', 'goals', g.id, {
      id: idFor('goals', g.id), name: g.name || 'Target', target_amount: money('goals', g.id, 'target', g.target),
      saved_amount: money('goals', g.id, 'saved', g.saved), deadline: date('goals', g.id, 'deadline', g.deadline), note: g.note || null,
    });
  }

  for (const x of d.debts) {
    push('debts', 'debts', x.id, {
      id: idFor('debts', x.id), direction: DEBT_DIR[x.dir] ?? 'payable', person: x.person || 'Tanpa nama',
      amount: money('debts', x.id, 'amount', x.amount), paid_amount: money('debts', x.id, 'paid', x.paid),
      occurred_on: date('debts', x.id, 'date', x.date), due_on: date('debts', x.id, 'due', x.due), note: x.note || null,
    });
  }

  for (const x of d.trueExp) {
    push('sinking_funds', 'trueExp', x.id, {
      id: idFor('trueExp', x.id), name: x.name || 'Biaya sejati', amount: money('trueExp', x.id, 'amount', x.amount),
      due_on: date('trueExp', x.id, 'due', x.due), saved_amount: money('trueExp', x.id, 'saved', x.saved),
      is_done: x.done, note: x.note || null,
    });
  }

  // ===== Kuliah =====
  const activeSem = d.settings.sem;
  const semNumbers = new Set<number>();
  if (activeSem) semNumbers.add(activeSem);
  d.courses.forEach((c) => { if (c.sem) semNumbers.add(c.sem); });
  const semesters: TransformResult['semesters'] = [];
  for (const n of [...semNumbers].sort((a, b) => a - b)) {
    const isActive = n === activeSem;
    const o = overrides.semesterDates[String(n)];
    let start = o?.start || (isActive ? d.settings.semStart : '');
    let end = o?.end || (isActive ? d.settings.semEnd : '');
    if (start && !isIsoDate(start)) start = '';
    if (end && !isIsoDate(end)) end = '';
    if (start && end && end < start) end = '';
    if (isActive && (!start || !end)) warnings.push({ type: 'semester_without_dates', semester: n });
    semesters.push({ number: n, start, end, isActive });
    push('semesters', 'semesters', String(n), {
      id: idFor('semesters', String(n)), name: `Semester ${n}`, number: n,
      start_date: start || null, end_date: end || null, is_active: isActive,
    });
  }

  d.courses.forEach((c) => idFor('courses', c.id));
  for (const c of d.courses) {
    push('courses', 'courses', c.id, {
      id: idFor('courses', c.id), semester_id: c.sem ? ref('semesters', String(c.sem)) : null, code: null,
      name: c.name || 'Mata kuliah', alias: c.alias || null, lecturer: c.lecturer || null,
      credits: c.sks == null ? null : Math.round(c.sks), room: null, note: c.note || null,
    });
  }

  for (const s of d.schedule) {
    const courseId = ref('courses', s.course);
    const start = time(s.start);
    const end = time(s.end);
    if (!courseId) { warnings.push({ type: 'skipped', table: 'schedule', legacyId: s.id, reason: 'mata kuliah tidak ditemukan' }); continue; }
    if (!start || !end || end <= start) { warnings.push({ type: 'skipped', table: 'schedule', legacyId: s.id, reason: 'jam mulai atau selesai tidak valid' }); continue; }
    if (!(s.day >= 0 && s.day <= 6)) { warnings.push({ type: 'skipped', table: 'schedule', legacyId: s.id, reason: 'hari tidak valid' }); continue; }
    push('course_schedules', 'schedule', s.id, {
      id: idFor('schedule', s.id), course_id: courseId, weekday: s.day + 1, start_time: start, end_time: end, location: s.room || null,
    });
  }

  for (const m of d.materials) {
    push('materials', 'materials', m.id, {
      id: idFor('materials', m.id), course_id: ref('courses', m.course), title: m.title || 'Materi', url: m.url || null,
      storage_path: null, notes: m.note || null, meeting: m.meeting == null ? null : Math.round(m.meeting),
      kind: m.type || null, tags: m.tags,
    });
  }

  d.tasks.forEach((t) => idFor('tasks', t.id));
  for (const t of d.tasks) {
    const due = date('tasks', t.id, 'due', t.due);
    const doneAt = isIsoDate(t.doneAt) ? t.doneAt : null;
    const parentId = t.parent && known('tasks', t.parent) ? ref('tasks', t.parent) : null;
    if (t.parent && !parentId) warnings.push({ type: 'missing_reference', table: 'tasks', legacyId: t.id, field: 'parent', detail: 'tugas induk tidak ditemukan, dijadikan tugas biasa' });
    const taskId = idFor('tasks', t.id);
    push('tasks', 'tasks', t.id, {
      id: taskId, course_id: ref('courses', t.course), parent_id: parentId, title: t.title || 'Tugas',
      description: t.note || null, kind: TASK_KIND[t.kind] ?? 'assignment', priority: PRIORITY[t.prio] ?? 'medium',
      url: t.link || null, due_at: due ? zonedToIso(due, '23:59') : null,
      status: t.done ? 'done' : 'todo', estimated_minutes: null,
      completed_at: t.done ? zonedToIso(doneAt ?? due ?? created ?? '2000-01-01', '12:00') : null,
    });
    const work = date('tasks', t.id, 'work', t.work);
    if (work) {
      const ws = time(t.workStart);
      const we = time(t.workEnd);
      const startAt = zonedToIso(work, ws ?? '19:00');
      let endAt = we ? zonedToIso(work, we) : ws ? addMinutesToIso(startAt, 120) : zonedToIso(work, '21:00');
      if (endAt <= startAt) endAt = addMinutesToIso(startAt, 60);
      push('task_work_slots', 'task_work_slots', t.id, {
        id: idFor('task_work_slots', t.id), task_id: taskId, start_at: startAt, end_at: endAt, suggested_by_agent: false,
      });
    }
  }

  for (const h of d.holidays) {
    const start = date('holidays', h.id, 'start', h.start);
    if (!start) { warnings.push({ type: 'skipped', table: 'holidays', legacyId: h.id, reason: 'tanggal mulai kosong' }); continue; }
    let end = date('holidays', h.id, 'end', h.end);
    if (end && end < start) end = null;
    push('holidays', 'holidays', h.id, { id: idFor('holidays', h.id), name: h.name || 'Libur', start_date: start, end_date: end });
  }

  // ===== Riset (D-10: satu proyek default) =====
  const hasResearch = d.needs.length + d.ideas.length + d.milestones.length + d.literature.length > 0;
  const projectId = hasResearch ? idFor('research_projects', 'default') : null;
  if (projectId) {
    push('research_projects', 'research_projects', 'default', {
      id: projectId, title: 'Riset utama', description: 'Dibuat otomatis saat impor data app lama.', status: 'active',
    });
  }
  for (const n of d.needs) {
    push('research_needs', 'needs', n.id, {
      id: idFor('needs', n.id), project_id: projectId, item: n.title || 'Kebutuhan', kind: n.kind || null,
      status: NEED_STATUS[n.status] ?? 'open', note: n.note || null,
    });
  }
  d.ideas.forEach((x) => idFor('ideas', x.id));
  for (const x of d.ideas) {
    push('research_ideas', 'ideas', x.id, {
      id: idFor('ideas', x.id), project_id: projectId, content: x.title || 'Ide', source: x.origin || null,
      status: IDEA_STATUS[x.status] ?? 'raw', note: x.note || null,
    });
  }
  d.milestones.forEach((m) => idFor('milestones', m.id));
  for (const m of d.milestones) {
    push('research_targets', 'milestones', m.id, {
      id: idFor('milestones', m.id), project_id: projectId, title: m.title || 'Target',
      due_date: date('milestones', m.id, 'due', m.due), progress: Math.max(0, Math.min(100, Math.round(m.pct))),
      last_touched_at: m._u > 0 ? new Date(m._u).toISOString() : null, note: m.note || null,
    });
  }
  for (const l of d.literature) {
    push('readings', 'literature', l.id, {
      id: idFor('literature', l.id), project_id: projectId, title: l.title || 'Bacaan', authors: l.authors || null,
      year: l.year == null ? null : Math.round(l.year), venue: l.venue || null, doi: l.doi || null, url: null,
      collection: l.col || null, tags: l.tags, claim: l.claim || null,
      verification_status: LIT_STATUS[l.st] ?? 'unchecked', inclusion: LIT_INCLUSION[l.inc] ?? null,
      linked_target_ids: l.ms.map((x) => ref('milestones', x)).filter(Boolean),
      linked_idea_ids: l.ideas.map((x) => ref('ideas', x)).filter(Boolean),
      content_excerpt: null, notes: l.note || null,
    });
  }
  for (const b of d.bimbingan) {
    push('supervisions', 'bimbingan', b.id, {
      id: idFor('bimbingan', b.id), met_on: date('bimbingan', b.id, 'date', b.date), supervisor: b.with || null,
      points: b.points || null, status: b.status === 'done' ? 'done' : 'open', next_on: date('bimbingan', b.id, 'nextDate', b.nextDate),
    });
  }

  // ===== Kalender =====
  for (const e of d.events) {
    const day = date('events', e.id, 'date', e.date);
    if (!day) { warnings.push({ type: 'skipped', table: 'events', legacyId: e.id, reason: 'tanggal kosong' }); continue; }
    const st = time(e.time);
    const et = time(e.endTime);
    const endDay = date('events', e.id, 'endDate', e.endDate);
    const startAt = zonedToIso(day, st ?? '00:00');
    let endAt: string | null = endDay || et ? zonedToIso(endDay ?? day, et ?? '23:59') : null;
    if (endAt && endAt < startAt) endAt = null;
    push('events', 'events', e.id, {
      id: idFor('events', e.id), title: e.title || 'Acara', start_at: startAt, end_at: endAt, is_all_day: !st,
      location: e.place || null, recurrence: RECURRENCE[e.repeat] ?? 'none',
      recurrence_until: date('events', e.id, 'until', e.until), notes: e.note || null,
    });
  }

  // ===== Catatan kebiasaan untuk Gemini → memori agen =====
  if (d.settings.geminiNotes.trim()) {
    push('agent_memory', 'settings', 'geminiNotes', {
      id: idFor('settings', 'geminiNotes'), kind: 'preference', key: 'catatan_pengguna',
      value: { text: d.settings.geminiNotes.trim() }, confidence: 1, last_used_at: null,
    });
  }

  // ===== saldo yang diharapkan (cara hitung app lama, setelah pembulatan) =====
  const bal = new Map<string, number>();
  d.accounts.forEach((a) => bal.set(a.id, Math.round(a.open)));
  for (const t of d.transactions) {
    const n = Math.round(t.amount);
    if (!(n > 0) || !TX_KIND[t.type]) continue;
    if (t.type === 'in') { if (bal.has(t.acc)) bal.set(t.acc, bal.get(t.acc)! + n); }
    else if (t.type === 'out') { if (bal.has(t.acc)) bal.set(t.acc, bal.get(t.acc)! - n); }
    else {
      if (bal.has(t.acc)) bal.set(t.acc, bal.get(t.acc)! - n);
      if (bal.has(t.to) && t.to !== t.acc) bal.set(t.to, bal.get(t.to)! + n);
    }
  }

  return {
    payload: { tables, category_updates: categoryUpdates, map },
    warnings,
    blockers,
    counts,
    expectedBalances: d.accounts.map((a) => ({ legacyId: a.id, name: a.name, balance: bal.get(a.id) ?? 0 })),
    semesters,
    accounts: d.accounts.filter((a) => !a.archived).map((a) => ({ legacyId: a.id, name: a.name })),
  };
}
