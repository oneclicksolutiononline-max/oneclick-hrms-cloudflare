/* THE SEVEN-DAY DOCUMENT RULE (18-11-2026, Phase 3 – step 16; the master prompt Part 9: "mandatory documents within 7 days of
 * joining … after that the app is blocked except Documents … HR can override with a reason"; his answer: STAFF only).
 *   – A SETTING, not a number in the code (hr_settings, key "doc_rule"): on / off, the days, the categories, the papers. The row of
 *     the site wins over the company's row (site "ALL"). OFF until the Super Admin turns it on (his rule: what works stays working).
 *   – A person it applies to (his category is in it, he has a joining date, he has not left) has until his joining date + the days
 *     to have every paper of the list attached (a rejected one does not count; one marked "not applicable" is not asked).
 *   – After that day his "My HR" opens only his papers, his policies and his own record until they are there – or until the
 *     day the HR Admin / Super Admin let him (hr_doc_overrides – the reason, who, when). Nothing else of his is changed.
 *   – The HR office's own sign-in is not touched; Operator, Driver and Labour keep everything as today (his answer). */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const R = require('./rules');
const S15 = require('./step15');

const DEFAULT = { on: false, days: 7, categories: ['staff'], docs: ['photo', 'aadhaar', 'pan', 'bank_passbook'] };
const NOT_READY16 = 'This part is not set up yet: the Super Admin runs sql/hr_step16_attendance.sql once in the rcl-hr Supabase → SQL Editor.';
// what "My HR" may still do while he is held (his papers, his policies, his own record, his language)
const FREE = ['myHr', 'myDocs', 'myDocUploadUrl', 'myDocAdd', 'myDocLink', 'myPolicies', 'myPolicyAccept', 'myPolicyFile', 'langSet', 'myNotices', 'myNoticeSeen'];

const clean = v => {
  v = v || {}; const o = { on: v.on === true, days: Math.min(60, Math.max(1, Math.round(Number(v.days) || DEFAULT.days))) };
  o.categories = [...new Set((Array.isArray(v.categories) ? v.categories : DEFAULT.categories).map(R.category).filter(Boolean))];
  o.docs = [...new Set((Array.isArray(v.docs) ? v.docs : DEFAULT.docs).map(String).filter(k => R.docKind(k) && !R.docKind(k).restricted))];
  return o;
};
async function ready16() { try { await db('GET', 'hr_doc_overrides?select=id&limit=1'); return true; } catch (e) { if (e && e.code === 'notinstalled') return false; throw e; } }
// the rule of a site: its own row, else the company's (ALL), else the default (off)
async function ruleOf(site) {
  const rows = (await db('GET', 'hr_settings?select=site,value&key=eq.doc_rule&site=in.(' + enc(site) + ',ALL)')) || [];
  const own = rows.filter(r => r.site === site)[0] || rows.filter(r => r.site === 'ALL')[0];
  return Object.assign(clean(own ? own.value : DEFAULT), { from: own ? own.site : '' });
}
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/* where one person stands: { applies, due, missing: [names], blocked, override: { until, reason } | null }
 * emp: { id, site, category, joined_on, status } */
async function stateOf(emp, rule) {
  rule = rule || await ruleOf(emp.site);
  if (!rule.on || rule.categories.indexOf(emp.category) < 0 || !emp.joined_on || emp.status === 'left' || !(await S15.ready())) return { applies: false };
  const due = addDays(String(emp.joined_on).slice(0, 10), rule.days), today = R.today();
  const [docs, na, ov] = await Promise.all([db('GET', 'hr_employee_docs?select=kind,status&employee_id=eq.' + emp.id + '&active=is.true'), db('GET', 'hr_doc_na?select=kind&active=is.true&employee_id=eq.' + emp.id),
    db('GET', 'hr_doc_overrides?select=id,until,reason,given_by,given_at&employee_id=eq.' + emp.id + '&ended_at=is.null').catch(e => { if (e && e.code === 'notinstalled') return []; throw e; })]);
  const have = (docs || []).filter(d => d.status !== 'rejected').map(d => d.kind), naK = (na || []).map(n => n.kind);
  const missing = rule.docs.filter(k => have.indexOf(k) < 0 && naK.indexOf(k) < 0).map(k => R.docKind(k).name);
  const o = (ov || [])[0], override = o && o.until >= today ? { id: o.id, until: o.until, reason: o.reason, by: o.given_by } : null;
  return { applies: true, due: due, missing: missing, late: missing.length > 0 && today > due, blocked: missing.length > 0 && today > due && !override, override: override };
}

// a person who is NOT held is remembered for a minute (the check costs three readings); a held one is asked every time
const memo = new Map();
async function guard(s, action, me) {
  if (s.role !== 'self' || FREE.indexOf(String(action)) > -1) return;
  const k = String(s.email || '').toLowerCase(), m = memo.get(k); if (m && Date.now() - m.at < 60000) return;
  let emp; try { emp = await me(s); } catch (e) { return; }      // (no employee for this sign-in: the action itself says so)
  const full = ((await db('GET', 'hr_employees?select=id,site,category,joined_on,status&id=eq.' + emp.id)) || [])[0] || emp;
  const st = await stateOf(full);
  if (!st.blocked) { memo.set(k, { at: Date.now(), id: emp.id }); if (memo.size > 5000) memo.clear(); return; }
  const dmy = d => String(d).split('-').reverse().join('-');
  throw fail(403, 'Your papers were due by ' + dmy(st.due) + ': ' + st.missing.join(', ') + '. Attach them in Me → My documents – then everything opens again (or ask the HR office).', 'docs7', { missing: st.missing, due: st.due });
}
const forget = id => { for (const [k, v] of memo) if (v.id === id) memo.delete(k); };
module.exports = { DEFAULT, FREE, NOT_READY16, clean, ready16, ruleOf, stateOf, guard, forget, addDays };
