/* GET /api/jobs?job=… – THE TIMED JOBS of HR (18-11-2026, step 14). Called by Vercel's own timer (vercel.json → crons) on the live
 * deployment only, with "Authorization: Bearer <CRON_SECRET>" – a Vercel setting he adds; without it nothing runs. A Preview or the
 * beta copy runs no timed job.
 *   retention – the 90-day rule for punch photos (lib/retention.js), itself OFF until SELFIE_RETENTION_ENABLED=true.
 *   notify    – (step 17) HR's messages (lib/notify.js), itself OFF until HR_NOTIFY_ENABLED=true; called every 5 minutes by Supabase's
 *               own timer (sql/hr_step17b_timer.sql) – Vercel's own timer may run only once a day on the Hobby plan. */
'use strict';
const crypto = require('crypto');
const { handler, send } = require('../lib/http');
const RET = require('../lib/retention');

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
module.exports = handler(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
  const secret = String(process.env.CRON_SECRET || '');
  if (secret.length < 16 || !same(String(req.headers.authorization || ''), 'Bearer ' + secret)) return send(res, 401, { error: 'Not allowed.' });
  const job = new URL(req.url, 'http://x').searchParams.get('job');
  if (job === 'retention') return send(res, 200, Object.assign({ ok: true }, await RET.run()));
  // (18-11-2026, step 17) the messages: the shift reminders due, the daily ones, everything due sent – every 5 minutes (sql/hr_step17b_timer.sql)
  if (job === 'notify') return send(res, 200, Object.assign({ ok: true }, await require('../lib/notify').run()));
  send(res, 400, { error: 'Unknown job.' });
});
