/* THE SEVEN-DAY RULE'S PAGE (the HR office) – the setting, who is late or held, the override; and "My work locations" (the
 * employee's own, the app) – 18-11-2026, Phase 3 (step 16). See lib/docrule.js for the rule itself. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const DR = require('./docrule');
const OWN = require('./own');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id = v => { v = String(v || '').toLowerCase(); return UUID.test(v) ? v : ''; };
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const office = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };
const need16 = async () => { if (!(await DR.ready16())) throw fail(500, DR.NOT_READY16, 'notready16'); };
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
const me = s => require('./act_attend').me(s);

const ACT = {
  // the setting as it counts for this site (and where it comes from)
  async docRuleGet(s) {
    office(s); const rule = await DR.ruleOf(s.site);
    return { rule: rule, ready: await DR.ready16(), can: s.role === 'super', kinds: R.DOCS.filter(d => !d.restricted).map(d => ({ key: d.key, name: d.name })), categories: R.CATS.map(c => ({ key: c, name: R.CAT_NAME[c] || c })) };
  },
  /* the Super Admin turns it on / off and says the days, the categories and the papers – for every site (ALL) or for this one */
  async docRuleSave(s, x) {
    if (s.role !== 'super') throw fail(403, 'Only the Super Admin changes the seven-day rule.', 'role');
    await need16();
    const site = x.site === 'ALL' ? 'ALL' : s.site, v = DR.clean(x.rule || x);
    if (v.on && (!v.categories.length || !v.docs.length)) throw fail(400, 'Choose at least one category and one paper – or switch the rule off.', 'check');
    const was = ((await db('GET', 'hr_settings?select=value&key=eq.doc_rule&site=eq.' + enc(site))) || [])[0];
    await db('POST', 'hr_settings?on_conflict=site,key', [{ site: site, key: 'doc_rule', value: v, updated_by: s.email, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
    await audit(s.site, s.email, 'Seven-day document rule changed', site === 'ALL' ? 'every site' : site, { old: was ? was.value : null, new: v });
    return { ok: true, rule: await DR.ruleOf(s.site) };
  },
  /* the people of this site it applies to: when their papers are due, what is missing, held or let in */
  async docRuleList(s) {
    office(s); const rule = await DR.ruleOf(s.site);
    if (!rule.on) return { rule: rule, rows: [] };
    const emps = (await db('GET', 'hr_employees?select=id,code,name,category,site,joined_on,status&site=eq.' + enc(s.site) + '&status=neq.left&category=in.(' + rule.categories.join(',') + ')&joined_on=not.is.null&order=joined_on.desc&limit=2000')) || [];
    const out = [];
    for (const e of emps) { const st = await DR.stateOf(e, rule); if (st.applies && st.missing.length) out.push({ id: e.id, code: e.code, name: e.name, joined_on: e.joined_on, due: st.due, missing: st.missing, late: st.late, blocked: st.blocked, override: st.override }); }
    return { rule: rule, rows: out };
  },
  /* let him in up to a day (at most 60 days ahead) – the reason; never his own */
  async docOverride(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin lets a person in before his papers are there.', 'role');
    await need16();
    const e = ((await db('GET', 'hr_employees?select=id,code,name,site,status&id=eq.' + id(x.id) + '&site=eq.' + enc(s.site))) || [])[0]; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound');
    await OWN.notOwn(s, e.id, 'let yourself in');
    const until = R.date(x.until), today = R.today(); if (!until) throw fail(400, 'Up to: a date as DD-MM-YYYY.', 'until');
    if (until < today) throw fail(400, 'Up to: a day of today or later.', 'until'); if (until > DR.addDays(today, 60)) throw fail(400, 'Up to: at most 60 days ahead.', 'until');
    const why = R.str(x.reason, 200); if (why.length < 5) throw fail(400, 'Reason: write why he may use the app before his papers are there (at least 5 letters).', 'reason');
    const now = new Date().toISOString();
    await db('PATCH', 'hr_doc_overrides?employee_id=eq.' + e.id + '&ended_at=is.null', { ended_by: s.email, ended_at: now, end_reason: 'replaced by a newer one' }, 'return=minimal');
    await db('POST', 'hr_doc_overrides', [{ employee_id: e.id, site: e.site, until: until, reason: why, given_by: s.email }], 'return=minimal');
    DR.forget(e.id);
    await audit(s.site, s.email, 'Seven-day rule: let in', e.code, { until: until, reason: why });
    return { ok: true };
  },
  async docOverrideEnd(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin ends it.', 'role');
    await need16();
    const e = ((await db('GET', 'hr_employees?select=id,code&id=eq.' + id(x.id) + '&site=eq.' + enc(s.site))) || [])[0]; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound');
    const why = R.str(x.reason, 200); if (why.length < 3) throw fail(400, 'Reason: write why (at least 3 letters).', 'reason');
    const done = (await db('PATCH', 'hr_doc_overrides?employee_id=eq.' + e.id + '&ended_at=is.null', { ended_by: s.email, ended_at: new Date().toISOString(), end_reason: why }, 'return=representation')) || [];
    if (!done.length) throw fail(404, 'He was not let in.', 'none');
    DR.forget(e.id); await audit(s.site, s.email, 'Seven-day rule: let in – ended', e.code, { reason: why });
    return { ok: true };
  },

  /* (Phase 3 – the master prompt Part 7: "My Work Locations") HIS OWN WORK PLACES in the app: where he may mark today, IN / OUT,
   * the dates – and a place given to him that does not count today, with why. Reads only. */
  async myPlaces(s) {
    const emp = await me(s), A = require('./act_attend'), day = R.today();
    const full = ((await db('GET', 'hr_employees?select=id,code,name,category,site,department_id,status&id=eq.' + emp.id)) || [])[0] || emp;
    const now = await A.placesOf(full, day), ids = now.map(p => p.id);
    const r15 = await require('./step15').ready();
    const own = (await db('GET', 'hr_place_people?select=place_id' + (r15 ? ',valid_from,valid_to,can_in,can_out' : '') + '&employee_id=eq.' + emp.id)) || [];
    const later = own.filter(r => ids.indexOf(r.place_id) < 0), more = later.length ? (await db('GET', 'hr_places?select=id,site,name,kind,active,valid_from,removed_at&id=in.(' + later.slice(0, 60).map(r => r.place_id).join(',') + ')')) || [] : [];
    const why = (p, r) => p.removed_at ? 'removed' : !p.active ? 'switched off by the HR office' : p.valid_from > day ? 'counts from ' + dmy(p.valid_from) : r && r.valid_from && r.valid_from > day ? 'given to you from ' + dmy(r.valid_from) : r && r.valid_to && r.valid_to < day ? 'given to you up to ' + dmy(r.valid_to) : 'not today';
    // (19-11-2026) "Anywhere" given by the HR office: one line of the list (the app of today shows it as a place that counts)
    const free = await require('./anywhere').on(full.site, emp.id, day), any = free ? [{ id: 'anywhere', name: 'Anywhere – any place' + (free.until ? ' (up to ' + dmy(free.until) + ')' : ''), site: full.site, kind: 'other', can_in: true, can_out: true, counts: true, why: '' }] : [];
    return { day: day, anywhere: free ? { until: free.until || '' } : null, places: now.map(p => ({ id: p.id, name: p.name, site: p.site, kind: p.kind, shape: p.shape, lat: p.lat, lng: p.lng, radius_m: p.radius_m, can_in: p.can_in !== false, can_out: p.can_out !== false, counts: true, why: '' })).concat(any)
      .concat(more.filter(p => !p.removed_at).map(p => { const r = own.filter(x => x.place_id === p.id)[0]; return { id: p.id, name: p.name, site: p.site, kind: p.kind, can_in: !r || r.can_in !== false, can_out: !r || r.can_out !== false, counts: false, why: why(p, r) }; })) };
  },
};
const SELF = ['myPlaces'];
module.exports = { ACT, SELF };
