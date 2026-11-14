// Fungsi server Vercel untuk sinkron antar perangkat.
// Menyimpan data TERENKRIPSI (enkripsi dilakukan di browser) di Upstash Redis lewat REST API.
// Variabel lingkungan yang dibutuhkan:
//   UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN (otomatis dari integrasi Upstash di Vercel,
//   nama lama KV_REST_API_URL dan KV_REST_API_TOKEN juga didukung)
//   SYNC_TOKEN (diisi dengan nilai yang ditampilkan aplikasi di Pengaturan, tab Sinkron)
const crypto = require('crypto');

const REDIS_URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const HASH = 'hubpribadi:data';
const KEY_RE = /^[a-z0-9:_-]{1,40}$/i;
const MAX_VALUE = 3 * 1024 * 1024;

async function redis(cmd) {
  const r = await fetch(REDIS_URL(), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN(), 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'redis ' + r.status);
  return j.result;
}
async function redisPipeline(cmds) {
  const r = await fetch(REDIS_URL().replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN(), 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  const j = await r.json().catch(() => []);
  if (!r.ok || !Array.isArray(j)) throw new Error('redis pipeline ' + r.status);
  const bad = j.find(x => x && x.error);
  if (bad) throw new Error(bad.error);
  return j.map(x => x.result);
}
function authOK(req) {
  const want = process.env.SYNC_TOKEN || '';
  const got = String(req.headers['x-sync-auth'] || '');
  if (want.length < 32) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.SYNC_TOKEN || process.env.SYNC_TOKEN.length < 32) return res.status(503).json({ hub: true, error: 'no_sync_token' });
  if (!REDIS_URL() || !REDIS_TOKEN()) return res.status(503).json({ hub: true, error: 'no_redis' });
  if (!authOK(req)) return res.status(401).json({ hub: true, error: 'unauthorized' });
  try {
    if (req.method === 'GET') {
      const op = (req.query && req.query.op) || '';
      if (op === 'rev') {
        const rev = await redis(['HGET', HASH, 'rev']);
        return res.status(200).json({ hub: true, rev: Number(rev || 0) });
      }
      const flat = await redis(['HGETALL', HASH]);
      const items = {};
      for (let i = 0; i < (flat || []).length; i += 2) items[flat[i]] = flat[i + 1];
      const rev = Number(items.rev || 0); delete items.rev;
      return res.status(200).json({ hub: true, rev, items });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const b = body(req);
      const items = b.items && typeof b.items === 'object' ? b.items : null;
      if (!items) return res.status(400).json({ hub: true, error: 'bad_request' });
      const fields = [];
      for (const [k, v] of Object.entries(items)) {
        if (!KEY_RE.test(k) || k === 'rev' || typeof v !== 'string' || v.length > MAX_VALUE) return res.status(400).json({ hub: true, error: 'bad_item', key: k });
        fields.push(k, v);
      }
      const cur = Number((await redis(['HGET', HASH, 'rev'])) || 0);
      if (!b.force && Number(b.baseRev) !== cur) return res.status(409).json({ hub: true, error: 'conflict', rev: cur });
      const rev = cur + 1;
      const set = ['HSET', HASH, 'rev', String(rev), ...fields];
      if (b.replace) await redisPipeline([['DEL', HASH], set]); else await redis(set);
      return res.status(200).json({ hub: true, rev });
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ hub: true, error: 'method' });
  } catch (e) {
    return res.status(502).json({ hub: true, error: 'storage', detail: String(e.message || e).slice(0, 120) });
  }
};
