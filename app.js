'use strict';
/* Hub Pribadi: kuliah, riset, keuangan. Semua data tersimpan lokal di perangkat (IndexedDB). */

/* ---------- util ---------- */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 864e5);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const addMonthsISO = (s, n) => { const d = parseISO(s); const day = d.getDate(); const t = new Date(d.getFullYear(), d.getMonth() + n, 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(day, last)); return iso(t); };
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const weekdayIdx = s => (parseISO(s).getDay() + 6) % 7;
const startOfWeek = s => addDays(s, -weekdayIdx(s));
const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const DAYS3 = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => s ? new Intl.DateTimeFormat('id-ID', o).format(parseISO(s)) : '';
const fmtMonth = ym => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseISO(ym + '-01'));
const rp = n => { const v = Math.round(Number(n) || 0); return (v < 0 ? '-' : '') + 'Rp\u00a0' + Math.abs(v).toLocaleString('id-ID'); };
const short = n => { const v = Math.abs(Number(n) || 0); if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + 'jt'; if (v >= 1e3) return Math.round(v / 1e3) + 'rb'; return String(Math.round(v)); };
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
const rel = s => { if (!s) return ''; const d = diffDays(s, today()); if (d === 0) return 'hari ini'; if (d === 1) return 'besok'; if (d === -1) return 'kemarin'; return d > 0 ? `${d} hari lagi` : `${-d} hari lalu`; };

/* ---------- penyimpanan ---------- */
const COLLS = ['courses', 'tasks', 'materials', 'schedule', 'holidays', 'needs', 'ideas', 'milestones', 'literature', 'bimbingan',
  'accounts', 'categories', 'transactions', 'investments', 'budgets', 'goals', 'debts', 'bills', 'trueExp', 'aiLog'];
const DEF_SET = { sem: 1, semStart: '', semEnd: '', created: '', lastBackup: '', lastAcc: '', geminiKey: '', geminiModel: 'gemini-flash-latest', useGemini: false, geminiMode: 'direct', geminiNotes: '', shareSummary: false, syncOn: false, syncSecret: '', syncRev: 0 };
const S = { settings: { ...DEF_SET }, tomb: {} };
COLLS.forEach(k => S[k] = []);

const DB = {
  db: null,
  open() {
    return new Promise(res => {
      try {
        const r = indexedDB.open('hub-pribadi', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(true); };
        r.onerror = () => res(false);
      } catch (e) { res(false); }
    });
  },
  getAll() {
    if (!this.db) { try { return Promise.resolve(JSON.parse(localStorage.getItem('hub-pribadi') || '{}')); } catch (e) { return Promise.resolve({}); } }
    return new Promise(res => {
      const out = {};
      const st = this.db.transaction('kv').objectStore('kv');
      const cur = st.openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      cur.onerror = () => res(out);
    });
  },
  put(key, val) {
    if (!this.db) { try { localStorage.setItem('hub-pribadi', JSON.stringify(S)); } catch (e) { toast('Penyimpanan penuh atau diblokir browser'); } return; }
    try { this.db.transaction('kv', 'readwrite').objectStore('kv').put(JSON.parse(JSON.stringify(val)), key); }
    catch (e) { toast('Gagal menyimpan data'); }
  }
};
let stampHook = null;
const persist = k => DB.put(k, S[k]);
const commit = k => { if (stampHook) stampHook(k); persist(k); };
const commitAll = () => { commit('settings'); DB.put('tomb', S.tomb); COLLS.forEach(commit); };

/* ---------- kategori bawaan ---------- */
const DEF_OUT = [
  ['o_makan', 'Makan & minum', '🍜', '#d9822b', 'makan,minum,kopi,jajan,sarapan,lunch,dinner,snack,boba,warteg,galon,gofood,grabfood,nasi,ayam,bakso,mie'],
  ['o_transport', 'Transportasi', '🚌', '#2f7fb8', 'bensin,ojol,gojek,grab,angkot,parkir,tol,kereta,krl,bus,transport,maxim,travel,tiket kereta'],
  ['o_kos', 'Kos & tempat tinggal', '🏠', '#7a5ea8', 'kos,kontrakan,sewa kos,listrik,pln,wifi kos'],
  ['o_kuliah', 'Kuliah', '🎓', '#0f7b6c', 'ukt,spp,buku,fotokopi,print,cetak,praktikum,kuliah,materai,jilid'],
  ['o_riset', 'Riset & lapangan', '🛰️', '#2a9d8f', 'lapangan,survei,riset,drone,baterai,sewa alat,gnss,uav,patok,akomodasi lapangan'],
  ['o_org', 'Organisasi', '🤝', '#c2528b', 'organisasi,himpunan,iuran,proker,rapat,konsumsi rapat,kas organisasi'],
  ['o_pulsa', 'Pulsa & internet', '📶', '#4a6fa5', 'pulsa,kuota,internet,paket data,indihome'],
  ['o_langganan', 'Langganan', '🔁', '#8a6d3b', 'langganan,subscribe,netflix,spotify,youtube,claude,chatgpt,cloud,domain,hosting'],
  ['o_harian', 'Kebutuhan harian', '🧴', '#5f8f4e', 'sabun,sampo,laundry,deterjen,belanja,tisu,alfamart,indomaret,skincare,pasta gigi'],
  ['o_sehat', 'Kesehatan', '💊', '#c0504d', 'obat,dokter,klinik,vitamin,apotek,bpjs,rumah sakit'],
  ['o_hibur', 'Hiburan', '🎮', '#b8860b', 'nonton,game,bioskop,jalan,hangout,hiburan,konser'],
  ['o_hadiah', 'Hadiah & donasi', '🎁', '#d46a6a', 'hadiah,kado,donasi,sedekah,infaq,zakat,amal'],
  ['o_admin', 'Biaya admin & pajak', '🏷️', '#7d8590', 'biaya admin,pajak,denda'],
  ['o_lain', 'Lainnya', '📦', '#8c9199', '']
];
const DEF_IN = [
  ['i_saku', 'Uang saku atau kiriman', '💼', '#2f7fb8', 'uang saku,kiriman,transferan ortu,ortu,orang tua,saku'],
  ['i_gaji', 'Gaji, honor, atau upah magang', '💰', '#1f7a4d', 'gaji,honor,upah,magang'],
  ['i_beasiswa', 'Beasiswa', '🎓', '#0f7b6c', 'beasiswa,kip,bidikmisi'],
  ['i_proyek', 'Proyek atau freelance', '🛠️', '#7a5ea8', 'proyek,freelance,jasa,job'],
  ['i_invest', 'Hasil investasi', '📈', '#b8860b', 'dividen,bunga,profit,cuan,hasil investasi'],
  ['i_hadiah', 'Hadiah', '🎁', '#d46a6a', 'hadiah,kado,angpao,thr'],
  ['i_lain', 'Lainnya', '📦', '#8c9199', '']
];
function seedCategories() {
  S.categories = [
    ...DEF_OUT.map((c, i) => ({ id: c[0], kind: 'out', name: c[1], icon: c[2], color: c[3], keywords: c[4] ? c[4].split(',') : [], subs: [], hidden: false, builtin: true, order: i, _u: 0 })),
    ...DEF_IN.map((c, i) => ({ id: c[0], kind: 'in', name: c[1], icon: c[2], color: c[3], keywords: c[4] ? c[4].split(',') : [], subs: [], hidden: false, builtin: true, order: i, _u: 0 }))
  ];
  if (typeof rebuildSnap === 'function') rebuildSnap();
  persist('categories');
}
const ACCOUNT_PRESETS = [['Tunai', 'tunai'], ['BCA', 'bank'], ['BRI', 'bank'], ['BNI', 'bank'], ['Mandiri', 'bank'], ['BSI', 'bank'], ['SeaBank', 'bank'], ['Jago', 'bank'],
  ['Dana', 'ewallet'], ['OVO', 'ewallet'], ['GoPay', 'ewallet'], ['ShopeePay', 'ewallet'], ['LinkAja', 'ewallet']];
const ACC_TYPES = [{ v: 'bank', l: 'Rekening bank' }, { v: 'ewallet', l: 'Dompet digital' }, { v: 'tunai', l: 'Uang tunai' }, { v: 'investasi', l: 'Akun investasi' }];
const ACC_TYPE_L = Object.fromEntries(ACC_TYPES.map(t => [t.v, t.l]));
const EMOJIS = ['🍜', '☕', '🚌', '🏠', '🎓', '🛰️', '🤝', '📶', '🔁', '🧴', '💊', '🎮', '🎁', '🏷️', '📦', '💼', '💰', '📈', '🎯', '✈️', '📚', '🧾', '🛒', '⚡', '🛠️', '🐾', '👕', '📱'];

/* ---------- UI state ---------- */
const UI = {
  tab: 'beranda', sub: { kuliah: 'tugas', riset: 'progres', keu: 'ringkasan' },
  calMode: 'bulan', calDate: today(), calOff: {},
  keuMonth: today().slice(0, 7), txView: 'daftar', txDay: '', tx: { acc: '', cat: '', q: '' },
  semF: 'aktif', mat: { course: '', q: '' }, lit: { col: '', st: '', inc: '', q: '' },
  catKind: 'out', showDone: false, setSub: 'asisten', needF: '', ideaF: ''
};
const ADD_LABEL = {};
let AIOUT = null;

/* ---------- toast, dialog, formulir ---------- */
let toastT = null;
function toast(msg) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400);
}
const dlg = () => $('#dlg');
let FORM = null;

function fieldHTML(f, v) {
  if (f.show && !f.show(v)) return '';
  const val = v[f.k] ?? '';
  const id = 'f_' + f.k;
  const re = f.reload ? ' data-reload="1"' : '';
  const wrap = inner => `<label class="f${f.wide ? ' wide' : ''}" for="${id}"><span>${esc(f.label)}${f.req ? ' *' : ''}</span>${inner}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
  switch (f.type) {
    case 'select':
      return wrap(`<select id="${id}" name="${f.k}"${re}>${(f.opts || []).map(o => `<option value="${esc(o.v)}"${String(o.v) === String(val) ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`);
    case 'textarea':
      return wrap(`<textarea id="${id}" name="${f.k}" rows="3">${esc(val)}</textarea>`);
    case 'tags':
      return wrap(`<input id="${id}" name="${f.k}" type="text" value="${esc(Array.isArray(val) ? val.join(', ') : val)}" placeholder="${esc(f.ph || 'pisahkan dengan koma')}">`);
    case 'check':
      return `<label class="f chk"><input type="checkbox" name="${f.k}"${val ? ' checked' : ''}${re}><span>${esc(f.label)}</span></label>`;
    case 'multi': {
      const arr = Array.isArray(val) ? val : [];
      return `<fieldset class="f"><legend>${esc(f.label)}</legend><div class="multi">${(f.opts || []).map(o => `<label><input type="checkbox" name="${f.k}" value="${esc(o.v)}"${arr.includes(o.v) ? ' checked' : ''}> ${esc(o.l)}</label>`).join('') || '<small>Belum ada pilihan</small>'}</div></fieldset>`;
    }
    case 'emoji':
      return wrap(`<input id="${id}" name="${f.k}" type="text" maxlength="4" value="${esc(val)}"><span class="emojis">${EMOJIS.map(e => `<button type="button" data-act="emoji-pick" data-id="${f.k}" data-x="${e}" aria-label="Pilih ${e}">${e}</button>`).join('')}</span>`);
    case 'info':
      return `<div class="f info small mute">${f.html}</div>`;
    default: {
      const type = f.type === 'money' ? 'number' : (f.type || 'text');
      const extra = (f.type === 'money' || f.type === 'number') ? ` step="${f.step || 'any'}" inputmode="decimal"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}` : '';
      return wrap(`<input id="${id}" name="${f.k}" type="${type}" value="${esc(val)}"${extra}${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}${re}>`);
    }
  }
}
function collect() {
  const form = $('#frm'); const prev = FORM.vals; const out = { ...prev };
  FORM.fields.forEach(f => {
    if (f.type === 'info') return;
    const q = form.querySelectorAll(`[name="${f.k}"]`);
    if (!q.length) return;
    if (f.type === 'multi') out[f.k] = [...q].filter(x => x.checked).map(x => x.value);
    else if (f.type === 'check') out[f.k] = q[0].checked;
    else if (f.type === 'tags') out[f.k] = q[0].value.split(',').map(s => s.trim()).filter(Boolean);
    else if (f.type === 'money' || f.type === 'number') out[f.k] = q[0].value === '' ? '' : Number(q[0].value);
    else out[f.k] = q[0].value;
  });
  return out;
}
function renderForm(focusName) {
  const { cfg, vals } = FORM;
  FORM.fields = typeof cfg.fields === 'function' ? cfg.fields(vals) : cfg.fields;
  dlg().innerHTML = `<form id="frm" autocomplete="off" novalidate><h2>${esc(cfg.title)}</h2><div class="fgrid">${FORM.fields.map(f => fieldHTML(f, vals)).join('')}</div>
    <div class="actions">${cfg.onDelete ? '<button type="button" class="btn danger" data-act="form-del">Hapus</button>' : ''}<span class="grow"></span>
    <button type="button" class="btn" data-act="form-cancel">Batal</button><button type="submit" class="btn primary">${esc(cfg.saveLabel || 'Simpan')}</button></div></form>`;
  if (focusName) { const el = $(`#frm [name="${focusName}"]`); if (el) el.focus(); }
}
function openForm(cfg) {
  FORM = { cfg, vals: { ...(cfg.values || {}) }, fields: [] };
  renderForm();
  const d = dlg(); if (!d.open) d.showModal();
  const first = $('#frm input:not([type=checkbox]),#frm select,#frm textarea'); if (first && !first.matches('[type=date],[type=time]')) first.focus();
}
function closeForm() { const d = dlg(); if (d.open) d.close(); d.innerHTML = ''; FORM = null; if (typeof onFormClosed === 'function') onFormClosed(); }
function submitForm() {
  if (!FORM) return;
  const v = collect();
  for (const f of FORM.fields) {
    if (f.show && !f.show(v)) continue;
    if (f.req && f.type !== 'info' && (v[f.k] === '' || v[f.k] === undefined || (Array.isArray(v[f.k]) && !v[f.k].length))) { toast(`Isi dulu: ${f.label}`); const el = $(`#frm [name="${f.k}"]`); if (el) el.focus(); return; }
  }
  const r = FORM.cfg.onSave(v);
  if (r === false) return;
  closeForm();
}

/* entitas generik: tambah, ubah, hapus */
function editEntity(coll, id, spec, prefill) {
  const ex = id ? S[coll].find(x => x.id === id) : null;
  if (id && !ex) return;
  const vals = ex ? { ...ex } : { ...(spec.defaults || {}), ...(prefill || {}) };
  openForm({
    title: (ex ? 'Ubah ' : 'Tambah ') + spec.title, fields: spec.fields, values: vals,
    onSave(v) {
      if (spec.map) v = spec.map(v, ex) || v;
      if (spec.check) { const err = spec.check(v, ex); if (err) { toast(err); return false; } }
      const rec = ex || { id: uid(), ...v };
      if (ex) Object.assign(ex, v); else S[coll].push(rec);
      commit(coll); if (spec.after) spec.after(v, ex, rec);
      if (spec.then) spec.then();
      render(); toast((spec.msg && spec.msg()) || 'Tersimpan');
    },
    canDelete: ex && spec.canDelete ? () => spec.canDelete(ex) : null,
    onDelete: ex ? () => {
      S[coll] = S[coll].filter(x => x.id !== id); commit(coll);
      if (spec.onDelete) spec.onDelete(ex);
      render(); toast('Dihapus');
    } : null
  });
}

/* ---------- aksi (delegasi klik) ---------- */
const ACT = {};
ACT['form-cancel'] = () => closeForm();
ACT['form-del'] = () => {
  if (!FORM || !FORM.cfg.onDelete) return;
  const err = FORM.cfg.canDelete ? FORM.cfg.canDelete() : '';
  if (err) { toast(err); return; }
  if (!confirm('Hapus data ini? Tindakan ini tidak bisa dibatalkan.')) return;
  const fn = FORM.cfg.onDelete; closeForm(); fn();
};
ACT['emoji-pick'] = el => { const i = $(`#frm [name="${el.dataset.id}"]`); if (i) i.value = el.dataset.x; };
ACT.go = el => { UI.tab = el.dataset.id; AIOUT = null; renderAIOut(); render(); window.scrollTo(0, 0); };

/* ================= logika domain ================= */
const accById = id => S.accounts.find(a => a.id === id);
const catById = id => S.categories.find(c => c.id === id);
const courseById = id => S.courses.find(c => c.id === id);
const accName = id => accById(id)?.name || '(akun dihapus)';
const catName = id => catById(id)?.name || '(kategori dihapus)';
const visCats = kind => S.categories.filter(c => c.kind === kind && !c.hidden).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const catLain = kind => S.categories.find(c => c.id === (kind === 'in' ? 'i_lain' : 'o_lain')) || visCats(kind)[0];
const activeAccs = () => S.accounts.filter(a => !a.archived);

function balances() {
  const b = {}; S.accounts.forEach(a => b[a.id] = Number(a.open) || 0);
  S.transactions.forEach(t => {
    const n = Number(t.amount) || 0;
    if (t.type === 'in') { if (t.acc in b) b[t.acc] += n; }
    else if (t.type === 'out') { if (t.acc in b) b[t.acc] -= n; }
    else { if (t.acc in b) b[t.acc] -= n; if (t.to in b) b[t.to] += n; }
  });
  return b;
}
const txIn = ym => S.transactions.filter(t => t.date && t.date.startsWith(ym));
function monthTotals(ym) {
  const tx = txIn(ym);
  return { in: sum(tx.filter(t => t.type === 'in'), t => t.amount), out: sum(tx.filter(t => t.type === 'out'), t => t.amount) };
}
function spentByCat(ym) {
  const m = {}; txIn(ym).filter(t => t.type === 'out').forEach(t => { m[t.cat] = (m[t.cat] || 0) + (Number(t.amount) || 0); });
  return m;
}
function totalInvest() { return { cost: sum(S.investments, i => i.cost), value: sum(S.investments, i => i.value) }; }

/* anggaran: batas belanja harian per kategori */
function budgetInfo(b, ym = today().slice(0, 7)) {
  const spent = spentByCat(ym)[b.cat] || 0; const left = (Number(b.limit) || 0) - spent;
  const isNow = ym === today().slice(0, 7);
  const dLeft = isNow ? daysInMonth(ym) - Number(today().slice(8)) + 1 : 0;
  return { spent, left, perDay: isNow && dLeft > 0 ? left / dLeft : 0, p: pct(spent, b.limit) };
}
/* biaya sejati: pengeluaran besar dipecah jadi tabungan bulanan */
function trueInfo(t) {
  const ym = today().slice(0, 7); const due = (t.due || '').slice(0, 7);
  let months = due ? Math.max(1, (Number(due.slice(0, 4)) - Number(ym.slice(0, 4))) * 12 + Number(due.slice(5)) - Number(ym.slice(5))) : 1;
  const remain = Math.max(0, (Number(t.amount) || 0) - (Number(t.saved) || 0));
  return { months, remain, perMonth: Math.ceil(remain / months), p: pct(t.saved, t.amount) };
}
function nextBillDate(b) {
  if (b.freq === 'tahunan') return addMonthsISO(b.nextDue, 12);
  if (b.freq === 'sekali') return b.nextDue;
  return addMonthsISO(b.nextDue, 1);
}

/* tugas */
const isOverdue = t => !t.done && t.due && t.due < today();
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
function streakDays() {
  const T = today();
  if (S.tasks.some(isOverdue)) return 0;
  const late = S.tasks.filter(t => t.done && t.due && t.doneAt && t.doneAt > t.due).map(t => t.doneAt).sort();
  const base = late.pop() || S.settings.created || T;
  return Math.max(0, diffDays(T, base));
}
function semOf(c) { return c ? c.sem : null; }
function inSemFilter(courseId) {
  const f = UI.semF === 'aktif' ? S.settings.sem : UI.semF;
  if (f === 'all') return true;
  const c = courseById(courseId); if (!c) return true;
  return Number(c.sem) === Number(f);
}

/* kalender gabungan */
const TYPES = { kelas: ['Kuliah', '#2f7fb8'], tugas: ['Tenggat tugas', '#d9822b'], kerjakan: ['Dikerjakan', '#5a7bd8'], ujian: ['Ujian', '#c0504d'], riset: ['Riset', '#0f7b6c'], bimbingan: ['Bimbingan', '#7a5ea8'], tagihan: ['Tagihan', '#8a6d3b'], libur: ['Libur', '#7d8590'] };
function eventsOn(d, useFilter = true) {
  const ev = []; const st = S.settings;
  const hol = S.holidays.find(h => d >= h.start && d <= (h.end || h.start));
  if (hol) ev.push({ type: 'libur', title: hol.name, time: '', ref: ['holidays', hol.id] });
  const inSem = (!st.semStart || d >= st.semStart) && (!st.semEnd || d <= st.semEnd);
  if (!hol && inSem) {
    const wd = weekdayIdx(d);
    S.schedule.filter(c => Number(c.day) === wd).forEach(c => {
      const co = courseById(c.course); if (!co || Number(co.sem) !== Number(st.sem)) return;
      ev.push({ type: 'kelas', title: co.name, sub: c.room || '', time: c.start || '', end: c.end || '', ref: ['schedule', c.id] });
    });
  }
  S.tasks.filter(t => t.due === d).forEach(t => ev.push({ type: t.kind === 'ujian' ? 'ujian' : 'tugas', title: t.title, sub: courseById(t.course)?.name || '', time: '', done: t.done, ref: ['tasks', t.id] }));
  S.tasks.filter(t => !t.done && t.work === d).forEach(t => ev.push({ type: 'kerjakan', title: 'Kerjakan: ' + t.title, sub: [courseById(t.course)?.name || '', t.due ? 'tenggat ' + fmtDate(t.due) : ''].filter(Boolean).join(' · '), time: t.workStart || '', end: t.workEnd || '', ref: ['tasks', t.id] }));
  S.milestones.filter(m => m.due === d).forEach(m => ev.push({ type: 'riset', title: m.title, sub: `${m.pct || 0}%`, done: (m.pct || 0) >= 100, ref: ['milestones', m.id] }));
  S.bimbingan.forEach(b => {
    if (b.date === d) ev.push({ type: 'bimbingan', title: 'Bimbingan' + (b.with ? ': ' + b.with : ''), ref: ['bimbingan', b.id] });
    if (b.nextDate === d) ev.push({ type: 'bimbingan', title: 'Bimbingan berikutnya' + (b.with ? ': ' + b.with : ''), ref: ['bimbingan', b.id] });
  });
  S.bills.filter(b => b.active !== false && b.nextDue === d).forEach(b => ev.push({ type: 'tagihan', title: b.name, sub: rp(b.amount), ref: ['bills', b.id] }));
  S.trueExp.filter(b => !b.done && b.due === d).forEach(b => ev.push({ type: 'tagihan', title: b.name, sub: rp(b.amount), ref: ['trueExp', b.id] }));
  return ev.filter(e => !useFilter || !UI.calOff[e.type]).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

/* simpan transaksi (dipakai form dan asisten) */
function saveTx(tx, fee) {
  const t = { id: uid(), ...tx };
  if (t.type === 'tf') { delete t.cat; delete t.sub; }
  if (Number(fee) > 0 && t.type === 'tf') {
    t.group = uid();
    S.transactions.push(t);
    S.transactions.push({ id: uid(), type: 'out', date: t.date, amount: Number(fee), acc: t.acc, cat: 'o_admin', note: 'Biaya admin', group: t.group });
  } else S.transactions.push(t);
  commit('transactions');
  S.settings.lastAcc = t.type === 'tf' ? t.to : t.acc; commit('settings');
  return t;
}

/* ================= pengurai perintah lokal ================= */
const MONTHS = { jan: 0, januari: 0, feb: 1, februari: 1, mar: 2, maret: 2, apr: 3, april: 3, mei: 4, jun: 5, juni: 5, jul: 6, juli: 6, agu: 7, agt: 7, agustus: 7, sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, nov: 10, november: 10, des: 11, desember: 11 };
const WD = { senin: 0, selasa: 1, rabu: 2, kamis: 3, jumat: 4, "jum'at": 4, sabtu: 5, minggu: 6, ahad: 6 };

function parseDate(text, mode) {
  let t = text, date = null; const T = today();
  const cut = (re, fn) => { if (date !== null) return; const m = t.match(re); if (!m) return; const d = fn(m); if (d) { date = d; t = t.replace(m[0], ' '); } };
  cut(/\b(\d{4})-(\d{2})-(\d{2})\b/, m => `${m[1]}-${m[2]}-${m[3]}`);
  cut(/\b(\d+)\s*hari\s*(?:yang\s*)?lalu\b/i, m => addDays(T, -Number(m[1])));
  cut(/\bkemarin\s*lusa\b/i, () => addDays(T, -2));
  cut(/\bkemarin\b/i, () => addDays(T, -1));
  cut(/\b(?:hari\s*ini|tadi|barusan)\b/i, () => T);
  cut(/\bbesok\b/i, () => addDays(T, 1));
  cut(/\blusa\b/i, () => addDays(T, 2));
  cut(/\bminggu\s*depan\b/i, () => addDays(T, 7));
  cut(/\b(\d{1,2})\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sept|sep|okt|nov|des)\b/i, m => {
    const mo = MONTHS[m[2].toLowerCase()]; const y = new Date().getFullYear();
    let d = iso(new Date(y, mo, Number(m[1])));
    if (mode === 'future' && d < T) d = iso(new Date(y + 1, mo, Number(m[1])));
    if (mode === 'past' && d > T) d = iso(new Date(y - 1, mo, Number(m[1])));
    return d;
  });
  cut(/\b(?:tanggal|tgl)\s*(\d{1,2})\b/i, m => {
    const n = Number(m[1]); if (n < 1 || n > 31) return null;
    const now = new Date(); let d = iso(new Date(now.getFullYear(), now.getMonth(), n));
    if (mode === 'future' && d < T) d = iso(new Date(now.getFullYear(), now.getMonth() + 1, n));
    if (mode === 'past' && d > T) d = iso(new Date(now.getFullYear(), now.getMonth() - 1, n));
    return d;
  });
  cut(/\b(\d{1,2})[\/-](\d{1,2})\b/, m => {
    const dd = Number(m[1]), mm = Number(m[2]); if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    const y = new Date().getFullYear(); let d = iso(new Date(y, mm - 1, dd));
    if (mode === 'future' && d < T) d = iso(new Date(y + 1, mm - 1, dd));
    if (mode === 'past' && d > T) d = iso(new Date(y - 1, mm - 1, dd));
    return d;
  });
  cut(/\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(\s+depan)?\b/i, m => {
    const idx = WD[m[1].toLowerCase()];
    if (m[2]) return addDays(startOfWeek(T), 7 + idx);
    const cur = weekdayIdx(T);
    if (mode === 'past') { let diff = cur - idx; if (diff <= 0) diff += 7; return addDays(T, -diff); }
    let diff = idx - cur; if (diff <= 0) diff += 7; return addDays(T, diff);
  });
  return { date, rest: t };
}

function normNum(str, unit) {
  let s = String(str); unit = (unit || '').toLowerCase(); let mult = 1;
  if (['k', 'rb', 'ribu'].includes(unit)) mult = 1e3; else if (['jt', 'juta'].includes(unit)) mult = 1e6;
  if (mult > 1) {
    if (/^\d+[.,]\d{1,2}$/.test(s)) s = s.replace(',', '.'); else s = s.replace(/[.,]/g, '');
    return Number(s) * mult;
  }
  return Number(s.replace(/[.,]/g, ''));
}
const AMT_SRC = '(rp\\.?\\s*)?(\\d+(?:[.,]\\d+)*)\\s*(juta|jt|ribu|rb|k)?(?![a-z0-9])';
function findAmount(text) {
  const re = new RegExp(AMT_SRC, 'gi'); let m;
  while ((m = re.exec(text))) {
    const unit = m[3], hasRp = !!m[1]; const val = normNum(m[2], unit);
    if ((unit || hasRp || val >= 1000) && val > 0) return { amount: val, rest: text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length) };
  }
  return { amount: 0, rest: text };
}
const FEE_RE = /\b(?:biaya\s*admin|admin|biaya|fee)\s*(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(juta|jt|ribu|rb|k)?(?![a-z0-9])/i;
function findFee(text) {
  const m = text.match(FEE_RE); if (!m) return { fee: 0, rest: text };
  return { fee: normNum(m[1], m[2]), rest: text.replace(m[0], ' ') };
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function findAccounts(text) {
  const lower = text.toLowerCase(); const hits = [];
  S.accounts.filter(a => !a.archived).forEach(a => {
    const names = [a.name, ...String(a.alias || '').split(',')].map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const n of names) {
      const m = new RegExp('(^|[^a-z0-9])(' + reEsc(n) + ')(?=$|[^a-z0-9])').exec(lower);
      if (m) { hits.push({ acc: a, idx: m.index + m[1].length, len: n.length }); break; }
    }
  });
  return hits.sort((x, y) => x.idx - y.idx);
}
function buildTransfer(hits, lower) {
  let from = null, to = null;
  hits.forEach(h => {
    const before = lower.slice(0, h.idx).trimEnd();
    if (/(^|\s)dari$/.test(before) && !from) from = h.acc;
    else if (/(^|\s)(ke|kedalam)$/.test(before) && !to) to = h.acc;
  });
  const cash = S.accounts.find(a => a.type === 'tunai' && !a.archived);
  const other = ex => (hits.find(h => h.acc !== ex && h.acc !== from && h.acc !== to) || hits.find(h => h.acc !== ex))?.acc || null;
  if (/\btarik\b/.test(lower) && !/\bsetor\b/.test(lower)) {
    if (!to && cash) to = cash;
    if (!from) from = hits.map(h => h.acc).find(a => a !== to) || null;
  } else if (/\bsetor\b/.test(lower)) {
    if (!from && cash) from = cash;
    if (!to) to = hits.map(h => h.acc).find(a => a !== from) || null;
  } else if (/\b(top\s*up|topup|isi)\b/.test(lower)) {
    if (!to) to = hits.map(h => h.acc).find(a => a !== from) || null;
    if (!from) from = hits.map(h => h.acc).find(a => a !== to) || null;
  } else {
    const rest = hits.map(h => h.acc).filter(a => a !== from && a !== to);
    if (!from) from = rest.shift() || null;
    if (!to) to = rest.shift() || null;
  }
  if (!from && S.settings.lastAcc && S.settings.lastAcc !== to?.id) from = accById(S.settings.lastAcc) || null;
  return { from, to };
}
function matchCategory(text, kind, strict) {
  const toks = text.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);
  const low = ' ' + toks.join(' ') + ' ';
  let best = null, score = 0;
  visCats(kind).forEach(c => {
    if (c.id === 'o_admin') return;
    const kws = [...(c.keywords || []), ...c.name.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3)];
    kws.forEach(k => {
      k = String(k).trim().toLowerCase(); if (!k) return;
      if (low.includes(' ' + k + ' ')) { const sc = k.length + (k.includes(' ') ? 5 : 0); if (sc > score) { score = sc; best = c; } }
    });
  });
  if (best) return best;
  return strict ? null : catLain(kind);
}
function matchSub(text, cat) {
  if (!cat || !cat.subs || !cat.subs.length) return '';
  const low = ' ' + text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ') + ' ';
  return cat.subs.find(s => low.includes(' ' + String(s).toLowerCase() + ' ')) || '';
}
function cleanNote(t, hits) {
  let s = t;
  hits.slice().sort((a, b) => b.idx - a.idx).forEach(h => {
    const pre = s.slice(0, h.idx).replace(/\b(pakai|via|dengan|dari|ke|kedalam)\s*$/i, '');
    s = pre + ' ' + s.slice(h.idx + h.len);
  });
  s = s.replace(/\brp\.?(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function parseTxCommand(text) {
  const raw = text.trim();
  let t = raw;
  const f = findFee(t); t = f.rest;
  const d = parseDate(t, 'past'); t = d.rest;
  const a = findAmount(t); t = a.rest;
  if (!a.amount) return null;
  const lower = t.toLowerCase();
  const hits = findAccounts(t);
  let type = 'out';
  const isIn = /\b(gaji|honor|terima|diterima|dapat|pemasukan|uang saku|kiriman|dikirim|beasiswa|bonus|dividen|cashback|transfer\s+masuk|masuk)\b/.test(lower);
  const isTf = /\b(tarik|setor|pindah|pindahin|top\s*up|topup|isi\s*saldo|transfer\s+(dari|ke))\b/.test(lower);
  if (isTf && !/transfer\s+masuk/.test(lower)) type = 'tf'; else if (isIn) type = 'in';
  const date = d.date || today();
  if (type === 'tf') {
    const { from, to } = buildTransfer(hits, lower);
    let note = cleanNote(t, hits);
    const verb = lower.match(/\b(tarik\s*tunai|setor\s*tunai|top\s*up|topup|pindah\w*|isi\s*saldo)\b/);
    if (!note || /^(tarik|setor|top|pindah|isi)/i.test(note)) note = verb ? verb[0].replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase()) : '';
    return { kind: 'tx', fee: f.fee, tx: { type, date, amount: a.amount, acc: from?.id || '', to: to?.id || '', note } };
  }
  const kindCat = type === 'in' ? 'in' : 'out';
  const cat = matchCategory(t, kindCat);
  const accHit = hits[0]?.acc || accById(S.settings.lastAcc) || activeAccs()[0] || null;
  return { kind: 'tx', fee: 0, tx: { type, date, amount: a.amount, acc: accHit?.id || '', cat: cat?.id || '', sub: matchSub(t, cat), note: cleanNote(t, hits) }, guessedAcc: !hits.length };
}

function parseTaskCommand(text) {
  let t = text.trim(); let kind = 'tugas';
  const km = t.match(/^(tambah\s+)?(tugas|ujian|uts|uas|kuis|quiz|praktikum)\b[:\s]*/i);
  if (km) {
    const w = km[2].toLowerCase();
    kind = ['ujian', 'uts', 'uas'].includes(w) ? 'ujian' : (w === 'kuis' || w === 'quiz') ? 'kuis' : w === 'praktikum' ? 'praktikum' : 'tugas';
    t = (['uts', 'uas'].includes(w) ? w.toUpperCase() + ' ' : '') + t.slice(km[0].length);
  }
  let work = '', workStart = '';
  const wm = t.match(/\b(?:dikerjakan|kerjakan|mulai|garap)\s+((?:hari\s*ini|besok|lusa|senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu(?:\s+depan)?|(?:tanggal|tgl)\s*\d{1,2}|\d{1,2}\s*(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sept|sep|okt|nov|des)|\d{1,2}[\/-]\d{1,2}))(?:\s+jam\s*(\d{1,2})(?:[.:](\d{2}))?)?/i);
  if (wm) {
    work = parseDate(wm[1], 'future').date || '';
    if (wm[2] !== undefined && Number(wm[2]) < 24) workStart = pad(Number(wm[2])) + ':' + (wm[3] || '00');
    t = t.replace(wm[0], ' ');
  }
  const d = parseDate(t, 'future'); t = d.rest;
  t = t.replace(/\b(deadline|dedlen|dikumpul|kumpul|batas|tenggat|due)\b/gi, ' ');
  let course = null, cl = 0, hitName = '';
  const pool = [...S.courses].sort((a, b) => (Number(b.sem) === Number(S.settings.sem)) - (Number(a.sem) === Number(S.settings.sem)));
  pool.forEach(c => {
    [c.name, ...String(c.alias || '').split(',')].map(s => s.trim()).filter(Boolean).forEach(n => {
      if (n.length > cl && new RegExp('(^|[^a-z0-9])' + reEsc(n) + '(?=$|[^a-z0-9])', 'i').test(t)) { course = c; cl = n.length; hitName = n; }
    });
  });
  if (course) t = t.replace(new RegExp(reEsc(hitName), 'i'), ' ');
  t = t.replace(/\s+/g, ' ').trim();
  const label = { tugas: 'Tugas', ujian: 'Ujian', kuis: 'Kuis', praktikum: 'Praktikum' }[kind];
  const title = t ? t[0].toUpperCase() + t.slice(1) : (course ? `${label} ${course.name}` : `${label} baru`);
  return { kind: 'task', task: { title, course: course?.id || '', due: d.date || '', work, workStart, kind, prio: 'sedang' } };
}

/* jawaban pertanyaan (dihitung di perangkat, data tidak dikirim ke mana pun) */
function periodRange(low) {
  const T = today(), ym = T.slice(0, 7);
  if (/hari ini/.test(low)) return [T, T, 'hari ini'];
  if (/kemarin/.test(low)) { const y = addDays(T, -1); return [y, y, 'kemarin']; }
  if (/minggu ini/.test(low)) { const s = startOfWeek(T); return [s, addDays(s, 6), 'minggu ini']; }
  if (/bulan lalu/.test(low)) { const p = addMonths(ym, -1); return [p + '-01', p + '-' + pad(daysInMonth(p)), 'bulan lalu']; }
  return [ym + '-01', ym + '-' + pad(daysInMonth(ym)), 'bulan ini'];
}
function answerQuery(text) {
  const low = text.toLowerCase(); const lines = [];
  if (/\bsaldo\b/.test(low)) {
    const b = balances(); const hits = findAccounts(text);
    if (hits.length) hits.forEach(h => lines.push(`${h.acc.name}: ${rp(b[h.acc.id])}`));
    else {
      const accs = activeAccs(); if (!accs.length) return { kind: 'answer', lines: ['Belum ada akun yang dicatat.'] };
      lines.push(`Total saldo: ${rp(sum(accs, a => b[a.id]))}`);
      accs.forEach(a => lines.push(`${a.name}: ${rp(b[a.id])}`));
    }
    return { kind: 'answer', lines };
  }
  if (/(pengeluaran|keluar|belanja|habis|pemasukan|masuk|terima)/.test(low) && !/\btugas\b/.test(low)) {
    const isIn = /(pemasukan|masuk|terima)/.test(low) && !/(pengeluaran|keluar|belanja|habis)/.test(low);
    const [a, b, label] = periodRange(low);
    const cat = matchCategory(text, isIn ? 'in' : 'out', true);
    let tx = S.transactions.filter(t => t.type === (isIn ? 'in' : 'out') && t.date >= a && t.date <= b);
    if (cat) tx = tx.filter(t => t.cat === cat.id);
    lines.push(`${isIn ? 'Pemasukan' : 'Pengeluaran'}${cat ? ' ' + cat.name : ''} ${label}: ${rp(sum(tx, t => t.amount))} (${tx.length} transaksi)`);
    return { kind: 'answer', lines };
  }
  if (/\btugas\b|deadline/.test(low)) {
    const T = today(); let list = S.tasks.filter(t => !t.done && !t.parent);
    let label = 'belum selesai';
    if (/hari ini/.test(low)) { list = list.filter(t => t.due === T); label = 'hari ini'; }
    else if (/besok/.test(low)) { list = list.filter(t => t.due === addDays(T, 1)); label = 'besok'; }
    else if (/minggu ini/.test(low)) { const s = startOfWeek(T); list = list.filter(t => t.due >= s && t.due <= addDays(s, 6)); label = 'minggu ini'; }
    list.sort(byDue);
    if (!list.length) return { kind: 'answer', lines: [`Tidak ada tugas ${label}.`] };
    lines.push(`Tugas ${label}: ${list.length}`);
    list.slice(0, 8).forEach(t => lines.push(`${t.title}${t.due ? ' (' + fmtDate(t.due) + ')' : ''}`));
    return { kind: 'answer', lines };
  }
  if (/anggaran|sisa/.test(low)) {
    if (!S.budgets.length) return { kind: 'answer', lines: ['Belum ada anggaran yang diatur.'] };
    S.budgets.forEach(b => { const i = budgetInfo(b); lines.push(`${catName(b.cat)}: terpakai ${rp(i.spent)} dari ${rp(b.limit)}, sisa ${rp(i.left)}`); });
    return { kind: 'answer', lines };
  }
  if (/tagihan/.test(low)) {
    const T = today(); const l = S.bills.filter(b => b.active !== false && b.nextDue <= addDays(T, 14)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    if (!l.length) return { kind: 'answer', lines: ['Tidak ada tagihan dalam 14 hari ke depan.'] };
    l.forEach(b => lines.push(`${b.name}: ${rp(b.amount)}, ${fmtDate(b.nextDue)} (${rel(b.nextDue)})`));
    return { kind: 'answer', lines };
  }
  return null;
}

function localParse(text) {
  const t = text.trim(); const low = t.toLowerCase();
  if (!t) return null;
  const isQ = /\?\s*$/.test(t) || /^(berapa|lihat|cek|apa|daftar|list|sisa|total)\b/.test(low) || /\b(berapa|apa saja)\b/.test(low) || /^(tugas|deadline)\s+(minggu ini|hari ini|besok|bulan ini)\s*$/.test(low) || /^saldo\b/.test(low);
  if (isQ) { const a = answerQuery(t); if (a) return a; }
  let m;
  if ((m = t.match(/^ide\b[:\s-]*/i))) return { kind: 'idea', item: { title: cap(t.slice(m[0].length)), origin: '', status: 'mentah', note: '' } };
  if ((m = t.match(/^(butuh|kebutuhan(?:\s+riset)?)\b[:\s-]*/i))) {
    const rest = t.slice(m[0].length); const kw = rest.toLowerCase().match(/\b(data|alat|izin|akses|literatur)\b/);
    return { kind: 'need', item: { title: cap(rest), kind: kw ? kw[1] : 'lainnya', status: 'belum', note: '' } };
  }
  if (/^(tambah\s+)?(tugas|ujian|uts|uas|kuis|quiz|praktikum)\b/i.test(t)) return parseTaskCommand(t);
  const tx = parseTxCommand(t); if (tx) return tx;
  if (/\b(deadline|dikumpul|tenggat)\b/i.test(t)) return parseTaskCommand(t);
  const a = answerQuery(t); if (a) return a;
  return null;
}
const cap = s => { s = String(s).trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };

/* ================= Gemini (opsional) ================= */
const hasGemini = () => S.settings.geminiMode === 'proxy' ? !!S.settings.syncSecret : !!S.settings.geminiKey;

/* Penjelasan sistem untuk Gemini: aturan aplikasi, akun, kategori, mata kuliah, dan catatan pengguna (tanpa saldo atau riwayat). */
function systemContext() {
  const kw = c => (c.keywords || []).slice(0, 12).join(', ');
  const L = [];
  L.push('SISTEM APLIKASI (Hub Pribadi, aplikasi pencatat milik seorang mahasiswa):');
  L.push('- Transaksi punya tiga jenis: out (pengeluaran), in (pemasukan), tf (transfer antar akun milik sendiri). Transfer BUKAN pemasukan atau pengeluaran.');
  L.push('- Tarik tunai = tf dari akun bank ke akun bertipe tunai. Setor tunai = tf dari tunai ke bank. Top up dompet digital = tf dari bank ke dompet digital. Biaya admin transfer dicatat terpisah lewat field fee.');
  L.push('- Memberi uang ke orang lain = out. Menerima uang dari orang lain = in. Bayar makanan, ojek, atau belanja = out.');
  L.push('- Tugas punya tenggat (due) dan tanggal rencana mengerjakan (workDate). Jenis tugas: tugas, ujian, kuis, praktikum. UTS dan UAS adalah ujian.');
  L.push('- Ide riset adalah gagasan penelitian lanjutan. Kebutuhan riset adalah data, alat, izin, atau akses yang masih dicari.');
  L.push('AKUN: ' + (activeAccs().map(a => `${a.name} (${ACC_TYPE_L[a.type] || a.type}${a.alias ? ', nama lain: ' + a.alias : ''})`).join('; ') || '(belum ada)'));
  [['out', 'KATEGORI PENGELUARAN:'], ['in', 'KATEGORI PEMASUKAN:']].forEach(([kind, head]) => {
    L.push(head);
    visCats(kind).forEach(c => L.push(`- ${c.name}${(c.subs || []).length ? ' | sub: ' + c.subs.join(', ') : ''}${kw(c) ? ' | kata kunci: ' + kw(c) : ''}`));
  });
  L.push('MATA KULIAH: ' + (S.courses.map(c => `${c.name} (semester ${c.sem}${c.alias ? ', singkatan: ' + c.alias : ''})`).join('; ') || '(belum ada)'));
  if (S.settings.geminiNotes) L.push('CATATAN PENGGUNA TENTANG KEBIASAANNYA: ' + S.settings.geminiNotes);
  return L.join('\n');
}

/* Ringkasan data: hanya dikirim bila pengguna mengizinkan, dan tanpa isi catatan, tautan, atau literatur. */
function dataSummary() {
  const T = today(), ym = T.slice(0, 7), pm = addMonths(ym, -1); const b = balances(); const L = [];
  const catSum = m => Object.entries(spentByCat(m)).sort((a, c) => c[1] - a[1]).map(([c, v]) => `${catName(c)} ${rp(v)}`).join('; ') || 'tidak ada';
  L.push(`Tanggal hari ini: ${T} (${DAYS[weekdayIdx(T)]})`);
  const accs = activeAccs();
  L.push('SALDO AKUN: ' + (accs.map(a => `${a.name} ${rp(b[a.id])}`).join('; ') || 'belum ada') + (accs.length ? `. Total ${rp(sum(accs, a => b[a.id]))}` : ''));
  if (S.investments.length) L.push('INVESTASI: ' + S.investments.map(i => `${i.name} nilai ${rp(i.value)} modal ${rp(i.cost)}`).join('; '));
  [[ym, 'BULAN INI'], [pm, 'BULAN LALU']].forEach(([m, lab]) => { const t = monthTotals(m); L.push(`${lab} (${fmtMonth(m)}): pemasukan ${rp(t.in)}, pengeluaran ${rp(t.out)}. Pengeluaran per kategori: ${catSum(m)}`); });
  const recent = S.transactions.filter(t => t.date >= addDays(T, -14)).sort((a, c) => c.date.localeCompare(a.date)).slice(0, 40);
  if (recent.length) {
    L.push('TRANSAKSI 14 HARI TERAKHIR (tanpa catatan):');
    recent.forEach(t => L.push(`- ${t.date} ${{ in: 'masuk', out: 'keluar', tf: 'transfer' }[t.type]} ${rp(t.amount)} ${t.type === 'tf' ? accName(t.acc) + ' ke ' + accName(t.to) : catName(t.cat) + ' (' + accName(t.acc) + ')'}`));
  }
  if (S.budgets.length) L.push('ANGGARAN BULAN INI: ' + S.budgets.map(x => { const i = budgetInfo(x); return `${catName(x.cat)} terpakai ${rp(i.spent)} dari ${rp(x.limit)}`; }).join('; '));
  const debts = S.debts.filter(d => d.amount - d.paid > 0.5);
  if (debts.length) L.push('UTANG DAN PIUTANG: ' + debts.map(d => `${d.dir === 'utang' ? 'utang ke' : 'piutang dari'} ${d.person} sisa ${rp(d.amount - d.paid)}`).join('; '));
  const bills = S.bills.filter(x => x.active !== false);
  if (bills.length) L.push('TAGIHAN BERULANG: ' + bills.map(x => `${x.name} ${rp(x.amount)} jatuh tempo ${x.nextDue}`).join('; '));
  if (S.goals.length) L.push('TARGET TABUNGAN: ' + S.goals.map(g => `${g.name} ${rp(g.saved)} dari ${rp(g.target)}`).join('; '));
  const tasks = S.tasks.filter(t => !t.done).sort(byDue);
  if (tasks.length) { L.push('TUGAS BELUM SELESAI:'); tasks.slice(0, 30).forEach(t => L.push(`- ${t.title} (${t.kind}${courseById(t.course) ? ', ' + courseById(t.course).name : ''}) tenggat ${t.due || 'belum ada'}${t.work ? ', rencana dikerjakan ' + t.work : ''}`)); }
  const cls = S.schedule.filter(c => courseById(c.course) && Number(courseById(c.course).sem) === Number(S.settings.sem));
  if (cls.length) L.push('JADWAL KULIAH MINGGUAN: ' + cls.map(c => `${DAYS[c.day]} ${c.start}-${c.end} ${courseById(c.course).name}`).join('; '));
  if (S.milestones.length) L.push('TARGET RISET: ' + S.milestones.map(m => `${m.title} tenggat ${m.due || '-'} progres ${m.pct || 0}%`).join('; '));
  const needs = S.needs.filter(n => n.status !== 'terpenuhi');
  if (needs.length) L.push('KEBUTUHAN RISET BELUM TERPENUHI: ' + needs.map(n => `${n.title} (${n.status})`).join('; '));
  if (S.ideas.length) L.push('IDE RISET: ' + S.ideas.map(i => `${i.title} (${i.status})`).join('; '));
  return L.join('\n');
}

function gemStatusError(status, j) {
  if (status === 429) return 'Kuota Gemini sedang habis. Coba lagi nanti atau pakai perintah biasa.';
  if (status === 400 || status === 403) return 'Gemini menolak permintaan. Periksa kunci API dan nama model di Pengaturan.';
  if (status === 404) return 'Nama model tidak ditemukan. Tekan "Lihat model tersedia" di Pengaturan lalu pilih salah satunya.';
  return 'Gemini bermasalah (kode ' + status + ').';
}
/* Satu pintu ke Gemini: lewat server Vercel (kunci di server) atau langsung dari browser. */
async function geminiCall(payload) {
  const st = S.settings; const model = st.geminiModel || 'gemini-flash-latest';
  if (st.geminiMode === 'proxy') {
    if (!st.syncSecret) throw new Error('Isi Kode sinkron dulu (Pengaturan, tab Sinkron). Kode itu dipakai untuk mengamankan jalur ke server.');
    const r = await api('/api/gemini', { method: 'POST', body: JSON.stringify({ model, payload }) });
    if (r.status === 0) throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.');
    if (r.j === null && r.status === 404) throw new Error('Fungsi api/gemini belum ter-deploy. Pastikan folder api ikut di-deploy ke Vercel.');
    if (r.j && r.j.hub) {
      if (r.j.error === 'unauthorized') throw new Error('Kode sinkron di perangkat ini berbeda dengan SYNC_TOKEN di Vercel.');
      if (r.j.error === 'no_sync_token') throw new Error('SYNC_TOKEN belum diisi di Vercel.');
      if (r.j.error === 'no_gemini_key') throw new Error('GEMINI_API_KEY belum diisi di Vercel.');
      if (r.j.error === 'timeout') throw new Error('Gemini tidak menjawab tepat waktu.');
      throw new Error('Server bermasalah saat menghubungi Gemini.');
    }
    if (!r.ok) throw new Error(gemStatusError(r.status, r.j));
    return r.j;
  }
  if (!st.geminiKey) throw new Error('Kunci API Gemini belum diisi.');
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': st.geminiKey }, signal: ctl.signal, body: JSON.stringify(payload)
    });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'Gemini tidak menjawab dalam 25 detik.' : 'Tidak bisa terhubung ke Gemini. Periksa koneksi internet.'); }
  finally { clearTimeout(to); }
  if (!r.ok) throw new Error(gemStatusError(r.status));
  return r.json();
}
const gemText = j => (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');

async function geminiParse(text) {
  const T = today();
  const prompt = `Kamu adalah pengurai perintah untuk aplikasi pencatatan pribadi mahasiswa. Ubah perintah pengguna menjadi JSON. Balas HANYA dengan satu objek JSON tanpa teks lain.
Tanggal hari ini: ${T} (${DAYS[weekdayIdx(T)]}).

${systemContext()}

Skema: {"intent":"tx|task|idea|need|ask|unknown","type":"out|in|tf","date":"YYYY-MM-DD","amount":angka rupiah,"acc":"nama akun persis dari daftar atau kosong","to":"akun tujuan untuk transfer atau kosong","cat":"nama kategori persis dari daftar atau kosong","note":"keterangan singkat","fee":angka biaya admin atau 0,"title":"judul tugas atau ide","course":"nama mata kuliah persis atau kosong","due":"tenggat YYYY-MM-DD atau kosong","workDate":"tanggal rencana mengerjakan tugas YYYY-MM-DD atau kosong","taskKind":"tugas|ujian|kuis|praktikum"}
Aturan: 18rb=18000, 1,5jt=1500000. Ikuti penjelasan sistem di atas, termasuk nama lain akun, kata kunci kategori, dan catatan pengguna. Jika tanggal transaksi tidak disebut, pakai tanggal hari ini. Untuk tugas, kosongkan tanggal yang tidak disebut. Pakai intent "ask" untuk pertanyaan tentang data pengguna (saldo, total pengeluaran, daftar tugas, jadwal, dan sebagainya). Jangan mengarang akun atau kategori yang tidak ada di daftar.
Perintah: ${JSON.stringify(text)}`;
  const j = await geminiCall({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } });
  const raw = gemText(j).replace(/^```json\s*|^```\s*|```$/gm, '').trim();
  let o; try { o = JSON.parse(raw); } catch (e) { throw new Error('Jawaban Gemini tidak bisa dibaca.'); }
  return mapGemini(o);
}
async function geminiAsk(question) {
  const prompt = `Kamu asisten untuk aplikasi pencatatan pribadi seorang mahasiswa. Jawab pertanyaan pengguna dalam bahasa Indonesia yang singkat dan jelas, HANYA berdasarkan data di bawah. Jika datanya tidak ada atau tidak cukup, katakan terus terang dan jangan mengarang. Tulis uang dengan format Rp 1.234.000. Jangan pakai format markdown berat, daftar pendek boleh.

${systemContext()}

DATA PENGGUNA:
${dataSummary()}

Pertanyaan: ${JSON.stringify(question)}`;
  const j = await geminiCall({ contents: [{ parts: [{ text: prompt }] }] });
  const t = gemText(j).trim(); if (!t) throw new Error('Gemini tidak memberi jawaban.');
  return t;
}
async function listGeminiModels() {
  const st = S.settings; let j;
  if (st.geminiMode === 'proxy') {
    const r = await api('/api/gemini?op=models');
    if (r.status === 0) throw new Error('Tidak bisa terhubung ke server.');
    if (r.j && r.j.hub) throw new Error({ unauthorized: 'Kode sinkron berbeda dengan SYNC_TOKEN di Vercel.', no_gemini_key: 'GEMINI_API_KEY belum diisi di Vercel.', no_sync_token: 'SYNC_TOKEN belum diisi di Vercel.' }[r.j.error] || 'Server bermasalah.');
    if (!r.ok) throw new Error(gemStatusError(r.status));
    j = r.j;
  } else {
    if (!st.geminiKey) throw new Error('Isi kunci API dulu.');
    let r; try { r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': st.geminiKey } }); } catch (e) { throw new Error('Tidak bisa terhubung ke Gemini.'); }
    if (!r.ok) throw new Error(gemStatusError(r.status)); j = await r.json();
  }
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, '')).filter(n => /^gemini/.test(n) && !/(image|tts|embedding|live|robotics|computer|audio|vision)/.test(n))
    .sort().reverse().slice(0, 16);
}
function byName(list, name) {
  if (!name) return null; const n = String(name).toLowerCase().trim();
  return list.find(x => x.name.toLowerCase() === n) || list.find(x => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase())) || null;
}
function mapGemini(o) {
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  if (o.intent === 'ask') return { kind: 'ask' };
  if (o.intent === 'tx') {
    const type = ['in', 'out', 'tf'].includes(o.type) ? o.type : 'out';
    const amount = Number(o.amount) || 0; if (!amount) return null;
    const acc = byName(activeAccs(), o.acc) || accById(S.settings.lastAcc) || activeAccs()[0];
    const tx = { type, date: isDate(o.date) ? o.date : today(), amount, acc: acc?.id || '', note: String(o.note || '') };
    if (type === 'tf') { tx.to = byName(activeAccs(), o.to)?.id || ''; }
    else { const cat = byName(visCats(type), o.cat) || catLain(type); tx.cat = cat?.id || ''; tx.sub = ''; }
    return { kind: 'tx', tx, fee: Number(o.fee) || 0 };
  }
  if (o.intent === 'task') {
    const course = byName(S.courses, o.course);
    return { kind: 'task', task: { title: cap(o.title || 'Tugas baru'), course: course?.id || '', due: isDate(o.due) ? o.due : '', work: isDate(o.workDate) ? o.workDate : '', workStart: '', kind: ['tugas', 'ujian', 'kuis', 'praktikum'].includes(o.taskKind) ? o.taskKind : 'tugas', prio: 'sedang' } };
  }
  if (o.intent === 'idea') return { kind: 'idea', item: { title: cap(o.title || ''), origin: '', status: 'mentah', note: '' } };
  if (o.intent === 'need') return { kind: 'need', item: { title: cap(o.title || ''), kind: 'lainnya', status: 'belum', note: '' } };
  return null;
}

/* ================= komponen tampilan ================= */
const A = (act, id, extra = '') => `data-act="${act}"${id !== undefined && id !== null ? ` data-id="${esc(id)}"` : ''}${extra ? ' ' + extra : ''}`;
const btn = (label, act, id, cls = '') => `<button type="button" class="btn ${cls}" ${A(act, id)}>${label}</button>`;
const chipRow = (items, cur, act) => `<div class="chips">${items.map(([v, l]) => `<button type="button" class="chip ${String(v) === String(cur) ? 'on' : ''}" ${A(act, v)}>${esc(l)}</button>`).join('')}</div>`;
const panel = (title, body, right = '') => `<section class="panel"><div class="ph"><h2>${title}</h2>${right}</div>${body}</section>`;
const empty = (msg, action = '') => `<div class="empty"><p>${msg}</p>${action}</div>`;
const bar = (p, cls = '') => `<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(Math.max(0, Math.min(100, p)))}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
const badge = (t, c = '') => `<span class="badge ${c}">${esc(t)}</span>`;
const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
const subTabs = (ns, list) => `<div class="tabs" role="tablist">${list.map(([v, l]) => `<button type="button" role="tab" aria-selected="${UI.sub[ns] === v}" class="${UI.sub[ns] === v ? 'on' : ''}" ${A('subtab', ns + ':' + v)}>${esc(l)}</button>`).join('')}</div>`;
const selectBind = (bind, cur, opts, label) => `<select class="btn" data-bind="${bind}" aria-label="${esc(label)}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const searchBox = (bind, val, ph) => `<input class="btn" style="cursor:text;font-weight:400" type="search" data-bind="${bind}" data-search="${bind}" value="${esc(val)}" placeholder="${esc(ph)}" aria-label="${esc(ph)}">`;
const courseOpts = () => [{ v: '', l: '(tanpa mata kuliah)' }, ...[...S.courses].sort((a, b) => a.sem - b.sem || a.name.localeCompare(b.name)).map(c => ({ v: c.id, l: `${c.name} (Sem ${c.sem})` }))];
const semOpts = () => Array.from({ length: 14 }, (_, i) => ({ v: i + 1, l: `Semester ${i + 1}` }));
const dueBadge = t => {
  if (!t.due) return '';
  const od = isOverdue(t);
  return badge(`${fmtDate(t.due)} · ${rel(t.due)}`, t.done ? '' : od ? 'bad' : t.due === today() ? 'warn' : '');
};

/* ================= TUGAS & KULIAH: formulir ================= */
function editTask(id, prefill, then) {
  const parents = S.tasks.filter(t => !t.parent && t.id !== id).map(t => ({ v: t.id, l: t.title }));
  editEntity('tasks', id, {
    title: 'tugas', defaults: { kind: 'tugas', prio: 'sedang', done: false, course: '', parent: '' },
    fields: [
      { k: 'title', label: 'Judul', req: true, wide: true },
      { k: 'kind', label: 'Jenis', type: 'select', opts: ['tugas', 'ujian', 'kuis', 'praktikum'].map(v => ({ v, l: cap(v) })) },
      { k: 'course', label: 'Mata kuliah', type: 'select', opts: courseOpts() },
      { k: 'due', label: 'Tenggat (deadline)', type: 'date' },
      { k: 'work', label: 'Dikerjakan pada', type: 'date', hint: 'Hari yang kamu rencanakan untuk mengerjakannya. Muncul di kalender.' },
      { k: 'workStart', label: 'Mulai jam', type: 'time' },
      { k: 'workEnd', label: 'Selesai jam', type: 'time' },
      { k: 'prio', label: 'Prioritas', type: 'select', opts: [{ v: 'rendah', l: 'Rendah' }, { v: 'sedang', l: 'Sedang' }, { v: 'tinggi', l: 'Tinggi' }] },
      { k: 'parent', label: 'Sub-tugas dari (misalnya belajar untuk ujian)', type: 'select', wide: true, opts: [{ v: '', l: '(bukan sub-tugas)' }, ...parents] },
      { k: 'link', label: 'Tautan', type: 'url', wide: true },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true },
      { k: 'done', label: 'Sudah selesai', type: 'check' }
    ],
    map: (v, ex) => ({ ...v, doneAt: v.done ? (ex?.doneAt || today()) : '' }),
    check: v => (v.work && v.due && v.work > v.due) ? 'Tanggal mengerjakan tidak boleh setelah tenggat' : (v.workStart && v.workEnd && v.workEnd <= v.workStart ? 'Jam selesai harus setelah jam mulai' : ''),
    onDelete: ex => { S.tasks = S.tasks.filter(t => t.parent !== ex.id); commit('tasks'); },
    then
  }, prefill);
}
function ensureActiveSem(sem) {
  sem = Number(sem); if (!sem || sem === Number(S.settings.sem)) return false;
  if (S.courses.some(c => Number(c.sem) === Number(S.settings.sem))) return false;
  S.settings.sem = sem; commit('settings'); return true;
}
function editCourse(id, prefill, then) {
  let want = false, msg = '';
  editEntity('courses', id, {
    title: 'mata kuliah', defaults: { sem: S.settings.sem, sks: 2, addClass: true },
    fields: [
      { k: 'name', label: 'Nama mata kuliah', req: true, wide: true },
      { k: 'alias', label: 'Singkatan', hint: 'Dipakai asisten untuk mengenali, misalnya: srg' },
      { k: 'sem', label: 'Semester', type: 'select', opts: semOpts() },
      { k: 'sks', label: 'SKS', type: 'number', min: 0, step: 1 },
      { k: 'lecturer', label: 'Dosen' },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true },
      { k: 'addClass', label: 'Lanjut mengisi jadwal kelas setelah menyimpan', type: 'check', show: () => !id }
    ],
    map: v => { want = !!v.addClass; const { addClass, ...rest } = v; return { ...rest, sem: Number(rest.sem) }; },
    after: (v, ex, rec) => {
      msg = ensureActiveSem(rec.sem) ? `Tersimpan. Semester aktif diubah ke ${rec.sem} supaya jadwalnya tampil di kalender.` : '';
      if (!ex && want) setTimeout(() => editClass(null, { course: rec.id }), 0);
    },
    msg: () => msg,
    onDelete: ex => {
      S.schedule = S.schedule.filter(c => c.course !== ex.id); commit('schedule');
      S.tasks.forEach(t => { if (t.course === ex.id) t.course = ''; }); commit('tasks');
      S.materials.forEach(m => { if (m.course === ex.id) m.course = ''; }); commit('materials');
    },
    then
  }, prefill);
}
function editMaterial(id) {
  editEntity('materials', id, {
    title: 'materi', defaults: { type: 'slide', course: UI.mat.course || '' },
    fields: [
      { k: 'title', label: 'Judul materi', req: true, wide: true },
      { k: 'course', label: 'Mata kuliah', type: 'select', opts: courseOpts() },
      { k: 'meeting', label: 'Pertemuan ke-', type: 'number', min: 0, step: 1 },
      { k: 'type', label: 'Jenis', type: 'select', opts: ['slide', 'jurnal', 'video', 'catatan', 'buku', 'lainnya'].map(v => ({ v, l: cap(v) })) },
      { k: 'url', label: 'Tautan (Drive, YouTube, dan sebagainya)', type: 'url', wide: true },
      { k: 'tags', label: 'Tag', type: 'tags', wide: true },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ]
  });
}
function editClass(id, prefill) {
  let again = false, msg = '';
  editEntity('schedule', id, {
    title: 'jadwal kelas', defaults: { day: 0, start: '08:00', end: '09:40', again: false },
    fields: [
      { k: 'course', label: 'Mata kuliah', type: 'select', req: true, wide: true, opts: [{ v: '', l: '(pilih)' }, ...courseOpts().slice(1)] },
      { k: 'day', label: 'Hari (berulang tiap minggu)', type: 'select', opts: DAYS.map((d, i) => ({ v: i, l: d })) },
      { k: 'room', label: 'Ruang' },
      { k: 'start', label: 'Mulai', type: 'time' },
      { k: 'end', label: 'Selesai', type: 'time' },
      { k: 'again', label: 'Tambah jadwal lain untuk mata kuliah ini', type: 'check', show: () => !id }
    ],
    map: v => { again = !!v.again; const { again: _a, ...rest } = v; return { ...rest, day: Number(rest.day) }; },
    check: v => (v.start && v.end && v.end <= v.start) ? 'Jam selesai harus setelah jam mulai' : '',
    after: (v, ex, rec) => {
      const co = courseById(rec.course);
      msg = co && ensureActiveSem(co.sem) ? `Tersimpan. Semester aktif diubah ke ${co.sem} supaya jadwalnya tampil di kalender.` : '';
      if (!ex && again) setTimeout(() => editClass(null, { course: rec.course, start: rec.start, end: rec.end, room: rec.room, day: (Number(rec.day) + 1) % 7 }), 0);
    },
    msg: () => msg
  }, prefill);
}
function editHoliday(id) {
  editEntity('holidays', id, {
    title: 'hari libur', defaults: { start: today() },
    fields: [
      { k: 'name', label: 'Nama libur', req: true, wide: true },
      { k: 'start', label: 'Mulai', type: 'date', req: true },
      { k: 'end', label: 'Selesai (kosongkan jika satu hari)', type: 'date' }
    ]
  });
}
function editSemester() {
  openForm({
    title: 'Pengaturan semester', values: { sem: S.settings.sem, semStart: S.settings.semStart, semEnd: S.settings.semEnd },
    fields: [
      { k: 'sem', label: 'Semester aktif', type: 'select', opts: semOpts(), wide: true },
      { k: 'semStart', label: 'Kuliah mulai', type: 'date' },
      { k: 'semEnd', label: 'Kuliah berakhir', type: 'date' },
      { k: 'i', type: 'info', html: 'Jadwal kelas hanya muncul di kalender untuk mata kuliah semester aktif dan di antara dua tanggal ini. Kalau tanggalnya dikosongkan, jadwal muncul setiap minggu.' }
    ],
    onSave(v) { S.settings.sem = Number(v.sem); S.settings.semStart = v.semStart || ''; S.settings.semEnd = v.semEnd || ''; commit('settings'); render(); toast('Tersimpan'); }
  });
}
ACT['task-toggle'] = el => { const t = S.tasks.find(x => x.id === el.dataset.id); if (!t) return; t.done = !t.done; t.doneAt = t.done ? today() : ''; commit('tasks'); render(); };
ACT['task-edit'] = el => editTask(el.dataset.id);
ACT['course-edit'] = el => editCourse(el.dataset.id);
ACT['mat-edit'] = el => editMaterial(el.dataset.id);
ACT['class-edit'] = el => editClass(el.dataset.id);
ACT['hol-edit'] = el => editHoliday(el.dataset.id);
ACT['sem-edit'] = () => editSemester();
ACT['toggle-done'] = () => { UI.showDone = !UI.showDone; render(); };

/* ================= RISET: formulir ================= */
const NEED_ST = { belum: ['Belum', 'warn'], diurus: ['Sedang diurus', 'acc'], terpenuhi: ['Terpenuhi', 'good'] };
const IDEA_ST = { mentah: ['Mentah', 'warn'], layak: ['Layak dikembangkan', 'good'], dibuang: ['Dibuang', ''] };
const LIT_ST = { belum: ['Belum dicek', 'warn'], doi: ['DOI dicek', 'acc'], teks: ['Teks lengkap dibaca', 'good'], halaman: ['Halaman dicek', 'good'] };
const optsOf = o => Object.entries(o).map(([v, a]) => ({ v, l: a[0] }));
function editNeed(id, prefill, then) {
  editEntity('needs', id, {
    title: 'kebutuhan riset', defaults: { kind: 'data', status: 'belum' },
    fields: [
      { k: 'title', label: 'Kebutuhan', req: true, wide: true },
      { k: 'kind', label: 'Jenis', type: 'select', opts: ['data', 'alat', 'izin', 'akses', 'literatur', 'lainnya'].map(v => ({ v, l: cap(v) })) },
      { k: 'status', label: 'Status', type: 'select', opts: optsOf(NEED_ST) },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ], then
  }, prefill);
}
function editIdea(id, prefill, then) {
  editEntity('ideas', id, {
    title: 'ide riset', defaults: { status: 'mentah' },
    fields: [
      { k: 'title', label: 'Ide', req: true, wide: true },
      { k: 'origin', label: 'Asal munculnya', wide: true, hint: 'Misalnya: bab 4, diskusi dengan dosen, jurnal tertentu' },
      { k: 'status', label: 'Status', type: 'select', opts: optsOf(IDEA_ST) },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ], then
  }, prefill);
}
function editMilestone(id) {
  editEntity('milestones', id, {
    title: 'target riset', defaults: { pct: 0 },
    fields: [
      { k: 'title', label: 'Target atau milestone', req: true, wide: true },
      { k: 'due', label: 'Tenggat', type: 'date' },
      { k: 'pct', label: 'Progres (%)', type: 'number', min: 0, max: 100, step: 5 },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ],
    map: v => ({ ...v, pct: Math.max(0, Math.min(100, Number(v.pct) || 0)) })
  });
}
function editLit(id) {
  editEntity('literature', id, {
    title: 'literatur', defaults: { st: 'belum', inc: '', ideas: [], ms: [] },
    fields: [
      { k: 'title', label: 'Judul', req: true, wide: true },
      { k: 'authors', label: 'Penulis', wide: true, hint: 'Tulis sesuai gaya sitasi yang dipakai, misalnya: Hadyan, A., & Suryantini, S.' },
      { k: 'year', label: 'Tahun', type: 'number', step: 1 },
      { k: 'venue', label: 'Jurnal atau penerbit' },
      { k: 'doi', label: 'DOI', hint: 'Tulis DOI saja, tanpa https://doi.org/', wide: true },
      { k: 'col', label: 'Koleksi', ph: 'misalnya: Geomorfometri' },
      { k: 'tags', label: 'Tag', type: 'tags' },
      { k: 'claim', label: 'Klaim yang didukung literatur ini', type: 'textarea', wide: true },
      { k: 'st', label: 'Status verifikasi', type: 'select', opts: optsOf(LIT_ST) },
      { k: 'inc', label: 'Keputusan', type: 'select', opts: [{ v: '', l: '(belum diputuskan)' }, { v: 'pakai', l: 'Pakai' }, { v: 'ragu', l: 'Ragu' }, { v: 'tidak', l: 'Tidak dipakai' }] },
      { k: 'note', label: 'Catatan baca', type: 'textarea', wide: true },
      { k: 'ideas', label: 'Terkait ide riset', type: 'multi', opts: S.ideas.map(i => ({ v: i.id, l: i.title })) },
      { k: 'ms', label: 'Terkait target', type: 'multi', opts: S.milestones.map(m => ({ v: m.id, l: m.title })) }
    ],
    map: v => ({ ...v, doi: String(v.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() })
  });
}
function editBim(id) {
  editEntity('bimbingan', id, {
    title: 'catatan bimbingan', defaults: { date: today(), status: 'open' },
    fields: [
      { k: 'date', label: 'Tanggal', type: 'date', req: true },
      { k: 'with', label: 'Dengan siapa' },
      { k: 'points', label: 'Poin revisi dan arahan', type: 'textarea', req: true, wide: true },
      { k: 'status', label: 'Tindak lanjut', type: 'select', opts: [{ v: 'open', l: 'Belum dikerjakan' }, { v: 'done', l: 'Selesai' }] },
      { k: 'nextDate', label: 'Bimbingan berikutnya', type: 'date' }
    ]
  });
}
ACT['need-edit'] = el => editNeed(el.dataset.id);
ACT['idea-edit'] = el => editIdea(el.dataset.id);
ACT['ms-edit'] = el => editMilestone(el.dataset.id);
ACT['lit-edit'] = el => editLit(el.dataset.id);
ACT['bim-edit'] = el => editBim(el.dataset.id);
ACT['need-cycle'] = el => { const n = S.needs.find(x => x.id === el.dataset.id); if (!n) return; const k = Object.keys(NEED_ST); n.status = k[(k.indexOf(n.status) + 1) % k.length]; commit('needs'); render(); };
ACT['idea-cycle'] = el => { const n = S.ideas.find(x => x.id === el.dataset.id); if (!n) return; const k = Object.keys(IDEA_ST); n.status = k[(k.indexOf(n.status) + 1) % k.length]; commit('ideas'); render(); };
ACT['bim-toggle'] = el => { const b = S.bimbingan.find(x => x.id === el.dataset.id); if (!b) return; b.status = b.status === 'done' ? 'open' : 'done'; commit('bimbingan'); render(); };
ACT['lit-copy'] = () => {
  const l = S.literature.filter(x => ['doi', 'teks', 'halaman'].includes(x.st) && x.inc === 'pakai' && x.title)
    .sort((a, b) => String(a.authors).localeCompare(String(b.authors), 'id'));
  if (!l.length) { toast('Belum ada literatur berstatus terverifikasi dan berkeputusan Pakai'); return; }
  const txt = l.map(x => `${x.authors || '(penulis belum diisi)'} (${x.year || 't.t.'}). ${x.title}.${x.venue ? ' ' + x.venue + '.' : ''}${x.doi ? ' https://doi.org/' + x.doi : ''}`).join('\n\n');
  const done = () => toast(`${l.length} referensi disalin`);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, () => prompt('Salin teks ini:', txt)); else prompt('Salin teks ini:', txt);
};

/* ================= VIEW: Beranda ================= */
function eventRow(e, showDate) {
  const [lab, col] = TYPES[e.type];
  return `<div class="ev ${e.done ? 'done' : ''}" style="--c:${col}"><i class="sw"></i><div class="tm">${esc(e.time || '')}</div><div class="grow tap" ${A('open-ref', e.ref.join(':'))} tabindex="0" role="button"><div class="t" style="font-weight:600">${esc(e.title)}</div><div class="s small mute">${esc(lab)}${e.sub ? ' · ' + esc(e.sub) : ''}${e.end ? ' · sampai ' + esc(e.end) : ''}${showDate ? ' · ' + esc(fmtDate(showDate)) : ''}</div></div></div>`;
}
function taskRow(t, sub) {
  const c = courseById(t.course);
  const meta = [c ? esc(c.name) : '', t.kind !== 'tugas' ? cap(t.kind) : '', t.prio === 'tinggi' ? 'Prioritas tinggi' : '', (t.work && !t.done) ? 'Dikerjakan ' + esc(fmtDate(t.work)) + (t.workStart ? ' jam ' + esc(t.workStart) : '') : ''].filter(Boolean).join(' · ');
  return `<div class="item ${t.done ? 'done' : ''} ${sub ? 'sub' : ''}"><button type="button" class="check ${t.done ? 'on' : ''}" ${A('task-toggle', t.id)} aria-label="${t.done ? 'Tandai belum selesai' : 'Tandai selesai'}: ${esc(t.title)}">${t.done ? '✓' : ''}</button>
    <div class="grow tap" ${A('task-edit', t.id)} tabindex="0" role="button"><div class="t">${esc(t.title)}</div>${(meta || t.due) ? `<div class="s">${dueBadge(t)} ${meta}</div>` : ''}</div></div>`;
}
function viewBeranda() {
  const T = today(), ym = T.slice(0, 7);
  const b = balances(); const accs = activeAccs();
  const tot = sum(accs, a => b[a.id]); const inv = totalInvest(); const mt = monthTotals(ym);
  const todayEv = eventsOn(T, false);
  const overdue = S.tasks.filter(t => isOverdue(t) && !t.parent);
  const soon = S.tasks.filter(t => !t.done && !t.parent && t.due && t.due >= T && t.due <= addDays(T, 7)).sort(byDue);
  const ms = S.milestones.filter(m => (m.pct || 0) < 100).sort((a, c) => (a.due || '9999').localeCompare(c.due || '9999')).slice(0, 3);
  const openBim = S.bimbingan.filter(x => x.status === 'open').length;
  const bills = S.bills.filter(x => x.active !== false && x.nextDue && x.nextDue <= addDays(T, 7)).sort((a, c) => a.nextDue.localeCompare(c.nextDue));
  let h = '';
  if (!S.courses.length && !S.accounts.length) {
    h += panel('Mulai dari sini', `<div class="stack"><p class="mute">Isi tiga hal ini supaya Beranda terisi. Sisanya bisa menyusul sambil dipakai.</p>
      <div class="row">${btn('Atur semester', 'sem-edit')}${btn('Tambah mata kuliah', 'course-new', null, 'primary')}${btn('Tambah akun keuangan', 'go', 'keuangan')}</div>
      <p class="small mute">Untuk mencatat cepat, ketik di kolom paling atas, misalnya <b>kopi 15rb dana</b> atau <b>tugas laporan deadline Jumat</b>.</p></div>`);
  }
  const lastB = S.settings.lastBackup;
  if ((S.transactions.length + S.tasks.length > 5) && (!lastB || diffDays(T, lastB) > 14)) {
    h += `<div class="notice"><b>Waktunya cadangan.</b> ${lastB ? `Cadangan terakhir ${diffDays(T, lastB)} hari lalu.` : 'Data belum pernah dicadangkan.'} Data hanya tersimpan di perangkat ini. ${btn('Unduh cadangan', 'export', null, 'sm')}</div>`;
  }
  const left = `
    ${panel('Hari ini', (overdue.length ? `<div class="notice" style="margin-bottom:8px">${overdue.length} tugas terlambat. ${btn('Lihat', 'go-kuliah-tugas', null, 'sm')}</div>` : '') + (todayEv.length ? todayEv.map(e => eventRow(e)).join('') : empty('Tidak ada agenda hari ini.')), btn('Kalender', 'go', 'kalender', 'sm ghost'))}
    ${panel('Tenggat 7 hari ke depan', soon.length ? soon.slice(0, 7).map(t => taskRow(t)).join('') : empty('Tidak ada tenggat dalam seminggu ini.'), btn('Semua tugas', 'go-kuliah-tugas', null, 'sm ghost'))}
    ${panel('Riset', (ms.length ? `<div class="tl">${ms.map(m => `<div class="m"><div class="row between"><span class="tap" style="font-weight:600" ${A('ms-edit', m.id)} tabindex="0" role="button">${esc(m.title)}</span><span class="small mute">${m.due ? esc(fmtDate(m.due)) + ' · ' + rel(m.due) : 'tanpa tenggat'}</span></div>${bar(m.pct || 0)}</div>`).join('')}</div>` : empty('Belum ada target riset.')) + (openBim ? `<p class="small mute" style="margin-top:8px">${openBim} poin bimbingan belum ditindaklanjuti.</p>` : ''), btn('Buka riset', 'go', 'riset', 'sm ghost'))}`;
  const budgets = S.budgets.map(x => ({ x, i: budgetInfo(x) })).sort((a, c) => c.i.p - a.i.p).slice(0, 4);
  const right = `
    ${panel('Uang', accs.length ? `<div class="stats"><div class="stat"><span class="v">${rp(tot)}</span><span class="l">Total saldo</span></div>
      <div class="stat"><span class="v ${mt.in - mt.out >= 0 ? 'pos' : 'neg'}">${rp(mt.in - mt.out)}</span><span class="l">Selisih bulan ini</span></div></div>
      <div class="row" style="margin-top:10px"><span class="small mute">Masuk</span><b class="pos small">${rp(mt.in)}</b><span class="small mute" style="margin-left:10px">Keluar</span><b class="neg small">${rp(mt.out)}</b></div>
      ${inv.value ? `<p class="small mute" style="margin-top:6px">Investasi ${rp(inv.value)} · Kekayaan bersih ${rp(tot + inv.value)}</p>` : ''}` : empty('Belum ada akun. Tambahkan akun dulu di Keuangan.', btn('Tambah akun', 'go', 'keuangan', 'sm')), btn('Keuangan', 'go', 'keuangan', 'sm ghost'))}
    ${S.budgets.length ? panel('Batas belanja harian', `<div class="bars">${budgets.map(({ x, i }) => `<div><div class="row between"><span style="font-weight:600">${esc(catName(x.cat))}</span><span class="small ${i.left < 0 ? 'neg' : 'mute'}">${i.left < 0 ? 'lewat ' + rp(-i.left) : rp(i.perDay) + ' per hari'}</span></div>${bar(i.p, i.p >= 100 ? 'bad' : i.p >= 80 ? 'warn' : '')}</div>`).join('')}</div>`) : ''}
    ${bills.length ? panel('Tagihan segera', bills.map(x => `<div class="item"><div class="grow tap" ${A('bill-edit', x.id)} tabindex="0" role="button"><div class="t">${esc(x.name)}</div><div class="s">${esc(fmtDate(x.nextDue))} · ${rel(x.nextDue)}</div></div><b>${rp(x.amount)}</b>${btn('Bayar', 'bill-pay', x.id, 'sm')}</div>`).join('')) : ''}`;
  return h + `<div class="cols"><div class="stack">${left}</div><div class="stack">${right}</div></div>`;
}
ACT['go-kuliah-tugas'] = () => { UI.tab = 'kuliah'; UI.sub.kuliah = 'tugas'; render(); window.scrollTo(0, 0); };
ACT['course-new'] = () => editCourse(null);
ACT['open-ref'] = el => {
  const [coll, id] = el.dataset.id.split(':');
  ({ tasks: editTask, milestones: editMilestone, bimbingan: editBim, bills: editBill, trueExp: editTrue, holidays: editHoliday, schedule: editClass })[coll]?.(id);
};

/* ================= VIEW: Kalender ================= */
function monthGrid(ym, cell, act, sel) {
  const first = ym + '-01'; const start = startOfWeek(first);
  const n = Math.ceil((weekdayIdx(first) + daysInMonth(ym)) / 7) * 7;
  let h = '<div class="mg" role="grid">' + DAYS3.map(d => `<div class="mh">${d}</div>`).join('');
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i); const inM = d.slice(0, 7) === ym;
    h += `<button type="button" class="mc ${inM ? '' : 'out'} ${d === today() ? 'now' : ''} ${d === sel ? 'sel' : ''}" ${A(act, d)} aria-label="${esc(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }))}"><span class="dn">${Number(d.slice(8))}</span>${cell(d)}</button>`;
  }
  return h + '</div>';
}
function calNotices() {
  const st = S.settings; const out = []; const hid = {};
  S.schedule.forEach(c => { const co = courseById(c.course); if (co && Number(co.sem) !== Number(st.sem)) hid[co.sem] = (hid[co.sem] || 0) + 1; });
  Object.entries(hid).forEach(([sem, n]) => out.push(`<div class="notice">${n} jadwal kelas semester ${esc(sem)} tidak tampil karena semester aktif adalah ${esc(st.sem)}. ${btn('Aktifkan semester ' + esc(sem), 'set-sem', sem, 'sm')}</div>`));
  if (S.schedule.length && ((st.semStart && today() < st.semStart) || (st.semEnd && today() > st.semEnd))) out.push(`<div class="notice">Jadwal kelas hanya tampil di antara tanggal mulai dan akhir semester, dan hari ini di luar rentang itu. ${btn('Atur semester', 'sem-edit', null, 'sm')}</div>`);
  return out.join('');
}
ACT['set-sem'] = el => { S.settings.sem = Number(el.dataset.id); commit('settings'); render(); toast(`Semester aktif: ${S.settings.sem}`); };
function viewKalender() {
  const d = UI.calDate; const mode = UI.calMode;
  const label = mode === 'bulan' ? fmtMonth(d.slice(0, 7)) : mode === 'minggu' ? `${fmtDate(startOfWeek(d), { day: 'numeric', month: 'short' })} sampai ${fmtDate(addDays(startOfWeek(d), 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const filters = `<div class="chips">${Object.entries(TYPES).map(([k, [l, c]]) => `<button type="button" class="chip dot ${UI.calOff[k] ? 'off' : 'on'}" style="--c:${c}" aria-pressed="${!UI.calOff[k]}" ${A('cal-filter', k)}>${l}</button>`).join('')}</div>`;
  let body = '';
  const dayList = (x, withHead) => { const ev = eventsOn(x); return (withHead ? `<div class="sec" style="margin-top:12px">${esc(fmtDate(x, { weekday: 'long', day: 'numeric', month: 'long' }))}${x === today() ? ' · hari ini' : ''}</div>` : '') + (ev.length ? ev.map(e => eventRow(e)).join('') : `<p class="small mute" style="padding:6px 0">Tidak ada agenda.</p>`); };
  if (mode === 'bulan') {
    body = monthGrid(d.slice(0, 7), x => { const types = [...new Set(eventsOn(x).map(e => e.type))]; return types.length ? `<span class="dots">${types.slice(0, 5).map(t => `<i style="--c:${TYPES[t][1]}"></i>`).join('')}</span>` : ''; }, 'cal-pick', d) + `<div style="margin-top:8px">${dayList(d, true)}</div>`;
  } else if (mode === 'minggu') {
    body = Array.from({ length: 7 }, (_, i) => dayList(addDays(startOfWeek(d), i), true)).join('');
  } else body = dayList(d, false);
  return calNotices() + panel('Kalender gabungan', `<div class="stack"><div class="row between"><div class="chips">${[['hari', 'Hari'], ['minggu', 'Minggu'], ['bulan', 'Bulan']].map(([v, l]) => `<button type="button" class="chip ${mode === v ? 'on' : ''}" ${A('cal-mode', v)}>${l}</button>`).join('')}</div>
    <div class="row">${btn('‹', 'cal-nav', '-1', 'sm')}${btn('Hari ini', 'cal-nav', '0', 'sm')}${btn('›', 'cal-nav', '1', 'sm')}</div></div>
    <div class="num" style="font-size:16px">${esc(label)}</div>${filters}<div>${body}</div></div>`);
}
ACT['cal-mode'] = el => { UI.calMode = el.dataset.id; render(); };
ACT['cal-pick'] = el => { UI.calDate = el.dataset.id; render(); };
ACT['cal-filter'] = el => { UI.calOff[el.dataset.id] = !UI.calOff[el.dataset.id]; render(); };
ACT['cal-nav'] = el => {
  const n = Number(el.dataset.id); if (n === 0) { UI.calDate = today(); render(); return; }
  if (UI.calMode === 'bulan') UI.calDate = addMonthsISO(UI.calDate, n); else if (UI.calMode === 'minggu') UI.calDate = addDays(UI.calDate, 7 * n); else UI.calDate = addDays(UI.calDate, n);
  render();
};

/* ================= VIEW: Kuliah ================= */
function semToolbar() {
  const opts = [['aktif', `Semester aktif (${S.settings.sem})`], ...Array.from({ length: 14 }, (_, i) => [String(i + 1), `Semester ${i + 1}`]), ['all', 'Semua semester']];
  return `<div class="row">${selectBind('semF', UI.semF, opts, 'Filter semester')}${btn('Atur semester', 'sem-edit', null, 'sm')}</div>`;
}
function kuliahTugas() {
  const all = S.tasks.filter(t => inSemFilter(t.course)); const top = all.filter(t => !t.parent);
  const T = today(); const open = top.filter(t => !t.done).sort(byDue);
  const subsOf = id => all.filter(x => x.parent === id).sort(byDue);
  const groups = [['Terlambat', open.filter(isOverdue)], ['Minggu ini', open.filter(t => t.due && t.due >= T && t.due <= addDays(T, 7))], ['Nanti', open.filter(t => t.due && t.due > addDays(T, 7))], ['Tanpa tenggat', open.filter(t => !t.due)]];
  let h = '';
  groups.forEach(([n, l]) => { if (l.length) h += `<div class="sec">${n} (${l.length})</div>` + l.map(t => taskRow(t) + subsOf(t.id).map(s => taskRow(s, true)).join('')).join(''); });
  const done = top.filter(t => t.done).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  if (!h) h = empty('Belum ada tugas untuk filter ini.', btn('Tambah tugas', 'task-new', null, 'primary'));
  if (done.length) {
    h += `<div class="row" style="margin-top:14px">${btn(UI.showDone ? 'Sembunyikan yang selesai' : `Tampilkan selesai (${done.length})`, 'toggle-done', null, 'sm')}</div>`;
    if (UI.showDone) h += done.slice(0, 40).map(t => taskRow(t) + subsOf(t.id).map(s => taskRow(s, true)).join('')).join('');
  }
  return panel('Tugas dan ujian', h, btn('+ Tugas', 'task-new', null, 'sm primary'));
}
function kuliahMateri() {
  const courses = S.courses.filter(c => inSemFilter(c.id));
  let l = S.materials.filter(m => inSemFilter(m.course) && (!UI.mat.course || m.course === UI.mat.course));
  const q = UI.mat.q.trim().toLowerCase();
  if (q) l = l.filter(m => [m.title, m.note, ...(m.tags || [])].join(' ').toLowerCase().includes(q));
  l.sort((a, b) => (a.course || '').localeCompare(b.course || '') || (Number(a.meeting) || 0) - (Number(b.meeting) || 0));
  const filt = `<div class="row" style="margin-bottom:6px">${selectBind('mat:course', UI.mat.course, [['', 'Semua mata kuliah'], ...courses.map(c => [c.id, c.name])], 'Filter mata kuliah')}${searchBox('mat:q', UI.mat.q, 'Cari materi')}</div>`;
  const rows = l.map(m => { const c = courseById(m.course); const u = safeUrl(m.url); return `<div class="item"><div class="grow tap" ${A('mat-edit', m.id)} tabindex="0" role="button"><div class="t">${esc(m.title)}</div><div class="s">${[c ? esc(c.name) : '', m.meeting ? 'Pertemuan ' + esc(m.meeting) : '', cap(m.type || ''), ...(m.tags || []).map(x => '#' + esc(x))].filter(Boolean).join(' · ')}</div></div>${u ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer">Buka</a>` : ''}</div>`; }).join('');
  return panel('Materi', filt + (rows || empty('Belum ada materi. Simpan tautan slide, jurnal, atau catatan per mata kuliah.', btn('Tambah materi', 'mat-new', null, 'primary'))), btn('+ Materi', 'mat-new', null, 'sm primary'));
}
function kuliahMatkul() {
  const l = S.courses.filter(c => inSemFilter(c.id)).sort((a, b) => a.sem - b.sem || a.name.localeCompare(b.name));
  const sks = sum(l, c => c.sks);
  const rows = l.map(c => { const open = S.tasks.filter(t => t.course === c.id && !t.done).length; const mat = S.materials.filter(m => m.course === c.id).length;
    return `<div class="item"><div class="grow tap" ${A('course-edit', c.id)} tabindex="0" role="button"><div class="t">${esc(c.name)}</div><div class="s">Semester ${esc(c.sem)} · ${esc(c.sks || 0)} SKS${c.lecturer ? ' · ' + esc(c.lecturer) : ''}</div></div><div class="small mute" style="text-align:right">${open} tugas terbuka<br>${mat} materi</div></div>`; }).join('');
  return panel(`Mata kuliah${l.length ? ` · ${sks} SKS` : ''}`, rows || empty('Belum ada mata kuliah di filter ini.', btn('Tambah mata kuliah', 'course-new', null, 'primary')), btn('+ Mata kuliah', 'course-new', null, 'sm primary'));
}
function kuliahJadwal() {
  const st = S.settings;
  const by = DAYS.map((d, i) => [d, S.schedule.filter(c => Number(c.day) === i && courseById(c.course) && inSemFilter(c.course)).sort((a, b) => (a.start || '').localeCompare(b.start || ''))]);
  const body = by.map(([d, l]) => l.length ? `<div class="sec">${d}</div>` + l.map(c => { const co = courseById(c.course); return `<div class="item"><div class="tm small mute" style="width:92px;flex:none">${esc(c.start || '')} - ${esc(c.end || '')}</div><div class="grow tap" ${A('class-edit', c.id)} tabindex="0" role="button"><div class="t">${esc(co.name)}</div>${c.room ? `<div class="s">${esc(c.room)}</div>` : ''}</div></div>`; }).join('') : '').join('');
  const hol = [...S.holidays].sort((a, b) => a.start.localeCompare(b.start));
  return `<div class="stack">${panel('Jadwal mingguan', `<p class="small mute" style="margin-bottom:6px">Semester aktif: ${st.sem}${st.semStart ? ` · ${esc(fmtDate(st.semStart, { day: 'numeric', month: 'short', year: 'numeric' }))} sampai ${st.semEnd ? esc(fmtDate(st.semEnd, { day: 'numeric', month: 'short', year: 'numeric' })) : 'belum diatur'}` : ' · tanggal semester belum diatur'}</p>${body || empty('Belum ada jadwal kelas. Tambahkan mata kuliah dulu, lalu jadwalnya.', S.courses.length ? btn('Tambah jadwal', 'class-new', null, 'primary') : btn('Tambah mata kuliah', 'course-new', null, 'primary'))}`, btn('+ Jadwal', 'class-new', null, 'sm primary'))}
    ${panel('Hari libur', `<p class="small mute" style="margin-bottom:6px">Kelas otomatis dijeda di kalender selama libur.</p>` + (hol.length ? hol.map(h => `<div class="item"><div class="grow tap" ${A('hol-edit', h.id)} tabindex="0" role="button"><div class="t">${esc(h.name)}</div><div class="s">${esc(fmtDate(h.start, { day: 'numeric', month: 'short', year: 'numeric' }))}${h.end ? ' sampai ' + esc(fmtDate(h.end, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</div></div></div>`).join('') : empty('Belum ada hari libur.')), btn('+ Libur', 'hol-new', null, 'sm'))}</div>`;
}
function kuliahStat() {
  const all = S.tasks.filter(t => inSemFilter(t.course) && !t.parent);
  const done = all.filter(t => t.done); const withDue = done.filter(t => t.due && t.doneAt);
  const onTime = withDue.filter(t => t.doneAt <= t.due).length;
  const per = S.courses.filter(c => inSemFilter(c.id)).map(c => ({ c, open: all.filter(t => t.course === c.id && !t.done).length, tot: all.filter(t => t.course === c.id).length })).filter(x => x.tot).sort((a, b) => b.open - a.open);
  const mx = Math.max(1, ...per.map(x => x.tot));
  return panel('Statistik belajar', `<div class="stats"><div class="stat"><span class="v">${done.length}</span><span class="l">Tugas selesai</span></div>
    <div class="stat"><span class="v">${withDue.length ? pct(onTime, withDue.length) + '%' : '-'}</span><span class="l">Selesai tepat waktu</span></div>
    <div class="stat"><span class="v">${streakDays()}</span><span class="l">Hari tanpa tugas terlambat</span></div>
    <div class="stat"><span class="v">${all.filter(t => !t.done).length}</span><span class="l">Tugas terbuka</span></div></div>
    <div class="sec">Tugas per mata kuliah</div>${per.length ? `<div class="bars">${per.map(x => `<div class="bl"><span>${esc(x.c.name)}</span>${bar(pct(x.tot, mx))}<span class="small mute">${x.open} terbuka dari ${x.tot}</span></div>`).join('')}</div>` : empty('Belum ada data tugas.')}`);
}
function viewKuliah() {
  const tabs = [['tugas', 'Tugas'], ['materi', 'Materi'], ['matkul', 'Mata kuliah'], ['jadwal', 'Jadwal'], ['statistik', 'Statistik']];
  const f = { tugas: kuliahTugas, materi: kuliahMateri, matkul: kuliahMatkul, jadwal: kuliahJadwal, statistik: kuliahStat }[UI.sub.kuliah];
  return `<div class="row between">${subTabs('kuliah', tabs)}</div>${semToolbar()}${f()}`;
}
ACT['task-new'] = () => editTask(null);
ACT['mat-new'] = () => editMaterial(null);
ACT['class-new'] = () => editClass(null);
ACT['hol-new'] = () => editHoliday(null);

/* ================= VIEW: Riset ================= */
function risetProgres() {
  const l = [...S.milestones].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const rows = l.map(m => { const late = m.due && m.due < today() && (m.pct || 0) < 100; return `<div class="m"><div class="row between"><span class="tap" style="font-weight:600" ${A('ms-edit', m.id)} tabindex="0" role="button">${esc(m.title)}</span><span class="small ${late ? 'neg' : 'mute'}">${m.due ? esc(fmtDate(m.due, { day: 'numeric', month: 'short', year: 'numeric' })) + ' · ' + rel(m.due) : 'tanpa tenggat'}</span></div>
    ${bar(m.pct || 0, late ? 'bad' : '')}<div class="row between"><input type="range" min="0" max="100" step="5" value="${Number(m.pct) || 0}" data-ms="${esc(m.id)}" aria-label="Progres ${esc(m.title)}" style="max-width:260px"><b class="small">${Number(m.pct) || 0}%</b></div>${m.note ? `<div class="small mute">${esc(m.note)}</div>` : ''}</div>`; }).join('');
  return panel('Progres dan target', rows ? `<div class="tl">${rows}</div>` : empty('Belum ada target. Pecah riset jadi milestone, misalnya sempro, pengambilan data, olah data, bab hasil, sidang.', btn('Tambah target', 'ms-new', null, 'primary')), btn('+ Target', 'ms-new', null, 'sm primary'));
}
function risetKebutuhan() {
  let l = S.needs; if (UI.needF) l = l.filter(n => n.status === UI.needF);
  const rows = l.map(n => `<div class="item"><div class="grow tap" ${A('need-edit', n.id)} tabindex="0" role="button"><div class="t">${esc(n.title)}</div><div class="s">${esc(cap(n.kind || ''))}${n.note ? ' · ' + esc(n.note) : ''}</div></div><button type="button" class="badge ${NEED_ST[n.status]?.[1] || ''}" style="cursor:pointer" ${A('need-cycle', n.id)} aria-label="Ubah status, sekarang ${esc(NEED_ST[n.status]?.[0] || '')}">${esc(NEED_ST[n.status]?.[0] || n.status)}</button></div>`).join('');
  return panel('Kebutuhan riset', chipRow([['', 'Semua'], ...Object.entries(NEED_ST).map(([k, v]) => [k, v[0]])], UI.needF, 'need-filter') + (rows || empty('Belum ada kebutuhan yang dicatat. Catat data, alat, izin, atau akses yang masih dicari.', btn('Tambah kebutuhan', 'need-new', null, 'primary'))), btn('+ Kebutuhan', 'need-new', null, 'sm primary'));
}
function risetIde() {
  let l = S.ideas; if (UI.ideaF) l = l.filter(n => n.status === UI.ideaF);
  const rows = l.map(n => `<div class="item"><div class="grow tap" ${A('idea-edit', n.id)} tabindex="0" role="button"><div class="t">${esc(n.title)}</div><div class="s">${[n.origin ? 'Asal: ' + esc(n.origin) : '', esc(n.note || '')].filter(Boolean).join(' · ')}</div></div><button type="button" class="badge ${IDEA_ST[n.status]?.[1] || ''}" style="cursor:pointer" ${A('idea-cycle', n.id)} aria-label="Ubah status, sekarang ${esc(IDEA_ST[n.status]?.[0] || '')}">${esc(IDEA_ST[n.status]?.[0] || n.status)}</button></div>`).join('');
  return panel('Ide riset lanjutan', chipRow([['', 'Semua'], ...Object.entries(IDEA_ST).map(([k, v]) => [k, v[0]])], UI.ideaF, 'idea-filter') + (rows || empty('Parkir ide di sini supaya tidak hilang. Tulis juga dari mana ide itu muncul.', btn('Tambah ide', 'idea-new', null, 'primary'))), btn('+ Ide', 'idea-new', null, 'sm primary'));
}
function risetLit() {
  const cols = [...new Set(S.literature.map(x => x.col).filter(Boolean))].sort();
  let l = S.literature.filter(x => (!UI.lit.col || x.col === UI.lit.col) && (!UI.lit.st || x.st === UI.lit.st) && (!UI.lit.inc || (UI.lit.inc === 'none' ? !x.inc : x.inc === UI.lit.inc)));
  const q = UI.lit.q.trim().toLowerCase();
  if (q) l = l.filter(x => [x.title, x.authors, x.claim, x.note, x.venue, ...(x.tags || [])].join(' ').toLowerCase().includes(q));
  l.sort((a, b) => String(a.authors).localeCompare(String(b.authors), 'id'));
  const filt = `<div class="row" style="margin-bottom:6px">${selectBind('lit:col', UI.lit.col, [['', 'Semua koleksi'], ...cols.map(c => [c, c])], 'Filter koleksi')}${selectBind('lit:st', UI.lit.st, [['', 'Semua status'], ...Object.entries(LIT_ST).map(([k, v]) => [k, v[0]])], 'Filter status verifikasi')}${selectBind('lit:inc', UI.lit.inc, [['', 'Semua keputusan'], ['pakai', 'Pakai'], ['ragu', 'Ragu'], ['tidak', 'Tidak dipakai'], ['none', 'Belum diputuskan']], 'Filter keputusan')}${searchBox('lit:q', UI.lit.q, 'Cari literatur')}</div>`;
  const rows = l.map(x => {
    const doi = x.doi ? `<a href="https://doi.org/${esc(encodeURI(x.doi))}" target="_blank" rel="noopener noreferrer">${esc(x.doi)}</a>` : '';
    const links = [...(x.ideas || []).map(i => S.ideas.find(y => y.id === i)?.title), ...(x.ms || []).map(i => S.milestones.find(y => y.id === i)?.title)].filter(Boolean);
    return `<div class="item" style="align-items:flex-start"><div class="grow"><div class="tap" ${A('lit-edit', x.id)} tabindex="0" role="button"><div class="t">${esc(x.title)}</div></div>
      <div class="s">${esc(x.authors || '(penulis belum diisi)')} (${esc(x.year || 't.t.')})${x.venue ? ' · ' + esc(x.venue) : ''}${doi ? ' · ' + doi : ''}</div>
      ${x.claim ? `<div class="small" style="margin-top:3px">${esc(x.claim)}</div>` : ''}
      <div class="row" style="margin-top:5px">${badge(LIT_ST[x.st]?.[0] || 'Belum dicek', LIT_ST[x.st]?.[1] || '')}${x.inc ? badge({ pakai: 'Pakai', ragu: 'Ragu', tidak: 'Tidak dipakai' }[x.inc], x.inc === 'pakai' ? 'good' : x.inc === 'ragu' ? 'warn' : '') : ''}${x.col ? badge(x.col, 'acc') : ''}${(x.tags || []).map(t => badge('#' + t)).join('')}</div>
      ${links.length ? `<div class="tiny mute" style="margin-top:3px">Terkait: ${links.map(esc).join(', ')}</div>` : ''}${x.note ? `<div class="tiny mute" style="margin-top:3px">Catatan: ${esc(x.note)}</div>` : ''}</div></div>`;
  }).join('');
  const nv = S.literature.filter(x => x.inc === 'pakai' && x.st === 'belum').length;
  return panel(`Literatur${S.literature.length ? ` (${S.literature.length})` : ''}`, (nv ? `<div class="notice" style="margin-bottom:8px">${nv} literatur berkeputusan Pakai tapi belum diverifikasi. Cek DOI dan isinya sebelum dikutip.</div>` : '') + filt + (rows || empty('Belum ada literatur. Catat DOI dan klaim yang didukung supaya sitasi mudah dilacak.', btn('Tambah literatur', 'lit-new', null, 'primary'))) + (S.literature.length ? `<div class="row" style="margin-top:10px">${btn('Salin daftar pustaka', 'lit-copy', null, 'sm')}<span class="tiny mute">Hanya yang berstatus terverifikasi dan berkeputusan Pakai. Format sederhana, cek ulang dengan gaya yang dipakai kampusmu.</span></div>` : ''), btn('+ Literatur', 'lit-new', null, 'sm primary'));
}
function risetBim() {
  const l = [...S.bimbingan].sort((a, b) => b.date.localeCompare(a.date));
  const rows = l.map(b => `<div class="item" style="align-items:flex-start"><button type="button" class="check ${b.status === 'done' ? 'on' : ''}" ${A('bim-toggle', b.id)} aria-label="Ubah tindak lanjut">${b.status === 'done' ? '✓' : ''}</button><div class="grow tap ${b.status === 'done' ? 'mute' : ''}" ${A('bim-edit', b.id)} tabindex="0" role="button"><div class="t">${esc(fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}${b.with ? ' · ' + esc(b.with) : ''}</div><div class="s" style="white-space:pre-wrap">${esc(b.points)}</div>${b.nextDate ? `<div class="s">Berikutnya: ${esc(fmtDate(b.nextDate))}</div>` : ''}</div></div>`).join('');
  return panel('Log bimbingan', rows || empty('Catat poin revisi setiap bimbingan supaya tidak tercecer di chat.', btn('Tambah catatan', 'bim-new', null, 'primary')), btn('+ Bimbingan', 'bim-new', null, 'sm primary'));
}
function viewRiset() {
  const tabs = [['progres', 'Progres'], ['kebutuhan', 'Kebutuhan'], ['ide', 'Ide lanjutan'], ['literatur', 'Literatur'], ['bimbingan', 'Bimbingan']];
  const f = { progres: risetProgres, kebutuhan: risetKebutuhan, ide: risetIde, literatur: risetLit, bimbingan: risetBim }[UI.sub.riset];
  return `${subTabs('riset', tabs)}${f()}`;
}
ACT['ms-new'] = () => editMilestone(null);
ACT['need-new'] = () => editNeed(null);
ACT['idea-new'] = () => editIdea(null);
ACT['lit-new'] = () => editLit(null);
ACT['bim-new'] = () => editBim(null);
ACT['need-filter'] = el => { UI.needF = el.dataset.id; render(); };
ACT['idea-filter'] = el => { UI.ideaF = el.dataset.id; render(); };

/* ================= KEUANGAN: formulir ================= */
function editAccount(id, prefill) {
  editEntity('accounts', id, {
    title: 'akun', defaults: { type: 'bank', open: 0 },
    fields: [
      { k: 'name', label: 'Nama akun', req: true, wide: true, hint: 'Nama saja, misalnya BCA atau Dana. Jangan tulis nomor rekening, nomor kartu, atau PIN.' },
      { k: 'type', label: 'Jenis', type: 'select', opts: ACC_TYPES },
      { k: 'open', label: 'Saldo awal', type: 'money' },
      { k: 'alias', label: 'Nama lain', wide: true, hint: 'Supaya dikenali asisten, pisahkan dengan koma. Misalnya: gopay, gojek' },
      { k: 'archived', label: 'Arsipkan akun (sembunyikan dari pilihan)', type: 'check' }
    ],
    map: v => ({ ...v, open: Number(v.open) || 0 }),
    check: (v, ex) => S.accounts.some(a => a.id !== ex?.id && a.name.toLowerCase() === String(v.name).toLowerCase()) ? 'Nama akun sudah dipakai' : '',
    canDelete: ex => S.transactions.some(t => t.acc === ex.id || t.to === ex.id) ? 'Akun ini punya transaksi. Arsipkan saja supaya riwayat tetap utuh.' : ''
  }, prefill);
}
function reconcile(id) {
  const a = accById(id); if (!a) return; const rec = balances()[id];
  openForm({
    title: `Cocokkan saldo ${a.name}`, values: { actual: '' },
    fields: [
      { k: 'i', type: 'info', html: `Saldo menurut catatan: <b>${rp(rec)}</b>. Isi saldo yang tampil di aplikasi ${esc(a.name)} sekarang.` },
      { k: 'actual', label: 'Saldo di aplikasi asli', type: 'money', req: true, wide: true }
    ], saveLabel: 'Bandingkan',
    onSave(v) {
      const diff = Number(v.actual) - rec;
      if (Math.abs(diff) < 0.5) { toast('Saldo cocok'); return; }
      if (confirm(`Selisih ${rp(diff)} (${diff > 0 ? 'saldo asli lebih besar' : 'catatan lebih besar'}).\n\nBuat transaksi penyesuaian sebesar selisih ini?\nPilih Batal kalau mau menelusuri transaksi yang terlewat dulu.`)) {
        saveTx({ type: diff > 0 ? 'in' : 'out', date: today(), amount: Math.abs(diff), acc: id, cat: diff > 0 ? 'i_lain' : 'o_lain', sub: '', note: 'Penyesuaian saldo' });
        toast('Penyesuaian dicatat'); render();
      } else toast(`Selisih ${rp(diff)} belum disesuaikan`);
    }
  });
}
function editTx(id, prefill, then) {
  const ex = id ? S.transactions.find(t => t.id === id) : null; if (id && !ex) return;
  if (!S.accounts.length) { toast('Tambah akun dulu'); UI.tab = 'keuangan'; UI.sub.keu = 'akun'; render(); return; }
  const last = accById(S.settings.lastAcc);
  const base = ex ? { ...ex } : { type: 'out', date: today(), acc: last && !last.archived ? last.id : (activeAccs()[0]?.id || ''), cat: 'o_lain', sub: '', fee: '', ...(prefill || {}) };
  const accOpts = cur => [{ v: '', l: '(pilih akun)' }, ...S.accounts.filter(a => !a.archived || a.id === cur).map(a => ({ v: a.id, l: a.name }))];
  openForm({
    title: (ex ? 'Ubah' : 'Tambah') + ' transaksi', values: base,
    fields: v => {
      const kind = v.type === 'in' ? 'in' : 'out'; const cats = visCats(kind); const cur = catById(v.cat);
      if (cur && cur.kind === kind && !cats.find(c => c.id === cur.id)) cats.push(cur);
      const subs = cur && cur.kind === kind ? (cur.subs || []) : [];
      return [
        { k: 'type', label: 'Jenis', type: 'select', reload: true, opts: [{ v: 'out', l: 'Pengeluaran' }, { v: 'in', l: 'Pemasukan' }, { v: 'tf', l: 'Transfer antar akun' }] },
        { k: 'date', label: 'Tanggal', type: 'date', req: true },
        { k: 'amount', label: 'Nominal', type: 'money', req: true, min: 0 },
        { k: 'acc', label: v.type === 'tf' ? 'Dari akun' : v.type === 'in' ? 'Masuk ke akun' : 'Dibayar dari akun', type: 'select', req: true, opts: accOpts(v.acc) },
        { k: 'to', label: 'Ke akun', type: 'select', req: true, opts: accOpts(v.to), show: x => x.type === 'tf' },
        { k: 'cat', label: 'Kategori', type: 'select', reload: true, opts: cats.map(c => ({ v: c.id, l: `${c.icon} ${c.name}` })), show: x => x.type !== 'tf' },
        { k: 'sub', label: 'Sub-kategori', type: 'select', opts: [{ v: '', l: '(tanpa)' }, ...subs.map(s => ({ v: s, l: s }))], show: x => x.type !== 'tf' && subs.length > 0 },
        { k: 'fee', label: 'Biaya admin (opsional)', type: 'money', min: 0, hint: 'Dicatat terpisah sebagai pengeluaran', show: x => x.type === 'tf' && !ex },
        { k: 'note', label: 'Catatan', wide: true }
      ];
    },
    onReload(v) {
      const kind = v.type === 'in' ? 'in' : 'out'; const c = catById(v.cat);
      if (v.type !== 'tf' && (!c || c.kind !== kind)) v.cat = catLain(kind)?.id || '';
      const c2 = catById(v.cat); if (!c2 || !(c2.subs || []).includes(v.sub)) v.sub = '';
    },
    onSave(v) {
      const amount = Number(v.amount);
      if (!(amount > 0)) { toast('Nominal harus lebih dari nol'); return false; }
      if (!v.acc || !accById(v.acc)) { toast('Pilih akun'); return false; }
      if (v.type === 'tf') { if (!v.to || !accById(v.to)) { toast('Pilih akun tujuan'); return false; } if (v.to === v.acc) { toast('Akun asal dan tujuan tidak boleh sama'); return false; } }
      const tx = { type: v.type, date: v.date, amount, acc: v.acc, note: v.note || '' };
      if (v.type === 'tf') tx.to = v.to; else { tx.cat = v.cat; tx.sub = v.sub || ''; }
      if (ex) { delete ex.to; delete ex.cat; delete ex.sub; delete ex.fee; Object.assign(ex, tx); commit('transactions'); S.settings.lastAcc = v.type === 'tf' ? v.to : v.acc; commit('settings'); }
      else saveTx(tx, v.fee);
      if (then) then();
      render(); toast('Tersimpan');
    },
    onDelete: ex ? () => deleteTx(ex.id) : null
  });
}
function deleteTx(id) {
  const t = S.transactions.find(x => x.id === id); if (!t) return;
  S.transactions = S.transactions.filter(x => x.id !== id && !(t.group && x.group === t.group));
  commit('transactions'); render(); toast(t.group ? 'Transaksi dan biaya adminnya dihapus' : 'Dihapus');
}
function editInv(id) {
  editEntity('investments', id, {
    title: 'investasi', defaults: { kind: 'reksa dana', cost: 0, value: 0 },
    fields: [
      { k: 'name', label: 'Nama instrumen', req: true, wide: true },
      { k: 'kind', label: 'Jenis', type: 'select', opts: ['reksa dana', 'saham', 'emas', 'obligasi atau SBN', 'kripto', 'deposito', 'lainnya'].map(v => ({ v, l: cap(v) })) },
      { k: 'platform', label: 'Platform' },
      { k: 'cost', label: 'Modal (total yang sudah dimasukkan)', type: 'money', min: 0 },
      { k: 'value', label: 'Nilai sekarang', type: 'money', min: 0 },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ],
    map: (v, ex) => ({ ...v, cost: Number(v.cost) || 0, value: Number(v.value) || 0, updated: (ex && Number(ex.value) === Number(v.value) && ex.updated) ? ex.updated : today() })
  });
}
function editBudget(id) {
  editEntity('budgets', id, {
    title: 'anggaran', defaults: { cat: visCats('out').find(c => !S.budgets.some(b => b.cat === c.id))?.id || 'o_makan' },
    fields: [
      { k: 'cat', label: 'Kategori', type: 'select', wide: true, opts: visCats('out').map(c => ({ v: c.id, l: `${c.icon} ${c.name}` })) },
      { k: 'limit', label: 'Batas per bulan', type: 'money', req: true, min: 0, wide: true }
    ],
    map: v => ({ ...v, limit: Number(v.limit) || 0 }),
    check: (v, ex) => S.budgets.some(b => b.id !== ex?.id && b.cat === v.cat) ? 'Kategori ini sudah punya anggaran' : ''
  });
}
function editGoal(id) {
  editEntity('goals', id, {
    title: 'target tabungan', defaults: { saved: 0 },
    fields: [
      { k: 'name', label: 'Nama target', req: true, wide: true, hint: 'Misalnya: dana darurat, laptop baru' },
      { k: 'target', label: 'Target nominal', type: 'money', req: true, min: 0 },
      { k: 'saved', label: 'Sudah terkumpul', type: 'money', min: 0 },
      { k: 'deadline', label: 'Tenggat (opsional)', type: 'date' },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ], map: v => ({ ...v, target: Number(v.target) || 0, saved: Number(v.saved) || 0 })
  });
}
function editTrue(id) {
  editEntity('trueExp', id, {
    title: 'biaya sejati', defaults: { saved: 0, done: false },
    fields: [
      { k: 'name', label: 'Nama biaya', req: true, wide: true, hint: 'Pengeluaran besar yang datangnya jarang: UKT, perpanjangan software, servis motor' },
      { k: 'amount', label: 'Perkiraan nominal', type: 'money', req: true, min: 0 },
      { k: 'due', label: 'Jatuh tempo', type: 'date', req: true },
      { k: 'saved', label: 'Sudah disisihkan', type: 'money', min: 0 },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true },
      { k: 'done', label: 'Sudah dibayar', type: 'check' }
    ], map: v => ({ ...v, amount: Number(v.amount) || 0, saved: Number(v.saved) || 0 })
  });
}
function editDebt(id) {
  editEntity('debts', id, {
    title: 'utang atau piutang', defaults: { dir: 'utang', paid: 0, date: today() },
    fields: [
      { k: 'dir', label: 'Jenis', type: 'select', wide: true, opts: [{ v: 'utang', l: 'Utang: saya berutang ke orang lain' }, { v: 'piutang', l: 'Piutang: orang lain berutang ke saya' }] },
      { k: 'person', label: 'Nama orang', req: true },
      { k: 'amount', label: 'Nominal', type: 'money', req: true, min: 0 },
      { k: 'paid', label: 'Sudah dibayar', type: 'money', min: 0 },
      { k: 'date', label: 'Tanggal', type: 'date' },
      { k: 'due', label: 'Jatuh tempo', type: 'date' },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true }
    ], map: v => ({ ...v, amount: Number(v.amount) || 0, paid: Number(v.paid) || 0 })
  });
}
function editBill(id) {
  editEntity('bills', id, {
    title: 'tagihan berulang', defaults: { freq: 'bulanan', cat: 'o_langganan', acc: S.settings.lastAcc || '', active: true, nextDue: today() },
    fields: [
      { k: 'name', label: 'Nama tagihan', req: true, wide: true },
      { k: 'amount', label: 'Nominal', type: 'money', req: true, min: 0 },
      { k: 'freq', label: 'Berulang', type: 'select', opts: [{ v: 'bulanan', l: 'Tiap bulan' }, { v: 'tahunan', l: 'Tiap tahun' }, { v: 'sekali', l: 'Sekali saja' }] },
      { k: 'nextDue', label: 'Jatuh tempo berikutnya', type: 'date', req: true },
      { k: 'cat', label: 'Kategori', type: 'select', opts: visCats('out').map(c => ({ v: c.id, l: `${c.icon} ${c.name}` })) },
      { k: 'acc', label: 'Dibayar dari akun', type: 'select', wide: true, opts: [{ v: '', l: '(tanya saat membayar)' }, ...activeAccs().map(a => ({ v: a.id, l: a.name }))] },
      { k: 'note', label: 'Catatan', type: 'textarea', wide: true },
      { k: 'active', label: 'Aktif', type: 'check' }
    ], map: v => ({ ...v, amount: Number(v.amount) || 0 })
  });
}
function editCat(id) {
  editEntity('categories', id, {
    title: 'kategori', defaults: { kind: UI.catKind, icon: '📦', color: '#5b6a75', keywords: [], subs: [], hidden: false },
    fields: [
      { k: 'name', label: 'Nama kategori', req: true, wide: true },
      { k: 'icon', label: 'Ikon', type: 'emoji', wide: true },
      { k: 'color', label: 'Warna', type: 'color' },
      { k: 'hidden', label: 'Sembunyikan dari pilihan', type: 'check' },
      { k: 'keywords', label: 'Kata kunci untuk asisten', type: 'tags', wide: true, hint: 'Kalau kata ini muncul di perintah, transaksi masuk ke kategori ini. Misalnya: kopi, jajan, sarapan' },
      { k: 'subs', label: 'Sub-kategori', type: 'tags', wide: true, hint: 'Opsional. Misalnya untuk Transportasi: bensin, ojol, parkir' }
    ],
    map: (v, ex) => ({ ...v, keywords: (v.keywords || []).map(s => s.toLowerCase()), icon: v.icon || '📦', color: v.color || '#5b6a75',
      order: ex ? ex.order : Math.max(-1, ...S.categories.filter(c => c.kind === v.kind).map(c => c.order || 0)) + 1 }),
    check: (v, ex) => S.categories.some(c => c.kind === v.kind && c.id !== ex?.id && c.name.toLowerCase() === String(v.name).toLowerCase()) ? 'Nama kategori sudah dipakai' : '',
    canDelete: ex => ex.builtin ? 'Kategori bawaan tidak bisa dihapus, tapi bisa disembunyikan.' : (S.transactions.some(t => t.cat === ex.id) ? 'Kategori ini sudah punya riwayat transaksi. Sembunyikan atau gabungkan saja.' : '')
  });
}
function mergeCat(id) {
  const src = catById(id); if (!src) return;
  const targets = S.categories.filter(c => c.kind === src.kind && c.id !== id);
  openForm({
    title: `Gabungkan "${src.name}"`, values: { to: targets[0]?.id || '' },
    fields: [
      { k: 'to', label: 'Gabungkan ke kategori', type: 'select', req: true, wide: true, opts: targets.map(c => ({ v: c.id, l: `${c.icon} ${c.name}` })) },
      { k: 'i', type: 'info', html: 'Semua transaksi, anggaran, dan tagihan berkategori ini dipindahkan ke kategori tujuan. Kategori ini lalu disembunyikan (atau dihapus kalau buatanmu sendiri).' }
    ], saveLabel: 'Gabungkan',
    onSave(v) {
      S.transactions.forEach(t => { if (t.cat === id) { t.cat = v.to; t.sub = ''; } }); commit('transactions');
      const had = S.budgets.some(b => b.cat === v.to);
      S.budgets = S.budgets.filter(b => !(b.cat === id && had)); S.budgets.forEach(b => { if (b.cat === id) b.cat = v.to; }); commit('budgets');
      S.bills.forEach(b => { if (b.cat === id) b.cat = v.to; }); commit('bills');
      if (src.builtin) src.hidden = true; else S.categories = S.categories.filter(c => c.id !== id);
      commit('categories'); render(); toast('Kategori digabungkan');
    }
  });
}
ACT['acc-edit'] = el => editAccount(el.dataset.id);
ACT['acc-new'] = () => editAccount(null);
ACT['acc-preset'] = el => { const [name, type] = el.dataset.id.split('|'); const a = { id: uid(), name, type, alias: '', open: 0 }; S.accounts.push(a); commit('accounts'); render(); editAccount(a.id); };
ACT['acc-reconcile'] = el => reconcile(el.dataset.id);
ACT['tx-edit'] = el => editTx(el.dataset.id);
ACT['tx-new'] = () => editTx(null);
ACT['inv-edit'] = el => editInv(el.dataset.id);
ACT['inv-new'] = () => editInv(null);
ACT['bud-edit'] = el => editBudget(el.dataset.id);
ACT['bud-new'] = () => editBudget(null);
ACT['goal-edit'] = el => editGoal(el.dataset.id);
ACT['goal-new'] = () => editGoal(null);
ACT['true-edit'] = el => editTrue(el.dataset.id);
ACT['true-new'] = () => editTrue(null);
ACT['debt-edit'] = el => editDebt(el.dataset.id);
ACT['debt-new'] = () => editDebt(null);
ACT['bill-edit'] = el => editBill(el.dataset.id);
ACT['bill-new'] = () => editBill(null);
ACT['cat-edit'] = el => editCat(el.dataset.id);
ACT['cat-new'] = () => editCat(null);
ACT['cat-merge'] = el => mergeCat(el.dataset.id);
ACT['cat-kind'] = el => { UI.catKind = el.dataset.id; render(); };
ACT['cat-move'] = el => {
  const [id, dir] = el.dataset.id.split('|'); const l = S.categories.filter(c => c.kind === UI.catKind).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  l.forEach((c, i) => c.order = i); const i = l.findIndex(c => c.id === id); const j = i + Number(dir); if (j < 0 || j >= l.length) return;
  [l[i].order, l[j].order] = [l[j].order, l[i].order]; commit('categories'); render();
};
ACT['cat-hide'] = el => { const c = catById(el.dataset.id); if (!c) return; c.hidden = !c.hidden; commit('categories'); render(); };
ACT['month-nav'] = el => { UI.keuMonth = addMonths(UI.keuMonth, Number(el.dataset.id)); UI.txDay = ''; render(); };
ACT['month-now'] = () => { UI.keuMonth = today().slice(0, 7); render(); };
ACT['tx-view'] = el => { UI.txView = el.dataset.id; render(); };
ACT['tx-day'] = el => { UI.txDay = UI.txDay === el.dataset.id ? '' : el.dataset.id; render(); };
function moneyForm(title, label, max, cb, extra = []) {
  openForm({ title, values: { amount: '' }, saveLabel: 'Catat', fields: [{ k: 'amount', label, type: 'money', req: true, min: 0, wide: true, hint: max != null ? `Maksimal ${rp(max)}` : '' }, ...extra],
    onSave(v) { const n = Number(v.amount); if (!(n > 0)) { toast('Nominal harus lebih dari nol'); return false; } if (max != null && n > max + 0.5) { toast('Melebihi batas'); return false; } return cb(n, v); } });
}
ACT['goal-add'] = el => { const g = S.goals.find(x => x.id === el.dataset.id); if (!g) return; moneyForm(`Setor ke ${g.name}`, 'Nominal setoran', null, n => { g.saved = (Number(g.saved) || 0) + n; commit('goals'); render(); toast('Setoran dicatat'); }); };
ACT['true-add'] = el => { const g = S.trueExp.find(x => x.id === el.dataset.id); if (!g) return; moneyForm(`Sisihkan untuk ${g.name}`, 'Nominal yang disisihkan', null, n => { g.saved = (Number(g.saved) || 0) + n; commit('trueExp'); render(); toast('Dicatat'); }); };
ACT['debt-pay'] = el => {
  const d = S.debts.find(x => x.id === el.dataset.id); if (!d) return; const left = d.amount - d.paid; const isU = d.dir === 'utang';
  moneyForm(isU ? `Bayar utang ke ${d.person}` : `Terima dari ${d.person}`, 'Nominal', left, (n, v) => {
    if (v.acc && !accById(v.acc)) { toast('Akun tidak ditemukan'); return false; }
    d.paid = (Number(d.paid) || 0) + n; commit('debts');
    if (v.acc) saveTx({ type: isU ? 'out' : 'in', date: today(), amount: n, acc: v.acc, cat: isU ? 'o_lain' : 'i_lain', sub: '', note: (isU ? 'Bayar utang ke ' : 'Piutang dari ') + d.person });
    render(); toast('Dicatat');
  }, [{ k: 'acc', label: 'Catat juga sebagai transaksi di akun', type: 'select', wide: true, opts: [{ v: '', l: '(tidak dicatat sebagai transaksi)' }, ...activeAccs().map(a => ({ v: a.id, l: a.name }))] }]);
};
function advanceBill(b) { if (b.freq === 'sekali') b.active = false; else b.nextDue = nextBillDate(b); commit('bills'); }
ACT['bill-pay'] = el => {
  const b = S.bills.find(x => x.id === el.dataset.id); if (!b) return;
  if (!b.acc || !accById(b.acc)) { editTx(null, { type: 'out', amount: b.amount, cat: b.cat || 'o_lain', note: b.name, date: today() }, () => advanceBill(b)); return; }
  saveTx({ type: 'out', date: today(), amount: b.amount, acc: b.acc, cat: b.cat || 'o_lain', sub: '', note: b.name });
  advanceBill(b); render(); toast(`${b.name} dibayar dan dicatat`);
};

/* ================= VIEW: Keuangan ================= */
function txRow(t) {
  const isTf = t.type === 'tf'; const c = catById(t.cat);
  const title = t.note || (isTf ? 'Transfer' : catName(t.cat));
  const sub = isTf ? `${esc(accName(t.acc))} → ${esc(accName(t.to))}` : `${esc(catName(t.cat))}${t.sub ? ' › ' + esc(t.sub) : ''} · ${esc(accName(t.acc))}`;
  const amt = isTf ? `<b>${rp(t.amount)}</b>` : t.type === 'in' ? `<b class="pos">+${rp(t.amount)}</b>` : `<b class="neg">-${rp(t.amount)}</b>`;
  const lead = isTf ? '<span class="cat" style="--c:#7d8590">⇄</span>' : `<span class="cat" style="--c:${esc(c?.color || '#8c9199')}">${esc(c?.icon || '📦')}</span>`;
  return `<div class="item">${lead}<div class="grow tap" ${A('tx-edit', t.id)} tabindex="0" role="button"><div class="t">${esc(title)}</div><div class="s">${sub}</div></div>${amt}</div>`;
}
function monthBar() {
  return `<div class="row between"><div class="row">${btn('‹', 'month-nav', '-1', 'sm')}<b style="min-width:130px;text-align:center">${esc(fmtMonth(UI.keuMonth))}</b>${btn('›', 'month-nav', '1', 'sm')}</div>${btn('Bulan ini', 'month-now', null, 'sm')}</div>`;
}
function chart6(ym) {
  const ms = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5)); const data = ms.map(m => ({ m, ...monthTotals(m) }));
  const mx = Math.max(1, ...data.map(d => Math.max(d.in, d.out))); const W = 360, H = 120, bw = 16, gap = (W - 6 * (2 * bw + 2)) / 7;
  let s = `<svg viewBox="0 0 ${W} ${H + 22}" width="100%" role="img" aria-label="Pemasukan dan pengeluaran enam bulan terakhir">`;
  data.forEach((d, i) => {
    const x = gap + (2 * bw + 2 + gap) * i; const hi = Math.round(d.in / mx * H), ho = Math.round(d.out / mx * H);
    s += `<rect x="${x}" y="${H - hi}" width="${bw}" height="${hi}" rx="3" style="fill:var(--good)"/><rect x="${x + bw + 2}" y="${H - ho}" width="${bw}" height="${ho}" rx="3" style="fill:var(--bad)"/><text x="${x + bw}" y="${H + 16}" text-anchor="middle" font-size="11" style="fill:var(--mute)">${esc(new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(parseISO(d.m + '-01')))}</text>`;
  });
  return s + '</svg>';
}
function keuRingkasan() {
  const ym = UI.keuMonth; const mt = monthTotals(ym); const b = balances(); const accs = activeAccs(); const inv = totalInvest();
  const tot = sum(accs, a => b[a.id]); const by = Object.entries(spentByCat(ym)).sort((a, c) => c[1] - a[1]); const mx = by[0]?.[1] || 1;
  return `<div class="stack">${monthBar()}
    ${panel('Posisi keuangan', `<div class="stats"><div class="stat"><span class="v">${rp(tot)}</span><span class="l">Saldo semua akun</span></div><div class="stat"><span class="v">${rp(inv.value)}</span><span class="l">Nilai investasi</span></div><div class="stat"><span class="v">${rp(tot + inv.value)}</span><span class="l">Kekayaan bersih</span></div></div>`)}
    ${panel('Arus kas bulan ini', `<div class="stats"><div class="stat"><span class="v pos">${rp(mt.in)}</span><span class="l">Pemasukan</span></div><div class="stat"><span class="v neg">${rp(mt.out)}</span><span class="l">Pengeluaran</span></div><div class="stat"><span class="v ${mt.in - mt.out >= 0 ? 'pos' : 'neg'}">${rp(mt.in - mt.out)}</span><span class="l">Selisih</span></div></div>`)}
    <div class="cols">${panel('Enam bulan terakhir', chart6(ym) + '<div class="row small mute"><span class="pos">■</span> Pemasukan <span class="neg">■</span> Pengeluaran</div>')}
    ${panel('Pengeluaran per kategori', by.length ? `<div class="bars">${by.slice(0, 10).map(([c, v]) => `<div class="bl"><span>${esc(catById(c)?.icon || '')} ${esc(catName(c))}</span>${bar(pct(v, mx))}<span class="small">${rp(v)}</span></div>`).join('')}</div>` : empty('Belum ada pengeluaran bulan ini.'))}</div></div>`;
}
function keuTransaksi() {
  const ym = UI.keuMonth; let l = txIn(ym);
  const f = UI.tx; if (f.acc) l = l.filter(t => t.acc === f.acc || t.to === f.acc); if (f.cat) l = l.filter(t => t.cat === f.cat);
  const q = f.q.trim().toLowerCase(); if (q) l = l.filter(t => [t.note, catName(t.cat), t.sub, accName(t.acc)].join(' ').toLowerCase().includes(q));
  const filt = `<div class="row">${selectBind('tx:acc', f.acc, [['', 'Semua akun'], ...S.accounts.map(a => [a.id, a.name])], 'Filter akun')}${selectBind('tx:cat', f.cat, [['', 'Semua kategori'], ...S.categories.filter(c => c.kind === 'out' || c.kind === 'in').map(c => [c.id, c.name])], 'Filter kategori')}${searchBox('tx:q', f.q, 'Cari transaksi')}</div>`;
  const toggle = chipRow([['daftar', 'Daftar'], ['kalender', 'Kalender']], UI.txView, 'tx-view');
  const dayBlock = d => { const dl = l.filter(t => t.date === d); return dl.length ? dl.map(txRow).join('') : '<p class="small mute" style="padding:6px 0">Tidak ada transaksi.</p>'; };
  let body;
  if (UI.txView === 'kalender') {
    const grid = monthGrid(ym, d => { const dl = l.filter(t => t.date === d); const o = sum(dl.filter(t => t.type === 'out'), t => t.amount), i = sum(dl.filter(t => t.type === 'in'), t => t.amount); return `${o ? `<span class="amt neg">-${short(o)}</span>` : ''}${i ? `<span class="amt pos">+${short(i)}</span>` : ''}`; }, 'tx-day', UI.txDay);
    body = grid + (UI.txDay ? `<div class="sec">${esc(fmtDate(UI.txDay, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>${dayBlock(UI.txDay)}` : '<p class="small mute" style="margin-top:8px">Ketuk tanggal untuk melihat transaksinya.</p>');
  } else {
    const days = [...new Set(l.map(t => t.date))].sort().reverse();
    body = days.map(d => { const dl = l.filter(t => t.date === d); const net = sum(dl.filter(t => t.type === 'in'), t => t.amount) - sum(dl.filter(t => t.type === 'out'), t => t.amount);
      return `<div class="row between sec"><span>${esc(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><span class="${net >= 0 ? 'pos' : 'neg'}">${rp(net)}</span></div>${dl.map(txRow).join('')}`; }).join('') || empty('Belum ada transaksi di bulan ini. Ketik di kolom paling atas, misalnya: kopi 15rb dana.', btn('Tambah transaksi', 'tx-new', null, 'primary'));
  }
  return `<div class="stack">${monthBar()}${panel('Transaksi', `<div class="stack">${filt}${toggle}<div>${body}</div></div>`, btn('+ Transaksi', 'tx-new', null, 'sm primary'))}</div>`;
}
function keuAkun() {
  const b = balances(); const accs = activeAccs(); const arch = S.accounts.filter(a => a.archived);
  const presets = ACCOUNT_PRESETS.filter(([n]) => !S.accounts.some(a => a.name.toLowerCase() === n.toLowerCase()));
  const groups = ACC_TYPES.map(t => [t, accs.filter(a => a.type === t.v)]).filter(([, l]) => l.length);
  const body = groups.map(([t, l]) => `<div class="row between sec"><span>${t.l}</span><span>${rp(sum(l, a => b[a.id]))}</span></div>` + l.map(a => `<div class="item"><div class="grow tap" ${A('acc-edit', a.id)} tabindex="0" role="button"><div class="t">${esc(a.name)}</div><div class="s">${ACC_TYPE_L[a.type] || ''}</div></div><b class="${b[a.id] < 0 ? 'neg' : ''}">${rp(b[a.id])}</b>${btn('Cocokkan', 'acc-reconcile', a.id, 'sm')}</div>`).join('')).join('');
  return `<div class="stack">${panel(`Akun${accs.length ? ` · total ${rp(sum(accs, a => b[a.id]))}` : ''}`, (body || empty('Belum ada akun. Tambahkan tempat uangmu: bank, dompet digital, tunai, atau akun investasi.')) + (presets.length ? `<div class="sec">Tambah cepat (nama saja)</div><div class="cmdhint">${presets.map(([n, t]) => `<button type="button" ${A('acc-preset', n + '|' + t)}>${esc(n)}</button>`).join('')}</div>` : ''), btn('+ Akun', 'acc-new', null, 'sm primary'))}
    <p class="small mute">Tombol Cocokkan membandingkan saldo catatan dengan saldo di aplikasi bank atau dompet aslinya, lalu menunjukkan selisihnya.</p>
    ${arch.length ? panel('Diarsipkan', arch.map(a => `<div class="item"><div class="grow tap" ${A('acc-edit', a.id)} tabindex="0" role="button"><div class="t">${esc(a.name)}</div></div><span class="small mute">${rp(b[a.id])}</span></div>`).join('')) : ''}</div>`;
}
function keuInvest() {
  const t = totalInvest(); const g = t.value - t.cost;
  const rows = S.investments.map(i => { const gl = i.value - i.cost; const age = i.updated ? diffDays(today(), i.updated) : null; return `<div class="item"><div class="grow tap" ${A('inv-edit', i.id)} tabindex="0" role="button"><div class="t">${esc(i.name)}</div><div class="s">${esc(cap(i.kind || ''))}${i.platform ? ' · ' + esc(i.platform) : ''} · modal ${rp(i.cost)}${age !== null ? ` · nilai diperbarui ${age === 0 ? 'hari ini' : age + ' hari lalu'}` : ''}</div></div><div style="text-align:right"><b>${rp(i.value)}</b><div class="small ${gl >= 0 ? 'pos' : 'neg'}">${gl >= 0 ? '+' : ''}${rp(gl)}${i.cost ? ` (${gl >= 0 ? '+' : ''}${(gl / i.cost * 100).toFixed(1).replace('.', ',')}%)` : ''}</div></div></div>`; }).join('');
  return panel('Investasi', (S.investments.length ? `<div class="stats" style="margin-bottom:8px"><div class="stat"><span class="v">${rp(t.value)}</span><span class="l">Nilai sekarang</span></div><div class="stat"><span class="v">${rp(t.cost)}</span><span class="l">Total modal</span></div><div class="stat"><span class="v ${g >= 0 ? 'pos' : 'neg'}">${g >= 0 ? '+' : ''}${rp(g)}</span><span class="l">Untung atau rugi</span></div></div>` : '') + (rows || empty('Catat reksa dana, saham, emas, dan instrumen lain. Nilai sekarang kamu perbarui sendiri secara berkala.', btn('Tambah investasi', 'inv-new', null, 'primary'))), btn('+ Investasi', 'inv-new', null, 'sm primary'));
}
function keuAnggaran() {
  const ym = today().slice(0, 7); const tl = sum(S.budgets, b => b.limit); const ts = sum(S.budgets, b => budgetInfo(b).spent);
  const rows = S.budgets.map(b => ({ b, i: budgetInfo(b) })).sort((a, c) => c.i.p - a.i.p).map(({ b, i }) => `<div class="item" style="align-items:flex-start"><span class="cat" style="--c:${esc(catById(b.cat)?.color || '#8c9199')}">${esc(catById(b.cat)?.icon || '📦')}</span><div class="grow"><div class="row between"><span class="tap" style="font-weight:600" ${A('bud-edit', b.id)} tabindex="0" role="button">${esc(catName(b.cat))}</span><span class="small">${rp(i.spent)} dari ${rp(b.limit)}</span></div>${bar(i.p, i.p >= 100 ? 'bad' : i.p >= 80 ? 'warn' : '')}<div class="small ${i.left < 0 ? 'neg' : 'mute'}">${i.left < 0 ? `Lewat ${rp(-i.left)}` : `Sisa ${rp(i.left)} · boleh ${rp(i.perDay)} per hari`}</div></div></div>`).join('');
  return panel(`Anggaran ${esc(fmtMonth(ym))}`, (S.budgets.length ? `<p class="small mute" style="margin-bottom:6px">Total batas ${rp(tl)} · terpakai ${rp(ts)}</p>` : '') + (rows || empty('Atur batas per kategori, misalnya Makan & minum. Aplikasi akan menghitung berapa yang boleh dibelanjakan per hari.', btn('Tambah anggaran', 'bud-new', null, 'primary'))), btn('+ Anggaran', 'bud-new', null, 'sm primary'));
}
function keuTarget() {
  const tx = S.trueExp.filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due)); const per = sum(tx, t => trueInfo(t).perMonth);
  const goals = S.goals.map(g => `<div class="item" style="align-items:flex-start"><div class="grow"><div class="row between"><span class="tap" style="font-weight:600" ${A('goal-edit', g.id)} tabindex="0" role="button">${esc(g.name)}</span><span class="small">${rp(g.saved)} dari ${rp(g.target)}</span></div>${bar(pct(g.saved, g.target))}<div class="small mute">${pct(g.saved, g.target)}%${g.deadline ? ' · tenggat ' + esc(fmtDate(g.deadline)) : ''}</div></div>${btn('Setor', 'goal-add', g.id, 'sm')}</div>`).join('');
  const trues = tx.map(t => { const i = trueInfo(t); return `<div class="item" style="align-items:flex-start"><div class="grow"><div class="row between"><span class="tap" style="font-weight:600" ${A('true-edit', t.id)} tabindex="0" role="button">${esc(t.name)}</span><span class="small">${rp(t.amount)} · ${esc(fmtDate(t.due, { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>${bar(i.p)}<div class="small mute">Disisihkan ${rp(t.saved)} · sisihkan ${rp(i.perMonth)} per bulan selama ${i.months} bulan</div></div>${btn('Sisihkan', 'true-add', t.id, 'sm')}</div>`; }).join('');
  return `<div class="stack">${panel('Target tabungan', goals || empty('Misalnya dana darurat atau laptop baru.', btn('Tambah target', 'goal-new', null, 'primary')), btn('+ Target', 'goal-new', null, 'sm primary'))}
    ${panel('Biaya sejati', `<p class="small mute" style="margin-bottom:6px">Pengeluaran besar yang jarang datang dipecah jadi tabungan bulanan supaya tidak jadi kejutan. ${tx.length ? `Total yang perlu disisihkan bulan ini: <b>${rp(per)}</b>.` : ''}</p>` + (trues || empty('Misalnya UKT, perpanjangan software, atau servis motor.', btn('Tambah biaya sejati', 'true-new', null))), btn('+ Biaya', 'true-new', null, 'sm'))}</div>`;
}
function keuUtang() {
  const mk = dir => S.debts.filter(d => d.dir === dir && d.amount - d.paid > 0.5).map(d => { const left = d.amount - d.paid; const late = d.due && d.due < today();
    return `<div class="item" style="align-items:flex-start"><div class="grow"><div class="row between"><span class="tap" style="font-weight:600" ${A('debt-edit', d.id)} tabindex="0" role="button">${esc(d.person)}</span><b>${rp(left)}</b></div>${bar(pct(d.paid, d.amount))}<div class="small ${late ? 'neg' : 'mute'}">Dari ${rp(d.amount)}${d.due ? ' · jatuh tempo ' + esc(fmtDate(d.due)) + ' (' + rel(d.due) + ')' : ''}${d.note ? ' · ' + esc(d.note) : ''}</div></div>${btn(dir === 'utang' ? 'Bayar' : 'Terima', 'debt-pay', d.id, 'sm')}</div>`; }).join('');
  const lunas = S.debts.filter(d => d.amount - d.paid <= 0.5).length;
  const u = sum(S.debts.filter(d => d.dir === 'utang'), d => d.amount - d.paid), p = sum(S.debts.filter(d => d.dir === 'piutang'), d => d.amount - d.paid);
  return `<div class="stack">${panel('Utang saya', `${u > 0.5 ? `<p class="small mute">Total ${rp(u)}</p>` : ''}${mk('utang') || empty('Tidak ada utang yang berjalan.')}`, btn('+ Utang', 'debt-new', null, 'sm primary'))}
    ${panel('Piutang (orang lain berutang ke saya)', `${p > 0.5 ? `<p class="small mute">Total ${rp(p)}</p>` : ''}${mk('piutang') || empty('Tidak ada piutang yang berjalan. Cocok untuk talangan dan patungan.')}`, '')}
    ${lunas ? `<p class="small mute">${lunas} catatan sudah lunas dan disembunyikan.</p>` : ''}</div>`;
}
function keuTagihan() {
  const l = S.bills.filter(b => b.active !== false).sort((a, b) => a.nextDue.localeCompare(b.nextDue)); const off = S.bills.filter(b => b.active === false);
  const rows = l.map(b => { const late = b.nextDue < today(); return `<div class="item"><span class="cat" style="--c:${esc(catById(b.cat)?.color || '#8c9199')}">${esc(catById(b.cat)?.icon || '📦')}</span><div class="grow tap" ${A('bill-edit', b.id)} tabindex="0" role="button"><div class="t">${esc(b.name)}</div><div class="s ${late ? 'neg' : ''}">${esc(fmtDate(b.nextDue, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${rel(b.nextDue)} · ${b.freq === 'bulanan' ? 'tiap bulan' : b.freq === 'tahunan' ? 'tiap tahun' : 'sekali'}${b.acc ? ' · ' + esc(accName(b.acc)) : ''}</div></div><b>${rp(b.amount)}</b>${btn('Bayar', 'bill-pay', b.id, 'sm')}</div>`; }).join('');
  return `<div class="stack">${panel('Tagihan berulang', `<p class="small mute" style="margin-bottom:6px">Tombol Bayar mencatat transaksi pengeluaran dan memajukan jatuh tempo ke periode berikutnya.</p>` + (rows || empty('Misalnya kos, langganan, atau cicilan.', btn('Tambah tagihan', 'bill-new', null, 'primary'))), btn('+ Tagihan', 'bill-new', null, 'sm primary'))}
    ${off.length ? panel('Tidak aktif', off.map(b => `<div class="item"><div class="grow tap" ${A('bill-edit', b.id)} tabindex="0" role="button"><div class="t">${esc(b.name)}</div></div><span class="small mute">${rp(b.amount)}</span></div>`).join('')) : ''}</div>`;
}
function keuKategori() {
  const l = S.categories.filter(c => c.kind === UI.catKind).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rows = l.map((c, i) => `<div class="item ${c.hidden ? 'done' : ''}"><span class="cat" style="--c:${esc(c.color)}">${esc(c.icon)}</span><div class="grow tap" ${A('cat-edit', c.id)} tabindex="0" role="button"><div class="t">${esc(c.name)}${c.hidden ? ' (disembunyikan)' : ''}</div><div class="s">${(c.subs || []).length ? 'Sub: ' + c.subs.map(esc).join(', ') + ' · ' : ''}${(c.keywords || []).length} kata kunci${c.builtin ? ' · bawaan' : ''}</div></div>
    <div class="row" style="gap:4px">${btn('↑', 'cat-move', c.id + '|-1', 'sm ghost')}${btn('↓', 'cat-move', c.id + '|1', 'sm ghost')}${btn(c.hidden ? 'Tampilkan' : 'Sembunyikan', 'cat-hide', c.id, 'sm')}${btn('Gabung', 'cat-merge', c.id, 'sm')}</div></div>`).join('');
  return panel('Kategori', chipRow([['out', 'Pengeluaran'], ['in', 'Pemasukan']], UI.catKind, 'cat-kind') + `<p class="small mute" style="margin:8px 0 2px">Kategori bawaan bisa diubah nama, ikon, dan warnanya. Kategori yang sudah punya riwayat hanya bisa disembunyikan atau digabung supaya laporan lama tetap utuh. Transfer tidak memakai kategori.</p>` + rows, btn('+ Kategori', 'cat-new', null, 'sm primary'));
}
function viewKeuangan() {
  const tabs = [['ringkasan', 'Ringkasan'], ['transaksi', 'Transaksi'], ['akun', 'Akun'], ['investasi', 'Investasi'], ['anggaran', 'Anggaran'], ['target', 'Target'], ['utang', 'Utang'], ['tagihan', 'Tagihan'], ['kategori', 'Kategori']];
  const f = { ringkasan: keuRingkasan, transaksi: keuTransaksi, akun: keuAkun, investasi: keuInvest, anggaran: keuAnggaran, target: keuTarget, utang: keuUtang, tagihan: keuTagihan, kategori: keuKategori }[UI.sub.keu];
  return subTabs('keu', tabs) + f();
}

/* ================= SINKRON ANTAR PERANGKAT ================= */
/* Data dienkripsi di browser (AES-GCM, kunci dari Kode sinkron) sebelum dikirim, jadi server hanya menyimpan teks acak.
   Penggabungan per data: yang terakhir diubah menang, penghapusan dicatat sebagai nisan (tombstone). */
const SYNC_COLLS = COLLS.filter(k => k !== 'aiLog');
const SETTINGS_SYNC = ['sem', 'semStart', 'semEnd', 'geminiModel', 'geminiNotes', 'shareSummary'];
const SYNC = { busy: false, again: false, chg: 0, syncedChg: -1, timer: null, poll: null, status: 'off', msg: '', last: 0 };
const SNAP = {};
let SET_SNAP = '';
const settingsSyncJSON = () => JSON.stringify(SETTINGS_SYNC.map(k => S.settings[k] ?? ''));
const syncActive = () => !!(S.settings.syncOn && S.settings.syncSecret);

function rebuildSnap(only) {
  (only ? [only] : SYNC_COLLS).forEach(k => { const m = new Map(); S[k].forEach(r => { const { _u, ...rest } = r; m.set(r.id, JSON.stringify(rest)); }); SNAP[k] = m; });
  if (!only) SET_SNAP = settingsSyncJSON();
}
function markDirty() { SYNC.chg++; if (syncActive()) scheduleSync(2500); }
stampHook = function (k) {
  if (k === 'settings') { const j = settingsSyncJSON(); if (j !== SET_SNAP) { SET_SNAP = j; S.settings._su = Date.now(); markDirty(); } return; }
  if (!SYNC_COLLS.includes(k)) return;
  const snap = SNAP[k] || (SNAP[k] = new Map()); const now = Date.now(); const seen = new Set(); let tc = false;
  S[k].forEach(r => { seen.add(r.id); const { _u, ...rest } = r; const j = JSON.stringify(rest); if (snap.get(r.id) !== j) { r._u = now; snap.set(r.id, j); markDirty(); } });
  [...snap.keys()].forEach(id => { if (!seen.has(id)) { snap.delete(id); (S.tomb[k] = S.tomb[k] || {})[id] = now; tc = true; markDirty(); } });
  if (tc) DB.put('tomb', S.tomb);
};

/* ---- kripto ---- */
const TE = new TextEncoder(), TD = new TextDecoder();
function toB64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(s) { const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
async function sha256hex(str) { const h = await crypto.subtle.digest('SHA-256', TE.encode(str)); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
let KC = { secret: '', key: null }, AC = { secret: '', hash: '' };
async function authHash(secret) { if (AC.secret === secret) return AC.hash; const h = await sha256hex('hub-auth-v1:' + secret); AC = { secret, hash: h }; return h; }
async function encKey(secret) {
  if (KC.secret === secret && KC.key) return KC.key;
  const base = await crypto.subtle.importKey('raw', TE.encode(secret), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: TE.encode('hub-pribadi-enc-v1'), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  KC = { secret, key }; return key;
}
async function encryptJSON(secret, obj) {
  const key = await encKey(secret); const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TE.encode(JSON.stringify(obj)));
  return JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) });
}
async function decryptJSON(secret, str) {
  const o = JSON.parse(str); const key = await encKey(secret);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(o.iv) }, key, fromB64(o.ct));
  return JSON.parse(TD.decode(pt));
}
function stable(v) { if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'; return JSON.stringify(v); }
const stableRecs = arr => stable([...(arr || [])].sort((a, b) => String(a.id).localeCompare(String(b.id))));

/* ---- panggilan ke server ---- */
async function api(path, opt = {}) {
  const secret = S.settings.syncSecret; const auth = secret ? await authHash(secret) : '';
  let r;
  try { r = await fetch(path, { ...opt, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-sync-auth': auth, ...(opt.headers || {}) } }); }
  catch (e) { return { status: 0, ok: false, j: null }; }
  let j = null; try { j = await r.json(); } catch (e) { }
  return { status: r.status, ok: r.ok, j };
}
class SyncError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
function checkRes(r) {
  if (r.status === 0) throw new SyncError('offline', 'Tidak ada koneksi internet.');
  if (r.j === null && r.status === 404) throw new SyncError('nofn', 'Fungsi server belum ada. Pastikan folder api ikut di-deploy ke Vercel.');
  if (r.j && r.j.hub && !r.ok) {
    const m = { no_sync_token: 'SYNC_TOKEN belum diisi di Vercel (atau belum di-redeploy).', no_redis: 'Penyimpanan Upstash belum terhubung ke project Vercel.', unauthorized: 'Kode sinkron di perangkat ini berbeda dengan SYNC_TOKEN di Vercel.', storage: 'Penyimpanan di server bermasalah: ' + (r.j.detail || ''), bad_item: 'Server menolak data.', conflict: 'Konflik versi.' };
    throw new SyncError(r.j.error, m[r.j.error] || 'Server bermasalah.');
  }
  if (!r.ok || !r.j) throw new SyncError('server', 'Server menjawab dengan kode ' + r.status + '.');
}

/* ---- penggabungan ---- */
async function decodeRemote(secret, items) {
  const out = { colls: {}, tomb: null, settings: null, has: Object.keys(items).length > 0 };
  for (const [k, v] of Object.entries(items)) {
    let obj; try { obj = await decryptJSON(secret, v); } catch (e) { throw new SyncError('secret', 'Kode sinkron tidak cocok dengan data yang ada di server.'); }
    if (k.startsWith('c:')) out.colls[k.slice(2)] = obj.records || [];
    else if (k === 'tomb') out.tomb = obj; else if (k === 'settings') out.settings = obj;
  }
  return out;
}
const localSettingsObj = () => ({ ...Object.fromEntries(SETTINGS_SYNC.map(k => [k, S.settings[k] ?? ''])), _su: S.settings._su || 0 });
function mergeAll(remote) {
  const now = Date.now(); const cut = now - 90 * 864e5; const colls = {}; const tomb = {};
  SYNC_COLLS.forEach(k => {
    const lt = S.tomb[k] || {}, rt = (remote.tomb && remote.tomb[k]) || {}; const t = { ...rt };
    Object.entries(lt).forEach(([id, ts]) => { t[id] = Math.max(t[id] || 0, ts); });
    const map = new Map(); (remote.colls[k] || []).forEach(r => map.set(r.id, r));
    S[k].forEach(r => { const o = map.get(r.id); if (!o || (r._u || 0) >= (o._u || 0)) map.set(r.id, r); });
    const out = [];
    map.forEach((r, id) => { const ts = t[id]; if (ts && ts > (r._u || 0)) return; if (ts) delete t[id]; out.push(r); });
    Object.keys(t).forEach(id => { if (t[id] < cut) delete t[id]; });
    colls[k] = out; if (Object.keys(t).length) tomb[k] = t;
  });
  const ls = localSettingsObj(); let st;
  if (!remote.settings) { ls._su = ls._su || now; st = ls; } else st = (remote.settings._su || 0) > ls._su ? remote.settings : ls;
  return { colls, tomb, settings: st };
}
const localAsMerged = () => { const colls = {}; SYNC_COLLS.forEach(k => colls[k] = S[k]); const ls = localSettingsObj(); ls._su = ls._su || Date.now(); return { colls, tomb: S.tomb, settings: ls }; };
const remoteAsMerged = remote => { const colls = {}; SYNC_COLLS.forEach(k => colls[k] = remote.colls[k] || []); return { colls, tomb: remote.tomb || {}, settings: remote.settings || localSettingsObj() }; };
async function buildPush(secret, merged, remote, all) {
  const items = {};
  for (const k of SYNC_COLLS) if (all || stableRecs(merged.colls[k]) !== stableRecs(remote.colls[k])) items['c:' + k] = await encryptJSON(secret, { records: merged.colls[k] });
  if (all || stable(merged.tomb) !== stable(remote.tomb || {})) items.tomb = await encryptJSON(secret, merged.tomb);
  if (all || stable(merged.settings) !== stable(remote.settings || null)) items.settings = await encryptJSON(secret, merged.settings);
  return items;
}
function applyMerged(m) {
  SYNC_COLLS.forEach(k => { S[k] = m.colls[k] || []; persist(k); });
  S.tomb = m.tomb || {}; DB.put('tomb', S.tomb);
  if (m.settings) { SETTINGS_SYNC.forEach(k => { if (m.settings[k] !== undefined) S.settings[k] = m.settings[k]; }); S.settings._su = m.settings._su || 0; }
  if (!S.categories.length) seedCategories();
  rebuildSnap();
}

/* ---- siklus sinkron ---- */
const hhmm = t => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(t));
function setSyncStatus(st, msg) {
  SYNC.status = st; SYNC.msg = msg || ''; if (st === 'ok') SYNC.last = Date.now();
  renderSyncBadge(); const el = $('#syncinfo'); if (el) el.innerHTML = syncInfoHTML();
}
function renderSyncBadge() {
  const b = $('#syncst'); if (!b) return;
  if (!syncActive()) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = { syncing: 'Menyinkronkan...', ok: 'Tersinkron ' + hhmm(SYNC.last), error: 'Sinkron gagal', offline: 'Offline', idle: 'Sinkron aktif' }[SYNC.status] || 'Sinkron aktif';
  b.title = SYNC.msg || 'Ketuk untuk menyinkronkan sekarang';
  b.style.color = SYNC.status === 'error' ? 'var(--bad)' : '';
}
function syncInfoHTML() {
  if (!syncActive()) return `<b>Sinkron mati.</b> Data hanya ada di perangkat ini.`;
  const s = { syncing: 'Sedang menyinkronkan...', ok: `Tersinkron pukul ${hhmm(SYNC.last)}.`, error: `<b class="neg">Gagal:</b> ${esc(SYNC.msg)}`, offline: 'Offline. Perubahan akan dikirim saat tersambung lagi.', idle: 'Sinkron aktif, menunggu.' }[SYNC.status];
  return `<b>Sinkron aktif.</b> ${s}`;
}
function scheduleSync(ms) { clearTimeout(SYNC.timer); SYNC.timer = setTimeout(() => syncNow(), ms); }
function startSyncLoop() {
  clearInterval(SYNC.poll);
  SYNC.poll = setInterval(() => { if (document.visibilityState === 'visible' && syncActive() && !FORM) syncNow(); }, 60000);
}
function onFormClosed() { if (SYNC.again && syncActive()) { SYNC.again = false; scheduleSync(400); } }

async function syncNow(opt = {}) {
  if (!syncActive()) { renderSyncBadge(); return false; }
  if ((FORM && !opt.force) || SYNC.busy) { SYNC.again = true; return false; }
  SYNC.busy = true; setSyncStatus('syncing'); const startChg = SYNC.chg; const secret = S.settings.syncSecret;
  try {
    if (!opt.force && !opt.full && SYNC.syncedChg === SYNC.chg) {
      const q = await api('/api/sync?op=rev'); checkRes(q);
      if (q.j.rev === S.settings.syncRev) { SYNC.syncedChg = startChg; setSyncStatus('ok'); return true; }
    }
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const g = await api('/api/sync'); checkRes(g);
      const remote = await decodeRemote(secret, g.j.items || {});
      const merged = opt.force === 'pull' ? remoteAsMerged(remote) : opt.force === 'push' ? localAsMerged() : mergeAll(remote);
      const items = await buildPush(secret, merged, remote, opt.force === 'push');
      if (opt.force === 'pull' || !Object.keys(items).length) { applyMerged(merged); S.settings.syncRev = g.j.rev; done = true; break; }
      const p = await api('/api/sync', { method: 'PUT', body: JSON.stringify({ baseRev: g.j.rev, items, replace: opt.force === 'push', force: opt.force === 'push' }) });
      if (p.status === 409) continue;
      checkRes(p); applyMerged(merged); S.settings.syncRev = p.j.rev; done = true;
    }
    if (!done) throw new SyncError('conflict', 'Server sedang sibuk menerima perubahan lain. Coba lagi sebentar lagi.');
    persist('settings'); SYNC.syncedChg = startChg; setSyncStatus('ok');
    if (!FORM) render();
    return true;
  } catch (e) {
    if (e instanceof SyncError) { setSyncStatus(e.code === 'offline' ? 'offline' : 'error', e.message); if (opt.verbose) toast(e.message); }
    else { setSyncStatus('error', 'Terjadi kesalahan: ' + (e.message || e)); }
    return false;
  } finally {
    SYNC.busy = false;
    if (SYNC.again && !FORM) { SYNC.again = false; scheduleSync(600); }
  }
}

/* ---- tampilan dan aksi di Pengaturan ---- */
const SECRET_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genSecret() { const a = crypto.getRandomValues(new Uint8Array(20)); const s = [...a].map(x => SECRET_ALPHA[x % 32]).join(''); return s.match(/.{1,5}/g).join('-'); }
const cleanSecret = s => String(s || '').trim();
function setSinkron() {
  const st = S.settings;
  return `<div class="stack">${panel('Sinkron HP dan laptop', `<div class="stack">
    <p class="small mute">Data di laptop dan HP terpisah karena tersimpan di browser masing-masing. Dengan sinkron, data dikirim ke penyimpanan di akun Vercel-mu dan dibagi ke semua perangkat. <b>Data dienkripsi di browser sebelum dikirim</b>, jadi Vercel dan Upstash hanya menyimpan teks acak yang tidak bisa dibaca tanpa Kode sinkron.</p>
    <div id="syncinfo" class="notice" style="background:var(--panel2);border-color:var(--line)">${syncInfoHTML()}</div>
    <ol class="steps small">
      <li>Di Vercel buka project-mu, tab <b>Storage</b>, lalu hubungkan database <b>Upstash (Redis)</b> dengan paket gratis. Vercel menambahkan variabel <code>UPSTASH_REDIS_REST_URL</code> dan <code>UPSTASH_REDIS_REST_TOKEN</code> ke project secara otomatis.</li>
      <li>Pastikan folder <code>api</code> dari paket aplikasi ikut di-deploy (letaknya sejajar dengan <code>index.html</code>).</li>
      <li>Buat Kode sinkron di bawah, lalu salin nilai <b>SYNC_TOKEN</b> yang ditampilkan.</li>
      <li>Di Vercel buka <b>Settings, Environment Variables</b>, tambah <code>SYNC_TOKEN</code> dengan nilai tadi, lalu <b>Redeploy</b>.</li>
      <li>Kembali ke sini, tekan <b>Tes koneksi</b>, lalu <b>Aktifkan sinkron</b>.</li>
      <li>Di HP, buka tautan pemasangan dari tombol di panel berikutnya.</li>
    </ol>
    <label class="f"><span>Kode sinkron</span><input id="sk" type="text" autocomplete="off" spellcheck="false" value="${esc(st.syncSecret)}" placeholder="Tekan Buat kode acak"><small>Kode ini yang mengunci enkripsi. Kalau hilang dan tidak ada perangkat yang menyimpannya, data di server tidak bisa dipulihkan. Simpan juga di tempat aman, misalnya pengelola kata sandi.</small></label>
    <div class="row">${btn('Buat kode acak', 'sync-gen')}${btn('Simpan kode', 'sync-save')}</div>
    <div class="f"><span>Nilai SYNC_TOKEN untuk Vercel</span><div class="row"><code id="synchash" style="overflow-wrap:anywhere;font-size:12px">${st.syncSecret ? 'menghitung...' : '(isi Kode sinkron dulu)'}</code>${btn('Salin', 'sync-copy-token', null, 'sm')}</div></div>
    <div class="row">${btn(st.syncOn ? 'Matikan sinkron' : 'Aktifkan sinkron', 'sync-toggle', null, st.syncOn ? 'danger' : 'primary')}${btn('Sinkronkan sekarang', 'sync-now')}${btn('Tes koneksi', 'sync-test')}</div></div>`)}
    ${panel('Pasang di HP', `<p class="small mute" style="margin-bottom:8px">Salin tautan ini, kirim ke HP-mu, lalu buka. Kode terisi otomatis dan sinkron langsung aktif. Kode ada di dalam tautan, jadi kirim lewat jalur pribadi (misalnya chat ke diri sendiri) dan hapus pesannya setelah dipakai.</p>${btn('Salin tautan pemasangan HP', 'sync-link', null, 'primary')}`)}
    ${panel('Pemulihan', `<p class="small mute" style="margin-bottom:8px">Biasanya tidak perlu. Dua perangkat yang berbeda digabung otomatis: data yang terakhir diubah yang menang, dan data baru dari kedua sisi sama-sama dipertahankan.</p><div class="row">${btn('Timpa server dengan data perangkat ini', 'sync-push', null, 'danger')}${btn('Timpa perangkat ini dengan data server', 'sync-pull', null, 'danger')}</div>`)}
    ${panel('Yang perlu kamu tahu', `<ul class="small mute" style="margin:0;padding-left:18px;display:grid;gap:4px"><li>Penghapusan ikut tersinkron. Menghapus data di satu perangkat menghapusnya di semua perangkat.</li><li>Kalau dua perangkat mengubah data yang sama sebelum sempat sinkron, versi yang terakhir disimpan yang dipakai.</li><li>Sinkron berjalan saat aplikasi dibuka, tiap menit saat tampil, dan beberapa detik setelah kamu mengubah data. Offline tetap bisa dipakai, dan perubahan dikirim saat tersambung lagi.</li><li>Menurut halaman harga Upstash saat ini, tier gratis dibatasi 500 ribu perintah per bulan. Pemakaian pribadi jauh di bawah itu, tapi cek halaman harganya karena angkanya bisa berubah.</li><li>Kunci API Gemini dan Kode sinkron tidak ikut tersinkron dan tidak masuk file cadangan.</li></ul>`)}</div>`;
}
async function postRender() {
  if (UI.tab !== 'pengaturan' || UI.setSub !== 'sinkron') return;
  const el = $('#synchash'); if (!el) return;
  const s = S.settings.syncSecret; el.textContent = s ? await authHash(s) : '(isi Kode sinkron dulu)';
}
ACT['sync-gen'] = () => { const v = genSecret(); $('#sk').value = v; ACT['sync-save'](); };
ACT['sync-save'] = async () => {
  const v = cleanSecret($('#sk').value);
  if (v.length < 16) { toast('Kode minimal 16 karakter. Tekan Buat kode acak.'); return; }
  if (S.settings.syncOn && v !== S.settings.syncSecret && !confirm('Mengganti kode berarti data lama di server tidak bisa dibuka dengan kode baru. Lanjutkan?')) return;
  S.settings.syncSecret = v; commit('settings'); toast('Kode tersimpan'); render();
};
ACT['sync-copy-token'] = async () => {
  if (!S.settings.syncSecret) { toast('Isi Kode sinkron dulu'); return; }
  const h = await authHash(S.settings.syncSecret);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(h).then(() => toast('SYNC_TOKEN disalin'), () => prompt('Salin nilai ini:', h)); else prompt('Salin nilai ini:', h);
};
ACT['sync-link'] = () => {
  if (!S.settings.syncSecret) { toast('Buat dan simpan Kode sinkron dulu'); return; }
  const u = location.origin + location.pathname.replace(/index\.html$/, '') + '#sync=' + encodeURIComponent(S.settings.syncSecret);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(u).then(() => toast('Tautan disalin'), () => prompt('Salin tautan ini:', u)); else prompt('Salin tautan ini:', u);
};
ACT['sync-toggle'] = async () => {
  if (S.settings.syncOn) { S.settings.syncOn = false; commit('settings'); setSyncStatus('off'); render(); toast('Sinkron dimatikan'); return; }
  const v = cleanSecret($('#sk')?.value || S.settings.syncSecret);
  if (v.length < 16) { toast('Buat dan simpan Kode sinkron dulu'); return; }
  S.settings.syncSecret = v; S.settings.syncOn = true; S.settings.syncRev = 0; commit('settings'); render();
  const ok = await syncNow({ full: true, verbose: true }); if (ok) toast('Sinkron aktif'); else if (SYNC.status === 'error' && /Kode sinkron tidak cocok/.test(SYNC.msg)) { S.settings.syncOn = false; commit('settings'); render(); }
};
ACT['sync-now'] = async () => {
  if (!syncActive()) { UI.tab = 'pengaturan'; UI.setSub = 'sinkron'; render(); return; }
  const ok = await syncNow({ full: true, verbose: true }); if (ok) toast('Sudah tersinkron');
};
ACT['sync-test'] = async () => {
  if (!S.settings.syncSecret) { toast('Isi dan simpan Kode sinkron dulu'); return; }
  const q = await api('/api/sync?op=rev');
  try { checkRes(q); toast('Server siap. Kode cocok dengan SYNC_TOKEN.'); } catch (e) { toast(e.message); }
};
ACT['sync-push'] = async () => {
  if (!syncActive()) { toast('Aktifkan sinkron dulu'); return; }
  if (!confirm('Seluruh data di server diganti dengan data perangkat ini. Perangkat lain akan mengikuti. Lanjutkan?')) return;
  const ok = await syncNow({ force: 'push', verbose: true }); if (ok) toast('Server diperbarui');
};
ACT['sync-pull'] = async () => {
  if (!syncActive()) { toast('Aktifkan sinkron dulu'); return; }
  if (!confirm('Seluruh data di perangkat ini diganti dengan data dari server. Lanjutkan?')) return;
  const ok = await syncNow({ force: 'pull', verbose: true }); if (ok) toast('Perangkat diperbarui');
};

/* ================= ASISTEN: panel hasil ================= */
function logAI(kind) {
  if (!AIOUT) return;
  S.aiLog.unshift({ t: new Date().toISOString(), text: AIOUT.text, via: AIOUT.via || 'lokal', kind }); S.aiLog = S.aiLog.slice(0, 30); commit('aiLog');
}
function txValid(t) { return t.amount > 0 && accById(t.acc) && (t.type !== 'tf' || (accById(t.to) && t.to !== t.acc)) && (t.type === 'tf' || catById(t.cat)); }
function renderAIOut() {
  const el = $('#ai-out'); if (!el) return;
  if (!AIOUT) { el.innerHTML = ''; return; }
  const a = AIOUT.act; let h = '';
  const acts = (save, saveLabel = 'Simpan') => `<div class="acts">${save ? btn(saveLabel, 'ai-save', null, 'primary sm') : ''}${save !== null && a && a.kind !== 'answer' ? btn('Ubah dulu', 'ai-edit', null, 'sm') : ''}${btn(a && a.kind === 'answer' ? 'Tutup' : 'Batal', 'ai-dismiss', null, 'sm')}</div>`;
  if (AIOUT.loading) h = `<div class="aiout"><div class="big">Memproses perintah...</div></div>`;
  else if (!a) {
    h = `<div class="aiout warn"><div class="big">Perintah belum bisa dipahami</div><div class="sub">${AIOUT.err ? esc(AIOUT.err) : 'Coba tulis dengan nominal dan akun, misalnya "kopi 15rb dana", atau awali dengan "tugas", "ide:", atau "butuh".'}</div>${!hasGemini() ? `<div class="sub">Untuk kalimat yang lebih bebas, kamu bisa menyambungkan Gemini di Pengaturan.</div>` : ''}<div class="acts">${btn('Catat manual', 'tx-new', null, 'sm primary')}${btn('Tutup', 'ai-dismiss', null, 'sm')}</div></div>`;
  } else if (a.kind === 'tx') {
    const t = a.tx; const ok = txValid(t); const kl = { out: 'Pengeluaran', in: 'Pemasukan', tf: 'Transfer' }[t.type];
    const l2 = t.type === 'tf' ? `${t.acc ? esc(accName(t.acc)) : '<b class="neg">akun asal belum jelas</b>'} → ${t.to ? esc(accName(t.to)) : '<b class="neg">akun tujuan belum jelas</b>'}` : `${esc(catName(t.cat))}${t.sub ? ' › ' + esc(t.sub) : ''} · ${t.acc ? esc(accName(t.acc)) : '<b class="neg">akun belum ada</b>'}${a.guessedAcc ? ' <span class="warnc">(akun ditebak dari transaksi terakhir)</span>' : ''}`;
    h = `<div class="aiout ${ok && !a.guessedAcc ? '' : 'warn'}"><div class="big">${kl} ${rp(t.amount)}</div><div class="sub">${l2}</div><div class="sub">${esc(fmtDate(t.date))}${t.note ? ' · ' + esc(t.note) : ''}${a.fee ? ' · biaya admin ' + rp(a.fee) : ''}</div>${acts(true, ok ? 'Simpan' : 'Lengkapi')}</div>`;
  } else if (a.kind === 'task') {
    const t = a.task; h = `<div class="aiout"><div class="big">${esc(cap(t.kind))} baru: ${esc(t.title)}</div><div class="sub">${t.course ? esc(courseById(t.course)?.name || '') : 'tanpa mata kuliah'} · ${t.due ? 'tenggat ' + esc(fmtDate(t.due)) + ' (' + rel(t.due) + ')' : 'tanpa tenggat'}</div>${t.work ? `<div class="sub">Dikerjakan ${esc(fmtDate(t.work))}${t.workStart ? ' jam ' + esc(t.workStart) : ''}</div>` : ''}${acts(true)}</div>`;
  } else if (a.kind === 'idea' || a.kind === 'need') {
    h = `<div class="aiout"><div class="big">${a.kind === 'idea' ? 'Ide riset' : 'Kebutuhan riset'}: ${esc(a.item.title)}</div>${a.kind === 'need' ? `<div class="sub">Jenis: ${esc(cap(a.item.kind))}</div>` : ''}${acts(true)}</div>`;
  } else if (a.kind === 'answer') {
    h = `<div class="aiout"><div class="big">${esc(a.lines[0])}</div>${a.lines.slice(1).map(x => `<div class="sub">${esc(x)}</div>`).join('')}${acts(null)}</div>`;
  }
  el.innerHTML = h;
}
async function runCommand(text) {
  text = text.trim(); if (!text) return;
  AIOUT = { text, loading: true }; renderAIOut();
  let act = null, via = 'lokal', err = '';
  const useG = hasGemini() && !!S.settings.useGemini;
  const tryG = async () => { try { const r = await geminiParse(text); if (r) { act = r; via = 'gemini'; } } catch (e) { err = e.message; } };
  if (useG) await tryG();
  if (!act) act = localParse(text);
  if (!act && hasGemini() && !useG) await tryG();
  if (act && act.kind === 'ask') {
    if (!S.settings.shareSummary) {
      act = { kind: 'answer', lines: ['Pertanyaan ini perlu membaca datamu.', 'Kalau kamu setuju, aktifkan "Izinkan Gemini membaca ringkasan data" di Pengaturan, tab Asisten. Isi ringkasannya bisa kamu lihat dulu sebelum dikirim.'] };
    } else {
      AIOUT = { text, loading: true }; renderAIOut();
      try { const ans = await geminiAsk(text); act = { kind: 'answer', lines: ans.replace(/\*\*/g, '').split('\n').map(x => x.trim().replace(/^[*-]\s+/, '• ')).filter(Boolean) }; via = 'gemini'; }
      catch (e) { err = e.message; act = null; }
    }
  }
  AIOUT = { text, act, via, err }; renderAIOut();
}
function clearAI() { AIOUT = null; renderAIOut(); }
ACT['ai-dismiss'] = () => { logAI('batal'); clearAI(); };
ACT['ai-edit'] = () => {
  const a = AIOUT?.act; if (!a) return;
  if (a.kind === 'tx') editTx(null, { ...a.tx, fee: a.fee || '' }, () => { logAI('tx'); clearAI(); });
  else if (a.kind === 'task') editTask(null, a.task, () => { logAI('task'); clearAI(); });
  else if (a.kind === 'idea') editIdea(null, a.item, () => { logAI('idea'); clearAI(); });
  else if (a.kind === 'need') editNeed(null, a.item, () => { logAI('need'); clearAI(); });
};
ACT['ai-save'] = () => {
  const a = AIOUT?.act; if (!a) return;
  if (a.kind === 'tx') {
    if (!txValid(a.tx)) { ACT['ai-edit'](); return; }
    saveTx(a.tx, a.fee); toast('Transaksi tersimpan');
  } else if (a.kind === 'task') { S.tasks.push({ id: uid(), done: false, parent: '', link: '', note: '', ...a.task }); commit('tasks'); toast('Tugas tersimpan'); }
  else if (a.kind === 'idea') { S.ideas.push({ id: uid(), ...a.item }); commit('ideas'); toast('Ide tersimpan'); }
  else if (a.kind === 'need') { S.needs.push({ id: uid(), ...a.item }); commit('needs'); toast('Kebutuhan tersimpan'); }
  logAI(a.kind); clearAI(); render();
};

/* ================= VIEW: Pengaturan ================= */
const EXAMPLES = ['kopi 15rb dana', 'tarik tunai 200rb dari bri admin 2500', 'topup dana 100rb dari bca', 'gaji magang 1,5jt masuk bca', 'kemarin bensin 25rb tunai', 'tugas laporan deadline Jumat kerjakan Rabu jam 19', 'uas 2 desember', 'ide: bandingkan dua skala analisis', 'butuh izin masuk kawasan', 'berapa pengeluaran makan bulan ini', 'saldo', 'tugas minggu ini'];
function setAsisten() {
  const st = S.settings; const proxy = st.geminiMode === 'proxy';
  return `<div class="stack">${panel('Cara memakai', `<p class="small mute" style="margin-bottom:8px">Ketik di kolom paling atas halaman mana pun. Hasilnya muncul sebagai pratinjau, dan baru tersimpan setelah kamu menekan Simpan. Ketuk contoh di bawah untuk mencobanya.</p><div class="cmdhint">${EXAMPLES.map(x => `<button type="button" ${A('ai-example', x)}>${esc(x)}</button>`).join('')}</div>
    <p class="small mute" style="margin-top:10px">Perintah biasa diproses langsung di perangkatmu tanpa internet dan tanpa AI. Kata kunci per kategori diatur di Keuangan, tab Kategori. Nama lain akun (misalnya gopay) diatur di form akun.</p>`)}
    ${panel('Sambungkan Gemini (opsional)', `<div class="stack"><p class="small mute">Gemini dipakai untuk kalimat bebas yang tidak dikenali pengurai biasa. Kalau kamu mengizinkan, Gemini juga bisa menjawab pertanyaan tentang datamu.</p>
      <ol class="steps small">
        <li>Buka <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer">aistudio.google.com/api-keys</a>, masuk dengan akun Google, buat API key baru, lalu salin.</li>
        <li><b>Jalur disarankan (kunci aman di server):</b> di Vercel buka project-mu, <b>Settings, Environment Variables</b>, tambah <code>GEMINI_API_KEY</code> berisi kunci tadi, lalu <b>Redeploy</b>. Kunci tidak pernah sampai ke browser, dan cukup diisi sekali untuk laptop dan HP. Jalur ini juga butuh <code>SYNC_TOKEN</code> dan Kode sinkron dari tab Sinkron.</li>
        <li>Pilih <b>Lewat server Vercel</b> di bawah, simpan, lalu tekan <b>Uji koneksi</b>.</li>
        <li>Alternatif tanpa server: pilih <b>Langsung dari browser</b> dan tempel kuncinya. Berlaku hanya di perangkat itu.</li>
      </ol>
      <label class="f"><span>Jalur</span><select id="gmode"><option value="proxy"${proxy ? ' selected' : ''}>Lewat server Vercel (disarankan)</option><option value="direct"${proxy ? '' : ' selected'}>Langsung dari browser</option></select></label>
      <label class="f"><span>Kunci API Gemini (hanya untuk jalur langsung)</span><input id="gk" type="password" autocomplete="off" value="${esc(st.geminiKey)}" placeholder="Tempel kunci dari Google AI Studio"><small>Tersimpan hanya di perangkat ini dan tidak ikut file cadangan.</small></label>
      <label class="f"><span>Nama model</span><input id="gm" type="text" value="${esc(st.geminiModel)}"><small>Nilai bawaan gemini-flash-latest mengikuti model Flash terbaru. Tekan tombol di bawah untuk melihat model yang tersedia untuk kuncimu.</small></label>
      <div id="modelchips" class="cmdhint"></div>
      <label class="f"><span>Catatan untuk Gemini tentang kebiasaanmu</span><textarea id="gn" rows="4" maxlength="800" placeholder="Contoh: Rekening utamaku BRI. Kopi dan jajan selalu masuk Makan &amp; minum. Kalau kubilang kampus, artinya mata kuliah praktikum. Uang saku masuk tiap tanggal 1.">${esc(st.geminiNotes)}</textarea><small>Dikirim ke Gemini bersama aturan sistem supaya ia memahami caramu mencatat. Jangan tulis nomor rekening, kata sandi, atau data pribadi lain.</small></label>
      <label class="f chk"><input id="gu" type="checkbox" ${st.useGemini ? 'checked' : ''}><span>Selalu coba Gemini lebih dulu (kalau dimatikan, Gemini hanya dipakai saat pengurai biasa gagal)</span></label>
      <label class="f chk"><input id="gs" type="checkbox" ${st.shareSummary ? 'checked' : ''}><span>Izinkan Gemini membaca ringkasan datamu untuk menjawab pertanyaan</span></label>
      <p class="small mute">Kalau diizinkan, saat kamu bertanya tentang datamu (misalnya "pengeluaranku paling boros di mana?") dan pengurai biasa tidak bisa menjawab, ringkasan data dikirim ke Google: saldo per akun, total per kategori, transaksi 14 hari terakhir tanpa catatan, tugas, jadwal, dan target riset. Isi catatan, tautan, dan literatur tidak ikut. Pada tier gratis, Google menyatakan konten yang dikirim dapat dipakai untuk meningkatkan produk mereka.</p>
      <div class="row">${btn('Simpan pengaturan', 'ai-set-save', null, 'primary')}${btn('Uji koneksi', 'ai-test')}${btn('Lihat model tersedia', 'ai-models')}</div>
      <div class="row">${btn('Lihat penjelasan sistem yang dikirim', 'ai-show-sys', null, 'sm')}${btn('Lihat ringkasan data yang akan dikirim', 'ai-show-sum', null, 'sm')}${st.geminiKey ? btn('Hapus kunci', 'ai-key-del', null, 'sm danger') : ''}</div></div>`)}
    ${panel('Riwayat perintah', S.aiLog.length ? S.aiLog.slice(0, 15).map(x => `<div class="item"><div class="grow tap" ${A('ai-example', x.text)} tabindex="0" role="button"><div class="t">${esc(x.text)}</div><div class="s">${esc(new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(x.t)))} · ${esc(x.via)} · ${esc(x.kind)}</div></div></div>`).join('') : empty('Belum ada riwayat.'))}</div>`;
}
function setData() {
  const lb = S.settings.lastBackup;
  return `<div class="stack">${panel('Cadangan', `<p class="small mute" style="margin-bottom:8px">Semua data tersimpan di browser perangkat ini. Pindah perangkat atau menghapus data situs berarti data hilang, jadi unduh cadangan secara rutin. ${lb ? `Cadangan terakhir: ${esc(fmtDate(lb, { day: 'numeric', month: 'long', year: 'numeric' }))}.` : 'Belum pernah dicadangkan.'}</p>
    <div class="row">${btn('Unduh cadangan (JSON)', 'export', null, 'primary')}${btn('Unduh transaksi (CSV)', 'export-csv')}<label class="btn" style="cursor:pointer">Pulihkan dari cadangan<input id="importfile" type="file" accept="application/json,.json" hidden></label></div>
    <p class="small mute" style="margin-top:8px">Memulihkan cadangan akan menggantikan seluruh data di perangkat ini. Kunci API Gemini tidak ikut tersimpan di cadangan.</p>`)}
    ${panel('Isi data', `<div class="stats"><div class="stat"><span class="v">${S.transactions.length}</span><span class="l">Transaksi</span></div><div class="stat"><span class="v">${S.accounts.length}</span><span class="l">Akun</span></div><div class="stat"><span class="v">${S.tasks.length}</span><span class="l">Tugas</span></div><div class="stat"><span class="v">${S.courses.length}</span><span class="l">Mata kuliah</span></div><div class="stat"><span class="v">${S.literature.length}</span><span class="l">Literatur</span></div></div>`)}
    ${panel('Pasang di HP', `<p class="small mute">Android (Chrome): menu titik tiga, lalu Instal aplikasi atau Tambahkan ke layar utama. iPhone (Safari): tombol Bagikan, lalu Tambah ke Layar Utama. Setelah terpasang, aplikasi bisa dibuka tanpa internet. Data di HP dan laptop terpisah. Untuk memindahkannya, pakai cadangan dan pulihkan.</p>`)}
    ${panel('Hapus semua data', `<p class="small mute" style="margin-bottom:8px">Menghapus seluruh data di perangkat ini secara permanen. Unduh cadangan dulu kalau masih ragu.</p>${btn('Hapus semua data', 'wipe', null, 'danger')}`)}</div>`;
}
function viewPengaturan() {
  const f = { asisten: setAsisten, sinkron: setSinkron, data: setData }[UI.setSub] || setAsisten;
  return `<div class="tabs" role="tablist">${[['asisten', 'Asisten'], ['sinkron', 'Sinkron'], ['data', 'Data dan cadangan']].map(([v, l]) => `<button type="button" role="tab" class="${UI.setSub === v ? 'on' : ''}" ${A('set-sub', v)}>${l}</button>`).join('')}</div>${f()}`;
}
ACT['set-sub'] = el => { UI.setSub = el.dataset.id; render(); };
ACT['ai-example'] = el => { const i = $('#cmdin'); i.value = el.dataset.id; i.focus(); window.scrollTo(0, 0); };
function readAISettings() {
  const st = S.settings;
  st.geminiMode = $('#gmode').value === 'proxy' ? 'proxy' : 'direct';
  st.geminiKey = $('#gk').value.trim();
  st.geminiModel = $('#gm').value.trim() || 'gemini-flash-latest';
  st.geminiNotes = $('#gn').value.trim().slice(0, 800);
  st.useGemini = $('#gu').checked; st.shareSummary = $('#gs').checked;
  commit('settings');
}
ACT['ai-set-save'] = () => { readAISettings(); toast('Pengaturan tersimpan'); render(); };
ACT['ai-key-del'] = () => { if (!confirm('Hapus kunci API dari perangkat ini?')) return; S.settings.geminiKey = ''; commit('settings'); render(); toast('Kunci dihapus'); };
ACT['ai-test'] = async () => {
  readAISettings();
  if (!hasGemini()) { toast(S.settings.geminiMode === 'proxy' ? 'Isi Kode sinkron dulu di tab Sinkron' : 'Isi kunci API dulu'); return; }
  toast('Menguji koneksi...');
  try { const r = await geminiParse('kopi 10rb'); toast(r ? 'Gemini terhubung dan berfungsi' : 'Terhubung, tapi jawabannya belum bisa dipakai'); } catch (e) { toast(e.message); }
};
ACT['ai-models'] = async () => {
  readAISettings(); toast('Mengambil daftar model...');
  try {
    const l = await listGeminiModels(); const el = $('#modelchips');
    el.innerHTML = l.length ? l.map(n => `<button type="button" ${A('ai-pick-model', n)}>${esc(n)}</button>`).join('') : '<small class="mute">Tidak ada model yang cocok.</small>';
    toast(l.length ? 'Ketuk nama model untuk memakainya' : 'Daftar model kosong');
  } catch (e) { toast(e.message); }
};
ACT['ai-pick-model'] = el => { $('#gm').value = el.dataset.id; toast('Model dipilih. Tekan Simpan pengaturan.'); };
function showText(title, text, note) {
  openForm({ title, fields: [{ k: 'i', type: 'info', html: (note ? `<p style="margin-bottom:8px">${esc(note)}</p>` : '') + `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:52vh;overflow:auto;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:0;color:var(--ink)">${esc(text)}</pre>` }], saveLabel: 'Tutup', onSave() { } });
}
ACT['ai-show-sys'] = () => showText('Penjelasan sistem untuk Gemini', systemContext(), 'Ini yang dikirim ke Gemini setiap kali ia diminta memahami perintahmu. Tidak ada saldo atau riwayat transaksi di dalamnya.');
ACT['ai-show-sum'] = () => showText('Ringkasan data yang akan dikirim', dataSummary(), S.settings.shareSummary ? 'Ringkasan ini dikirim hanya saat kamu mengajukan pertanyaan tentang datamu.' : 'Izin belum diaktifkan, jadi ringkasan ini tidak dikirim ke mana pun. Ini hanya pratinjau.');
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
ACT.export = () => {
  const data = { ...S, settings: { ...S.settings, geminiKey: '', syncSecret: '', syncOn: false, syncRev: 0 } };
  download(`hub-pribadi-${today()}.json`, JSON.stringify({ app: 'hub-pribadi', version: 1, exported: new Date().toISOString(), data }, null, 1), 'application/json');
  S.settings.lastBackup = today(); commit('settings'); toast('Cadangan diunduh'); render();
};
ACT['export-csv'] = () => {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['tanggal', 'jenis', 'nominal', 'akun', 'ke_akun', 'kategori', 'sub_kategori', 'catatan'].join(',')];
  [...S.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([t.date, { in: 'masuk', out: 'keluar', tf: 'transfer' }[t.type], t.amount, q(accName(t.acc)), q(t.to ? accName(t.to) : ''), q(t.cat ? catName(t.cat) : ''), q(t.sub || ''), q(t.note || '')].join(',')));
  download(`transaksi-${today()}.csv`, '\ufeff' + rows.join('\n'), 'text/csv'); toast('CSV diunduh');
};
function importBackup(file) {
  const r = new FileReader();
  r.onload = async () => {
    let o; try { o = JSON.parse(r.result); } catch (e) { toast('File bukan cadangan yang valid'); return; }
    if (!o || o.app !== 'hub-pribadi' || !o.data) { toast('File ini bukan cadangan Hub Pribadi'); return; }
    if (!confirm('Seluruh data di perangkat ini akan diganti dengan isi cadangan. Lanjutkan?')) return;
    const keep = { geminiKey: S.settings.geminiKey, syncSecret: S.settings.syncSecret, syncOn: S.settings.syncOn };
    S.settings = { ...DEF_SET, ...(o.data.settings || {}), ...keep, syncRev: 0 };
    COLLS.forEach(k => S[k] = Array.isArray(o.data[k]) ? o.data[k] : []);
    S.tomb = {};
    if (!S.categories.length) seedCategories();
    rebuildSnap(); const stamp = Date.now(); SYNC_COLLS.forEach(k => S[k].forEach(x => { x._u = stamp; })); S.settings._su = stamp;
    DB.put('settings', S.settings); DB.put('tomb', S.tomb); COLLS.forEach(persist); render(); toast('Data dipulihkan');
    if (syncActive() && confirm('Sinkron sedang aktif. Timpa data di server dengan hasil pemulihan ini supaya perangkat lain ikut?')) { const ok = await syncNow({ force: 'push', verbose: true }); if (ok) toast('Server diperbarui'); }
    else if (syncActive()) markDirty();
  };
  r.readAsText(file);
}
ACT.wipe = () => {
  if (syncActive() && !confirm('Sinkron sedang aktif. Penghapusan ikut ke server dan semua perangkat lain. Kalau hanya ingin menghapus di perangkat ini, matikan sinkron dulu. Tetap lanjut menghapus di semua perangkat?')) return;
  if (!confirm('Hapus SEMUA data? Tindakan ini tidak bisa dibatalkan.')) return;
  if (prompt('Ketik HAPUS untuk memastikan:') !== 'HAPUS') { toast('Dibatalkan'); return; }
  const keep = { geminiKey: S.settings.geminiKey, syncSecret: S.settings.syncSecret, syncOn: S.settings.syncOn, syncRev: S.settings.syncRev };
  const now = Date.now();
  SYNC_COLLS.forEach(k => { S.tomb[k] = S.tomb[k] || {}; S[k].forEach(r => { S.tomb[k][r.id] = now; }); });
  COLLS.forEach(k => S[k] = []); S.settings = { ...DEF_SET, created: today(), ...keep, _su: now };
  seedCategories(); S.categories.forEach(c => { c._u = now + 1; }); rebuildSnap();
  DB.put('tomb', S.tomb); DB.put('settings', S.settings); COLLS.forEach(persist);
  if (syncActive()) markDirty();
  AIOUT = null; renderAIOut(); render(); toast('Semua data dihapus');
};

/* ================= router, navigasi, event ================= */
const TITLES = { beranda: 'Beranda', kalender: 'Kalender', kuliah: 'Kuliah', riset: 'Riset', keuangan: 'Keuangan', pengaturan: 'Pengaturan' };
const VIEWS = { beranda: viewBeranda, kalender: viewKalender, kuliah: viewKuliah, riset: viewRiset, keuangan: viewKeuangan, pengaturan: viewPengaturan };
function renderNav() {
  const items = Object.entries(TITLES);
  $('#nav').innerHTML = `<div class="brand">Hub Pribadi</div>` + items.map(([k, l]) => `<button type="button" class="${UI.tab === k ? 'on' : ''}" ${UI.tab === k ? 'aria-current="page"' : ''} ${A('go', k)}>${l}</button>`).join('');
  $('#tabbar').innerHTML = items.slice(0, 5).map(([k, l]) => `<button type="button" class="${UI.tab === k ? 'on' : ''}" ${UI.tab === k ? 'aria-current="page"' : ''} ${A('go', k)}>${l}</button>`).join('');
}
function render() {
  const ae = document.activeElement; const key = ae && ae.dataset ? ae.dataset.search : null; const pos = ae && ae.selectionStart;
  $('#title').textContent = TITLES[UI.tab];
  document.title = TITLES[UI.tab] + ' · Hub Pribadi';
  $('#main').innerHTML = VIEWS[UI.tab]();
  renderNav(); renderSyncBadge();
  $('#fab').style.display = UI.tab === 'pengaturan' ? 'none' : '';
  if (key) { const n = $(`[data-search="${key}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } }
  postRender();
}
function addCurrent() {
  const s = UI.sub;
  const m = {
    beranda: editTx, kalender: () => editTask(null),
    kuliah: () => ({ tugas: () => editTask(null), materi: () => editMaterial(null), matkul: () => editCourse(null), jadwal: () => editClass(null), statistik: () => editTask(null) }[s.kuliah])(),
    riset: () => ({ progres: () => editMilestone(null), kebutuhan: () => editNeed(null), ide: () => editIdea(null), literatur: () => editLit(null), bimbingan: () => editBim(null) }[s.riset])(),
    keuangan: () => ({ ringkasan: () => editTx(null), transaksi: () => editTx(null), akun: () => editAccount(null), investasi: () => editInv(null), anggaran: () => editBudget(null), target: () => editGoal(null), utang: () => editDebt(null), tagihan: () => editBill(null), kategori: () => editCat(null) }[s.keu])()
  }[UI.tab];
  if (m) m(null);
}
ACT.fab = () => addCurrent();
ACT.subtab = el => { const [ns, v] = el.dataset.id.split(':'); UI.sub[ns] = v; render(); };
const setBind = (bind, val) => { if (bind.includes(':')) { const [ns, k] = bind.split(':'); UI[ns][k] = val; } else UI[bind] = val; };
let bindT = null;

function wire() {
  document.addEventListener('click', e => {
    const d = dlg();
    if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { closeForm(); return; } }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); f(el, e); }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'frm') { e.preventDefault(); submitForm(); }
    else if (e.target.id === 'cmd') { e.preventDefault(); const i = $('#cmdin'); const v = i.value; i.value = ''; runCommand(v); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches && t.matches('input[data-bind]')) { setBind(t.dataset.bind, t.value); clearTimeout(bindT); bindT = setTimeout(render, 180); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.closest && t.closest('#frm') && t.dataset.reload && FORM) { FORM.vals = collect(); if (FORM.cfg.onReload) FORM.cfg.onReload(FORM.vals); renderForm(t.name); return; }
    if (t.matches('select[data-bind]')) { setBind(t.dataset.bind, t.value); render(); return; }
    if (t.dataset && t.dataset.ms) { const m = S.milestones.find(x => x.id === t.dataset.ms); if (m) { m.pct = Number(t.value); commit('milestones'); render(); } return; }
    if (t.id === 'importfile' && t.files[0]) { importBackup(t.files[0]); t.value = ''; }
  });
  dlg().addEventListener('close', () => { FORM = null; onFormClosed(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && syncActive()) scheduleSync(300); });
  window.addEventListener('online', () => { if (syncActive()) scheduleSync(300); });
}

async function init() {
  await DB.open();
  const all = await DB.getAll();
  S.settings = { ...DEF_SET, ...(all.settings || {}) };
  COLLS.forEach(k => S[k] = Array.isArray(all[k]) ? all[k] : []);
  S.tomb = all.tomb && typeof all.tomb === 'object' ? all.tomb : {};
  rebuildSnap();
  if (!S.settings.created) { S.settings.created = today(); commit('settings'); }
  if (!S.categories.length) seedCategories();
  UI.calDate = today(); UI.keuMonth = today().slice(0, 7);
  const lm = location.hash.match(/^#sync=(.+)$/);
  if (lm) {
    history.replaceState(null, '', location.pathname + location.search);
    let code = ''; try { code = decodeURIComponent(lm[1]); } catch (e) { }
    if (code.length >= 16 && confirm('Sambungkan perangkat ini ke sinkron memakai kode dari tautan?')) { S.settings.syncSecret = code; S.settings.syncOn = true; S.settings.syncRev = 0; commit('settings'); }
  }
  wire(); render(); renderAIOut(); startSyncLoop();
  if (syncActive()) syncNow({ full: true });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
}
if (typeof document !== 'undefined' && document.addEventListener && typeof module === 'undefined') document.addEventListener('DOMContentLoaded', init);
