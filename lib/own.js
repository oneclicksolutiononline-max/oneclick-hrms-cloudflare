/* NOBODY DECIDES HIS OWN (18-11-2026, Phase 1 – the audit's E5; the master prompt: "Prevent self-approval"). A request, a day of
 * attendance, a month's row, a phone or a salary that is about the person who is signed in is decided by ANOTHER person of the
 * HR office – as a salary already was ("A salary is approved by another person than the one who proposed it"). The Super Admin is
 * the one exception, as for the salary: he has nobody above him in HR.
 * "The person signed in" = the employee whose e-mail (or the Portal's user ID kept for a mobile-only sign-in) is the sign-in's. */
'use strict';
const { fail } = require('./http');
const { db } = require('./db');

const mail = v => String(v || '').trim().toLowerCase();
const isMe = (s, emp) => !!emp && !!mail(s.email) && (mail(emp.email) === mail(s.email) || mail(emp.portal_email) === mail(s.email));
// the employee rows asked for (id → { email, portal_email }) – one reading
async function rowsOf(ids) {
  ids = [...new Set((ids || []).filter(Boolean).map(String))]; const out = {};
  for (let i = 0; i < ids.length; i += 80) ((await db('GET', 'hr_employees?select=id,email,portal_email&id=in.(' + ids.slice(i, i + 80).join(',') + ')')) || []).forEach(e => { out[e.id] = e; });
  return out;
}
// refused when the employee is the person signed in (not for the Super Admin). what = 'decide this request' …
async function notOwn(s, empId, what) {
  if (s.role === 'super' || !empId) return;
  const e = (await rowsOf([empId]))[empId];
  if (isMe(s, e)) throw fail(403, 'This is about you: you cannot ' + what + ' yourself – another person of the HR office does it.', 'own');
}
// of many: the ids that are the person signed in (none for the Super Admin)
async function mineOf(s, ids) {
  if (s.role === 'super') return new Set();
  const rows = await rowsOf(ids); return new Set(Object.keys(rows).filter(k => isMe(s, rows[k])));
}
module.exports = { notOwn, mineOf, isMe, mail };
