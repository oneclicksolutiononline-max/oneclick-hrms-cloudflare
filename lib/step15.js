/* STEP 15 – IS IT THERE? (18-11-2026, Phase 2 of the enterprise HRMS: the Employee Master, papers, onboarding, policies)
 * The code of Phase 2 may reach Vercel before the Super Admin runs sql/hr_step15_employee.sql. Until then EVERYTHING of today works
 * exactly as before: a paper is attached as before, a work place is for IN and OUT as before; only the new pages say what to run.
 * The answer is kept 5 minutes (a "not yet" is asked again after one minute, so it turns on soon after he runs it). */
'use strict';
const { fail } = require('./http');
const { db } = require('./db');
const R = require('./rules');

const NOT_READY15 = 'This part is not set up yet: the Super Admin runs sql/hr_step15_employee.sql once in the rcl-hr Supabase → SQL Editor.';
let has = null, at = 0;
async function ready() {
  if (has !== null && Date.now() - at < (has ? 300000 : 60000)) return has;
  try { await db('GET', 'hr_doc_na?select=kind&limit=1'); has = true; }
  catch (e) { if (e && e.code === 'notinstalled') has = false; else throw e; }
  at = Date.now(); return has;
}
async function need() { if (!(await ready())) throw fail(500, NOT_READY15, 'notready15'); }
const reset = () => { has = null; at = 0; };      // (the tests)

/* WHICH PAPERS A PERSON STILL NEEDS – one rule for every page (the office's, his own, the app's): his category; his driving licence
 * also when he drives for work (his profile, "Drives a vehicle for work"); never a kind marked "not applicable" to him; a rejected
 * paper does not count as attached. A reminder, never a block. */
async function needsOf(ids) {
  ids = [...new Set((ids || []).filter(Boolean))]; const out = {}; ids.forEach(i => { out[i] = { drives: false, na: [] }; });
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80).join(',');
    ((await db('GET', 'hr_employee_profile?select=employee_id,data&employee_id=in.(' + part + ')')) || []).forEach(p => { if (out[p.employee_id]) out[p.employee_id].drives = !!(p.data && p.data.drives === true); });
    if (await ready()) ((await db('GET', 'hr_doc_na?select=employee_id,kind&active=is.true&employee_id=in.(' + part + ')')) || []).forEach(n => { if (out[n.employee_id]) out[n.employee_id].na.push(n.kind); });
  }
  return out;
}
// e: { id, category }; docs: his active papers [{ kind, status? }]
async function missingOf(e, docs) {
  const o = (await needsOf([e.id]))[e.id];
  return R.docsMissing(e.category, (docs || []).filter(d => d.status !== 'rejected').map(d => d.kind), o);
}
module.exports = { NOT_READY15, ready, need, reset, needsOf, missingOf };
