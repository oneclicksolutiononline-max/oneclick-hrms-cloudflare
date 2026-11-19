/* /api/wa-hook – WHATSAPP'S WORD OF HR'S MESSAGES (18-11-2026, Phase 4 – step 17): Meta calls it when a message is delivered, read or
 * failed. GET: Meta's one-time check (hub.verify_token = WHATSAPP_VERIFY_TOKEN). POST: only with Meta's signature of the body
 * (X-Hub-Signature-256 = HMAC-SHA256 with WHATSAPP_APP_SECRET); then the message's row moves on (lib/notify.js status). Nothing
 * else of HR can be reached here. Both settings are Vercel's (never in a file). */
'use strict';
const crypto = require('crypto');
const { handler, send } = require('../lib/http');
const N = require('../lib/notify');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const raw = req => new Promise((ok, no) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) no(new Error('too big')); }); req.on('end', () => ok(b)); req.on('error', no); });
module.exports = handler(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    const t = String(process.env.WHATSAPP_VERIFY_TOKEN || '');
    if (t.length >= 8 && u.searchParams.get('hub.mode') === 'subscribe' && same(u.searchParams.get('hub.verify_token') || '', t)) { res.statusCode = 200; res.setHeader('Content-Type', 'text/plain'); return res.end(String(u.searchParams.get('hub.challenge') || '')); }
    return send(res, 403, { error: 'Not allowed.' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
  // the body exactly as Meta signed it (req.body is never touched: Vercel would parse it and the bytes would differ)
  const secret = String(process.env.WHATSAPP_APP_SECRET || ''), body = await raw(req);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret || crypto.randomBytes(16)).update(body).digest('hex');
  if (secret.length < 8 || !same(String(req.headers['x-hub-signature-256'] || ''), sig)) return send(res, 401, { error: 'Not allowed.' });
  let j = {}; try { j = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { error: 'Bad body.' }); }
  const list = []; (j.entry || []).forEach(en => (en.changes || []).forEach(c => ((c.value || {}).statuses || []).forEach(st => list.push(st))));
  const moved = list.length && (await N.ready()) ? await N.status(list) : 0;
  send(res, 200, { ok: true, moved: moved });
});
