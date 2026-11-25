// Audio untuk Gemini Live (Fase 8): mikrofon → PCM 16-bit 16 kHz mono (base64, potongan ~100 ms),
// dan pemutar PCM 16-bit 24 kHz dari Gemini yang bisa dihentikan seketika saat pengguna memotong bicara.

export const IN_RATE = 16_000;
export const OUT_RATE = 24_000;

/** Turunkan laju sampel dengan rata-rata (cukup untuk suara), lalu ubah ke PCM 16-bit little-endian. */
export function toPcm16(input: Float32Array, fromRate: number, toRate = IN_RATE): Int16Array {
  const ratio = fromRate / toRate;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio), end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end && j < input.length; j++) sum += input[j];
    const x = Math.max(-1, Math.min(1, sum / (end - start)));
    out[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToPcm16(b64: string): Int16Array {
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length - (raw.length % 2));
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) u8[i] = raw.charCodeAt(i);
  return new Int16Array(buf);
}

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('kompas-tap', Tap);
`;

const AC = () => window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

/** Mikrofon untuk sesi Live. onChunk menerima base64 PCM 16 kHz; onLevel 0..1 untuk tampilan gelombang. */
export class MicStream {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private pending: Int16Array[] = [];
  private pendingLen = 0;
  muted = false;

  constructor(private onChunk: (b64: string) => void, private onLevel?: (v: number) => void) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = AC();
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const handle = (f: Float32Array) => this.push(f);
    if (this.ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(this.ctx, 'kompas-tap');
      node.port.onmessage = (e) => handle(e.data as Float32Array);
      src.connect(node);
      this.node = node;
    } else {
      // Safari lama tanpa AudioWorklet
      const node = this.ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => handle(e.inputBuffer.getChannelData(0).slice(0));
      src.connect(node);
      node.connect(this.ctx.destination);
      this.node = node;
    }
  }

  private push(f: Float32Array) {
    if (!this.ctx) return;
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    this.onLevel?.(Math.min(1, Math.sqrt(sum / f.length) * 4));
    if (this.muted) return;
    const pcm = toPcm16(f, this.ctx.sampleRate);
    this.pending.push(pcm);
    this.pendingLen += pcm.length;
    if (this.pendingLen >= IN_RATE / 10) {
      const all = new Int16Array(this.pendingLen);
      let o = 0;
      for (const p of this.pending) { all.set(p, o); o += p.length; }
      this.pending = []; this.pendingLen = 0;
      this.onChunk(bytesToBase64(new Uint8Array(all.buffer)));
    }
  }

  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.ctx = null; this.stream = null; this.node = null;
  }
}

/** Pemutar suara Ra. Potongan diantrekan tanpa jeda. interrupt() menghentikan semua seketika. */
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private analyser: AnalyserNode | null = null;
  private probe: Float32Array<ArrayBuffer> | null = null;
  onPlayingChange?: (playing: boolean) => void;

  /** Panggil dari gestur pengguna (klik) supaya Safari mengizinkan suara. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new (AC())();
      // semua suara Ra lewat analyser supaya animasi bisa membaca volumenya
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
      this.probe = new Float32Array(this.analyser.fftSize);
    }
    void this.ctx.resume();
  }

  /** Volume suara Ra yang sedang diputar, 0..1. */
  level(): number {
    if (!this.analyser || !this.probe || !this.sources.size) return 0;
    this.analyser.getFloatTimeDomainData(this.probe);
    let sum = 0;
    for (let i = 0; i < this.probe.length; i++) sum += this.probe[i] * this.probe[i];
    return Math.min(1, Math.sqrt(sum / this.probe.length) * 5);
  }

  play(b64: string, rate = OUT_RATE) {
    this.unlock();
    const ctx = this.ctx!;
    const pcm = base64ToPcm16(b64);
    if (!pcm.length) return;
    const buf = ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser ?? ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, this.next);
    src.start(at);
    this.next = at + buf.duration;
    this.sources.add(src);
    this.onPlayingChange?.(true);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.onPlayingChange?.(false);
    };
  }

  interrupt() {
    for (const s of this.sources) { try { s.stop(); } catch { /* sudah berhenti */ } }
    this.sources.clear();
    this.next = 0;
    this.onPlayingChange?.(false);
  }

  close() {
    this.interrupt();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.probe = null;
  }
}

/** Laju sampel dari mimeType Gemini, mis. "audio/pcm;rate=24000". */
export function rateOf(mime: string | undefined): number {
  const m = mime?.match(/rate=(\d+)/);
  return m ? Number(m[1]) : OUT_RATE;
}
