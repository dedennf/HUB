import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeminiModel, ModelError, readThinkingLevel } from './model';

// Server Gemini tiruan: status HTTP ditentukan dari nama model di URL.
let server: Server;
let base = '';
const hits = new Map<string, number>();
const bodies = new Map<string, Record<string, unknown>[]>();
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const name = req.url?.match(/models\/([^:]+)/)?.[1] ?? '';
      const body = JSON.parse(raw || '{}');
      hits.set(name, (hits.get(name) ?? 0) + 1);
      bodies.set(name, [...(bodies.get(name) ?? []), body]);
      const thinking = !!body.generationConfig?.thinkingConfig;
      // "flaky": gagal 503 sekali lalu berhasil. "lama": tidak mengenal thinkingLevel.
      const status = name === 'flaky' ? (hits.get(name) === 1 ? 503 : 200)
        : name === 'lama' ? (thinking ? 400 : 200)
          : Number(name.match(/^s(\d{3})/)?.[1] ?? 200);
      const message = name === 'lama' ? 'Thinking level is not supported for this model.' : `galat ${status}`;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200
        ? { candidates: [{ content: { role: 'model', parts: [{ text: 'halo' }] } }] }
        : { error: { code: status, message, status: 'X' } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const call = (model: string, baseUrl = base, thinkingLevel?: 'off' | 'low' | 'minimal') => new GeminiModel({ apiKey: 'k', model, baseUrl, thinkingLevel }).generate({ system: 's', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [] });
const reason = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof ModelError ? e.reason : `bukan ModelError: ${e}`));

describe('GeminiModel memetakan galat HTTP', () => {
  it('200 → teks', async () => expect((await call('s200')).text).toBe('halo'));
  it('429 → quota', async () => expect(await reason(call('s429'))).toBe('quota'));
  it('400, 403, 404 → rejected', async () => {
    for (const s of ['s400', 's403', 's404']) expect(await reason(call(s))).toBe('rejected');
    hits.delete('s404');
  });
  it('503 → dicoba ulang sekali lalu unavailable, detail memuat status asli', async () => {
    const e = await call('s503').catch((x) => x);
    expect(e).toBeInstanceOf(ModelError);
    expect(e.reason).toBe('unavailable');
    expect(e.detail).toMatch(/^ApiError 503 /);
    expect(hits.get('s503')).toBe(2);
  });
  it('504 DEADLINE_EXCEEDED → timeout, tidak dicoba ulang', async () => {
    expect(await reason(call('s504'))).toBe('timeout');
    expect(hits.get('s504')).toBe(1);
  });
  it('503 sekali lalu pulih → berhasil', async () => expect((await call('flaky')).text).toBe('halo'));
  it('404 tidak dicoba ulang', async () => {
    await call('s404').catch(() => {});
    expect(hits.get('s404')).toBe(1);
  });
  it('host tidak bisa dihubungi → unavailable dengan penyebab jaringan di detail', async () => {
    // port yang baru saja dilepas: koneksi pasti ditolak
    const tmp = createServer();
    await new Promise<void>((r) => tmp.listen(0, '127.0.0.1', r));
    const port = (tmp.address() as AddressInfo).port;
    await new Promise((r) => tmp.close(r));
    const e = await call('s200', `http://127.0.0.1:${port}`).catch((x) => x);
    expect(e.reason).toBe('unavailable');
    expect(e.detail).toMatch(/ECONNREFUSED/);
  });
});

describe('tingkat berpikir', () => {
  it('bawaan low dikirim sebagai thinkingConfig', async () => {
    await call('t1');
    expect((bodies.get('t1')![0].generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });
  it('off: tidak dikirim', async () => {
    await call('t2', base, 'off');
    expect((bodies.get('t2')![0].generationConfig as Record<string, unknown> | undefined)?.thinkingConfig).toBeUndefined();
  });
  it('model yang menolak thinkingLevel: kirim ulang tanpa, lalu diingat', async () => {
    expect((await call('lama')).text).toBe('halo');
    expect(hits.get('lama')).toBe(2);
    await call('lama');
    expect(hits.get('lama')).toBe(3);
  });
  it('readThinkingLevel: nilai tak dikenal jadi low', () => {
    expect(readThinkingLevel(undefined)).toBe('low');
    expect(readThinkingLevel(' Minimal ')).toBe('minimal');
    expect(readThinkingLevel('tinggi')).toBe('low');
  });
});

describe('model cadangan', () => {
  const withFallback = (model: string, fallbackModel: string) => new GeminiModel({ apiKey: 'k', model, fallbackModel, baseUrl: base });
  const req = { system: 's', contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }], tools: [] };
  it('503 di model utama: langsung pindah ke cadangan tanpa coba ulang utama', async () => {
    const m = withFallback('s503', 'cadangan1');
    const before = hits.get('s503') ?? 0;
    expect((await m.generate(req)).text).toBe('halo');
    expect(hits.get('s503')).toBe(before + 1);
    expect(m.lastServedBy).toBe('cadangan1');
  });
  it('kuota habis dan 504 juga pindah ke cadangan', async () => {
    expect((await withFallback('s429', 'cadangan2').generate(req)).text).toBe('halo');
    expect((await withFallback('s504', 'cadangan3').generate(req)).text).toBe('halo');
  });
  it('404 (nama model salah) tidak pindah ke cadangan', async () => {
    const e = await withFallback('s404', 'cadangan4').generate(req).catch((x) => x);
    expect(e.reason).toBe('rejected');
    expect(hits.get('cadangan4')).toBeUndefined();
  });
  it('cadangan juga gagal: galat cadangan diteruskan', async () => {
    const e = await withFallback('s503', 's500').generate(req).catch((x) => x);
    expect(e.reason).toBe('unavailable');
    expect(e.detail).toMatch(/^ApiError 500 /);
  });
});
