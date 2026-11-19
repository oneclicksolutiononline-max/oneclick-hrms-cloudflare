/* THE NOTIFICATIONS PAGE (the HR office) and "My notifications" (the employee's app) – 18-11-2026, Phase 4 (step 17).
 * See lib/notify.js for the queue and the timer. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const N = require('./notify');
const WA = require('./whatsapp');
const MAIL = require('./mail');

const office = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const NOT_READY17 = 'This part is not set up yet: the Super Admin runs sql/hr_step17_notify.sql once in the rcl-hr Supabase → SQL Editor.';
const need17 = async () => { if (!(await N.ready())) throw fail(500, NOT_READY17, 'notready17'); };
const me = s => require('./act_attend').me(s);
const COLS = 'id,site,employee_id,channel,kind,to_addr,title,status,attempts,next_at,sent_at,error,seen_at,created_by,created_at';
const mask = (ch, a) => (ch === 'whatsapp' ? (a ? '+' + String(a).slice(0, 2) + ' XXXXX' + String(a).slice(-5) : '') : ch === 'email' ? String(a).replace(/^(.).*(@.*)$/, '$1…$2') : '');

const ACT = {
  /* what went out of this site: newest first; filters status / kind; the counts of the last 7 days; the switches as they are */
  async noticeList(s, x) {
    office(s); await need17();
    let q = 'hr_notify_queue?select=' + COLS + '&site=eq.' + enc(s.site);
    if (['queued', 'sent', 'delivered', 'read', 'failed', 'skipped', 'cancelled'].indexOf(x.status) > -1) q += '&status=eq.' + x.status;
    if (N.KINDS[x.kind]) q += '&kind=eq.' + x.kind;
    const rows = (await db('GET', q + '&channel=neq.app&order=id.desc&limit=300')) || [];
    const ids = [...new Set(rows.map(r => r.employee_id).filter(Boolean))], who = {};
    for (let i = 0; i < ids.length; i += 80) ((await db('GET', 'hr_employees?select=id,code,name&id=in.(' + ids.slice(i, i + 80).join(',') + ')')) || []).forEach(e => { who[e.id] = e; });
    const since = new Date(Date.now() - 7 * 86400000).toISOString(), week = (await db('GET', 'hr_notify_queue?select=status,channel&site=eq.' + enc(s.site) + '&channel=neq.app&created_at=gte.' + enc(since) + '&limit=20000')) || [], counts = {};
    week.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return { rows: rows.map(r => Object.assign(r, { to_addr: mask(r.channel, r.to_addr), employee: who[r.employee_id] ? { code: who[r.employee_id].code, name: who[r.employee_id].name } : null, kind_name: (N.KINDS[r.kind] || {}).name || r.kind })),
      counts: counts, kinds: Object.keys(N.KINDS).map(k => ({ key: k, name: N.KINDS[k].name, wa: N.KINDS[k].wa, ready: N.KINDS[k].wa && WA.ready(k) })),
      switches: { notify: N.on(), whatsapp: WA.on(), email: MAIL.ready() }, setting: await N.settingOf(s.site), can: isAdmin(s) };
  },
  /* the shift reminders of this site: on / off, the minutes around the shift's start (at most 6; default -15, 0, 15, 30) */
  async noticeSettingSave(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin changes the reminders.', 'role');
    await need17();
    const offs = [...new Set((Array.isArray(x.offsets) ? x.offsets : String(x.offsets || '').split(/[,\s]+/)).filter(v => String(v).trim() !== '').map(Number))];
    if (offs.some(n => !Number.isInteger(n) || n < -240 || n > 240)) throw fail(400, 'Minutes: whole numbers from -240 to 240 (before the start is minus).', 'offsets');
    if (offs.length > 6) throw fail(400, 'At most 6 reminders a shift.', 'offsets');
    const v = { shift_on: x.shift_on === true, offsets: offs.length ? offs.sort((a, b) => a - b) : N.DEFAULT_SET.offsets }, was = await N.settingOf(s.site);
    await db('POST', 'hr_settings?on_conflict=site,key', [{ site: s.site, key: 'notify', value: v, updated_by: s.email, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
    await audit(s.site, s.email, 'Shift reminders changed', s.site, { old: was, new: v });
    return { ok: true, setting: v };
  },
  // a failed one is sent again; one still waiting is cancelled
  async noticeRetry(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin sends it again.', 'role');
    await need17();
    const done = (await db('PATCH', 'hr_notify_queue?id=eq.' + (Number(x.id) || 0) + '&site=eq.' + enc(s.site) + '&status=eq.failed', { status: 'queued', attempts: 0, next_at: new Date().toISOString(), error: '' }, 'return=representation')) || [];
    if (!done.length) throw fail(400, 'Only a failed message is sent again.', 'status');
    await audit(s.site, s.email, 'Message sent again', '#' + done[0].id, { kind: done[0].kind, channel: done[0].channel }); return { ok: true };
  },
  async noticeCancel(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin cancels it.', 'role');
    await need17();
    const done = (await db('PATCH', 'hr_notify_queue?id=eq.' + (Number(x.id) || 0) + '&site=eq.' + enc(s.site) + '&status=eq.queued', { status: 'cancelled' }, 'return=representation')) || [];
    if (!done.length) throw fail(400, 'Only a message that still waits is cancelled.', 'status');
    await audit(s.site, s.email, 'Message cancelled', '#' + done[0].id, { kind: done[0].kind }); return { ok: true };
  },

  /* ───── his own (the app): his list – newest first – and how many he has not seen ───── */
  async myNotices(s) {
    if (!(await N.ready())) return { ready: false, rows: [], unread: 0 };
    const emp = await me(s), rows = (await db('GET', 'hr_notify_queue?select=id,kind,title,body,created_at,seen_at&employee_id=eq.' + emp.id + '&channel=eq.app&status=neq.cancelled&order=id.desc&limit=60')) || [];
    return { ready: true, rows: rows, unread: rows.filter(r => !r.seen_at).length };
  },
  async myNoticeSeen(s, x) {
    await need17(); const emp = await me(s), ids = (Array.isArray(x.ids) ? x.ids : []).map(Number).filter(n => n > 0).slice(0, 100);
    await db('PATCH', 'hr_notify_queue?employee_id=eq.' + emp.id + '&channel=eq.app&seen_at=is.null' + (ids.length ? '&id=in.(' + ids.join(',') + ')' : ''), { seen_at: new Date().toISOString() }, 'return=minimal');
    return { ok: true };
  },
};
const SELF = ['myNotices', 'myNoticeSeen'];
module.exports = { ACT, SELF, NOT_READY17 };
