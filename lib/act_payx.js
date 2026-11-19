/* PAYROLL, PHASE 5 (18-11-2026, step 18; the master prompt Part 12) – beside the payroll of steps 11–12, which stays as it is:
 *   SALARY STRUCTURES  a structure's parts as a % of the pay (Basic, HRA, …), versions from a date, approved by ANOTHER person of
 *                      the HO HR (the Super Admin may approve his own); a person is given a structure (hr_pay_emp.structure_id).
 *   STATUTORY NUMBERS  PF / ESIC / PT and (new) the employer's shares, LWF, gratuity stay the dated pay settings – each version with
 *                      its source; his CA's check of a version is written (hr_pay_checks).
 *   RELEASE            a locked payslip: approved → ready → paid (the payment: how, its reference, the day); or held / rejected.
 *   FULL & FINAL       for a relieved person: its lines (pay still due, leave paid out, gratuity, the advance left, notice, other),
 *                      made → checked → approved → paid – never by one person.
 *   REGISTERS          salary, PF, ESIC, PT, LWF, TDS, payments, F&F – rows for Excel.
 *   COMPARE            his present method's figures beside the ERP's, line by line (two months before it is used alone).
 * Only the HO HR and the Super Admin (as payroll). No amount is written into the audit. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const P = require('./pay');
const M = require('./month');
const PR = require('./act_payroll');
const MUS = require('./act_muster');

const NOT_READY18 = 'This part of payroll is not set up yet: the Super Admin runs sql/hr_step18_payroll.sql once in the rcl-hr Supabase → SQL Editor.';
const need18 = async () => { if (!(await PR.ready18())) throw fail(500, NOT_READY18, 'notready18'); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uid = v => { v = String(v || '').toLowerCase(); return UUID.test(v) ? v : ''; };
const lower = v => String(v || '').toLowerCase();
const monthOf = v => { if (!M.monthOk(v)) throw fail(400, 'Month: as YYYY-MM.', 'month'); return String(v); };
const empOf = async (s, v) => { const e = uid(v) ? ((await db('GET', 'hr_employees?select=id,code,name,site,status,joined_on,left_on,category&id=eq.' + uid(v) + '&site=eq.' + enc(s.site))) || [])[0] : null; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound'); return e; };
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
// a day typed (dd-mm-yyyy …) or today when empty; a wrong one is refused
const dayOr = (v, what) => { const d = R.date(v); if (d === null) throw fail(400, what + ': a date as DD-MM-YYYY.', 'day'); return d || R.today(); };
const mask = (s, v) => (s.role === 'super' || s.role === 'admin' || !v ? v || '' : 'X'.repeat(Math.max(0, String(v).length - 4)) + String(v).slice(-4));
// whole years of service and the years counted for gratuity (a part of a year above six months counts as a year)
function service(from, to) {
  const add = (d, m) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + m, +d.slice(8))); return t.toISOString().slice(0, 10); };
  let y = 0; while (add(from, (y + 1) * 12) <= to) y++;
  return { full: y, counted: to > add(from, y * 12 + 6) ? y + 1 : y };
}

/* a structure's parts as typed: [{ key, name, pct }] – keys are letters / _; the % add up to at most 100; the last may have no % (the rest) */
function partsOf(list) {
  const out = [], errs = [], seen = {}; let sum = 0;
  (Array.isArray(list) ? list : []).slice(0, 12).forEach((c, i) => {
    if (!c || (!c.name && !c.pct)) return;
    const name = R.str(c.name, 40), key = (R.str(c.key || c.name, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'part' + (i + 1)), last = i === list.length - 1;
    const pct = c.pct === '' || c.pct === undefined || c.pct === null ? null : Number(String(c.pct).replace('%', ''));
    if (name.length < 2) errs.push('Part ' + (i + 1) + ': a name.'); if (seen[key]) errs.push('Part ' + (i + 1) + ': the same part twice.'); seen[key] = 1;
    if (pct === null && !last) errs.push('Part ' + (i + 1) + ': its % (only the last part may take the rest).');
    if (pct !== null && !(pct > 0 && pct <= 100)) errs.push('Part ' + (i + 1) + ': a % above 0, at most 100.');
    if (pct !== null) sum += pct; out.push(Object.assign({ key: key, name: name }, pct !== null ? { pct: Math.round(pct * 100) / 100 } : {}));
  });
  if (!out.length) errs.push('Write at least one part (e.g. Basic 50 %).'); if (sum > 100.001) errs.push('The parts add up to more than 100 %.');
  return { parts: out, errors: errs };
}
// where a payslip stands: the newest release row; none = approved (it was locked)
async function standOf(ids) {
  const out = {}; for (const c of MUS.chunks(ids, 80)) ((await db('GET', 'hr_pay_release?select=payslip_id,status,note,by,at&payslip_id=in.(' + c.join(',') + ')&order=id.desc')) || []).forEach(r => { if (!out[r.payslip_id]) out[r.payslip_id] = r; });
  return out;
}
const MOVES = { approved: ['ready', 'hold', 'rejected'], ready: ['paid', 'hold', 'approved'], hold: ['approved', 'rejected'], rejected: [], paid: [] };
const sumLines = lines => P.r2(lines.reduce((n, l) => n + (l.kind === 'ded' ? -1 : 1) * (+l.amount || 0), 0));
function linesOf(list) {
  const out = [], errs = [];
  (Array.isArray(list) ? list : []).slice(0, 30).forEach((l, i) => {
    if (!l) return; const name = R.str(l.name, 80), amt = P.num(l.amount, 1e8);
    if (name.length < 2) errs.push('Line ' + (i + 1) + ': what it is.'); if (amt === null || amt === undefined) errs.push('Line ' + (i + 1) + ': an amount.');
    out.push({ key: R.str(l.key || 'other', 20), name: name, kind: l.kind === 'ded' ? 'ded' : 'earn', amount: amt || 0, note: R.str(l.note, 200) });
  });
  return { lines: out, errors: errs };
}

const ACT = {
  /* ───── salary structures ───── */
  async structList(s) {
    await PR.needHo(s); await need18();
    const [st, ver, used] = await Promise.all([db('GET', 'hr_pay_structures?select=*&order=name'), db('GET', 'hr_pay_structure_versions?select=*&order=structure_id,version.desc'), db('GET', 'hr_pay_emp?select=structure_id&structure_id=not.is.null')]);
    const n = {}; (used || []).forEach(u => { n[u.structure_id] = (n[u.structure_id] || 0) + 1; });
    return { rows: (st || []).map(x => Object.assign(x, { people: n[x.id] || 0, versions: (ver || []).filter(v => v.structure_id === x.id) })) };
  },
  async structSave(s, x) {
    await PR.needHo(s); await need18();
    const name = R.str(x.name, 60); if (name.length < 2) throw fail(400, 'Name: at least 2 letters.', 'name');
    const id = Number(x.id) || 0, row = { name: name, note: R.str(x.note, 200), active: x.active !== false };
    try { if (id) await db('PATCH', 'hr_pay_structures?id=eq.' + id, row, 'return=minimal'); else await db('POST', 'hr_pay_structures', [Object.assign(row, { created_by: s.email })], 'return=minimal'); }
    catch (e) { if (e && e.code === 'duplicate') throw fail(409, 'A structure with this name is there already.', 'name'); throw e; }
    await audit(s.site, s.email, id ? 'Salary structure changed' : 'Salary structure made', name, {}); return ACT.structList(s);
  },
  // a DRAFT version (written / changed until approved): { structure, parts: [{ name, pct }], valid_from }
  async structVersionSave(s, x) {
    await PR.needHo(s); await need18();
    const sid = Number(x.structure) || 0; if (!((await db('GET', 'hr_pay_structures?select=id&id=eq.' + sid)) || []).length) throw fail(404, 'This structure was not found.', 'notfound');
    const c = partsOf(x.parts); if (c.errors.length) throw fail(400, c.errors.join(' '), 'parts');
    const from = dayOr(x.valid_from, 'From');
    const draft = ((await db('GET', 'hr_pay_structure_versions?select=id,version&structure_id=eq.' + sid + '&status=eq.draft')) || [])[0];
    if (draft) await db('PATCH', 'hr_pay_structure_versions?id=eq.' + draft.id + '&status=eq.draft', { parts: c.parts, valid_from: from, created_by: s.email }, 'return=minimal');
    else { const last = ((await db('GET', 'hr_pay_structure_versions?select=version&structure_id=eq.' + sid + '&order=version.desc&limit=1')) || [])[0]; await db('POST', 'hr_pay_structure_versions', [{ structure_id: sid, version: last ? last.version + 1 : 1, valid_from: from, parts: c.parts, created_by: s.email }], 'return=minimal'); }
    return ACT.structList(s);
  },
  // approved by ANOTHER person (the Super Admin may approve his own); a month already locked is never counted again
  async structApprove(s, x) {
    await PR.needHo(s); await need18();
    const v = ((await db('GET', 'hr_pay_structure_versions?select=*&id=eq.' + (Number(x.version) || 0))) || [])[0];
    if (!v || v.status !== 'draft') throw fail(400, 'Only a draft is approved.', 'status');
    if (lower(v.created_by) === lower(s.email) && s.role !== 'super') throw fail(403, 'Another person of the HO HR approves it – not the one who wrote it.', 'own');
    await db('PATCH', 'hr_pay_structure_versions?id=eq.' + v.id + '&status=eq.draft', { status: 'approved', approved_by: s.email, approved_at: new Date().toISOString() }, 'return=minimal');
    await audit(s.site, s.email, 'Salary structure approved', 'structure ' + v.structure_id + ' v' + v.version, { from: v.valid_from, parts: v.parts.map(p => p.name + (p.pct ? ' ' + p.pct + '%' : ' rest')) });
    return ACT.structList(s);
  },
  /* a person's structure, LWF and TDS of a month – kept for the months to come (the month's sheet shows it while it is not locked) */
  async payEmpSet(s, x) {
    await PR.needHo(s); await need18(); const e = await empOf(s, x.id);
    const sid = x.structure === '' || x.structure === null || x.structure === undefined ? null : Number(x.structure) || 0;
    if (sid && !((await db('GET', 'hr_pay_structures?select=id&active=is.true&id=eq.' + sid)) || []).length) throw fail(400, 'Structure: choose one of the list.', 'structure');
    const tds = P.num(x.tds_monthly, 1e7); if (tds === null) throw fail(400, 'TDS of a month: a number.', 'tds');
    const was = ((await db('GET', 'hr_pay_emp?select=*&employee_id=eq.' + e.id)) || [])[0] || {};
    await db('POST', 'hr_pay_emp?on_conflict=employee_id', [{ employee_id: e.id, pf: !!was.pf, esic: !!was.esic, pt: !!was.pt, structure_id: sid, lwf: x.lwf === true, tds_monthly: tds || 0, updated_by: s.email, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
    await audit(s.site, s.email, 'Pay: structure / LWF / TDS set', e.code, { structure: sid, lwf: x.lwf === true, tds: !!tds });
    return { ok: true };
  },

  /* ───── the statutory numbers: his CA's check of the version in force (or of the one named) ───── */
  async statChecks(s) {
    await PR.needHo(s); await need18();
    const [set, chk] = await Promise.all([db('GET', 'hr_pay_settings?select=id,valid_from,settings,created_by,created_at&order=valid_from.desc,id.desc&limit=30'), db('GET', 'hr_pay_checks?select=*&order=id.desc&limit=200')]);
    return { rows: (set || []).map(v => Object.assign(v, { checks: (chk || []).filter(c => c.settings_id === v.id) })) };
  },
  async statCheck(s, x) {
    await PR.needHo(s); await need18();
    const v = ((await db('GET', 'hr_pay_settings?select=id,valid_from&id=eq.' + (Number(x.settings) || 0))) || [])[0]; if (!v) throw fail(404, 'This version of the settings was not found.', 'notfound');
    const note = R.str(x.note, 300); if (note.length < 5) throw fail(400, 'Write what was checked (e.g. "CA – PF, ESIC, PT as per the notifications of 2026").', 'note');
    await db('POST', 'hr_pay_checks', [{ settings_id: v.id, checked_by: s.email, note: note }], 'return=minimal');
    await audit(s.site, s.email, 'Pay settings checked', 'from ' + v.valid_from, { note: note }); return ACT.statChecks(s);
  },

  /* ───── release and payment of a locked month ───── */
  async payRelease(s, x) {
    await PR.needHo(s); await need18(); const month = monthOf(x.month);
    const run = ((await db('GET', 'hr_pay_runs?select=id&site=eq.' + enc(s.site) + '&month=eq.' + month)) || [])[0]; if (!run) return { locked: false, rows: [] };
    const slips = await MUS.all('hr_payslips?select=id,employee_id,net,data&run_id=eq.' + run.id + '&order=id'), st = await standOf(slips.map(p => p.id));
    const pays = {}; for (const c of MUS.chunks(slips.map(p => p.id), 80)) ((await db('GET', 'hr_pay_payments?select=*&payslip_id=in.(' + c.join(',') + ')')) || []).forEach(p => { (pays[p.payslip_id] = pays[p.payslip_id] || []).push(p); });
    return { locked: true, rows: slips.map(p => ({ id: p.id, code: (p.data || {}).code, name: (p.data || {}).name, net: +p.net, status: st[p.id] ? st[p.id].status : 'approved', note: st[p.id] ? st[p.id].note : '', by: st[p.id] ? st[p.id].by : '', payments: pays[p.id] || [] })) };
  },
  /* move payslips on: { ids, status: ready | hold | rejected | approved, note } – paid only through payPaid */
  async payReleaseSet(s, x) {
    await PR.needHo(s); await need18();
    const to = String(x.status || ''); if (['ready', 'hold', 'rejected', 'approved'].indexOf(to) < 0) throw fail(400, 'Choose where they go: ready, held, rejected or back to approved.', 'status');
    const note = R.str(x.note, 200); if ((to === 'hold' || to === 'rejected') && note.length < 3) throw fail(400, 'Reason: write why (at least 3 letters).', 'note');
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(Number).filter(n => n > 0))].slice(0, 2000); if (!ids.length) throw fail(400, 'Tick at least one payslip.', 'ids');
    const own = []; for (const c of MUS.chunks(ids, 80)) ((await db('GET', 'hr_payslips?select=id&site=eq.' + enc(s.site) + '&id=in.(' + c.join(',') + ')')) || []).forEach(p => own.push(p.id));
    const st = await standOf(own), ok = own.filter(id => MOVES[st[id] ? st[id].status : 'approved'].indexOf(to) > -1), skipped = own.length - ok.length;
    if (ok.length) await db('POST', 'hr_pay_release', ok.map(id => ({ payslip_id: id, status: to, note: note, by: s.email })), 'return=minimal');
    await audit(s.site, s.email, 'Payslips ' + to, ok.length + ' payslip(s)', { note: note });
    return { done: ok.length, skipped: skipped };
  },
  /* paid: { ids, mode, ref, paid_on } – a payment row for each (its net), then "paid"; only a payslip that is ready */
  async payPaid(s, x) {
    await PR.needHo(s); await need18();
    const mode = ['bank', 'cash', 'cheque', 'upi'].indexOf(x.mode) > -1 ? x.mode : ''; if (!mode) throw fail(400, 'How it was paid: bank, cash, cheque or UPI.', 'mode');
    const ref = R.str(x.ref, 80); if (mode !== 'cash' && ref.length < 3) throw fail(400, 'Reference: the bank / cheque / UPI reference.', 'ref');
    const on = dayOr(x.paid_on, 'Paid on'); if (on > R.today()) throw fail(400, 'Paid on: a day of today or before.', 'paid_on');
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(Number).filter(n => n > 0))].slice(0, 2000); if (!ids.length) throw fail(400, 'Tick at least one payslip.', 'ids');
    const slips = []; for (const c of MUS.chunks(ids, 80)) ((await db('GET', 'hr_payslips?select=id,net&site=eq.' + enc(s.site) + '&id=in.(' + c.join(',') + ')')) || []).forEach(p => slips.push(p));
    const st = await standOf(slips.map(p => p.id)), ok = slips.filter(p => st[p.id] && st[p.id].status === 'ready');
    if (ok.length) { await db('POST', 'hr_pay_payments', ok.map(p => ({ payslip_id: p.id, amount: +p.net, mode: mode, ref: ref, paid_on: on, by: s.email })), 'return=minimal'); await db('POST', 'hr_pay_release', ok.map(p => ({ payslip_id: p.id, status: 'paid', note: mode + (ref ? ' ' + ref : ''), by: s.email })), 'return=minimal'); }
    await audit(s.site, s.email, 'Payslips paid', ok.length + ' payslip(s)', { mode: mode, paid_on: on });
    return { done: ok.length, skipped: slips.length - ok.length };
  },

  /* ───── full & final ───── */
  async fnfList(s) {
    await PR.needHo(s); await need18();
    const rows = (await db('GET', 'hr_fnf?select=*&site=eq.' + enc(s.site) + '&order=id.desc&limit=200')) || [], ids = [...new Set(rows.map(r => r.employee_id))], who = {};
    for (const c of MUS.chunks(ids, 80)) ((await db('GET', 'hr_employees?select=id,code,name&id=in.(' + c.join(',') + ')')) || []).forEach(e => { who[e.id] = e; });
    return { rows: rows.map(r => Object.assign(r, { code: (who[r.employee_id] || {}).code, name: (who[r.employee_id] || {}).name })) };
  },
  /* make it – for a RELIEVED person, after the pay of the month of his last day is locked (his last pay goes through the monthly
   * pay, exactly as before; the full & final is what is left). The lines the ERP can work out are filled; each can be changed
   * before it is checked: his last month's pay only when he was not in that locked month; unused leave only when that month's
   * payslip did not pay it already (the Rule Book's "unused leave is paid"); gratuity only when its numbers are in the pay
   * settings (days, divided by, from how many years – his CA's numbers); the advance not taken back; the notice not served. */
  async fnfMake(s, x) {
    await PR.needHo(s); await need18(); const e = await empOf(s, x.id), last = e.left_on;
    if (!last) throw fail(400, 'He is not relieved yet – relieve him with his last working day first.', 'notleft');
    if (((await db('GET', 'hr_fnf?select=id&employee_id=eq.' + e.id + '&status=neq.cancelled')) || []).length) throw fail(409, 'His full & final is made already – open it.', 'duplicate');
    const month = last.slice(0, 7), run = ((await db('GET', 'hr_pay_runs?select=id&site=eq.' + enc(e.site) + '&month=eq.' + month)) || [])[0];
    if (!run) throw fail(400, 'First lock the pay of ' + month + ' (the month of his last day) – his last pay goes through it; the full & final comes after.', 'notlocked');
    const slip = ((await db('GET', 'hr_payslips?select=id,net,data&run_id=eq.' + run.id + '&employee_id=eq.' + e.id)) || [])[0];
    const sal = ((await db('GET', 'hr_salaries?select=pay_type,amount,valid_from&employee_id=eq.' + e.id + '&status=eq.approved&valid_from=lte.' + last + '&order=valid_from.desc&limit=1')) || [])[0];
    const set = await PR.settingsOn(last), st = set ? set.settings : {}, lines = [], mdays = +M.lastDay(month).slice(8);
    const monthly = sal ? (sal.pay_type === 'daily' ? +sal.amount * mdays : +sal.amount) : 0, day = sal ? (sal.pay_type === 'daily' ? +sal.amount : +sal.amount / mdays) : 0;
    if (!slip && sal) lines.push({ key: 'salary', name: 'Pay of ' + month + ' up to ' + dmy(last) + ' (he was not in the locked month)', kind: 'earn', amount: P.r2(day * +last.slice(8)), note: 'calendar days – check with the muster' });
    if (!(slip && +(slip.data || {}).leave_days > 0)) {
      try { const L = await require('./act_leave').state(e.site, 'employee_id=eq.' + e.id, [e]), b = L.by[e.id] || {}, have = Math.max(0, Math.floor(((+b.balance || 0) + (+b.comp || 0)) * 2) / 2);
        if (have > 0 && day) lines.push({ key: 'leave', name: 'Unused leave (' + have + ' days)', kind: 'earn', amount: P.r2(day * have), note: 'Paid leave + Comp-off left on his last day – remove it if it is not paid out' }); } catch (er) { if (!er || er.code !== 'notinstalled') throw er; }
    }
    if (sal && st.grat_days !== undefined && st.grat_divisor && e.joined_on) {
      const sv = service(e.joined_on, last);
      if (sv.full >= (st.grat_years !== undefined ? +st.grat_years : 0)) {
        const ver = (await db('GET', 'hr_pay_emp?select=structure_id&employee_id=eq.' + e.id)) || [], ST = ver[0] && ver[0].structure_id ? (await PR.structuresOn(last))[ver[0].structure_id] : null;
        const b = ST ? P.basicOf(P.parts(ST, monthly)) : undefined, base = b !== undefined ? b : monthly;
        lines.push({ key: 'gratuity', name: 'Gratuity (' + sv.counted + ' years)', kind: 'earn', amount: P.r2(base * +st.grat_days / +st.grat_divisor * sv.counted), note: (b !== undefined ? 'Basic' : 'the monthly pay (no structure – check the Basic with the CA)') + ' × ' + st.grat_days + ' ÷ ' + st.grat_divisor + ' × years' });
      }
    }
    const adv = ((await db('GET', 'hr_advances?select=amount,recovered&employee_id=eq.' + e.id + '&status=eq.active')) || [])[0];
    if (adv && +adv.amount - +adv.recovered > 0) lines.push({ key: 'advance', name: 'Advance not taken back', kind: 'ded', amount: P.r2(+adv.amount - +adv.recovered), note: '' });
    lines.push({ key: 'notice', name: 'Notice period not served', kind: 'ded', amount: 0, note: 'write the days × the day\'s pay, if any' });
    const row = (await db('POST', 'hr_fnf', [{ employee_id: e.id, site: e.site, last_day: last, lines: lines, net: sumLines(lines), made_by: s.email }], 'return=representation'))[0];
    await audit(s.site, s.email, 'Full & final made', e.code, { last_day: last }); return { id: row.id, lines: lines, net: +row.net };
  },
  async fnfSave(s, x) {
    await PR.needHo(s); await need18();
    const f = ((await db('GET', 'hr_fnf?select=*&id=eq.' + (Number(x.id) || 0) + '&site=eq.' + enc(s.site))) || [])[0]; if (!f) throw fail(404, 'This full & final was not found.', 'notfound');
    if (f.status !== 'made') throw fail(400, 'It is ' + f.status + ' – it is not changed any more.', 'status');
    const c = linesOf(x.lines); if (c.errors.length) throw fail(400, c.errors.join(' '), 'lines');
    await db('PATCH', 'hr_fnf?id=eq.' + f.id + '&status=eq.made', { lines: c.lines, net: sumLines(c.lines), note: R.str(x.note, 300), updated_at: new Date().toISOString() }, 'return=minimal');
    return { ok: true, net: sumLines(c.lines) };
  },
  /* checked (another person than who made it), approved (another person again – or the Super Admin), paid (with how and when) */
  async fnfStep(s, x) {
    await PR.needHo(s); await need18();
    const f = ((await db('GET', 'hr_fnf?select=*&id=eq.' + (Number(x.id) || 0) + '&site=eq.' + enc(s.site))) || [])[0]; if (!f) throw fail(404, 'This full & final was not found.', 'notfound');
    const step = String(x.step || ''), now = new Date().toISOString(), me = lower(s.email), sup = s.role === 'super';
    let row = null;
    if (step === 'check') { if (f.status !== 'made') throw fail(400, 'Only a made one is checked.', 'status'); if (lower(f.made_by) === me && !sup) throw fail(403, 'Another person checks it – not the one who made it.', 'own'); row = { status: 'checked', checked_by: s.email, checked_at: now }; }
    else if (step === 'approve') { if (f.status !== 'checked') throw fail(400, 'Only a checked one is approved.', 'status'); if ((lower(f.made_by) === me || lower(f.checked_by) === me) && !sup) throw fail(403, 'A third person (or the Super Admin) approves it.', 'own'); row = { status: 'approved', approved_by: s.email, approved_at: now }; }
    else if (step === 'paid') { if (f.status !== 'approved') throw fail(400, 'Only an approved one is paid.', 'status'); const mode = ['bank', 'cash', 'cheque', 'upi'].indexOf(x.mode) > -1 ? x.mode : ''; if (!mode) throw fail(400, 'How it was paid: bank, cash, cheque or UPI.', 'mode');
      const on = dayOr(x.paid_on, 'Paid on'); if (on > R.today()) throw fail(400, 'Paid on: a day of today or before.', 'paid_on');
      if (mode !== 'cash' && R.str(x.ref, 80).length < 3) throw fail(400, 'Reference: the bank / cheque / UPI reference.', 'ref');
      row = { status: 'paid', paid_mode: mode, paid_ref: R.str(x.ref, 80), paid_on: on }; }
    else if (step === 'cancel') { if (f.status === 'paid') throw fail(400, 'A paid one is never cancelled.', 'status'); const why = R.str(x.note, 200); if (why.length < 3) throw fail(400, 'Reason: write why it is cancelled.', 'note'); row = { status: 'cancelled', note: why }; }
    else throw fail(400, 'Unknown step.', 'step');
    await db('PATCH', 'hr_fnf?id=eq.' + f.id + '&status=eq.' + f.status, Object.assign(row, { updated_at: now }), 'return=minimal');
    await audit(s.site, s.email, 'Full & final ' + row.status, String(f.id), {}); return { ok: true, status: row.status };
  },

  /* ───── registers (rows for Excel) ───── */
  async payRegister(s, x) {
    await PR.needHo(s); const kind = String(x.kind || 'salary');
    if (kind === 'fnf') { await need18(); return { kind: kind, rows: (await ACT.fnfList(s)).rows.map(r => ({ code: r.code, name: r.name, last_day: r.last_day, net: +r.net, status: r.status, made_by: r.made_by, checked_by: r.checked_by, approved_by: r.approved_by, paid_on: r.paid_on, paid_ref: r.paid_ref })) }; }
    const month = monthOf(x.month), run = ((await db('GET', 'hr_pay_runs?select=id&site=eq.' + enc(s.site) + '&month=eq.' + month)) || [])[0];
    if (!run) throw fail(400, 'The pay of this month is not locked – a register is made of a locked month.', 'notlocked');
    const slips = await MUS.all('hr_payslips?select=id,employee_id,net,data&run_id=eq.' + run.id + '&order=id'), ids = slips.map(p => p.employee_id), sec = {};
    if (kind === 'pf' || kind === 'esic') for (const c of MUS.chunks(ids, 80)) ((await db('GET', 'hr_employee_profile?select=employee_id,secret&employee_id=in.(' + c.join(',') + ')')) || []).forEach(p => { sec[p.employee_id] = p.secret || {}; });
    const d = p => p.data || {}, er = p => d(p).employer || {};
    const map = {
      salary: p => Object.assign({ code: d(p).code, name: d(p).name, pay_days: d(p).pay_days, earned: d(p).earned }, ...(d(p).components || []).map(c => ({ [c.name]: c.amount })), { extra: d(p).extra, overtime: d(p).overtime || 0, other_earn: d(p).other_earn, gross: d(p).gross, pf: d(p).pf, esic: d(p).esic, pt: d(p).pt, lwf: d(p).lwf || 0, tds: d(p).tds || 0, advance: d(p).advance, other_ded: d(p).other_ded, net: +p.net }),
      pf: p => ({ code: d(p).code, name: d(p).name, uan: mask(s, (sec[p.employee_id] || {}).uan), gross: d(p).gross, pf_wage: er(p).pf_wage !== undefined ? er(p).pf_wage : d(p).earned, ee_pf: d(p).pf, er_epf: er(p).epf || 0, er_eps: er(p).eps || 0, edli: er(p).edli || 0, admin: er(p).pf_admin || 0 }),
      esic: p => ({ code: d(p).code, name: d(p).name, esic_no: mask(s, (sec[p.employee_id] || {}).esic_no), pay_days: d(p).pay_days, gross: d(p).gross, ee_esic: d(p).esic, er_esic: er(p).esic || 0 }),
      pt: p => ({ code: d(p).code, name: d(p).name, gross: d(p).gross, pt: d(p).pt }),
      lwf: p => ({ code: d(p).code, name: d(p).name, ee_lwf: d(p).lwf || 0, er_lwf: er(p).lwf || 0 }),
      tds: p => ({ code: d(p).code, name: d(p).name, gross: d(p).gross, tds: d(p).tds || 0 }),
    };
    if (kind === 'payments') { await need18(); const st = await standOf(slips.map(p => p.id)), pays = {}; for (const c of MUS.chunks(slips.map(p => p.id), 80)) ((await db('GET', 'hr_pay_payments?select=*&payslip_id=in.(' + c.join(',') + ')')) || []).forEach(p => { pays[p.payslip_id] = p; });
      return { kind: kind, month: month, rows: slips.map(p => ({ code: d(p).code, name: d(p).name, net: +p.net, status: st[p.id] ? st[p.id].status : 'approved', mode: (pays[p.id] || {}).mode || '', ref: (pays[p.id] || {}).ref || '', paid_on: (pays[p.id] || {}).paid_on || '' })) }; }
    if (!map[kind]) throw fail(400, 'Register: salary, pf, esic, pt, lwf, tds, payments or fnf.', 'kind');
    const keep = { salary: () => true, pf: r => r.ee_pf > 0, esic: r => r.ee_esic > 0, pt: r => r.pt > 0, lwf: r => r.ee_lwf > 0, tds: r => r.tds > 0 }[kind];
    const rows = slips.map(map[kind]).filter(keep);
    await audit(s.site, s.email, 'Pay register made', kind + ' ' + month, { rows: rows.length });
    return { kind: kind, month: month, rows: rows };
  },

  /* ───── his present method beside the ERP, line by line: { month, rows: [{ code, gross, pf, esic, pt, net, … }] } ───── */
  async payCompare(s, x) {
    await PR.needHo(s); const month = monthOf(x.month), list = Array.isArray(x.rows) ? x.rows.slice(0, 5000) : []; if (!list.length) throw fail(400, 'The file has no row.', 'rows');
    const r = await PR.ACT.payList(s, { month: month }); if (!r.ready) throw fail(400, r.reason, 'notready');
    const ours = {}; r.rows.forEach(p => { ours[String(p.code).toUpperCase()] = p; });
    const F = ['gross', 'pf', 'esic', 'pt', 'lwf', 'tds', 'advance', 'net'], out = [], seen = {}; let equal = 0, differ = 0, missing = 0;
    list.forEach(t => {
      const code = R.str(t.code, 20).toUpperCase(); if (!code) return; seen[code] = 1; const o = ours[code];
      if (!o) { missing++; out.push({ code: code, name: '', field: '–', ours: null, theirs: null, diff: null, note: 'not in the ERP\'s month' }); return; }
      let all = true; F.forEach(f => { if (t[f] === undefined || t[f] === null || t[f] === '') return; const a = +o[f] || 0, b = +String(t[f]).replace(/[,\s₹]/g, '') || 0, df = P.r2(a - b); if (Math.abs(df) >= 1) { all = false; out.push({ code: code, name: o.name, field: f, ours: a, theirs: b, diff: df, note: '' }); } });
      if (all) equal++; else differ++;
    });
    const notInFile = r.rows.filter(p => !seen[String(p.code).toUpperCase()]).map(p => ({ code: p.code, name: p.name }));
    await audit(s.site, s.email, 'Pay compared with the present method', month, { equal: equal, differ: differ, missing: missing, not_in_file: notInFile.length });
    return { month: month, locked: !!r.locked, equal: equal, differ: differ, missing: missing, rows: out, not_in_file: notInFile };
  },
};
module.exports = { ACT, NOT_READY18, partsOf, sumLines, service };
