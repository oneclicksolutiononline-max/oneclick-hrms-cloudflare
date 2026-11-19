/* MEDICAL INSURANCE (MEDICLAIM) OF A PERSON (18-11-2026, Phase 2 – step 15; the master prompt Part 6: "applicable, provider, policy
 * number, employee / dependent cover, start and expiry, sum insured, the policy paper, verification").
 * The office writes it (the policy paper itself is a paper of the kind "Medical insurance" under Documents); the HR Admin / Super
 * Admin verifies it – never his own. A policy past its expiry date reads "expired" by itself (nothing is written for it); a change
 * of a verified policy sends it back to "submitted". Every save and decision is in the activity. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const OWN = require('./own');
const S15 = require('./step15');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id = v => { v = String(v || '').toLowerCase(); return UUID.test(v) ? v : ''; };
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const FIELDS = ['applicable', 'provider', 'policy_no', 'employee_cover', 'dependent_cover', 'start_on', 'expires_on', 'sum_insured'];
const empOf = async (s, v) => { const e = ((await db('GET', 'hr_employees?select=id,code,name,site,status&id=eq.' + id(v) + '&site=eq.' + enc(s.site))) || [])[0]; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound'); return e; };
// what is shown: the state read with the day (a verified / submitted policy past its date = expired)
const shown = r => Object.assign({}, r, { status: r.applicable && r.expires_on && String(r.expires_on).slice(0, 10) < R.today() && r.status !== 'rejected' ? 'expired' : r.status });

const ACT = {
  async insGet(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    await S15.need(); const e = await empOf(s, x.id);
    const r = ((await db('GET', 'hr_insurance?select=*&employee_id=eq.' + e.id)) || [])[0];
    return { insurance: r ? shown(r) : { employee_id: e.id, applicable: false, status: 'draft' }, mine: (await OWN.mineOf(s, [e.id])).has(e.id) };
  },
  async insSave(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    await S15.need(); const e = await empOf(s, x.id); if (e.status === 'left') throw fail(400, 'This employee has left.', 'left');
    await OWN.notOwn(s, e.id, 'write your own insurance');
    const applicable = x.applicable === true, row = { employee_id: e.id, site: e.site, applicable: applicable, updated_by: s.email, updated_at: new Date().toISOString() }, errs = [];
    if (applicable) {
      row.provider = R.str(x.provider, 100); if (row.provider.length < 2) errs.push('Insurance company: needed.');
      row.policy_no = R.str(x.policy_no, 60).toUpperCase(); if (row.policy_no.length < 3) errs.push('Policy number: needed.');
      row.employee_cover = R.str(x.employee_cover, 120); row.dependent_cover = R.str(x.dependent_cover, 200);
      const st = R.date(x.start_on), ex = R.date(x.expires_on);
      if (st === null) errs.push('Start date: a date as DD-MM-YYYY.'); if (ex === null || !ex) errs.push('Expiry date: a date as DD-MM-YYYY.');
      if (st && ex && ex < st) errs.push('Expiry date: it is before the start date.');
      row.start_on = st || null; row.expires_on = ex || null;
      const t = String(x.sum_insured === undefined || x.sum_insured === null ? '' : x.sum_insured).replace(/[,\s₹]/g, '');
      if (t && !/^\d{1,12}(\.\d{1,2})?$/.test(t)) errs.push('Sum insured: a number.'); row.sum_insured = t ? +t : null;
    } else { Object.assign(row, { provider: '', policy_no: '', employee_cover: '', dependent_cover: '', start_on: null, expires_on: null, sum_insured: null }); }
    if (errs.length) throw fail(400, errs.join(' '), 'check');
    const was = ((await db('GET', 'hr_insurance?select=*&employee_id=eq.' + e.id)) || [])[0] || null;
    const changed = !was || FIELDS.some(k => String(was[k] === null || was[k] === undefined ? '' : was[k]) !== String(row[k] === null || row[k] === undefined ? '' : row[k]));
    if (!changed) return { ok: true, status: was.status };
    row.status = applicable ? 'submitted' : 'draft'; row.verified_by = ''; row.verified_at = null; row.note = '';
    await db('POST', 'hr_insurance?on_conflict=employee_id', [row], 'resolution=merge-duplicates,return=minimal');
    await audit(s.site, s.email, 'Insurance saved', e.code, { applicable: applicable, provider: row.provider, policy_last4: String(row.policy_no || '').slice(-4), expires_on: row.expires_on, was: was ? was.status : '' });
    return { ok: true, status: row.status };
  },
  async insVerify(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin verifies the insurance.', 'role');
    await S15.need(); const e = await empOf(s, x.id); await OWN.notOwn(s, e.id, 'verify your own insurance');
    const r = ((await db('GET', 'hr_insurance?select=*&employee_id=eq.' + e.id)) || [])[0];
    if (!r || !r.applicable) throw fail(400, 'There is no insurance written for him to verify.', 'none');
    const ok = x.ok === true, note = R.str(x.note, 300); if (!ok && note.length < 5) throw fail(400, 'Reason: write why it is rejected (at least 5 letters).', 'note');
    await db('PATCH', 'hr_insurance?employee_id=eq.' + e.id, { status: ok ? 'verified' : 'rejected', verified_by: s.email, verified_at: new Date().toISOString(), note: note }, 'return=minimal');
    await audit(s.site, s.email, ok ? 'Insurance verified' : 'Insurance rejected', e.code, { note: note });
    return { ok: true };
  },
};
module.exports = { ACT, shown };
