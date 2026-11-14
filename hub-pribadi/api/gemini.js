// Fungsi server Vercel yang meneruskan permintaan ke Gemini memakai kunci di server.
// Dengan begini kunci API tidak pernah sampai ke browser.
// Variabel lingkungan: GEMINI_API_KEY dan SYNC_TOKEN (sama seperti untuk sinkron).
const crypto = require('crypto');

const BASE = () => process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const MODEL_RE = /^[a-z0-9][a-z0-9._-]{1,60}$/i;

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
  if (!authOK(req)) return res.status(401).json({ hub: true, error: 'unauthorized' });
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) return res.status(503).json({ hub: true, error: 'no_gemini_key' });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    let url, init;
    if (req.method === 'GET') {
      if (((req.query && req.query.op) || '') !== 'models') return res.status(400).json({ hub: true, error: 'bad_request' });
      url = BASE() + '/v1beta/models?pageSize=200';
      init = { method: 'GET', headers: { 'x-goog-api-key': key }, signal: ctl.signal };
    } else if (req.method === 'POST') {
      const b = body(req);
      if (!MODEL_RE.test(String(b.model || '')) || !b.payload || typeof b.payload !== 'object') return res.status(400).json({ hub: true, error: 'bad_request' });
      url = BASE() + '/v1beta/models/' + encodeURIComponent(b.model) + ':generateContent';
      init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(b.payload), signal: ctl.signal };
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ hub: true, error: 'method' });
    }
    const r = await fetch(url, init);
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch (e) { j = { error: { message: 'Jawaban bukan JSON' } }; }
    return res.status(r.status).json(j);
  } catch (e) {
    return res.status(504).json({ hub: true, error: e.name === 'AbortError' ? 'timeout' : 'upstream' });
  } finally { clearTimeout(timer); }
};
