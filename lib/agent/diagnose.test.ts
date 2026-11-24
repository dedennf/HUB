import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { diagnose } from './diagnose';

let server: Server;
let base = '';
const toolsSeen: Record<string, number> = {};
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const name = req.url?.match(/models\/([^:]+)/)?.[1] ?? '';
      const body = JSON.parse(raw || '{}');
      const n = body.tools?.[0]?.functionDeclarations?.length ?? 0;
      toolsSeen[name] = Math.max(toolsSeen[name] ?? 0, n);
      // "berat": gagal 503 hanya bila membawa deklarasi tool
      const status = name === 'penuh' || (name === 'berat' && n > 0) ? 503 : 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { candidates: [{ content: { role: 'model', parts: [{ text: 'siap' }] } }] } : { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

it('diagnosa memisahkan model penuh dari masalah deklarasi tool', async () => {
  const r = await diagnose({ apiKey: 'rahasia-123', model: 'penuh', fallbackModel: 'berat', baseUrl: base, thinkingLevel: 'low' });
  expect(r.config).toEqual({ model: 'penuh', fallback_model: 'berat', thinking_level: 'low', base_url_set: true, api_key_set: true });
  expect(JSON.stringify(r)).not.toContain('rahasia-123');
  const pick = (model: string, test: RegExp) => r.cases.find((c) => c.model === model && test.test(c.test))!;
  expect(pick('penuh', /tanpa tool/)).toMatchObject({ ok: false, reason: 'unavailable' });
  expect(pick('penuh', /tanpa tool/).detail).toMatch(/503/);
  expect(pick('berat', /tanpa tool/)).toMatchObject({ ok: true, reply: 'siap' });
  expect(pick('berat', /tool Ra/)).toMatchObject({ ok: false });
  expect(toolsSeen.berat).toBeGreaterThan(30);
  expect(r.cases).toHaveLength(5);
});
