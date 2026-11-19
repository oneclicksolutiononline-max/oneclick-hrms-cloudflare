/* PUNCH PHOTOS KEPT BEYOND 90 DAYS – A HOLD (18-11-2026, Phase 1; his decision of 12-11-2026: "selfies kept 90 days; evidence under
 * a pending dispute, investigation or legal hold is kept until the matter is closed"). The 90-day job (api/jobs.js) never removes a
 * photo of a person's day that is under a hold. A hold is put and released by the HR Admin / Super Admin, always with the reason;
 * nothing of it is deleted (released = who, when, why). Photos of a punch that still waits for review are kept by themselves. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');

const NOT_READY14 = 'Holds of punch photos are not set up yet: the Super Admin runs sql/hr_step14_security.sql once in the rcl-hr Supabase → SQL Editor.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const needAdmin = s => { if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin keeps or releases punch photos.', 'role'); };
const ready = e => { if (e && e.code === 'notinstalled') throw fail(500, NOT_READY14, 'notready14'); throw e; };
const COLS = 'id,site,employee_id,from_day,to_day,reason,held_by,held_at,released_by,released_at,release_reason';
const empOf = async (s, id) => { const e = UUID.test(String(id)) ? ((await db('GET', 'hr_employees?select=id,code,name&id=eq.' + id + '&site=eq.' + enc(s.site))) || [])[0] : null; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound'); return e; };

const ACT = {
  // the holds of this site (or of one employee): those in force first, then the released ones
  async holdList(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    const one = x && x.id ? await empOf(s, String(x.id).toLowerCase()) : null;
    let list; try { list = (await db('GET', 'hr_selfie_holds?select=' + COLS + '&site=eq.' + enc(s.site) + (one ? '&employee_id=eq.' + one.id : '') + '&order=held_at.desc&limit=300')) || []; }
    catch (e) { if (e && e.code === 'notinstalled') return { ready: false, note: NOT_READY14, rows: [], days: 90 }; throw e; }
    const ids = [...new Set(list.map(h => h.employee_id))], by = {};
    if (ids.length) ((await db('GET', 'hr_employees?select=id,code,name&id=in.(' + ids.join(',') + ')')) || []).forEach(e => { by[e.id] = e; });
    const rows = list.map(h => Object.assign({}, h, { code: (by[h.employee_id] || {}).code || '', name: (by[h.employee_id] || {}).name || '', on: !h.released_at }));
    return { ready: true, rows: rows.filter(r => r.on).concat(rows.filter(r => !r.on)), can: isAdmin(s), days: 90 };
  },
  // { id: employee, from, to, reason } – his punch photos of those days are kept until the hold is released
  async holdSave(s, x) {
    needAdmin(s); const e = await empOf(s, String(x.id || '').toLowerCase()), from = R.date(x.from), to = R.date(x.to), why = R.str(x.reason, 200);
    if (!from || !to) throw fail(400, 'From and To: dates as DD-MM-YYYY.', 'day'); if (to < from) throw fail(400, 'To: it is before From.', 'day');
    if (why.length < 5) throw fail(400, 'Reason: write why these photos are kept (a dispute, an investigation …).', 'reason');
    const row = (await db('POST', 'hr_selfie_holds', [{ site: s.site, employee_id: e.id, from_day: from, to_day: to, reason: why, held_by: s.email }], 'return=representation').catch(ready))[0];
    await audit(s.site, s.email, 'Punch photos kept (hold)', e.code + ' ' + from + ' – ' + to, { hold: row.id, reason: why });
    return ACT.holdList(s, {});
  },
  // { hold, reason } – from now on the 90-day rule applies to those photos again
  async holdRelease(s, x) {
    needAdmin(s); const hid = parseInt(x.hold, 10) || 0, why = R.str(x.reason, 200); if (why.length < 3) throw fail(400, 'Reason: write why the hold is released.', 'reason');
    const h = ((await db('GET', 'hr_selfie_holds?select=' + COLS + '&id=eq.' + hid + '&site=eq.' + enc(s.site)).catch(ready)) || [])[0]; if (!h) throw fail(404, 'This hold was not found on this site.', 'notfound');
    if (h.released_at) throw fail(409, 'This hold is already released.', 'released');
    const done = (await db('PATCH', 'hr_selfie_holds?id=eq.' + h.id + '&released_at=is.null', { released_by: s.email, released_at: new Date().toISOString(), release_reason: why }, 'return=representation')) || [];
    if (!done.length) throw fail(409, 'This hold is already released.', 'released');
    const e = ((await db('GET', 'hr_employees?select=code&id=eq.' + h.employee_id)) || [])[0] || {};
    await audit(s.site, s.email, 'Punch photo hold released', (e.code || '') + ' ' + h.from_day + ' – ' + h.to_day, { hold: h.id, reason: why });
    return ACT.holdList(s, {});
  },
};
module.exports = { ACT, NOT_READY14 };
