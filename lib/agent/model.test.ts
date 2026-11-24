import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeminiModel, ModelError } from './model';

// Server Gemini tiruan: status HTTP ditentukan dari nama model di URL.
let server: Server;
let base = '';
const hits = new Map<string, number>();
beforeAll(async () => {
  server = createServer((req, res) => {
    const name = req.url?.match(/models\/([^:]+)/)?.[1] ?? '';
    hits.set(name, (hits.get(name) ?? 0) + 1);
    // "flaky": gagal 503 sekali lalu berhasil
    const status = name === 'flaky' ? (hits.get(name) === 1 ? 503 : 200) : Number(name.match(/^s(\d{3})/)?.[1] ?? 200);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200
      ? { candidates: [{ content: { role: 'model', parts: [{ text: 'halo' }] } }] }
      : { error: { code: status, message: `galat ${status}`, status: 'X' } }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const call = (model: string, baseUrl = base) => new GeminiModel({ apiKey: 'k', model, baseUrl }).generate({ system: 's', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [] });
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
