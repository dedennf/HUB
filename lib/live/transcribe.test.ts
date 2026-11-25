import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { transcribeWithLive, wavToPcm16k } from './transcribe';

function wav(samples: number, rate = 16000, channels = 1): Buffer {
  const pcm = Buffer.alloc(samples * 2 * channels);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2 * channels);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2 * channels, 28); h.writeUInt16LE(2 * channels, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

describe('wavToPcm16k', () => {
  it('mengambil data PCM dari WAV 16 kHz mono', () => {
    expect(wavToPcm16k(wav(1600))!.length).toBe(3200);
  });
  it('menolak laju atau kanal lain dan bukan WAV', () => {
    expect(wavToPcm16k(wav(1600, 48000))).toBeNull();
    expect(wavToPcm16k(wav(1600, 16000, 2))).toBeNull();
    expect(wavToPcm16k(Buffer.from('bukan wav sama sekali, cukup panjang untuk header 44 byte...'))).toBeNull();
  });
});

describe('transcribeWithLive (server Live tiruan)', () => {
  let server: Server;
  let base = '';
  const seen: { setup?: Record<string, unknown>; bytes: number } = { bytes: 0 };
  let mode: 'ok' | 'silent' | 'close' = 'ok';

  beforeAll(async () => {
    server = createServer();
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws) => {
      if (mode === 'close') { ws.close(1008, 'model tidak mendukung'); return; }
      const send = (o: unknown) => ws.send(JSON.stringify(o));
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.setup) { seen.setup = m.setup; send({ setupComplete: {} }); return; }
        if (m.realtimeInput?.audio) seen.bytes += Buffer.from(m.realtimeInput.audio.data, 'base64').length;
        if (m.realtimeInput?.audioStreamEnd) {
          if (mode === 'ok') {
            send({ serverContent: { inputTranscription: { text: 'tadi beli bensin ' } } });
            setTimeout(() => send({ serverContent: { inputTranscription: { text: 'tiga puluh ribu' } } }), 50);
          }
          setTimeout(() => send({ serverContent: { turnComplete: true } }), 100);
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('mengirim audio lalu mengumpulkan transkrip input', async () => {
    mode = 'ok'; seen.bytes = 0;
    const t = await transcribeWithLive({ apiKey: 'uji', model: 'live-uji', pcm: wavToPcm16k(wav(16000))!, baseUrl: base, timeoutMs: 5000 });
    expect(t).toBe('tadi beli bensin tiga puluh ribu');
    expect(JSON.stringify(seen.setup)).toContain('inputAudioTranscription');
    expect(seen.bytes).toBe(32000 + 3200 * 7); // audio + 700 ms hening
  });
  it('tanpa ucapan: null', async () => {
    mode = 'silent';
    expect(await transcribeWithLive({ apiKey: 'uji', model: 'live-uji', pcm: Buffer.alloc(3200), baseUrl: base, timeoutMs: 5000 })).toBeNull();
  });
  it('sesi ditolak: melempar galat supaya pemanggil kembali ke model teks', async () => {
    mode = 'close';
    await expect(transcribeWithLive({ apiKey: 'uji', model: 'salah', pcm: Buffer.alloc(3200), baseUrl: base, timeoutMs: 5000 })).rejects.toThrow(/1008|tidak mendukung/);
  });
});
