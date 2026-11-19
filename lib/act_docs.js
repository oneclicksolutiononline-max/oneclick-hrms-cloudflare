/* THE PAPERS' VERIFICATION (18-11-2026, Phase 2 – step 15; the master prompt Part 5: "Submitted, Under Verification, Verified,
 * Rejected … re-upload … Not Applicable … every action recorded").
 *   – A paper attached (by the office, by the employee in his app, by a new joiner's onboarding link) is "submitted".
 *   – The HR Admin / Super Admin opens the list of papers that wait, looks at each and marks it VERIFIED or REJECTED (with why) –
 *     never a paper of his own (the Super Admin excepted, as everywhere). "Under verification" = he has taken it up.
 *   – "Ask again" = rejected with what is needed; the employee / office attaches a new one in its place (the old one stays).
 *   – A kind of paper that does not apply to a person (no PAN, no driving licence for one who never drives) is marked NOT
 *     APPLICABLE with the reason – it is then not asked of him; attaching one later makes it applicable again.
 * Every step is a row of hr_doc_events (only added) and a line of the activity. Nothing is erased. */
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
const needAdmin = s => { if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin verifies papers.', 'role'); };
const kindName = k => (R.docKind(k) || {}).name || k;
const EMP = 'emp:hr_employees!inner(id,code,name,category,site,email,portal_email,status)';
const COLS = 'id,employee_id,kind,title,number,issued_on,expires_on,mime,bytes,status,verified_by,verified_at,verify_note,replaces,created_by,created_at';

// the papers of this site, of one state. which: waiting (submitted + under verification) | verified | rejected | expiring (≤ 30 days)
async function queue(s, x) {
  await S15.need();
  const which = ['waiting', 'verified', 'rejected', 'expiring'].indexOf(x.which) > -1 ? x.which : 'waiting';
  let q = 'hr_employee_docs?select=' + COLS + ',' + EMP + '&emp.site=eq.' + enc(s.site) + '&active=is.true';
  if (which === 'waiting') q += '&status=in.(submitted,under_verification)&order=created_at.asc';
  else if (which === 'expiring') { const to = new Date(Date.now() + 30 * 86400000 + 19800000).toISOString().slice(0, 10); q += '&expires_on=lte.' + to + '&emp.status=neq.left&order=expires_on.asc'; }
  else q += '&status=eq.' + which + '&order=verified_at.desc';
  const rows = (await db('GET', q + '&limit=500')) || [];
  const mine = await OWN.mineOf(s, rows.map(r => r.employee_id)), canAll = isAdmin(s);
  return { which: which, rows: rows.map(r => ({ id: r.id, kind: r.kind, kind_name: kindName(r.kind), title: r.title, number: canAll || !(R.docKind(r.kind) || {}).pay ? r.number : '', issued_on: r.issued_on, expires_on: r.expires_on,
    mime: r.mime, status: r.status, verified_by: r.verified_by, verified_at: r.verified_at, verify_note: r.verify_note, replaces: r.replaces, created_by: r.created_by, created_at: r.created_at,
    employee: { id: r.emp.id, code: r.emp.code, name: r.emp.name, category: r.emp.category }, own: mine.has(r.employee_id), can: canAll && !mine.has(r.employee_id) })) };
}

// the papers asked for, of this site and still there – with his employee
async function docsOf(s, ids) {
  ids = [...new Set((ids || []).map(id).filter(Boolean))].slice(0, 200);
  if (!ids.length) throw fail(400, 'Tick at least one paper.', 'ids');
  const rows = (await db('GET', 'hr_employee_docs?select=' + COLS + ',active,' + EMP + '&emp.site=eq.' + enc(s.site) + '&id=in.(' + ids.join(',') + ')')) || [];
  if (!rows.length) throw fail(404, 'These papers were not found on this site.', 'notfound');
  return rows;
}

const ACT = {
  async docQueue(s, x) { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); return queue(s, x || {}); },

  // "I am looking at these" – under verification (so two people do not do the same)
  async docTake(s, x) {
    needAdmin(s); await S15.need();
    const rows = (await docsOf(s, x.ids)).filter(r => r.active && r.status === 'submitted');
    const mine = await OWN.mineOf(s, rows.map(r => r.employee_id)), take = rows.filter(r => !mine.has(r.employee_id));
    if (!take.length) return { taken: 0 };
    await db('PATCH', 'hr_employee_docs?id=in.(' + take.map(r => r.id).join(',') + ')&status=eq.submitted', { status: 'under_verification' }, 'return=minimal');
    return { taken: take.length };
  },

  /* VERIFIED or REJECTED. ok: true = verified; false = rejected – note (why / what is needed) at least 5 letters; again: true = he is
   * asked to attach it again (a rejection that says so). Own papers are skipped and said. */
  async docVerify(s, x) {
    needAdmin(s); await S15.need();
    const ok = x.ok === true, note = R.str(x.note, 300), again = !ok && x.again === true;
    if (!ok && note.length < 5) throw fail(400, 'Reason: write why the paper is rejected / what is needed (at least 5 letters).', 'note');
    const rows = await docsOf(s, x.ids), mine = await OWN.mineOf(s, rows.map(r => r.employee_id)), skipped = [];
    const todo = rows.filter(r => {
      if (!r.active) { skipped.push(kindName(r.kind) + ' of ' + r.emp.code + ': removed'); return false; }
      if (mine.has(r.employee_id)) { skipped.push(kindName(r.kind) + ' of ' + r.emp.code + ': your own – another person of the HR office verifies it'); return false; }
      if (r.status === (ok ? 'verified' : 'rejected')) { skipped.push(kindName(r.kind) + ' of ' + r.emp.code + ': already ' + r.status); return false; }
      return true;
    });
    if (!todo.length) return { done: 0, skipped: skipped };
    const at = new Date().toISOString();
    await db('PATCH', 'hr_employee_docs?id=in.(' + todo.map(r => r.id).join(',') + ')&active=is.true', { status: ok ? 'verified' : 'rejected', verified_by: s.email, verified_at: at, verify_note: note }, 'return=minimal');
    await db('POST', 'hr_doc_events', todo.map(r => ({ doc_id: r.id, employee_id: r.employee_id, site: r.emp.site, kind: r.kind, event: ok ? 'verified' : again ? 'reupload_asked' : 'rejected', note: note, by: s.email })), 'return=minimal');
    await audit(s.site, s.email, ok ? 'Papers verified' : again ? 'Papers asked again' : 'Papers rejected', todo.length + ' paper(s)', { docs: todo.slice(0, 50).map(r => ({ doc: r.id, code: r.emp.code, kind: r.kind })), note: note });
    // (step 17) a rejected paper is told to the employee – his app, and WhatsApp / e-mail ("papers pending")
    if (!ok) {
      const ids = [...new Set(todo.map(r => r.employee_id))], ppl = {}; ((await db('GET', 'hr_employees?select=id,name,mobile,email&id=in.(' + ids.join(',') + ')')) || []).forEach(p => { ppl[p.id] = p; });
      await require('./notify').add(todo.map(r => { const p = ppl[r.employee_id] || {}, nm = kindName(r.kind); return { site: r.emp.site, employee_id: r.employee_id, kind: 'doc_pending', mobile: p.mobile, email: p.email, title: nm + ': please attach it again', body: 'Dear ' + (p.name || '') + ', your ' + nm + ' was not accepted: ' + note + ' – please attach it again in the RCL app (Me → My documents).', params: { name: p.name || '', papers: nm + ' (' + note + ')', due: '' }, dedupe: 'docrej|' + r.id, by: s.email }; })).catch(() => null);
    }
    return { done: todo.length, skipped: skipped };
  },

  /* NOT APPLICABLE to this person (with the reason) – or applicable again (na: false). */
  async docNa(s, x) {
    needAdmin(s); await S15.need();
    const empId = id(x.id), k = R.docKind(x.kind); if (!k) throw fail(400, 'Choose what kind of paper this is.', 'kind');
    const e = ((await db('GET', 'hr_employees?select=id,code,site,status,email,portal_email&id=eq.' + empId + '&site=eq.' + enc(s.site))) || [])[0];
    if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound');
    await OWN.notOwn(s, e.id, 'mark your own papers');
    const na = x.na !== false, reason = R.str(x.reason, 200);
    if (na && reason.length < 5) throw fail(400, 'Reason: write why this paper does not apply to him (at least 5 letters).', 'reason');
    if (na) {
      const have = (await db('GET', 'hr_employee_docs?select=id&employee_id=eq.' + e.id + '&kind=eq.' + k.key + '&active=is.true&status=neq.rejected&limit=1')) || [];
      if (have.length) throw fail(400, 'He has this paper attached – it applies to him. Remove it first if it is wrong.', 'have');
      await db('POST', 'hr_doc_na?on_conflict=employee_id,kind', [{ employee_id: e.id, kind: k.key, reason: reason, by: s.email, at: new Date().toISOString(), active: true }], 'resolution=merge-duplicates,return=minimal');
    } else await db('PATCH', 'hr_doc_na?employee_id=eq.' + e.id + '&kind=eq.' + k.key, { active: false }, 'return=minimal');
    await db('POST', 'hr_doc_events', [{ employee_id: e.id, site: e.site, kind: k.key, event: na ? 'not_applicable' : 'applicable', note: reason, by: s.email }], 'return=minimal');
    await audit(s.site, s.email, na ? 'Paper marked not applicable' : 'Paper applicable again', e.code, { kind: k.key, reason: reason });
    return { ok: true };
  },

  // what happened to a person's papers (newest first)
  async docEvents(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    await S15.need();
    const empId = id(x.id), e = ((await db('GET', 'hr_employees?select=id&id=eq.' + empId + '&site=eq.' + enc(s.site))) || [])[0];
    if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound');
    return { rows: ((await db('GET', 'hr_doc_events?select=id,doc_id,kind,event,note,by,at&employee_id=eq.' + e.id + '&order=at.desc,id.desc&limit=200')) || []).map(r => Object.assign(r, { kind_name: kindName(r.kind) })) };
  },
};
module.exports = { ACT, queue };
