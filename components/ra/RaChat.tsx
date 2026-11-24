'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { ApiFailure, confirmActions, sendToRa, undoActions } from '@/lib/agent/client';
import { useRa, type RaMessage } from '@/components/providers/RaProvider';
import { ActionBar } from './ActionBar';
import { ChatBubble } from './ChatBubble';
import { OfflineBanner } from './OfflineBanner';
import { ProposalCard } from './ProposalCard';
import { RaInputBar } from './RaInputBar';
import { RaAvatar } from './RaMark';
import { ReceiptScanning } from './ReceiptScanning';
import { UndoToast } from './UndoToast';

const EXAMPLES = ['tadi beli bensin 30rb pakai gopay', 'tugas laporan RDTR dikumpul jumat jam 23.59', 'pindahin 500rb dari BCA ke Dana', 'sisa uang di semua akun berapa'];

const uid = () => Math.random().toString(36).slice(2);
type RaMsg = Extract<RaMessage, { from: 'ra' }>;

/** Percakapan Ra (SPEC 6.2 dan 6.3). Dipakai panel laptop dan sheet HP. */
export function RaChat({ inputRef, showCamera = true }: { inputRef?: RefObject<HTMLInputElement | null>; showCamera?: boolean }) {
  const { messages, setMessages, conversationId, setConversationId, pickReceipts, scanning } = useRa();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; ids: string[]; msgId: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  // simpan terpisah dari transisi kirim, supaya input tidak terkunci selama halaman disegarkan
  const [saving, setSaving] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, pending, scanning]);

  const say = (text: string, extra: Partial<RaMsg> = {}) => setMessages((m) => [...m, { id: uid(), from: 'ra', text, ...extra }]);
  const update = (id: string, patch: Partial<RaMsg> | ((x: RaMsg) => Partial<RaMsg>)) =>
    setMessages((m) => m.map((x) => (x.id === id && x.from === 'ra' ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)));

  const send = (text: string) => {
    // usulan lama yang belum diputuskan dianggap batal (server juga menolaknya)
    const stale = messages.filter((x): x is RaMsg => x.from === 'ra' && x.status === 'pending').flatMap((x) => (x.actions ?? []).map((a) => a.id));
    if (stale.length) void confirmActions(stale, 'reject').catch(() => {});
    setMessages((m) => [...m.map((x) => (x.from === 'ra' && x.status === 'pending' ? { ...x, status: 'cancelled' as const } : x)), { id: uid(), from: 'user', text }]);
    start(async () => {
      try {
        const r = await sendToRa(text, conversationId);
        setConversationId(r.conversation_id);
        say(r.reply, { lines: r.lines, actions: r.proposed_actions, lookups: r.lookups, offline: r.offline, edits: {}, status: r.proposed_actions.length ? 'pending' : undefined });
      } catch (e) {
        say(e instanceof ApiFailure ? e.message : 'Ra sedang tidak tersambung ke server. Coba lagi sebentar lagi.');
      }
    });
  };

  const approve = async (msg: RaMsg) => {
    if (saving) return;
    setSaving(true);
    const ids = (msg.actions ?? []).map((a) => a.id);
    const edits = Object.fromEntries(Object.entries(msg.edits ?? {}).map(([id, f]) => [id, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value]))]));
    try {
      const r = await confirmActions(ids, 'approve', edits);
      if (!r.ok) { say(r.message); return; }
      update(msg.id, { status: 'approved' });
      setToast({ text: r.message, ids: r.executed, msgId: msg.id });
      router.refresh();
    } catch {
      say('Gagal menyimpan. Cek koneksi lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const reject = (msg: RaMsg, ids = (msg.actions ?? []).map((a) => a.id)) => {
    void confirmActions(ids, 'reject').catch(() => {});
    update(msg.id, (x) => {
      const rest = (x.actions ?? []).filter((a) => !ids.includes(a.id));
      return rest.length ? { actions: rest } : { status: 'cancelled' };
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
            <RaAvatar size={44} />
            <p className="font-display text-[16px] font-bold">Catat apa hari ini?</p>
            <p className="max-w-72 text-[13px] text-muted">Tulis seperti chat biasa, atau kirim foto struk dan bukti transfer. Tidak ada yang tersimpan sebelum kamu setujui.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => send(e)} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-[12px] text-fg hover:border-accent">{e}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-3">
            {messages.map((m) => m.from === 'user' ? (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                {m.images && m.images.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {m.images.map((src, i) => src
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img key={i} src={src} alt={`Struk ${i + 1}`} className="h-20 w-16 rounded-xl border border-line object-cover" />
                      : <span key={i} className="flex h-20 w-16 items-center justify-center rounded-xl border border-line bg-surface text-[11px] font-semibold text-muted">PDF/HEIC</span>)}
                  </div>
                )}
                <ChatBubble from="user">{m.text}</ChatBubble>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-2.5">
                {m.offline && <OfflineBanner reason={m.offline} />}
                <ChatBubble from="ra"><span className="whitespace-pre-line">{m.text}</span></ChatBubble>
                {m.lines && <ul className="card rows overflow-hidden text-[13px]">{m.lines.map((l, i) => <li key={i} className="px-4 py-2.5">{l}</li>)}</ul>}
                {m.links && m.links.map((l) => (
                  <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent underline-offset-2 hover:underline">{l.label}</Link>
                ))}
                {m.actions && m.actions.length > 0 && m.status !== 'cancelled' && (
                  <div className={`flex flex-col gap-2.5 ${m.status === 'pending' ? '' : 'opacity-60'}`}>
                    {m.actions.map((a) => (
                      <ProposalCard key={a.id} card={a} lookups={m.lookups} edits={m.edits?.[a.id]} readOnly={m.status !== 'pending'}
                        onEdit={(field, e) => update(m.id, (x) => ({ edits: { ...x.edits, [a.id]: { ...x.edits?.[a.id], [field]: e } } }))}
                        onRemove={() => reject(m, [a.id])} />
                    ))}
                    {m.status === 'pending' && (
                      <ActionBar count={m.actions.length} disabled={pending || saving} destructive={m.actions.some((a) => a.destructive)}
                        onCancel={() => reject(m)} onApprove={() => approve(m)} />
                    )}
                    {m.status === 'approved' && <p className="text-[12px] font-semibold text-positive">Disimpan. Riwayatnya ada di Log Agen.</p>}
                    {m.status === 'undone' && <p className="text-[12px] text-muted">Dibatalkan, data dikembalikan.</p>}
                  </div>
                )}
                {m.status === 'cancelled' && <p className="text-[12px] text-muted">Tidak disimpan.</p>}
              </div>
            ))}
            {pending && <p className="text-[13px] text-muted" role="status">Ra membaca...</p>}
            {scanning && (
              <div>
                <ReceiptScanning imageUrl={scanning.preview ?? undefined} />
                {scanning.total > 1 && <p className="mt-1 text-[12px] text-muted">Struk {scanning.done + 1} dari {scanning.total}</p>}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <RaInputBar inputRef={inputRef} onSubmit={send} busy={pending} showCamera={showCamera} onPick={pickReceipts} picking={!!scanning} />
      {toast && (
        <UndoToast key={toast.msgId} message={toast.text} undoing={undoing} onDone={() => setToast(null)}
          onUndo={async () => {
            setUndoing(true);
            const r = await undoActions(toast.ids).catch(() => ({ ok: false, message: 'Gagal membatalkan.' }));
            if (r.ok) update(toast.msgId, { status: 'undone' }); else say(r.message);
            setUndoing(false);
            setToast(null);
            router.refresh();
          }} />
      )}
    </div>
  );
}
