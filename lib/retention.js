/* THE 90-DAY RULE FOR PUNCH PHOTOS (18-11-2026, Phase 1; his decision of 12-11-2026: "Attendance selfies kept 90 days … secure
 * deletion after retention"; held evidence is kept until the matter is closed). Run once a day by Vercel (vercel.json → crons →
 * api/jobs.js). It removes from the private bucket hr-selfies the photos older than 90 days that are not under a hold
 * (lib/act_holds.js) and not of a punch that still waits for review – the database function hr_selfies_due() (step 14) says which.
 * The punch rows stay exactly as they are (they are never changed); only the photo file goes. What it did is written in hr_job_runs
 * (counts only).
 *   OFF until he sets SELFIE_RETENTION_ENABLED=true in Vercel. SELFIE_DAYS can only make the time LONGER than 90 days. */
'use strict';
const { db } = require('./db');
const store = require('./store');

const DAYS_MIN = 90, ROUNDS = 6, BATCH = 500;
const on = () => String(process.env.SELFIE_RETENTION_ENABLED || '') === 'true';
const daysOf = () => Math.max(DAYS_MIN, parseInt(process.env.SELFIE_DAYS || '', 10) || DAYS_MIN);

async function note(result) {
  try { await db('POST', 'hr_job_runs', [{ job: 'selfie_retention', finished_at: new Date().toISOString(), result: result }], 'return=minimal'); }
  catch (e) { console.error('[hr job] not written: ' + String((e && e.message) || e)); }
}
async function run(now) {
  now = now || Date.now();
  if (!on()) { const r = { job: 'selfie_retention', off: true }; await note(r); return r; }
  const days = daysOf(), before = new Date(now - days * 86400000).toISOString(), out = { job: 'selfie_retention', days: days, before: before, removed: 0, rounds: 0, faults: 0 };
  for (let i = 0; i < ROUNDS; i++) {
    const due = (await db('POST', 'rpc/hr_selfies_due', { p_before: before, p_limit: BATCH })) || [];
    out.rounds++; if (!due.length) break;
    let gone = []; try { gone = await store.remove(due.map(d => d.path), store.SELFIES); } catch (e) { out.faults++; break; }
    out.removed += gone.length;
    if (gone.length < due.length) { out.faults += due.length - gone.length; break; }      // something could not be removed: tried again tomorrow
    if (due.length < BATCH) break;
  }
  await note(out);
  return out;
}
module.exports = { run, on, daysOf, DAYS_MIN };
