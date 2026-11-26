import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Body = { contents: { parts: { text?: string; speechMetadata?: { speaker?: string } }[] }[]; generationConfig?: { speechConfig?: unknown } };

describe('synthesize (server TTS tiruan)', () => {
  let srv: Server;
  const bodies: Body[] = [];
  let rejectFirst = false;
  beforeAll(async () => {
    srv = createServer((req, res) => {
      let d = '';
      req.on('data', (c) => (d += c));
      req.on('end', () => {
        bodies.push(JSON.parse(d));
        res.setHeader('content-type', 'application/json');
        if (rejectFirst && bodies.length === 1) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { code: 400, message: 'speechMetadata not supported', status: 'INVALID_ARGUMENT' } }));
          return;
        }
        res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(4800).toString('base64') } }] } }] }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    vi.stubEnv('GEMINI_API_KEY', 'uji');
    vi.stubEnv('GEMINI_MODEL', 'teks-uji');
    vi.stubEnv('GEMINI_TTS_MODEL', 'tts-uji');
    vi.stubEnv('GEMINI_BASE_URL', `http://127.0.0.1:${(srv.address() as AddressInfo).port}`);
  });
  afterAll(() => { vi.unstubAllEnvs(); srv.close(); });

  const conv = { speakers: [{ name: 'Anna', gender: 'female' as const }, { name: 'Tom', gender: 'male' as const }], lines: [{ speaker: 'Anna', text: 'Hi.' }, { speaker: 'Tom', text: 'Hello.' }] };

  it('percakapan: tiap kalimat dikirim dengan speechMetadata.speaker', async () => {
    bodies.length = 0; rejectFirst = false;
    const { synthesize } = await import('./tts');
    const out = await synthesize(conv);
    expect(out).toMatchObject({ rate: 24000 });
    expect(out.pcm.length).toBe(4800);
    const parts = bodies[0].contents[0].parts;
    expect(parts.map((p) => p.speechMetadata?.speaker)).toEqual(['Anna', 'Tom']);
    expect(parts.map((p) => p.text)).toEqual(['Hi.', 'Hello.']);
    expect(JSON.stringify(bodies[0].generationConfig?.speechConfig)).toContain('multiSpeakerVoiceConfig');
  });

  it('model lama menolak: coba sekali lagi dengan format teks "Nama: kalimat"', async () => {
    bodies.length = 0; rejectFirst = true;
    const { synthesize } = await import('./tts');
    await synthesize(conv);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].contents[0].parts).toHaveLength(1);
    expect(bodies[1].contents[0].parts[0].text).toContain('Tom: Hello.');
  });
});
