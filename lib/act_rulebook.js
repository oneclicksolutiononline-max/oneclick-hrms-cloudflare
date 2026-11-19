/* THE ACTIONS OF THE RULE BOOK (api/hr.js sends them here) – step 13 (13-11-2026).
 * His decisions of 13-11-2026:
 *   · Only the SUPER ADMIN makes a policy, changes it (a new version from a date) or closes it.
 *   · GIVING a policy: the HO HR and the Super Admin on every site; the HR Admin of a site on his own site – and only a policy
 *     that is open for that site and in use.
 *   · A site has ONE policy of each kind for everybody (its default); a person may have his own from a date. A person has one
 *     policy of a kind – a new one takes the place of the old one from its date; the days before keep what they had.
 *   · A policy that was given to anybody is never deleted – it is closed.
 * Everything here only ADDS rows (a version, an assignment, a default); the only change is a policy's name / sites / "in use".
 * Before sql/hr_step13_rulebook.sql is run every reading answers { ready: false } and nothing of HR changes. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const B = require('./rulebook');
const { isHo } = require('./act_month');

const NOT_READY13 = 'The Rule Book is not set up yet: the Super Admin runs sql/hr_step13_rulebook.sql once in the rcl-hr Supabase → SQL Editor.';
const ready = e => { if (e && e.code === 'notinstalled') throw fail(400, NOT_READY13, 'notready'); throw e; };
const needOffice = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };
const needSuper = s => { if (s.role !== 'super') throw fail(403, 'Only the Super Admin makes or changes a policy of the Rule Book.', 'role'); };
// who may give a policy on this site: the Super Admin, the HO HR, the HR Admin of the site
async function needGiver(s) { needOffice(s); if (s.role === 'super' || s.role === 'admin') return; if (await isHo(s)) return; throw fail(403, 'A policy is given by the HR Admin of the site, the HO HR or the Super Admin.', 'role'); }
const kindOf = v => { const k = R.str(v, 20).toLowerCase(); if (B.KINDS.indexOf(k) < 0) throw fail(400, 'Unknown kind of policy.', 'kind'); return k; };
const dayOf = (v, name) => { const d = R.date(v); if (!d) throw fail(400, name + ': a date as DD-MM-YYYY.', 'date'); return d; };
const idOf = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw fail(400, 'This policy was not found.', 'notfound'); return n; };
const chunks = (list, n) => { const o = []; for (let i = 0; i < list.length; i += n) o.push(list.slice(i, i + n)); return o; };
/* EVERY POLICY IS OF ITS OWN SITE (18-11-2026, his correction: "HO chi policy HO sathi, VTR chi VTR sathi, CTR chi CTR sathi …
 * ekdchi policy tikde diste – as nko"). A new policy is kept for the site open at the top (sites = [that site]); the list, giving
 * it to the site or to people, changing, closing and deleting see only the policies of the site open at the top – the Super Admin
 * too. A policy made before (sites empty = "every site") is of the sites where it is in use (the site's own or given to somebody
 * there) and of the site it was made on (its audit row "policy new … #id"); found nowhere = every site, as before. Nothing in the
 * database is changed for it: its sites are written only when the Super Admin saves it again. */
async function homes(pol) {
  const old = pol.filter(p => !p.sites || !p.sites.length); if (!old.length) return {};
  const out = {}, add = (id, site) => { if (site) (out[id] = out[id] || {})[site] = 1; }, want = {}; old.forEach(p => { want[p.id] = 1; });
  for (const c of chunks(old.map(p => p.id), 80)) {
    const [d, a] = await Promise.all([db('GET', 'hr_policy_defaults?select=site,policy_id&policy_id=in.(' + c.join(',') + ')'), db('GET', 'hr_policy_assign?select=site,policy_id&policy_id=in.(' + c.join(',') + ')&limit=100000')]);
    (d || []).concat(a || []).forEach(r => add(r.policy_id, r.site));
  }
  ((await db('GET', 'hr_audit?select=site,target&action=eq.' + enc('policy new') + '&limit=20000').catch(() => [])) || []).forEach(r => { const m = /#(\d+)\b/.exec(r.target || ''); if (m && want[m[1]]) add(m[1], r.site); });
  const o = {}; Object.keys(out).forEach(id => { o[id] = Object.keys(out[id]).sort(); }); return o;
}
const sitesOf = (p, h) => (p.sites && p.sites.length ? p.sites : (h[p.id] || []));      // [] = every site (made before, found nowhere)
const ofSite = (p, site, h) => { const l = sitesOf(p, h); return !l.length || l.indexOf(site) > -1; };
async function needOfSite(p, site) { if (!ofSite(p, site, await homes([p]))) throw fail(403, 'This policy is of another site – open that site at the top.', 'site'); }

// (18-11-2026) the site's rules of before (Shifts & rules → the old "Attendance rules") of today: they count for a kind the site gives
// no policy of – the Rule Book shows them, so that every rule is seen in one place
async function oldRules(site) { try { const v = require('./day').validOn((await db('GET', 'hr_att_rules?select=valid_from,rules,created_at&site=eq.' + enc(site))) || [], R.today()); return v ? v.rules : {}; } catch (e) { return {}; } }
// (19-11-2026, asked: "leave policy ekach thikani rule book madhech thew") the site's leave policy of before (the Leave page's old
// "Policy"): shown in the Rule Book's Leave part while the site gives no leave policy of the Rule Book – then it is what counts
async function oldLeave(site) { try { const v = require('./leave').versions((await db('GET', 'hr_leave_policy?select=id,valid_from,per_month,carry,auto_absent,levels&site=eq.' + enc(site) + '&order=valid_from,id&limit=500')) || []).on(R.today()); return v ? { valid_from: v.valid_from, per_month: +v.per_month, carry: !!v.carry, auto_absent: !!v.auto_absent, levels: v.levels } : null; } catch (e) { return null; } }
async function policies() { return (await db('GET', 'hr_policies?select=*&order=kind,name').catch(ready)) || []; }
async function versionsOf(ids) {
  const out = {}; for (const c of chunks(ids, 80)) ((await db('GET', 'hr_policy_versions?select=id,policy_id,valid_from,body,auth,created_by,created_at&policy_id=in.(' + c.join(',') + ')&order=valid_from.desc,id.desc')) || []).forEach(v => { (out[v.policy_id] = out[v.policy_id] || []).push(v); });
  return out;
}
async function onePolicy(id) { const p = ((await db('GET', 'hr_policies?select=*&id=eq.' + id).catch(ready)) || [])[0]; if (!p) throw fail(404, 'This policy was not found.', 'notfound'); return p; }
// is the policy given to anybody, or a site's own?
async function used(id) {
  const [a, d] = await Promise.all([db('GET', 'hr_policy_assign?select=id&policy_id=eq.' + id + '&limit=1'), db('GET', 'hr_policy_defaults?select=id&policy_id=eq.' + id + '&limit=1')]);
  return ((a || []).length + (d || []).length) > 0;
}
/* WHAT COUNTS ON A SITE: its defaults and the people's own rows, with every version they point to – for the muster and leave.
 * → { ready, defaults: { kind: [rows] }, assign: { employeeId: { kind: [rows] } }, versions: { policyId: [rows] } }
 * Before step 13: { ready: false } – the rules of before count. */
async function siteBook(site, where) {
  let defs, asg;
  try {
    [defs, asg] = await Promise.all([db('GET', 'hr_policy_defaults?select=id,kind,policy_id,valid_from&site=eq.' + enc(site) + '&order=id'),
      db('GET', 'hr_policy_assign?select=id,employee_id,kind,policy_id,valid_from&' + (where || 'site=eq.' + enc(site)) + '&order=id&limit=20000')]);
  } catch (e) { if (e && e.code === 'notinstalled') return { ready: false, defaults: {}, assign: {}, versions: {} }; throw e; }
  const defaults = {}, assign = {}, ids = {};
  (defs || []).forEach(r => { (defaults[r.kind] = defaults[r.kind] || []).push(r); if (r.policy_id) ids[r.policy_id] = 1; });
  (asg || []).forEach(r => { const e = (assign[r.employee_id] = assign[r.employee_id] || {}); (e[r.kind] = e[r.kind] || []).push(r); if (r.policy_id) ids[r.policy_id] = 1; });
  return { ready: true, defaults: defaults, assign: assign, versions: Object.keys(ids).length ? await versionsOf(Object.keys(ids)) : {} };
}
// a person's policy of a kind on a day, from a site's book
const bookOn = (book, empId, kind, day) => (book && book.ready ? B.policyOn({ assign: ((book.assign[empId] || {})[kind]) || [], defaults: book.defaults[kind] || [], versions: book.versions }, day) : null);

const ACT = {
  /* the Rule Book as this person may see it: the policies of the site open at the top (the Super Admin too), each with what it says
   * today and its earlier versions; what the site gives to everybody; how many people have each policy of their own */
  async rbList(s) {
    needOffice(s); let pol; try { pol = await policies(); } catch (e) { if (e && e.code === 'notready') return { ready: false, note: NOT_READY13, kinds: B.KINDS.map(k => ({ key: k, name: B.KIND_NAME[k] })) }; throw e; }
    const today = R.today(), h = await homes(pol), mine = pol.filter(p => ofSite(p, s.site, h)), ver = mine.length ? await versionsOf(mine.map(p => p.id)) : {};
    const [book, ho, old0, oldLv] = await Promise.all([siteBook(s.site), s.role === 'super' ? true : isHo(s), oldRules(s.site), oldLeave(s.site)]), own = {}, old = Object.assign({}, old0, { leave: oldLv });
    Object.keys(book.assign).forEach(e => Object.keys(book.assign[e]).forEach(k => { const row = B.validOn(book.assign[e][k], today); if (row && row.policy_id) own[row.policy_id] = (own[row.policy_id] || 0) + 1; }));
    const site = {}; B.KINDS.forEach(k => { const d = B.validOn(book.defaults[k], today), next = (book.defaults[k] || []).filter(r => r.valid_from > today).sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1))[0]; site[k] = { policy_id: d ? d.policy_id : null, valid_from: d ? d.valid_from : '', next: next ? { policy_id: next.policy_id, valid_from: next.valid_from } : null }; });
    return { ready: true, today: today, site: s.site, can: { make: s.role === 'super', give: s.role === 'super' || s.role === 'admin' || ho },
      kinds: B.KINDS.map(k => ({ key: k, name: B.KIND_NAME[k] })), roles: B.ROLES.map(r => ({ key: r, name: B.ROLE_NAME[r] })), defaults: site, old: old,
      policies: mine.map(p => { const v = ver[p.id] || [], now = B.validOn(v, today); return { id: p.id, kind: p.kind, name: p.name, sites: sitesOf(p, h), active: p.active, open: true, people: own[p.id] || 0,
        body: now ? now.body : null, auth: now ? now.auth : null, valid_from: now ? now.valid_from : '', versions: v.map(x => ({ id: x.id, valid_from: x.valid_from, body: x.body, auth: x.auth, by: x.created_by, at: x.created_at })) }; }) };
  },
  /* a new policy (of the site open at the top), or a new version of one from a date (Super Admin). { id?, kind, name, valid_from, body, auth } */
  async rbSave(s, x) {
    needSuper(s); const kind = kindOf(x.kind), name = R.str(x.name, 60), from = dayOf(x.valid_from, 'Valid from'); if (name.length < 2) throw fail(400, 'Name: at least 2 letters.', 'name');
    const b = B.body(kind, x.body), a = B.auth(x.auth), errors = b.errors.concat(a.errors); if (errors.length) throw fail(400, errors.join(' '), 'policy');
    // a new one is of the site open at the top; one made before keeps its sites (one of "every site": where it is in use / was made)
    let id = x.id ? idOf(x.id) : 0, sites = [s.site];
    if (id) { const p = await onePolicy(id); if (p.kind !== kind) throw fail(400, 'A policy keeps its kind.', 'kind'); const h = await homes([p]); if (!ofSite(p, s.site, h)) throw fail(403, 'This policy is of another site – open that site at the top.', 'site');
      if (sitesOf(p, h).length) sites = sitesOf(p, h); await db('PATCH', 'hr_policies?id=eq.' + id, { name: name, sites: sites }, 'return=minimal'); }
    else { id = ((await db('POST', 'hr_policies', [{ kind: kind, name: name, sites: sites, created_by: s.email }], 'return=representation').catch(ready)) || [])[0].id; }
    await db('POST', 'hr_policy_versions', [{ policy_id: id, valid_from: from, body: b.body, auth: a.auth, created_by: s.email }], 'return=minimal');
    await audit(s.site, s.email, x.id ? 'policy version' : 'policy new', kind + ' #' + id + ' ' + name, { valid_from: from, body: b.body, auth: a.auth, sites: sites });
    return { id: id };
  },
  // closed = it stays where it is used, nobody new gets it; opened again (Super Admin)
  async rbClose(s, x) {
    needSuper(s); const p = await onePolicy(idOf(x.id)), on = x.active === true; await needOfSite(p, s.site);
    await db('PATCH', 'hr_policies?id=eq.' + p.id, on ? { active: true, closed_by: '', closed_at: null } : { active: false, closed_by: s.email, closed_at: new Date().toISOString() }, 'return=minimal');
    await audit(s.site, s.email, on ? 'policy opened' : 'policy closed', p.kind + ' #' + p.id + ' ' + p.name, null); return { ok: true };
  },
  // only a policy that was never given to anybody (Super Admin)
  async rbDelete(s, x) {
    needSuper(s); const p = await onePolicy(idOf(x.id)); await needOfSite(p, s.site); if (await used(p.id)) throw fail(400, 'This policy was given to people or to a site – it cannot be deleted. Close it instead.', 'used');
    await db('DELETE', 'hr_policy_versions?policy_id=eq.' + p.id, undefined, 'return=minimal'); await db('DELETE', 'hr_policies?id=eq.' + p.id, undefined, 'return=minimal');
    await audit(s.site, s.email, 'policy deleted', p.kind + ' #' + p.id + ' ' + p.name, null); return { ok: true };
  },
  /* what this site gives to everybody who has no policy of his own, from a date. { kind, policy_id (empty = none), valid_from } */
  async rbDefault(s, x) {
    await needGiver(s); const kind = kindOf(x.kind), from = dayOf(x.valid_from, 'From'), pid = x.policy_id ? idOf(x.policy_id) : null;
    if (pid) { const p = await onePolicy(pid); if (p.kind !== kind) throw fail(400, 'This policy is of another kind.', 'kind'); if (!p.active) throw fail(400, 'This policy is closed.', 'closed'); await needOfSite(p, s.site); }
    await db('POST', 'hr_policy_defaults', [{ site: s.site, kind: kind, policy_id: pid, valid_from: from, set_by: s.email }], 'return=minimal').catch(ready);
    await audit(s.site, s.email, 'policy of the site', kind, { policy_id: pid, valid_from: from }); return { ok: true };
  },
  /* a policy for some people of this site, from a date. { kind, policy_id (empty = back to the site's own), valid_from,
   * employees: [ids], reason } – at most 500 at a time; a person of another site is refused */
  async rbAssign(s, x) {
    await needGiver(s); const kind = kindOf(x.kind), from = dayOf(x.valid_from, 'From'), pid = x.policy_id ? idOf(x.policy_id) : null, why = R.str(x.reason, 200);
    const ids = [...new Set((Array.isArray(x.employees) ? x.employees : []).map(v => String(v)).filter(v => /^[0-9a-f-]{36}$/i.test(v)))]; if (!ids.length) throw fail(400, 'Choose at least one employee.', 'employees'); if (ids.length > 500) throw fail(400, 'At most 500 employees at a time.', 'employees');
    if (pid) { const p = await onePolicy(pid); if (p.kind !== kind) throw fail(400, 'This policy is of another kind.', 'kind'); if (!p.active) throw fail(400, 'This policy is closed.', 'closed'); await needOfSite(p, s.site); }
    const here = {}; for (const c of chunks(ids, 60)) ((await db('GET', 'hr_employees?select=id&site=eq.' + enc(s.site) + '&id=in.(' + c.join(',') + ')')) || []).forEach(e => { here[e.id] = 1; });
    if (ids.some(i => !here[i])) throw fail(403, 'One of these employees is not on this site.', 'site');
    for (const c of chunks(ids, 200)) await db('POST', 'hr_policy_assign', c.map(i => ({ employee_id: i, site: s.site, kind: kind, policy_id: pid, valid_from: from, reason: why, assigned_by: s.email })), 'return=minimal').catch(ready);
    await audit(s.site, s.email, 'policy given', kind + ' → ' + ids.length + ' employee(s)', { policy_id: pid, valid_from: from, reason: why, employees: ids.slice(0, 50) }); return { given: ids.length };
  },
  /* the people of this site with the policy of one kind each has today: his own, the site's, or none */
  async rbPeople(s, x) {
    needOffice(s); const kind = kindOf(x.kind), today = R.today(), book = await siteBook(s.site); if (!book.ready) return { ready: false, note: NOT_READY13, rows: [] };
    const emps = (await db('GET', 'hr_employees?select=id,code,name,category,department_id,status&site=eq.' + enc(s.site) + '&status=neq.left&order=name&limit=5000')) || [];
    return { ready: true, kind: kind, rows: emps.map(e => { const p = bookOn(book, e.id, kind, today), own = B.validOn(((book.assign[e.id] || {})[kind]) || [], today); return { id: e.id, code: e.code, name: e.name, category: e.category, policy_id: p ? p.policy_id : null, from: p ? p.from : '', since: own && own.policy_id ? own.valid_from : '' }; }) };
  },
  // one person's policies of today, kind by kind (his page)
  async rbOf(s, x) {
    needOffice(s); const id = String(x.id || ''); if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail(400, 'This employee was not found.', 'notfound');
    const e = ((await db('GET', 'hr_employees?select=id,site&id=eq.' + id + '&site=eq.' + enc(s.site))) || [])[0]; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound');
    const book = await siteBook(s.site, 'employee_id=eq.' + id); if (!book.ready) return { ready: false, rows: [] };
    const today = R.today(), names = {}, ids = Object.keys(book.versions); if (ids.length) ((await db('GET', 'hr_policies?select=id,name&id=in.(' + ids.join(',') + ')')) || []).forEach(p => { names[p.id] = p.name; });
    return { ready: true, rows: B.KINDS.map(k => { const p = bookOn(book, id, k, today); return { kind: k, kind_name: B.KIND_NAME[k], policy_id: p ? p.policy_id : null, name: p ? names[p.policy_id] || '' : '', from: p ? p.from : '' }; }) };
  },
  /* the HR office's word on ONE day of this site: off or working (a fifth Saturday). { day, off, reason } */
  async rbDayOff(s, x) {
    await needGiver(s); const day = dayOf(x.day, 'Day'), why = R.str(x.reason, 200); if (why.length < 3) throw fail(400, 'Reason: write why.', 'reason');
    await db('POST', 'hr_weekoff_days', [{ site: s.site, day: day, off: x.off === true, reason: why, set_by: s.email }], 'return=minimal').catch(ready);
    await audit(s.site, s.email, 'day off set', day, { off: x.off === true, reason: why }); return { ok: true };
  },
};
module.exports = { ACT, NOT_READY13, siteBook, bookOn };
