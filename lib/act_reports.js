/* REPORTS (18-11-2026, Phase 6 of the enterprise HRMS – the master prompt Part 15) – 25 reports of the site of the sign-in, each with
 * its filters, shown on the page and taken as Excel or PDF (the page makes the files). Nothing is written but one audit line a report.
 * WHO SEES WHICH (tested per role):
 *   HR User           – employees, papers, attendance, leave (no salary, no phone numbers – masked)
 *   HR Admin          – + the manual entries / corrections and the phones
 *   HO HR / Super Admin – + the pay reports (locked months, advances, salary changes)
 *   an employee (My HR) – none; a reporting manager has "My team" (myTeam) – his own team only
 * MY TEAM (the manager's dashboard, app and My HR): the people who report to him – today (in, late, absent, on leave, not marked),
 * what waits for him (attendance corrections, leave), this month's counts, papers still missing. Read only. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const D = require('./day');
const M = require('./month');
const MUS = require('./act_muster');
const { needOffice, me } = require('./act_attend');
const { isHo } = require('./act_month');

const soft = p => p.catch(e => { if (e && e.code === 'notinstalled') return []; throw e; });
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
const mask = v => (v ? 'XXXXXX' + String(v).slice(-4) : '');
const hm = ms => (ms === null || ms === undefined ? '' : new Date(ms + 19800000).toISOString().slice(11, 16));
const at = t => (t ? new Date(Date.parse(t) + 19800000).toISOString().slice(0, 16).replace('T', ' ') : '');
const inList = async (path, ids) => { const out = []; for (const c of MUS.chunks([...new Set(ids)].filter(Boolean), 80)) ((await db('GET', path + '=in.(' + c.join(',') + ')')) || []).forEach(r => out.push(r)); return out; };
const MAX = 20000;

/* ───── the filters as typed → checked ───── */
function filters(x, need) {
  const f = {}, t = R.today(), mo = t.slice(0, 7);
  if (need.indexOf('range') > -1) { const a = R.date(x.from), b = R.date(x.to); if (a === null || b === null) throw fail(400, 'From / To: dates as DD-MM-YYYY.', 'range');
    f.from = a || mo + '-01'; f.to = b || t; if (f.to < f.from) throw fail(400, 'To must not be before From.', 'range'); if (D.addDays(f.from, 366) < f.to) throw fail(400, 'At most one year at a time.', 'range'); }
  if (need.indexOf('day') > -1) { const d = R.date(x.day); if (d === null) throw fail(400, 'Day: a date as DD-MM-YYYY.', 'day'); f.day = d || t; }
  if (need.indexOf('month') > -1) { if (x.month && !M.monthOk(x.month)) throw fail(400, 'Month: as YYYY-MM.', 'month'); f.month = x.month || mo; }
  if (need.indexOf('days') > -1) { const n = parseInt(x.days, 10); f.days = n > 0 && n <= 365 ? n : 30; }
  f.category = R.CATS.indexOf(x.category) > -1 ? x.category : '';
  f.department = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(x.department || '').toLowerCase()) ? String(x.department).toLowerCase() : '';
  return f;
}
// the people of the site (the filters' category / department); left = also those who left
async function people(s, f, left) {
  const q = 'hr_employees?select=id,code,name,category,gender,dob,mobile,email,department_id,designation_id,reports_to,joined_on,left_on,left_reason,status&site=eq.' + enc(s.site) + (f.category ? '&category=eq.' + f.category : '') + (f.department ? '&department_id=eq.' + f.department : '') + (left ? '' : '&status=neq.left') + '&order=name,id';
  return MUS.all(q);
}
async function names() {
  const [dep, des] = await Promise.all([db('GET', 'hr_departments?select=id,name'), db('GET', 'hr_designations?select=id,name')]), o = { dep: {}, des: {} };
  (dep || []).forEach(d => { o.dep[d.id] = d.name; }); (des || []).forEach(d => { o.des[d.id] = d.name; }); return o;
}
const CAT = c => R.CAT_NAME[c] || c || '';
// the days of attendance of the people in a period (the muster's own counting – leave marked L)
async function days(s, emps, from, to) {
  if (!emps.length) return { days: [], rows: [] };
  const cfg = await MUS.setup(s.site), r = await MUS.daysOf(s.site, 'site=eq.' + enc(s.site), emps, from, to, cfg);
  await require('./act_leave').apply(s.site, 'site=eq.' + enc(s.site), emps, r, cfg); return r;
}
const byId = list => { const o = {}; list.forEach(e => { o[e.id] = e; }); return o; };

/* ───── the 25 reports: key → { name, group, who, need (filters), cols, run(s, f) → rows } ─────
 *   who: 'user' = every HR office role; 'admin' = HR Admin / Super Admin; 'ho' = HO HR / Super Admin */
const REPORTS = [
  { key: 'emp_list', group: 'Employees', name: 'Employee list', who: 'user', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['department', 'Department'], ['designation', 'Designation'], ['mobile', 'Mobile'], ['joined_on', 'Joined'], ['status', 'Status']],
    run: async (s, f) => { const [e, n] = await Promise.all([people(s, f), names()]), ad = s.role !== 'user'; return e.map(x => ({ code: x.code, name: x.name, category: CAT(x.category), department: n.dep[x.department_id] || '', designation: n.des[x.designation_id] || '', mobile: ad ? x.mobile || '' : mask(x.mobile), joined_on: dmy(x.joined_on), status: x.status })); } },
  { key: 'emp_joined', group: 'Employees', name: 'Joined in a period', who: 'user', need: ['range'], cols: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['department', 'Department'], ['joined_on', 'Joined']],
    run: async (s, f) => { const [e, n] = await Promise.all([people(s, f, true), names()]); return e.filter(x => x.joined_on && x.joined_on >= f.from && x.joined_on <= f.to).sort((a, b) => (a.joined_on < b.joined_on ? -1 : 1)).map(x => ({ code: x.code, name: x.name, category: CAT(x.category), department: n.dep[x.department_id] || '', joined_on: dmy(x.joined_on) })); } },
  { key: 'emp_left', group: 'Employees', name: 'Left in a period', who: 'user', need: ['range'], cols: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['joined_on', 'Joined'], ['left_on', 'Last day'], ['reason', 'Reason']],
    run: async (s, f) => (await people(s, f, true)).filter(x => x.left_on && x.left_on >= f.from && x.left_on <= f.to).sort((a, b) => (a.left_on < b.left_on ? -1 : 1)).map(x => ({ code: x.code, name: x.name, category: CAT(x.category), joined_on: dmy(x.joined_on), left_on: dmy(x.left_on), reason: x.left_reason || '' })) },
  { key: 'headcount', group: 'Employees', name: 'Headcount by department and category', who: 'user', need: [], cols: null,
    run: async (s, f) => { const [e, n] = await Promise.all([people(s, f), names()]), t = {}; e.forEach(x => { const d = n.dep[x.department_id] || '(none)', r = (t[d] = t[d] || { department: d, total: 0 }); r[x.category] = (r[x.category] || 0) + 1; r.total++; });
      const rows = Object.keys(t).sort().map(k => t[k]), all = { department: 'Total', total: e.length }; R.CATS.forEach(c => { all[c] = e.filter(x => x.category === c).length; rows.forEach(r => { r[c] = r[c] || 0; }); }); rows.push(all); return rows; } },
  { key: 'emp_dates', group: 'Employees', name: 'Birthdays and work anniversaries of a month', who: 'user', need: ['month'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['what', 'What']],
    run: async (s, f) => { const out = [], mm = f.month.slice(5); (await people(s, f)).forEach(x => { if (x.dob && x.dob.slice(5, 7) === mm) out.push({ day: x.dob.slice(8) + '-' + mm, code: x.code, name: x.name, what: 'Birthday' });
      if (x.joined_on && x.joined_on.slice(5, 7) === mm && x.joined_on.slice(0, 4) < f.month.slice(0, 4)) out.push({ day: x.joined_on.slice(8) + '-' + mm, code: x.code, name: x.name, what: (+f.month.slice(0, 4) - +x.joined_on.slice(0, 4)) + ' years with us' }); });
      return out.sort((a, b) => (a.day < b.day ? -1 : 1)); } },
  { key: 'reporting', group: 'Employees', name: 'Who reports to whom', who: 'user', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['manager_code', 'Reports to (code)'], ['manager', 'Reports to']],
    run: async (s, f) => { const e = await people(s, f), boss = byId(await inList('hr_employees?select=id,code,name&id', e.map(x => x.reports_to))); return e.map(x => ({ code: x.code, name: x.name, manager_code: (boss[x.reports_to] || {}).code || '', manager: (boss[x.reports_to] || {}).name || '' })); } },
  { key: 'docs_missing', group: 'Papers', name: 'Papers still missing', who: 'user', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['missing', 'Missing']],
    run: async (s, f) => { const e = await people(s, f), docs = await inList('hr_employee_docs?select=employee_id,kind,status&active=is.true&employee_id', e.map(x => x.id)), have = {}; docs.forEach(d => { if (d.status !== 'rejected') (have[d.employee_id] = have[d.employee_id] || []).push(d.kind); });
      const nd = await require('./step15').needsOf(e.map(x => x.id)); return e.map(x => ({ x: x, m: R.docsMissing(x.category, have[x.id] || [], nd[x.id]) })).filter(r => r.m.length).map(r => ({ code: r.x.code, name: r.x.name, category: CAT(r.x.category), missing: r.m.map(k => (R.docKind(k) || {}).name || k).join(', ') })); } },
  { key: 'docs_expiring', group: 'Papers', name: 'Papers running out', who: 'user', need: ['days'], cols: [['expires_on', 'Runs out on'], ['code', 'Code'], ['name', 'Name'], ['paper', 'Paper'], ['left', 'Days left']],
    run: async (s, f) => { const e = byId(await people(s, f)), t = R.today(), till = D.addDays(t, f.days), docs = await inList('hr_employee_docs?select=employee_id,kind,title,expires_on&active=is.true&expires_on=not.is.null&expires_on=lte.' + till + '&employee_id', Object.keys(e));
      return docs.sort((a, b) => (a.expires_on < b.expires_on ? -1 : 1)).map(d => ({ expires_on: dmy(d.expires_on), code: e[d.employee_id].code, name: e[d.employee_id].name, paper: (R.docKind(d.kind) || {}).name || d.title || d.kind, left: Math.round((Date.parse(String(d.expires_on).slice(0, 10)) - Date.parse(t)) / 86400000) })); } },
  { key: 'docs_waiting', group: 'Papers', name: 'Papers waiting to be verified', who: 'user', need: [], cols: [['since', 'Since'], ['code', 'Code'], ['name', 'Name'], ['paper', 'Paper'], ['status', 'Status']],
    run: async (s, f) => { const e = byId(await people(s, f)), docs = await soft(inList('hr_employee_docs?select=employee_id,kind,title,status,created_at&active=is.true&status=in.(submitted,under_verification)&employee_id', Object.keys(e)));
      return docs.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map(d => ({ since: at(d.created_at), code: e[d.employee_id].code, name: e[d.employee_id].name, paper: (R.docKind(d.kind) || {}).name || d.title || d.kind, status: d.status === 'submitted' ? 'Submitted' : 'Being checked' })); } },
  { key: 'policy_pending', group: 'Papers', name: 'Company policies not accepted', who: 'user', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['policy', 'Policy'], ['version', 'Version'], ['mandatory', 'Mandatory']],
    run: async (s, f) => { const CP = require('./act_cpolicy'), out = []; let pol; try { pol = await CP.load('active=is.true&order=title'); } catch (e) { if (e && e.code === 'notinstalled') return []; throw e; }
      if (!pol.length) return []; const v = await CP.inForce(pol.map(p => p.id)), emps = await people(s, f), vids = Object.keys(v).map(k => v[k].id), acc = {};
      (await inList('hr_cpolicy_accepts?select=employee_id,version_id&version_id=in.(' + vids.join(',') + ')&employee_id', emps.map(e => e.id))).forEach(a => { acc[a.employee_id + '|' + a.version_id] = 1; });
      emps.forEach(e => pol.forEach(p => { if (v[p.id] && CP.applies(p.scope, e) && !acc[e.id + '|' + v[p.id].id]) out.push({ code: e.code, name: e.name, policy: p.title, version: v[p.id].version, mandatory: p.mandatory ? 'Yes' : 'No' }); })); return out; } },
  { key: 'att_day', group: 'Attendance', name: 'Attendance of a day', who: 'user', need: ['day'], cols: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['status', 'Status'], ['in', 'In'], ['out', 'Out'], ['hours', 'Hours'], ['late_min', 'Late (min)']],
    run: async (s, f) => { const e = await people(s, f, true), r = await days(s, e.filter(x => !(x.left_on && x.left_on < f.day) && !(x.joined_on && x.joined_on > f.day)), f.day, f.day);
      return r.rows.map(w => { const d = w.days[0] || {}; return { code: w.emp.code, name: w.emp.name, category: CAT(w.emp.category), status: d.code || '–', in: hm(d.in), out: hm(d.out), hours: d.hours || 0, late_min: d.late_min || 0 }; }); } },
  { key: 'att_month', group: 'Attendance', name: 'Monthly attendance summary', who: 'user', need: ['month'], cols: null,
    run: async (s, f) => { const from = f.month + '-01', to = M.lastDay(f.month), e = (await people(s, f, true)).filter(x => !(x.left_on && x.left_on < from) && !(x.joined_on && x.joined_on > to)), r = await days(s, e, from, to);
      return r.rows.map(w => Object.assign({ code: w.emp.code, name: w.emp.name, category: CAT(w.emp.category) }, ...M.KEYS.map(k => ({ [k]: w.total[k] || 0 })))); } },
  { key: 'att_late', group: 'Attendance', name: 'Late arrivals', who: 'user', need: ['range'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['in', 'In'], ['late_min', 'Late (min)']],
    run: async (s, f) => { const r = await days(s, await people(s, f, true), f.from, f.to), out = []; r.rows.forEach(w => w.days.forEach(d => { if (d.late_min > 0) out.push({ day: dmy(d.day), code: w.emp.code, name: w.emp.name, in: hm(d.in), late_min: d.late_min }); })); return out; } },
  { key: 'att_early', group: 'Attendance', name: 'Early going', who: 'user', need: ['range'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['out', 'Out'], ['early_min', 'Early (min)']],
    run: async (s, f) => { const r = await days(s, await people(s, f, true), f.from, f.to), out = []; r.rows.forEach(w => w.days.forEach(d => { if (d.early_min > 0) out.push({ day: dmy(d.day), code: w.emp.code, name: w.emp.name, out: hm(d.out), early_min: d.early_min }); })); return out; } },
  { key: 'att_absent', group: 'Attendance', name: 'Absent days', who: 'user', need: ['range'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['category', 'Category']],
    run: async (s, f) => { const r = await days(s, await people(s, f, true), f.from, f.to), out = []; r.rows.forEach(w => w.days.forEach(d => { if (d.code === 'A') out.push({ day: dmy(d.day), code: w.emp.code, name: w.emp.name, category: CAT(w.emp.category) }); })); return out; } },
  { key: 'att_overtime', group: 'Attendance', name: 'Overtime and comp-off approved', who: 'user', need: ['range'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['kind', 'Kind'], ['hours', 'Hours / days'], ['result', 'Given as']],
    run: async (s, f) => { const a = await soft(MUS.all('hr_asks?select=employee_id,kind,day,body&site=eq.' + enc(s.site) + '&status=eq.approved&kind=in.(overtime,compoff)&day=gte.' + f.from + '&day=lte.' + f.to + '&order=day,id')), e = byId(await people(s, f, true));
      return a.filter(q => e[q.employee_id]).map(q => ({ day: dmy(q.day), code: e[q.employee_id].code, name: e[q.employee_id].name, kind: q.kind === 'overtime' ? 'Overtime' : 'Comp-off', hours: q.kind === 'overtime' ? Math.round((+(q.body || {}).minutes || 0) / 6) / 10 : +(q.body || {}).days || 0, result: (q.body || {}).result === 'pay' ? 'Pay' : 'Leave' })); } },
  { key: 'att_requests', group: 'Attendance', name: 'Attendance correction requests', who: 'user', need: ['range'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['asked', 'Asked'], ['reason', 'Reason'], ['status', 'Status']],
    run: async (s, f) => { const q = await soft(MUS.all('hr_regularize?select=employee_id,day,in_time,out_time,reason,status&site=eq.' + enc(s.site) + '&day=gte.' + f.from + '&day=lte.' + f.to + '&order=day,id')), e = byId(await people(s, f, true));
      return q.filter(r => e[r.employee_id]).map(r => ({ day: dmy(r.day), code: e[r.employee_id].code, name: e[r.employee_id].name, asked: [String(r.in_time || '').slice(0, 5), String(r.out_time || '').slice(0, 5)].filter(Boolean).join(' – '), reason: r.reason, status: r.status })); } },
  { key: 'att_review', group: 'Attendance', name: 'Punches waiting for review', who: 'user', need: ['range'], cols: [['at', 'At'], ['code', 'Code'], ['name', 'Name'], ['kind', 'In / Out'], ['offline', 'Sent later']],
    run: async (s, f) => { const p = await soft(MUS.all('hr_punches?select=employee_id,kind,at,offline&site=eq.' + enc(s.site) + '&status=eq.review&day=gte.' + f.from + '&day=lte.' + f.to + '&order=at')), e = byId(await people(s, f, true));
      return p.filter(r => e[r.employee_id]).map(r => ({ at: at(r.at), code: e[r.employee_id].code, name: e[r.employee_id].name, kind: r.kind === 'in' ? 'IN' : 'OUT', offline: r.offline ? 'Yes' : 'No' })); } },
  { key: 'att_manual', group: 'Attendance', name: 'Manual entries and corrections', who: 'admin', need: ['range'], cols: [['day', 'Day'], ['code', 'Code'], ['name', 'Name'], ['source', 'Kind'], ['before', 'Before'], ['after', 'After'], ['reason', 'Reason'], ['by', 'By']],
    run: async (s, f) => { const q = await soft(MUS.all('hr_day_entries?select=employee_id,day,in_at,out_at,old_in,old_out,source,reason,entered_by&site=eq.' + enc(s.site) + '&day=gte.' + f.from + '&day=lte.' + f.to + '&order=day,id')), e = byId(await people(s, f, true)), t = v => (v ? at(v).slice(11) : '');
      return q.filter(r => e[r.employee_id]).map(r => ({ day: dmy(r.day), code: e[r.employee_id].code, name: e[r.employee_id].name, source: { manual: 'Entered by hand', correction: 'Correction', regularized: 'Request approved' }[r.source] || r.source, before: [t(r.old_in), t(r.old_out)].filter(Boolean).join(' – ') || '–', after: [t(r.in_at), t(r.out_at)].filter(Boolean).join(' – ') || 'No attendance', reason: r.reason, by: r.entered_by })); } },
  { key: 'devices', group: 'Attendance', name: 'Phones for attendance', who: 'admin', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['model', 'Phone'], ['since', 'Since'], ['state', 'State'], ['released', 'Released']],
    run: async (s, f) => { const e = byId(await people(s, f, true)), d = await soft(inList('hr_devices?select=employee_id,model,os,active,bound_at,released_at,released_by,release_reason&order=bound_at.desc&employee_id', Object.keys(e)));
      return d.map(x => ({ code: e[x.employee_id].code, name: e[x.employee_id].name, model: [x.model, x.os].filter(Boolean).join(' · '), since: at(x.bound_at), state: x.active ? 'In use' : 'Released', released: x.active ? '' : at(x.released_at) + (x.release_reason ? ' – ' + x.release_reason : '') })); } },
  { key: 'leave_balance', group: 'Leave', name: 'Leave balances', who: 'user', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['paid', 'Paid leave'], ['comp', 'Comp-off'], ['booked', 'Booked'], ['pending', 'Waiting']],
    run: async (s, f) => { const e = await people(s, f); if (!e.length) return []; const st = await require('./act_leave').state(s.site, 'site=eq.' + enc(s.site), e);
      return e.map(x => { const b = st.by[x.id] || {}; return { code: x.code, name: x.name, category: CAT(x.category), paid: b.balance || 0, comp: b.comp || 0, booked: b.booked || 0, pending: b.pending || 0 }; }); } },
  { key: 'leave_requests', group: 'Leave', name: 'Leave requests', who: 'user', need: ['range'], cols: [['from', 'From'], ['to', 'To'], ['code', 'Code'], ['name', 'Name'], ['days', 'Days'], ['reason', 'Reason'], ['status', 'Status']],
    run: async (s, f) => { const q = await soft(MUS.all('hr_leave_requests?select=employee_id,from_day,to_day,days,reason,status&site=eq.' + enc(s.site) + '&to_day=gte.' + f.from + '&from_day=lte.' + f.to + '&order=from_day,id')), e = byId(await people(s, f, true));
      return q.filter(r => e[r.employee_id]).map(r => ({ from: dmy(r.from_day), to: dmy(r.to_day), code: e[r.employee_id].code, name: e[r.employee_id].name, days: +r.days, reason: r.reason, status: r.status })); } },
  { key: 'pay_months', group: 'Pay', name: 'Pay of the locked months', who: 'ho', need: ['range'], cols: [['month', 'Month'], ['people', 'People'], ['gross', 'Gross'], ['pf', 'PF'], ['esic', 'ESIC'], ['pt', 'PT'], ['advance', 'Advance'], ['net', 'Net pay'], ['locked_by', 'Locked by']],
    run: async (s, f) => ((await soft(db('GET', 'hr_pay_runs?select=month,people,totals,locked_by&site=eq.' + enc(s.site) + '&month=gte.' + f.from.slice(0, 7) + '&month=lte.' + f.to.slice(0, 7) + '&order=month'))) || []).map(r => ({ month: r.month, people: r.people, gross: (r.totals || {}).gross || 0, pf: (r.totals || {}).pf || 0, esic: (r.totals || {}).esic || 0, pt: (r.totals || {}).pt || 0, advance: (r.totals || {}).advance || 0, net: (r.totals || {}).net || 0, locked_by: r.locked_by })) },
  { key: 'pay_advances', group: 'Pay', name: 'Advances not taken back', who: 'ho', need: [], cols: [['code', 'Code'], ['name', 'Name'], ['given_on', 'Given on'], ['amount', 'Advance'], ['monthly', 'A month'], ['recovered', 'Taken back'], ['left', 'Left']],
    run: async (s, f) => { const a = await soft(db('GET', 'hr_advances?select=employee_id,amount,monthly,recovered,given_on&site=eq.' + enc(s.site) + '&status=eq.active&order=given_on')), e = byId(await people(s, f, true));
      return (a || []).filter(x => e[x.employee_id]).map(x => ({ code: e[x.employee_id].code, name: e[x.employee_id].name, given_on: dmy(x.given_on), amount: +x.amount, monthly: +x.monthly, recovered: +x.recovered, left: Math.round((+x.amount - +x.recovered) * 100) / 100 })); } },
  { key: 'pay_salaries', group: 'Pay', name: 'Salaries approved in a period', who: 'ho', need: ['range'], cols: [['valid_from', 'From'], ['code', 'Code'], ['name', 'Name'], ['pay_type', 'Type'], ['amount', 'Salary'], ['by', 'Approved by']],
    run: async (s, f) => { const e = byId(await people(s, f, true)), q = await soft(inList('hr_salaries?select=employee_id,pay_type,amount,valid_from,decided_by&status=eq.approved&valid_from=gte.' + f.from + '&valid_from=lte.' + f.to + '&employee_id', Object.keys(e)));
      return q.sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1)).map(x => ({ valid_from: dmy(x.valid_from), code: e[x.employee_id].code, name: e[x.employee_id].name, pay_type: x.pay_type === 'daily' ? 'A day' : 'A month', amount: +x.amount, by: x.decided_by || '' })); } },
];
const BY = {}; REPORTS.forEach(r => { BY[r.key] = r; });
// may this sign-in run this report?
async function may(s, r) { if (s.role === 'self') return false; if (r.who === 'user') return true; if (r.who === 'admin') return s.role === 'admin' || s.role === 'super'; return isHo(s); }
const colsOf = (r, rows) => r.cols || (rows.length ? Object.keys(rows[0]).map(k => [k, ({ code: 'Code', name: 'Name', category: 'Category', department: 'Department', total: 'Total', paid: 'Days paid', late: 'Late days' })[k] || R.CAT_NAME[k] || ({ present: 'Present', half: 'Half day', absent: 'Absent', leave: 'Leave', week_off: 'Weekly off', holiday: 'Holiday', extra: 'Extra' })[k] || k]) : []);

const ACT = {
  // the reports this sign-in may run, by group, with their filters
  async repCatalog(s) {
    needOffice(s); const out = [];
    for (const r of REPORTS) if (await may(s, r)) out.push({ key: r.key, group: r.group, name: r.name, need: r.need });
    const deps = (await db('GET', 'hr_departments?select=id,name&active=is.true&order=name')) || [];
    return { reports: out, categories: R.CATS.map(c => ({ key: c, name: CAT(c) })), departments: deps, site: s.site, today: R.today() };
  },
  async repRun(s, x) {
    needOffice(s); const r = BY[String(x.key || '')]; if (!r) throw fail(400, 'Choose a report of the list.', 'key');
    if (!(await may(s, r))) throw fail(403, r.who === 'ho' ? 'This report is only for the HO HR and the Super Admin.' : 'This report is only for the HR Admin and the Super Admin.', 'role');
    const f = filters(x, r.need), rows = (await r.run(s, f)).slice(0, MAX);
    await audit(s.site, s.email, 'Report made', r.name, { filters: f, rows: rows.length });
    return { key: r.key, name: r.name, group: r.group, site: s.site, filters: f, cols: colsOf(r, rows).map(c => ({ key: c[0], label: c[1] })), rows: rows, made_at: new Date().toISOString() };
  },

  /* ───── MY TEAM: a reporting manager's dashboard (the app and My HR) – only the people who report to him ───── */
  async myTeam(s) {
    const boss = await me(s), team = await MUS.all('hr_employees?select=id,code,name,category,site,joined_on,left_on,status&reports_to=eq.' + boss.id + '&status=neq.left&order=name,id');
    if (!team.length) return { team: 0, today: R.today(), people: [], counts: {}, waiting: { attendance: 0, leave: 0 }, month: null };
    const today = R.today(), mo = today.slice(0, 7), sites = [...new Set(team.map(e => e.site))], rows = [];
    for (const site of sites) { const mine = team.filter(e => e.site === site), cfg = await MUS.setup(site), r = await MUS.daysOf(site, 'site=eq.' + enc(site), mine, mo + '-01', today, cfg);
      await require('./act_leave').apply(site, 'site=eq.' + enc(site), mine, r, cfg); r.rows.forEach(w => rows.push(w)); }
    const ids = team.map(e => e.id), [regs, leaves, docs] = await Promise.all([soft(inList('hr_regularize?select=id,employee_id&status=eq.pending&level=eq.1&employee_id', ids)), soft(inList('hr_leave_requests?select=id,employee_id&status=eq.pending&level=eq.1&employee_id', ids)), inList('hr_employee_docs?select=employee_id,kind,status&active=is.true&employee_id', ids)]);
    const have = {}; docs.forEach(d => { if (d.status !== 'rejected') (have[d.employee_id] = have[d.employee_id] || []).push(d.kind); }); const nd = await require('./step15').needsOf(ids);
    const people = rows.map(w => { const t = w.days.find(d => d.day === today) || {}, e = w.emp, miss = R.docsMissing(e.category, have[e.id] || [], nd[e.id]);
      const now = t.code === 'L' ? 'leave' : t.code === 'H' || t.code === 'WO' ? 'off' : t.in ? (t.late_min > 0 ? 'late' : 'in') : 'not';
      return { code: e.code, name: e.name, category: CAT(e.category), now: now, in: hm(t.in), out: hm(t.out), late_min: t.late_min || 0, month: { present: (w.total.present || 0) + (w.total.half || 0) / 2, absent: w.total.absent || 0, leave: w.total.leave || 0, late: w.days.filter(d => d.late_min > 0).length }, papers_missing: miss.length }; })
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    const counts = {}; people.forEach(p => { counts[p.now] = (counts[p.now] || 0) + 1; });
    return { team: team.length, today: today, people: people, counts: counts, waiting: { attendance: regs.length, leave: leaves.length }, papers_missing: people.filter(p => p.papers_missing > 0).length };
  },
};
const SELF = ['myTeam'];
module.exports = { ACT, SELF, REPORTS, may };
