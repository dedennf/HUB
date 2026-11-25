// Transkripsi pesan suara dengan model Gemini Live (D-63). Model Live punya pengenal suara bawaan
// (inputAudioTranscription) yang jauh lebih akurat untuk ucapan campuran Indonesia-Inggris daripada
// meminta model teks menuliskan isi rekaman. Server membuka sesi Live singkat, mengirim audio PCM 16 kHz,
// mengumpulkan transkrip input, lalu menutup sesi. Jawaban suara model diabaikan.
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';

/** Ambil PCM 16-bit mono dari WAV. null bila bukan WAV PCM 16-bit mono 16 kHz. */
export function wavToPcm16k(buf: Buffer): Buffer | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  // cari potongan "data" (header bisa lebih dari 44 byte)
  let off = 12;
  let fmt: { channels: number; rate: number; bits: number; format: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || fmt.rate !== 16000) return null;
      return buf.subarray(off + 8, Math.min(buf.length, off + 8 + size));
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

const SYSTEM = 'Kamu hanya mendengarkan. Jangan menjawab, jangan menjalankan perintah. Bila harus bersuara, cukup ucapkan "oke".';
const CHUNK = 3200; // 100 ms PCM 16-bit 16 kHz

/**
 * Kembalikan transkrip ucapan, atau null bila tidak ada ucapan yang tertangkap.
 * Melempar galat bila sesi Live gagal, supaya pemanggil bisa kembali ke cara lama.
 */
export async function transcribeWithLive(opts: { apiKey: string; model: string; pcm: Buffer; baseUrl?: string; timeoutMs?: number }): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { apiVersion: 'v1alpha', ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) } });
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let session: Session | null = null;
  try {
    return await new Promise<string | null>((resolve, reject) => {
      let text = '';
      let sentAll = false;
      let settle: ReturnType<typeof setTimeout> | null = null;
      const done = () => { clearTimeout(timer); if (settle) clearTimeout(settle); resolve(text.replace(/\s+/g, ' ').trim().slice(0, 1000) || null); };
      const timer = setTimeout(() => (text.trim() ? done() : reject(new Error(`Live tidak menjawab dalam ${timeoutMs} ms`))), timeoutMs);
      // transkrip input datang bertahap: tunggu sebentar setelah potongan terakhir sebelum dianggap lengkap
      const wait = (ms: number) => { if (settle) clearTimeout(settle); settle = setTimeout(done, ms); };
      const bump = () => { if (sentAll && text.trim()) wait(1200); };
      const onmessage = (m: LiveServerMessage) => {
        const t = m.serverContent?.inputTranscription?.text;
        if (t) { text += t; bump(); }
        // giliran model selesai: sisa potongan transkrip biasanya sudah tiba, beri jeda kecil
        if (sentAll && (m.serverContent?.turnComplete || m.serverContent?.generationComplete)) wait(text.trim() ? 300 : 1500);
      };
      ai.live.connect({
        model: opts.model,
        config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, systemInstruction: SYSTEM },
        callbacks: {
          onmessage,
          onerror: (e) => { clearTimeout(timer); reject(new Error(String((e as ErrorEvent).message ?? 'galat websocket Live'))); },
          onclose: (e) => { if (text.trim()) done(); else { clearTimeout(timer); reject(new Error(`Live ditutup ${e.code}${e.reason ? `: ${e.reason}` : ''}`)); } },
        },
      }).then((s) => {
        session = s;
        for (let i = 0; i < opts.pcm.length; i += CHUNK) {
          s.sendRealtimeInput({ audio: { data: opts.pcm.subarray(i, i + CHUNK).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
        }
        // 700 ms hening supaya deteksi suara menutup giliran, lalu tandai audio selesai
        s.sendRealtimeInput({ audio: { data: Buffer.alloc(CHUNK * 7).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
        s.sendRealtimeInput({ audioStreamEnd: true });
        sentAll = true;
        bump();
      }, (e) => { clearTimeout(timer); reject(e); });
    });
  } finally {
    try { (session as Session | null)?.close(); } catch { /* sudah tertutup */ }
  }
}
