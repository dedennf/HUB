'use client';
import { ArrowLeftRight, CalendarCheck, CalendarDays, ClipboardList, Lightbulb, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { approveRa, askRa, undoRa, type Created, type ProposalView } from '@/app/(dashboard)/ra-actions';
import { useRa, type RaMessage } from '@/components/providers/RaProvider';
import { ActionBar } from './ActionBar';
import { ActionCard } from './ActionCard';
import { ChatBubble } from './ChatBubble';
import { RaInputBar } from './RaInputBar';
import { RaAvatar } from './RaMark';
import { UndoToast } from './UndoToast';

const ICON: Record<ProposalView['icon'], LucideIcon> = {
  expense: TrendingDown, income: TrendingUp, transfer: ArrowLeftRight, task: CalendarCheck, event: CalendarDays, idea: Lightbulb, need: ClipboardList,
};
const TONE: Record<ProposalView['icon'], 'expense' | 'income' | 'task' | 'neutral'> = {
  expense: 'expense', income: 'income', transfer: 'neutral', task: 'task', event: 'neutral', idea: 'neutral', need: 'neutral',
};
const EXAMPLES = ['kopi 18rb dana', 'tugas laporan jumat 23.59', 'rapat besok jam 14 di perpus', 'saldo berapa?'];

const uid = () => Math.random().toString(36).slice(2);

/** Percakapan Ra memakai pengurai lokal (D-32). Dipakai panel laptop dan sheet HP. */
export function RaChat({ inputRef, showCamera = true }: { inputRef?: RefObject<HTMLInputElement | null>; showCamera?: boolean }) {
  const { messages, setMessages } = useRa();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; created: Created[]; msgId: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, pending]);

  const send = (text: string) => {
    setMessages((m) => [...m.map((x) => (x.from === 'ra' && x.status === 'pending' ? { ...x, status: 'cancelled' as const } : x)), { id: uid(), from: 'user', text }]);
    start(async () => {
      try {
        const r = await askRa(text);
        setMessages((m) => [...m, { id: uid(), from: 'ra', text: r.reply, lines: r.lines, proposals: r.proposals, status: r.proposals.length ? 'pending' : undefined }]);
      } catch {
        setMessages((m) => [...m, { id: uid(), from: 'ra', text: 'Ra sedang tidak tersambung ke server. Coba lagi sebentar lagi.' }]);
      }
    });
  };

  const update = (id: string, patch: Partial<Extract<RaMessage, { from: 'ra' }>>) =>
    setMessages((m) => m.map((x) => (x.id === id && x.from === 'ra' ? { ...x, ...patch } : x)));

  const approve = (msg: Extract<RaMessage, { from: 'ra' }>) => start(async () => {
    const r = await approveRa((msg.proposals ?? []).map((p) => p.proposal));
    if (!r.ok) { setMessages((m) => [...m, { id: uid(), from: 'ra', text: r.message }]); return; }
    update(msg.id, { status: 'approved' });
    setToast({ text: r.message, created: r.created, msgId: msg.id });
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
            <RaAvatar size={44} />
            <p className="font-display text-[16px] font-bold">Catat apa hari ini?</p>
            <p className="max-w-72 text-[13px] text-muted">Ra belum tersambung ke Gemini, jadi perintah dibaca pengurai lokal. Bisa transaksi, tugas, acara, ide, dan pertanyaan saldo. Tidak ada yang tersimpan sebelum kamu setujui.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => send(e)} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-[12px] text-fg hover:border-accent">{e}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-3">
            {messages.map((m) => m.from === 'user' ? <ChatBubble key={m.id} from="user">{m.text}</ChatBubble> : (
              <div key={m.id} className="flex flex-col gap-2.5">
                <ChatBubble from="ra">{m.text}</ChatBubble>
                {m.lines && <ul className="card rows overflow-hidden text-[13px]">{m.lines.map((l, i) => <li key={i} className="px-4 py-2.5">{l}</li>)}</ul>}
                {m.proposals && m.proposals.length > 0 && m.status !== 'cancelled' && (
                  <div className={`flex flex-col gap-2.5 ${m.status === 'pending' ? '' : 'opacity-60'}`}>
                    {m.proposals.map((p) => (
                      <ActionCard key={p.key} icon={ICON[p.icon]} tone={TONE[p.icon]} kindLabel={p.kindLabel} value={p.value} chips={p.chips} note={p.note}
                        onRemove={m.status === 'pending' ? () => {
                          const rest = (m.proposals ?? []).filter((x) => x.key !== p.key);
                          update(m.id, rest.length ? { proposals: rest } : { proposals: rest, status: 'cancelled' });
                        } : undefined} />
                    ))}
                    {m.status === 'pending' && <ActionBar count={m.proposals.length} disabled={pending} onCancel={() => update(m.id, { status: 'cancelled' })} onApprove={() => approve(m)} />}
                    {m.status === 'approved' && <p className="text-[12px] font-semibold text-positive">Disimpan.</p>}
                    {m.status === 'undone' && <p className="text-[12px] text-muted">Dibatalkan, tidak ada yang tersimpan.</p>}
                  </div>
                )}
                {m.status === 'cancelled' && <p className="text-[12px] text-muted">Tidak disimpan.</p>}
              </div>
            ))}
            {pending && <p className="text-[13px] text-muted" role="status">Ra membaca...</p>}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <RaInputBar inputRef={inputRef} onSubmit={send} busy={pending} showCamera={showCamera} />
      {toast && (
        <UndoToast key={toast.msgId} message={toast.text} undoing={undoing} onDone={() => setToast(null)}
          onUndo={async () => {
            setUndoing(true);
            await undoRa(toast.created);
            update(toast.msgId, { status: 'undone' });
            setUndoing(false);
            setToast(null);
          }} />
      )}
    </div>
  );
}
