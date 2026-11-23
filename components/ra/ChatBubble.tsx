import { Mic } from 'lucide-react';
import type { ReactNode } from 'react';

/** Gelembung chat. Pengguna: kanan, latar accent, sudut kanan bawah 4 px. Pesan suara: ikon mic + durasi. */
export function ChatBubble({ from, children, voiceSeconds }: { from: 'user' | 'ra'; children: ReactNode; voiceSeconds?: number }) {
  if (from === 'ra') return <p className="max-w-[90%] text-[14px] leading-relaxed text-fg">{children}</p>;
  return (
    <div className="ml-auto max-w-[85%] rounded-[18px] rounded-br-[4px] bg-accent-fill px-4 py-2.5 text-[14px] leading-relaxed text-on-accent">
      {voiceSeconds != null && (
        <span className="mb-1 flex items-center gap-1 text-[12px] opacity-80">
          <Mic size={13} strokeWidth={1.8} aria-hidden="true" /> Pesan suara · {Math.floor(voiceSeconds / 60)}:{String(voiceSeconds % 60).padStart(2, '0')}
        </span>
      )}
      {children}
    </div>
  );
}
