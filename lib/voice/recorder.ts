// Perekam suara Ra (SPEC 7.3): MediaRecorder (webm/opus, mp4 di Safari), level gelombang, batas 60 detik.
// Sebelum dikirim, rekaman diubah ke WAV 16 kHz mono (format yang pasti dibaca Gemini). Ini bukan speech-to-text:
// audio tetap dikirim utuh ke Gemini (D-47).

export const MAX_SECONDS = 60;
/** Puncak RMS di bawah ini dianggap sunyi: rekaman tidak dikirim, supaya Gemini tidak mengarang isi (D-49). */
export const SILENCE_RMS = 0.02;

/** RMS sampel PCM 8-bit tak bertanda (getByteTimeDomainData, diam = 128). */
export function rmsOfBytes(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
  return data.length ? Math.sqrt(sum / data.length) : 0;
}
const RATE = 16_000;
const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];

/** Format perekam pertama yang didukung browser. Kosong = biarkan browser memilih. */
export function pickMime(isSupported: (t: string) => boolean): string {
  return CANDIDATES.find((t) => { try { return isSupported(t); } catch { return false; } }) ?? '';
}

/** Sampel mono float (-1..1) → berkas WAV PCM 16-bit. */
export function encodeWav(samples: Float32Array, rate = RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Ubah rekaman ke WAV 16 kHz mono. Bila browser tidak bisa mengurai, kirim rekaman asli. */
export async function toGeminiAudio(blob: Blob): Promise<{ blob: Blob; mime: string }> {
  const original = { blob, mime: (blob.type || 'audio/webm').split(';')[0] };
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const length = Math.max(1, Math.ceil(decoded.duration * RATE));
    const off = new OfflineAudioContext(1, length, RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return { blob: encodeWav(rendered.getChannelData(0)), mime: 'audio/wav' };
  } catch {
    return original;
  }
}

export type RecorderUpdate = { seconds: number; levels: number[] };

/** Satu sesi rekaman. `stop()` mengembalikan audio, `cancel()` membuang. Berhenti sendiri di `maxSeconds` (bawaan 60 detik). */
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;
  private raf = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = 0;
  private done: ((r: { blob: Blob; seconds: number; peak: number } | null) => void) | null = null;
  /** Puncak keras suara selama merekam (RMS 0..1). -1 bila Web Audio tidak tersedia (tidak bisa menilai). */
  private peak = -1;
  private cancelled = false;

  constructor(private onUpdate: (u: RecorderUpdate) => void, private onLimit: () => void, private maxSeconds = MAX_SECONDS) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = pickMime((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const seconds = Math.round((Date.now() - this.started) / 1000);
      const blob = new Blob(this.chunks, { type: this.rec?.mimeType || mime || 'audio/webm' });
      this.cleanup();
      this.done?.(this.cancelled ? null : { blob, seconds, peak: this.peak });
    };
    this.started = Date.now();
    this.rec.start(250);
    this.meter();
    this.timer = setInterval(() => {
      const s = (Date.now() - this.started) / 1000;
      if (s >= this.maxSeconds) this.onLimit();
    }, 250);
  }

  private meter() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      const an = this.audioCtx.createAnalyser();
      an.fftSize = 64;
      this.audioCtx.createMediaStreamSource(this.stream!).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const wave = new Uint8Array(an.fftSize);
      this.peak = 0;
      const tick = () => {
        an.getByteTimeDomainData(wave);
        this.peak = Math.max(this.peak, rmsOfBytes(wave));
        an.getByteFrequencyData(data);
        const levels = Array.from({ length: 16 }, (_, i) => (data[i + 1] ?? 0) / 255);
        this.onUpdate({ seconds: Math.floor((Date.now() - this.started) / 1000), levels });
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // tanpa Web Audio: tetap merekam, gelombang diam
    }
  }

  stop(): Promise<{ blob: Blob; seconds: number; peak: number } | null> {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === 'inactive') { resolve(null); return; }
      this.done = resolve;
      this.rec.stop();
    });
  }

  cancel(): void {
    this.cancelled = true;
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    else this.cleanup();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    if (this.timer) clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close().catch(() => {});
    this.stream = null;
    this.audioCtx = null;
  }
}
