/* THE ACTIONS OF LEAVE (api/hr.js sends them here) – step 7 (12-11-2026).
 *   A person for himself: his balance and requests (myLeave), a request (leaveAsk), taking a waiting one back (leaveCancel); the
 *   requests of the people who report to him (teamLeaves, teamLeaveDecide).
 *   The HR office: the requests (leaveList, leaveDecide), everybody's balance (leaveBalances), adding to / taking from one
 *   balance with the reason (leaveAdjust), the site's policy with its date (leavePolicy, leavePolicySave).
 * How a balance is counted: lib/leave.js – never a stored number. Nothing is deleted: a policy and an adjustment are only added;
 * a request only moves on (pending → approved / refused / cancelled = "Deleted") with who and when.
 * (19-11-2026, asked with the Leave screen: "user la aplela takleli leve delet pn krta yawi … status disel ki leave approval kuthh
 * prynt geley ani kona kadhun pending aahe … swatche leve che days kami krnecha option asel but leve day wadhwayche astil tr approval
 * lagel … ekda ka approved zali ti delet site hr ho hr super admin kru shakel … user ni keleli changes pn diistel"; his answers:
 * a paper for every leave; no IN on an approved or a waiting leave day; longer = the days of before stay approved, the extra days
 * wait for approval; an approved leave is changed / deleted by the Site HR Admin, the HO HR and the Super Admin – not an HR User):
 *   – a request is made only with its paper (act_leave_files: papersIn / attach);
 *   – the person deletes his own request while it waits (leaveCancel – kept as "Deleted", with who and when);
 *   – every request says where it stands and WHO it waits for (waits), and its whole history (history: asked, verified, approved,
 *     refused, made shorter, made longer, changed / deleted by the HR office, deleted by himself);
 *   – the person makes his leave SHORTER at once – a waiting or an approved one, only days from today on (leaveChange); LONGER:
 *     the extra days are a NEW request that waits for approval, the days of before keep where they stand;
 *   – the HR office changes or deletes a waiting or an approved leave with the reason (leaveEdit, leaveRemove): the HR Admin of
 *     the site (with the power "Decide requests"), the HO HR, the Super Admin – never his own (the Super Admin excepted);
 *   – a day of his leave (approved or waiting, a whole day, a working day of it): no IN (act_attend punch, onLeave).
 *   No SQL step: the history is kept in the request's own "steps".
 * In the muster a day covered by leave reads "L" (apply). */
'use strict';
const OWN = require('./own');      // (18-11-2026, Phase 1) nobody decides his own
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const D = require('./day');
const L = require('./leave');
const power = require('./powers');
const { me, needOffice } = require('./act_attend');
const { setup, daysOf, chunks } = require('./act_muster');

const NOT_READY7 = 'Leave is not set up yet: the Super Admin runs sql/hr_step7_leave.sql once in the rcl-hr Supabase → SQL Editor.';
const REQ = 'id,employee_id,site,from_day,to_day,part,days,reason,status,level,steps,asked_by,asked_at,decided_at';
const EMPF = 'id,code,name,category,site,department_id,reports_to,status,joined_on,left_on';
const PARTS = ['full', 'first', 'second'];
const policies = async site => (await db('GET', 'hr_leave_policy?select=id,valid_from,per_month,carry,auto_absent,levels,created_by,created_at&site=eq.' + enc(site) + '&order=valid_from,id&limit=500')) || [];
const free = (cfg, hol, day) => { const rl = D.validOn(cfg.rules, day); return !!hol[day] || ((rl && rl.rules.week_off) || []).indexOf(D.weekday(day)) > -1; };
const eachDay = (a, b, fn) => { for (let d = a, i = 0; d <= b && i < 400; d = D.addDays(d, 1), i++) fn(d); };
const holOf = cfg => { const hol = {}; cfg.holidays.forEach(h => { hol[h.day] = 1; }); return hol; };
// the working days between two days (a weekly off and a holiday are not counted)
const counted = (cfg, from, to) => { const hol = holOf(cfg); let n = 0; eachDay(from, to, d => { if (!free(cfg, hol, d)) n++; }); return n; };
const dmy = d => String(d || '').slice(0, 10).split('-').reverse().join('-');
const span = (a, b) => dmy(a) + (b && b !== a ? ' – ' + dmy(b) : '');

/* THE LEAVE OF SOME EMPLOYEES OF ONE SITE, counted up to today.   where: 'site=eq.X' or 'employee_id=eq.X'
 * → { policy (the one of today, or null), by: { empId: { balance, booked, pending, month: { credit, added, used }, marks, future } } }
 *   balance – as of today;  booked – approved leave days still to come;  pending – days asked and not decided yet. */
async function state(site, where, emps) {
  const today = R.today(), pol = await policies(site), v = L.versions(pol), by = {}, blank = () => ({ balance: 0, booked: 0, pending: 0, month: { credit: 0, added: 0, used: 0 }, marks: {}, future: {} });
  emps.forEach(e => { by[e.id] = blank(); });
  if (!emps.length) return { policy: v.on(today), by: by, today: today };
  /* (step 13) THE RULE BOOK: when this site (or one of these people) has a leave policy of the Rule Book, or days were added to
   * a balance there, the leave is walked the new way (two balances, a ledger – stateBook below). Otherwise: exactly as before. */
  const cfg0 = await setup(site), bk = cfg0.book && cfg0.book.used ? cfg0.book : null;
  if (bk) { const lv = (bk.defaults.leave || []).length > 0 || emps.some(e => (((bk.assign[e.id] || {}).leave) || []).length > 0); let cr = []; try { cr = (await db('GET', 'hr_leave_credits?select=employee_id,day,bucket,days,source,reason&' + where + '&order=day,id&limit=20000')) || []; } catch (e) { if (!e || e.code !== 'notinstalled') throw e; }
    if (lv || cr.length) return stateBook(site, where, emps, { today: today, pol: pol, v: v, by: by, cfg: cfg0, bk: bk, credits: cr }); }
  if (!pol.length) return { policy: v.on(today), by: by, today: today };
  const cfg = cfg0, from = pol[0].valid_from <= today ? pol[0].valid_from : today, hol = {}; cfg.holidays.forEach(h => { hol[h.day] = 1; });
  const [r, adj, req] = await Promise.all([daysOf(site, where, emps, from, today, cfg),
    db('GET', 'hr_leave_adjust?select=employee_id,day,days&' + where + '&limit=20000'),
    db('GET', 'hr_leave_requests?select=employee_id,from_day,to_day,part,days,status&' + where + '&status=in.(approved,pending)&to_day=gte.' + from + '&limit=20000')]);
  const A = {}, LV = {}; (adj || []).forEach(a => { const o = (A[a.employee_id] = A[a.employee_id] || {}), d = a.day < from ? from : a.day > today ? today : a.day; o[d] = (o[d] || 0) + +a.days; });
  (req || []).forEach(q => {
    const s = by[q.employee_id]; if (!s) return;
    if (q.status === 'pending') { s.pending = L.r1(s.pending + +q.days); return; }
    eachDay(q.from_day, q.to_day, d => { const n = q.part === 'full' ? 1 : 0.5; if (d <= today) (LV[q.employee_id] = LV[q.employee_id] || {})[d] = n; else if (!free(cfg, hol, d)) { s.future[d] = n; s.booked = L.r1(s.booked + n); } });
  });
  r.rows.forEach(w => {
    const e = w.emp, first = e.joined_on && e.joined_on > from ? e.joined_on : from, k = L.walk(w.days.map(d => ({ day: d.day, code: d.code })), { policies: pol, first: first, adjust: A[e.id], leave: LV[e.id] });
    Object.assign(by[e.id], { balance: k.balance, marks: k.marks, month: k.months[today.slice(0, 7)] || { credit: 0, added: 0, used: 0 } });
  });
  return { policy: v.on(today), by: by, today: today };
}
/* (step 13) the same answer as state(), walked with the Rule Book: by[emp] also has comp (the Comp-off balance), ledger and
 * absent ({ day: 'none' | 'refused' | 'nobalance' }). A day with no Rule Book policy for the person keeps the site's policy of
 * before (as it counted before – a leave is taken as asked). */
async function stateBook(site, where, emps, x) {
  const { today, pol, v, by, cfg, bk } = x, hol = {}; cfg.holidays.forEach(h => { hol[h.day] = 1; });
  const firsts = [pol.length ? pol[0].valid_from : ''].concat((bk.defaults.leave || []).map(r => r.valid_from)); emps.forEach(e => (((bk.assign[e.id] || {}).leave) || []).forEach(r => firsts.push(r.valid_from))); x.credits.forEach(c => firsts.push(c.day));
  const f0 = firsts.filter(Boolean).sort()[0] || today, from = (f0 <= today ? f0 : today).slice(0, 8) + '01';
  const [r, adj, req] = await Promise.all([daysOf(site, where, emps, from, today, cfg), db('GET', 'hr_leave_adjust?select=employee_id,day,days,reason&' + where + '&limit=20000'),
    db('GET', 'hr_leave_requests?select=employee_id,from_day,to_day,part,days,status,bucket&' + where + '&status=in.(approved,pending,refused)&to_day=gte.' + from + '&limit=20000')]);
  const CR = {}, LV = {}, RF = {}, put = (emp, day, row) => { const o = (CR[emp] = CR[emp] || {}), d = day < from ? from : day > today ? today : day; (o[d] = o[d] || []).push(row); };
  (adj || []).forEach(a => put(a.employee_id, a.day, { bucket: 'paid', days: +a.days, source: 'hr', reason: a.reason || 'Added by the HR office' })); x.credits.forEach(c => put(c.employee_id, c.day, { bucket: c.bucket, days: +c.days, source: c.source, reason: c.reason }));
  (req || []).forEach(q => {
    const s = by[q.employee_id]; if (!s) return;
    if (q.status === 'pending') { s.pending = L.r1(s.pending + +q.days); return; }
    if (q.status === 'refused') { eachDay(q.from_day, q.to_day, d => { (RF[q.employee_id] = RF[q.employee_id] || {})[d] = true; }); return; }
    eachDay(q.from_day, q.to_day, d => { const n = q.part === 'full' ? 1 : 0.5; if (d <= today) (LV[q.employee_id] = LV[q.employee_id] || {})[d] = { days: n }; else if (!free(cfg, hol, d)) { s.future[d] = n; s.booked = L.r1(s.booked + n); } });
  });
  const B = require('./rulebook');
  r.rows.forEach(w => {
    const e = w.emp, first = e.joined_on && e.joined_on > from ? e.joined_on : from;
    const polOn = day => { const p = B.policyOn({ assign: ((bk.assign[e.id] || {}).leave) || [], defaults: bk.defaults.leave || [], versions: bk.versions }, day); if (p) return Object.assign({ strict: true }, p.body); const o = v.on(day); return o ? { earn: 'month', per_month: +o.per_month, carry: o.carry, auto_absent: o.auto_absent, strict: false } : null; };
    const k = L.walk2(w.days.map(d => ({ day: d.day, code: d.code })), { polOn: polOn, first: first, last: e.left_on || '', credits: CR[e.id], leave: LV[e.id], refused: RF[e.id] });
    Object.assign(by[e.id], { balance: k.paid, comp: k.comp, marks: k.marks, month: k.months[today.slice(0, 7)] || { credit: 0, added: 0, used: 0 }, ledger: k.ledger, absent: k.absent });
  });
  return { policy: v.on(today), by: by, today: today, book: true };
}
/* THE MUSTER'S "L": the days of a month (act_muster's rows, each { emp, days, total }) get code L where leave covers them –
 * an approved leave day, or an absent day the balance paid for – and the count of the month follows (L, and the days for pay). */
async function apply(site, where, emps, r, cfg) {
  let st; try { st = await state(site, where, emps); } catch (e) { if (e && e.code === 'notinstalled') return r; throw e; }
  if (!st.policy && !st.book && !Object.keys(st.by).some(k => Object.keys(st.by[k].future).length)) { r.rows.forEach(w => { w.total.L = 0; }); return r; }
  const last = r.days[r.days.length - 1], rl = D.validOn(cfg.rules, last);
  r.rows.forEach(w => {
    const s = st.by[w.emp.id] || { marks: {}, future: {} }; let n = 0, paid = 0;
    w.days.forEach(d => { if (s.absent && s.absent[d.day]) d.absent = s.absent[d.day];      // (step 13) absent with no request / despite a refusal / the balance had no more
      const m = s.marks[d.day] || (s.future[d.day] ? { days: s.future[d.day], auto: false } : null); if (!m) return; paid += m.days; d.leave = m.days; if (m.days >= 1 || d.code === 'A' || d.code === '') { d.code = 'L'; n++; } });
    w.total = D.total(w.days, rl ? rl.rules : {}); w.total.L = n; w.total.paid = L.r1(w.total.paid + paid);
  });
  return r;
}
const names = async list => { const ids = [...new Set(list.map(q => q.employee_id))], by = {}; for (const c of chunks(ids, 80)) ((await db('GET', 'hr_employees?select=id,code,name,email,portal_email,reports_to&id=in.(' + c.join(',') + ')')) || []).forEach(e => { by[e.id] = e; }); return by; };
const low = v => String(v || '').trim().toLowerCase();
const ROLE = { reporting: 'Reporting person', site_hr: 'Site HR Admin', ho_hr: 'HO HR', super: 'Super Admin', office: 'HR office' };
/* (19-11-2026) WHO A WAITING REQUEST WAITS FOR – the step (verify / approve) and the people of it: his leave policy of the Rule Book
 * says them (a role, or a person by e-mail); without one, level 1 is the person he reports to, level 2 the HR office of the site.
 * → { stage, who: [{ role, name }], text } – null when it waits for nobody. */
function waitsOf(q, p, boss, nameOf) {
  if (q.status !== 'pending') return null;
  const stage = q.level === 1 ? 'verify' : 'approve';
  const who = p ? (((p.auth || {})[stage]) || []).map(x => x.role ? { role: x.role, name: x.role === 'reporting' ? boss || '' : '' } : { role: 'person', name: nameOf(x.email) || x.email || '' })
    : q.level === 1 ? [{ role: 'reporting', name: boss || '' }] : [{ role: 'office', name: '' }];
  return { stage: stage, who: who, text: (stage === 'verify' ? 'Waits for verify: ' : 'Waits for approval: ') + who.map(w => w.role === 'person' ? w.name : w.name ? w.name + ' (' + ROLE[w.role] + ')' : ROLE[w.role] || w.role).join(' / ') };
}
/* (19-11-2026) THE HISTORY OF A REQUEST, in order: asked (the days first asked), each decision (verified / approved / refused), and
 * every change – made shorter / longer by the person, changed or deleted by the HR office, deleted by himself. Each { kind, by, at, … } */
function historyOf(q, e) {
  const steps = (q.steps || []).filter(t => t && typeof t === 'object'), first = steps.find(t => t.was), orig = first ? first.was : { from: q.from_day, to: q.to_day, days: +q.days, part: q.part };
  const nm = t => t.name || (e && [e.email, e.portal_email].some(v => v && low(v) === low(t.by)) ? e.name : t.by || '');
  const out = [{ kind: steps[0] && steps[0].kind === 'extension' ? 'extension' : 'asked', by: nm({ by: q.asked_by }), at: q.asked_at, from: orig.from, to: orig.to, days: +orig.days, note: q.reason, of: steps[0] && steps[0].kind === 'extension' ? steps[0].of : undefined }];
  steps.forEach(t => {
    if (t.decision) out.push({ kind: t.decision === 'refused' ? 'refused' : t.level === 1 ? 'verified' : 'approved', by: nm(t), at: t.at, note: t.note || '' });
    else if (t.kind && t.kind !== 'extension') out.push({ kind: t.kind, by: nm(t), at: t.at, self: !!t.self, from: t.from, to: t.to, days: t.days, part: t.part, was: t.was, note: t.note || '', request: t.request });
  });
  return out;
}
/* the requests as the screens show them.  o: { pol: async employee → his leave policy of the Rule Book or null } */
async function rows(list, o) {
  o = o || {}; const by = await names(list), papers = await require('./act_leave_files').counts(list.map(q => q.id));      // (step 13) how many papers a request has
  // (19-11-2026) the names a waiting request needs: the person he reports to, a person named in his policy
  const wait = list.filter(q => q.status === 'pending'), pol = {}, bossIds = [...new Set(wait.map(q => (by[q.employee_id] || {}).reports_to).filter(Boolean))], boss = {}, mails = {};
  for (const id of [...new Set(wait.map(q => q.employee_id))]) pol[id] = o.pol && by[id] ? await o.pol(Object.assign({ site: wait.find(q => q.employee_id === id).site }, by[id])) : null;
  for (const c of chunks(bossIds, 80)) ((await db('GET', 'hr_employees?select=id,name&id=in.(' + c.join(',') + ')')) || []).forEach(e => { boss[e.id] = e.name; });
  const asked = [...new Set([].concat(...Object.values(pol).filter(Boolean).map(p => [].concat((p.auth || {}).verify || [], (p.auth || {}).approve || []).map(x => low(x.email)).filter(Boolean))))];
  if (asked.length) { const qv = asked.map(m => '"' + m.replace(/"/g, '') + '"').join(','); ((await db('GET', 'hr_employees?select=name,email,portal_email&or=(email.in.(' + qv + '),portal_email.in.(' + qv + '))&limit=200')) || []).forEach(e => { [e.email, e.portal_email].forEach(m => { if (m) mails[low(m)] = e.name; }); }); }
  return list.map(q => {
    const e = by[q.employee_id] || {}, dec = (q.steps || []).filter(t => t && t.decision), last = dec[dec.length - 1] || null;
    return { files: papers ? papers[q.id] || 0 : undefined, id: q.id, code: e.code, name: e.name, from: q.from_day, to: q.to_day, part: q.part, days: +q.days, reason: q.reason, status: q.status, level: q.level, steps: q.steps || [], note: last ? last.note || '' : '', asked_at: q.asked_at,
      waits: waitsOf(q, pol[q.employee_id], boss[e.reports_to], m => mails[low(m)]), history: historyOf(q, e) };
  });
}
const full = async id => ((await db('GET', 'hr_employees?select=' + EMPF + '&id=eq.' + id)) || [])[0];
const empOf = async (s, id) => { const e = ((await db('GET', 'hr_employees?select=' + EMPF + '&id=eq.' + id + '&site=eq.' + enc(s.site))) || [])[0]; if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound'); return e; };
const polOut = p => (p ? { valid_from: p.valid_from, per_month: +p.per_month, carry: p.carry, auto_absent: p.auto_absent, levels: p.levels } : null);

/* (step 13) the person's LEAVE POLICY OF THE RULE BOOK today, or null (then everything here is decided as before).
 * With it: who verifies and who approves a leave is what the policy says (level 1 = "verify", level 2 = "approve"). */
async function bookPolicy(emp) {
  const BK = require('./act_rulebook'); let book; try { book = await BK.siteBook(emp.site, 'employee_id=eq.' + emp.id); } catch (e) { return null; }
  return BK.bookOn(book, emp.id, 'leave', R.today());
}
const mayStep = async (s, emp, p, level) => require('./rulebook').mayDo((p.auth || {})[level === 1 ? 'verify' : 'approve'] || [], await require('./act_asks').whoIs(s, emp));

/* A NEW REQUEST of this person (leaveAsk, and the extra days of leaveChange): checked, made with its papers. link: the first step
 * of an extension ({ kind: 'extension', of }), or null. → the request made */
async function ask(s, emp, x, link) {
  const today = R.today(), from = R.date(x.from), to = R.date(x.to) || from, part = PARTS.indexOf(x.part) > -1 ? x.part : 'full', why = R.str(x.reason, 200);
  if (!from || !to) throw fail(400, 'From and To: dates as DD-MM-YYYY.', 'day'); if (to < from) throw fail(400, 'To: it is before From.', 'day');
  if (from < today) throw fail(400, 'Leave is asked for today or a day to come – a day gone is set right with a request.', 'day');
  if (to > D.addDays(from, 61)) throw fail(400, 'One request: at most 62 days.', 'day'); if (from > D.addDays(today, 366)) throw fail(400, 'Leave can be asked at most a year ahead.', 'day');
  if (part !== 'full' && from !== to) throw fail(400, 'A half day is for one day: From and To the same.', 'part');
  if (why.length < 3) throw fail(400, 'Reason: write why (at least 3 letters).', 'reason');
  const st = await state(emp.site, 'employee_id=eq.' + emp.id, [emp]); if (!st.policy && !st.book) throw fail(400, 'No leave policy is set for your site yet – ask the HR office.', 'nopolicy');
  const n = counted(await setup(emp.site), from, to);
  if (!n) throw fail(400, 'These days are a weekly off or a holiday – no leave is needed.', 'free'); const days = part === 'full' ? n : 0.5;
  const over = (await db('GET', 'hr_leave_requests?select=id&employee_id=eq.' + emp.id + '&status=in.(pending,approved)&from_day=lte.' + to + '&to_day=gte.' + from + '&limit=1')) || [];
  if (over.length) throw fail(409, 'A leave request for these days is already there.', 'duplicate');
  /* (step 13, his rule: "leave balance jitka aahe titkech days add hotil bakich absent") with a leave policy of the Rule Book a
   * request may be longer than the balance – the days the balance has are leave, the others stay absent. Before: refused. */
  const bp = st.book ? await bookPolicy(emp) : null, b = st.by[emp.id], avail = L.r1(b.balance + (b.comp || 0) - b.booked - b.pending); if (!bp && days > avail) throw fail(400, 'Not enough leave: you ask ' + days + ', the balance is ' + avail + '.', 'balance');
  const LF = require('./act_leave_files'), papers = await LF.papersIn(emp.id, x.files);      // (19-11-2026) every leave has its paper
  let level = 2; if (bp) level = ((bp.auth || {}).verify || []).length ? 1 : 2; else if (st.policy && st.policy.levels === 2 && emp.reports_to && ((await db('GET', 'hr_employees?select=id&id=eq.' + emp.reports_to + '&status=neq.left')) || []).length) level = 1;
  const made = (await db('POST', 'hr_leave_requests', [{ employee_id: emp.id, site: emp.site, from_day: from, to_day: to, part: part, days: days, reason: why, level: level, asked_by: s.email, steps: link ? [link] : [] }], 'return=representation'))[0];
  try { await LF.attach(s, made, papers); }
  catch (e) {      // the paper could not be written: the request does not stay without it
    const at = new Date().toISOString(); await db('PATCH', 'hr_leave_requests?id=eq.' + made.id + '&status=eq.pending', { status: 'cancelled', decided_at: at, steps: (made.steps || []).concat([{ kind: 'deleted', by: 'HR', at: at, note: 'Its paper could not be kept – ask again.' }]) }, 'return=minimal').catch(() => {});
    throw e;
  }
  await audit(emp.site, s.email, link ? 'Leave made longer – the extra days asked' : 'Leave asked', emp.code + ' ' + from + (to !== from ? ' – ' + to : ''), { days: days, part: part, level: level, papers: papers.length, extends: link ? link.of : undefined });
  return made;
}
// a step written to a request's history: only while it stands where it stood (a decision at the same moment: read again, once more)
async function addStep(id, step) {
  for (let i = 0; i < 3; i++) {
    const q = ((await db('GET', 'hr_leave_requests?select=id,status,level,steps&id=eq.' + id)) || [])[0]; if (!q) return;
    const done = (await db('PATCH', 'hr_leave_requests?id=eq.' + id + '&status=eq.' + q.status + '&level=eq.' + q.level, { steps: (q.steps || []).concat([step]) }, 'return=representation')) || [];
    if (done.length) return;
  }
}
/* (19-11-2026, his answer: "Site HR Admin + HO HR + Super Admin") WHO CHANGES OR DELETES A LEAVE of the HR office: the Super Admin,
 * the HO HR, the HR Admin of the site with the power "Decide requests (regularization)" – not an HR User. */
async function editor(s) { if (s.role === 'super') return true; if (await require('./act_month').isHo(s)) return true; return s.role === 'admin' && !!(await power.of(s.site)).regularize; }
async function needEditor(s) { needOffice(s); if (!(await editor(s))) throw fail(403, s.role === 'admin' ? 'The Super Admin has not given the HR Admin this power on this site (Decide requests (regularization)).' : 'Only the HR Admin of the site, the HO HR or the Super Admin changes or deletes a leave.', 'role'); }
const officeReq = async (s, id) => { needOffice(s); const q = ((await db('GET', 'hr_leave_requests?select=' + REQ + '&id=eq.' + (parseInt(id, 10) || 0) + '&site=eq.' + enc(s.site))) || [])[0]; if (!q) throw fail(404, 'This request was not found on this site.', 'notfound'); return q; };
// one leave deleted by the HR office (leaveRemove, leaveRemoveMany): the same checks for each
async function removeOne(s, q, why) {
  await OWN.notOwn(s, q.employee_id, 'delete this leave for');
  if (q.status !== 'pending' && q.status !== 'approved') throw fail(409, 'Only a leave that waits or is approved is deleted.', 'decided');
  if (q.status === 'approved') await monthsOpen(s.site, [q.from_day, q.to_day]);
  const at = new Date().toISOString(), done = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&status=eq.' + q.status + '&level=eq.' + q.level, { status: 'cancelled', decided_at: at, steps: (q.steps || []).concat([{ kind: 'deleted', by: s.email, name: s.name || '', at: at, note: why }]) }, 'return=representation')) || [];
  if (!done.length) throw fail(409, 'This leave was changed meanwhile – look at it again.', 'changed');
  const emp = await full(q.employee_id); await audit(s.site, s.email, 'Leave deleted by the HR office', ((emp || {}).code || '') + ' ' + span(q.from_day, q.to_day), { request: q.id, days: +q.days, status: q.status, reason: why });
}
// every month these days touch is still open (a month the HO HR approved is closed)
async function monthsOpen(site, days) { const M = require('./act_month'), seen = {}; for (const d of days.filter(Boolean)) { const m = String(d).slice(0, 7); if (seen[m]) continue; seen[m] = 1; await M.needOpen(site, m + '-01'); } }
/* (19-11-2026, his rule: on a day of his leave – approved or still waiting – no IN: "app error deil ani suggestions deil ki leave madhe
 * jaun date correct kar") the WHOLE-DAY leave that covers this day, or null. A weekly off or a holiday inside a leave is no leave
 * day (he may come then). → { id, from, to, status, days } */
async function onLeave(emp, day) {
  let list; try { list = (await db('GET', 'hr_leave_requests?select=id,from_day,to_day,status,days&employee_id=eq.' + emp.id + '&status=in.(approved,pending)&part=eq.full&from_day=lte.' + day + '&to_day=gte.' + day + '&order=id&limit=3')) || []; } catch (e) { if (e && e.code === 'notinstalled') return null; throw e; }
  if (!list.length) return null;
  const cfg = await setup(emp.site); if (free(cfg, holOf(cfg), day)) return null;
  const q = list.find(r => r.status === 'approved') || list[0];
  return { id: q.id, from: q.from_day, to: q.to_day, status: q.status, days: +q.days };
}

const ACT = {
  /* ───────────── a person, for himself ───────────── */
  async myLeave(s) {
    const emp = await me(s); Object.assign(emp, await full(emp.id)); const st = await state(emp.site, 'employee_id=eq.' + emp.id, [emp]), b = st.by[emp.id];
    const list = (await db('GET', 'hr_leave_requests?select=' + REQ + '&employee_id=eq.' + emp.id + '&order=id.desc&limit=50')) || [];
    const comp = b.comp || 0, all = L.r1(b.balance + comp);      // (step 13) one leave for the person: the Paid leave and the Comp-off days together
    const out = await rows(list, { pol: bookPolicy }), today = st.today;
    // (19-11-2026) what he may do with each: delete it while it waits; change its days – a whole-day leave that waits or is approved and is not over
    out.forEach(q => { q.can = { delete: q.status === 'pending', change: (q.status === 'pending' || q.status === 'approved') && q.part === 'full' && q.to >= today }; });
    return { today: st.today, employee: { code: emp.code, name: emp.name }, policy: polOut(st.policy), book: !!st.book, balance: all, paid: b.balance, comp: comp, booked: b.booked, pending: b.pending, available: L.r1(all - b.booked - b.pending), month: b.month,
      ledger: st.book ? (b.ledger || []).slice(-40).reverse() : [], requests: out, paper: true };
  },
  // a request: from – to (whole days), or one day's first / second half. Weekly offs and holidays inside are not counted.
  // (19-11-2026) with its paper – files: [{ path, name, bytes }] sent first with myLeavePaperUrl
  async leaveAsk(s, x) {
    const emp = await me(s); Object.assign(emp, await full(emp.id)); await ask(s, emp, x || {}, null);
    return ACT.myLeave(s);
  },
  /* (19-11-2026) HIS OWN LEAVE, NEW DAYS: { id, from, to, reason?, files? }
   *   SHORTER (the new days inside the old ones) – saved at once, a waiting or an approved leave; only days from today on are taken
   *   off (a day gone: the HR office). LONGER at one end – the extra days are a NEW request (its reason and paper, like any leave),
   *   it waits for approval; the leave of before keeps its days and where it stands. Both are written in the history. */
  async leaveChange(s, x) {
    const emp = await me(s); Object.assign(emp, await full(emp.id)); x = x || {};
    const q = ((await db('GET', 'hr_leave_requests?select=' + REQ + '&id=eq.' + (parseInt(x.id, 10) || 0) + '&employee_id=eq.' + emp.id)) || [])[0];
    if (!q) throw fail(404, 'This leave request was not found.', 'notfound');
    if (q.status !== 'pending' && q.status !== 'approved') throw fail(409, 'Only a leave that waits or is approved can be changed.', 'decided');
    if (q.part !== 'full') throw fail(400, 'A half-day leave is not changed – delete it while it waits and ask again.', 'part');
    const today = R.today(), f0 = R.date(x.from), t0 = R.date(x.to); if (f0 === null || t0 === null) throw fail(400, 'From and To: dates as DD-MM-YYYY.', 'day');
    const from = f0 || q.from_day, to = t0 || q.to_day; if (to < from) throw fail(400, 'To: it is before From.', 'day');
    if (from === q.from_day && to === q.to_day) throw fail(400, 'These are the days the leave has already.', 'same');
    const shorter = from >= q.from_day && to <= q.to_day, longer = from <= q.from_day && to >= q.to_day;
    if (!shorter && !longer) throw fail(400, 'Make the leave shorter, or longer – one at a time.', 'mixed');
    if (q.to_day < today) throw fail(400, 'This leave is over – the HR office changes a day gone.', 'past');
    if (shorter) {
      if ((from > q.from_day && q.from_day < today) || (to < q.to_day && D.addDays(to, 1) < today)) throw fail(400, 'A day gone stays as it is: only the days from today on are taken off (the HR office changes a day gone).', 'past');
      const n = counted(await setup(emp.site), from, to);
      if (!n) throw fail(400, q.status === 'pending' ? 'No working day is left in these days – delete the leave instead.' : 'No working day is left in these days – the HR office deletes an approved leave.', 'free');
      if (q.status === 'approved') await require('./act_month').needOpen(emp.site, from > q.from_day ? q.from_day : D.addDays(to, 1));
      const step = { kind: 'shortened', by: s.email, name: emp.name, self: true, at: new Date().toISOString(), from: from, to: to, days: n, was: { from: q.from_day, to: q.to_day, days: +q.days, part: q.part } };
      const done = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&status=eq.' + q.status + '&from_day=eq.' + q.from_day + '&to_day=eq.' + q.to_day, { from_day: from, to_day: to, days: n, steps: (q.steps || []).concat([step]) }, 'return=representation')) || [];
      if (!done.length) throw fail(409, 'This leave was changed meanwhile – look at it again.', 'changed');
      await audit(emp.site, s.email, 'Leave made shorter', emp.code + ' ' + span(q.from_day, q.to_day) + ' → ' + span(from, to), { request: q.id, days: n, was: +q.days, status: q.status });
      return Object.assign(await ACT.myLeave(s), { changed: { kind: 'shorter', id: q.id, from: from, to: to, days: n, less: L.r1(+q.days - n), status: q.status } });
    }
    if (from < q.from_day && to > q.to_day) throw fail(400, 'Make the leave longer at one end at a time.', 'mixed');
    const ex = from < q.from_day ? [from, D.addDays(q.from_day, -1)] : [D.addDays(q.to_day, 1), to], at = new Date().toISOString();
    const made = await ask(s, emp, { from: ex[0], to: ex[1], part: 'full', reason: x.reason, files: x.files }, { kind: 'extension', of: q.id, by: s.email, name: emp.name, at: at, from: q.from_day, to: q.to_day });
    await addStep(q.id, { kind: 'extended', by: s.email, name: emp.name, self: true, at: at, request: made.id, from: ex[0], to: ex[1], days: +made.days });
    return Object.assign(await ACT.myLeave(s), { changed: { kind: 'longer', id: q.id, request: made.id, from: ex[0], to: ex[1], days: +made.days } });
  },
  // (19-11-2026: "jo prynt approval hot nahi to prynt delete kru shakel") his own request is DELETED while it waits – kept as "Deleted"
  async leaveCancel(s, x) {
    const emp = await me(s); Object.assign(emp, await full(emp.id)); const q = ((await db('GET', 'hr_leave_requests?select=' + REQ + '&id=eq.' + (parseInt(x && x.id, 10) || 0) + '&employee_id=eq.' + emp.id)) || [])[0];
    if (!q || q.status !== 'pending') throw fail(409, 'Only a request that still waits can be deleted – an approved leave is deleted by the HR office.', 'decided');
    const at = new Date().toISOString(), done = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&employee_id=eq.' + emp.id + '&status=eq.pending&level=eq.' + q.level, { status: 'cancelled', decided_at: at, steps: (q.steps || []).concat([{ kind: 'deleted', by: s.email, name: emp.name, self: true, at: at }]) }, 'return=representation')) || [];
    if (!done.length) throw fail(409, 'Only a request that still waits can be deleted – an approved leave is deleted by the HR office.', 'decided');
    await audit(done[0].site, s.email, 'Leave request deleted by the person', emp.code + ' ' + span(q.from_day, q.to_day), { request: done[0].id });
    return ACT.myLeave(s);
  },
  // the leave requests of the people who report to me (the first level)
  async teamLeaves(s) {
    const emp = await me(s), team = ((await db('GET', 'hr_employees?select=id&reports_to=eq.' + emp.id + '&status=neq.left&limit=500')) || []).map(e => e.id), list = [];
    for (const c of chunks(team, 80)) ((await db('GET', 'hr_leave_requests?select=' + REQ + '&status=eq.pending&level=eq.1&employee_id=in.(' + c.join(',') + ')&order=asked_at')) || []).forEach(q => list.push(q));
    return { team: team.length, rows: await rows(list, { pol: bookPolicy }) };
  },
  async teamLeaveDecide(s, x) {
    const boss = await me(s), q = ((await db('GET', 'hr_leave_requests?select=' + REQ + '&id=eq.' + (parseInt(x.id, 10) || 0))) || [])[0]; if (!q) throw fail(404, 'This request was not found.', 'notfound');
    const emp = await full(q.employee_id); if (!emp || emp.reports_to !== boss.id) throw fail(403, 'This person does not report to you.', 'team');
    const bp0 = await bookPolicy(emp); if (bp0 && !(await mayStep(s, emp, bp0, 1))) throw fail(403, 'By his leave policy this request is verified by somebody else.', 'step');      // (step 13)
    if (q.status !== 'pending' || q.level !== 1) throw fail(409, 'This request does not wait for you any more.', 'decided');
    const dec = x.decision === 'approved' || x.decision === 'refused' ? x.decision : '', note = R.str(x.note, 200); if (!dec) throw fail(400, 'Decision: approve or refuse.', 'decision');
    if (dec === 'refused' && note.length < 3) throw fail(400, 'Reason: write why it is refused.', 'note');
    const step = { level: 1, by: s.email, name: s.name || '', decision: dec, note: note, at: new Date().toISOString() };
    const done = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&status=eq.pending&level=eq.1', dec === 'approved' ? { level: 2, steps: (q.steps || []).concat([step]) } : { status: 'refused', steps: (q.steps || []).concat([step]), decided_at: step.at }, 'return=representation')) || [];
    if (!done.length) throw fail(409, 'This request does not wait for you any more.', 'decided');
    await audit(q.site, s.email, dec === 'approved' ? 'Leave passed to the HR office' : 'Leave refused', emp.code + ' ' + q.from_day, { request: q.id, note: note });
    return ACT.teamLeaves(s);
  },

  /* ───────────── the HR office ───────────── */
  // (19-11-2026) also "all" – every request of the site, whatever it stands; each with where it waits and its history
  async leaveList(s, x) {
    needOffice(s); x = x || {}; const st = ['pending', 'approved', 'refused', 'cancelled', 'all'].indexOf(x.status) > -1 ? x.status : 'pending';
    const list = (await db('GET', 'hr_leave_requests?select=' + REQ + '&site=eq.' + enc(s.site) + (st === 'all' ? '' : '&status=eq.' + st) + '&order=asked_at.desc&limit=300')) || [];
    // (step 13) a request of a person with a leave policy of the Rule Book: "can" = this person may do the step it waits for
    const BK = require('./act_rulebook'); let book = null; if (list.some(q => q.status === 'pending')) { try { book = await BK.siteBook(s.site); } catch (e) { book = null; } }
    const inUse = !!(book && book.ready && book.used !== false && (Object.keys(book.defaults).length || Object.keys(book.assign).length)), polOf = async e => (inUse ? BK.bookOn(book, e.id, 'leave', R.today()) : null);
    const out = await rows(list, { pol: polOf });
    if (inUse) for (let i = 0; i < list.length; i++) { if (list[i].status !== 'pending') continue; const p = BK.bookOn(book, list[i].employee_id, 'leave', R.today()); if (p) { const emp = await full(list[i].employee_id); out[i].can = await mayStep(s, emp, p, list[i].level); out[i].stage = list[i].level === 1 ? 'verify' : 'approve'; } }
    // (19-11-2026) change / delete: a leave that waits or is approved – by the Site HR Admin, the HO HR, the Super Admin; never his own
    const ed = await editor(s), mine = ed ? await OWN.mineOf(s, list.map(q => q.employee_id)) : new Set();
    out.forEach((q, i) => { q.edit = ed && (q.status === 'pending' || q.status === 'approved') && !mine.has(list[i].employee_id); });
    return { status: st, rows: out, can: s.role === 'super' || (s.role === 'admin' && (await power.of(s.site)).regularize), editor: ed };
  },
  /* (19-11-2026) THE HR OFFICE CHANGES A LEAVE that waits or is approved: { id, from, to, part, reason } – its days (shorter or longer),
   * a whole day or a half; where it stands stays (approved stays approved). The reason is written in its history. */
  async leaveEdit(s, x) {
    x = x || {}; const q = await officeReq(s, x.id); await needEditor(s); await OWN.notOwn(s, q.employee_id, 'change this leave for');
    if (q.status !== 'pending' && q.status !== 'approved') throw fail(409, 'Only a leave that waits or is approved is changed.', 'decided');
    const from = R.date(x.from), t0 = R.date(x.to), to = t0 || from, part = PARTS.indexOf(x.part) > -1 ? x.part : 'full', why = R.str(x.reason, 200);
    if (!from || t0 === null) throw fail(400, 'From and To: dates as DD-MM-YYYY.', 'day'); if (to < from) throw fail(400, 'To: it is before From.', 'day');
    if (to > D.addDays(from, 61)) throw fail(400, 'One request: at most 62 days.', 'day'); if (part !== 'full' && from !== to) throw fail(400, 'A half day is for one day: From and To the same.', 'part');
    if (why.length < 3) throw fail(400, 'Reason: write why it is changed (at least 3 letters).', 'reason');
    if (from === q.from_day && to === q.to_day && part === q.part) throw fail(400, 'These are the days the leave has already.', 'same');
    const emp = await empOf(s, q.employee_id), n = counted(await setup(s.site), from, to);
    if (!n) throw fail(400, 'These days are a weekly off or a holiday – no leave is needed.', 'free'); const days = part === 'full' ? n : 0.5;
    const over = (await db('GET', 'hr_leave_requests?select=id&employee_id=eq.' + emp.id + '&id=neq.' + q.id + '&status=in.(pending,approved)&from_day=lte.' + to + '&to_day=gte.' + from + '&limit=1')) || [];
    if (over.length) throw fail(409, 'Another leave request of his is on these days already.', 'duplicate');
    if (q.status === 'approved') await monthsOpen(s.site, [q.from_day, q.to_day, from, to]);
    if (days > +q.days) { const st = await state(emp.site, 'employee_id=eq.' + emp.id, [emp]), bp = st.book ? await bookPolicy(emp) : null, b = st.by[emp.id], avail = L.r1(b.balance + (b.comp || 0) - b.booked - b.pending); if (!bp && days - q.days > avail) throw fail(400, 'Not enough leave: ' + L.r1(days - q.days) + ' more asked, the balance is ' + avail + '.', 'balance'); }
    const step = { kind: 'edited', by: s.email, name: s.name || '', at: new Date().toISOString(), note: why, from: from, to: to, part: part, days: days, was: { from: q.from_day, to: q.to_day, part: q.part, days: +q.days } };
    const done = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&status=eq.' + q.status + '&from_day=eq.' + q.from_day + '&to_day=eq.' + q.to_day + '&part=eq.' + q.part, { from_day: from, to_day: to, part: part, days: days, steps: (q.steps || []).concat([step]) }, 'return=representation')) || [];
    if (!done.length) throw fail(409, 'This leave was changed meanwhile – look at it again.', 'changed');
    await audit(s.site, s.email, 'Leave changed by the HR office', emp.code + ' ' + span(q.from_day, q.to_day) + ' → ' + span(from, to), { request: q.id, days: days, was: +q.days, status: q.status, reason: why });
    return { ok: true, id: q.id };
  },
  // (19-11-2026) THE HR OFFICE DELETES A LEAVE that waits or is approved: { id, reason } – kept as "Deleted" with who, when and why
  async leaveRemove(s, x) {
    x = x || {}; const q = await officeReq(s, x.id); await needEditor(s); const why = R.str(x.reason, 200);
    if (why.length < 3) throw fail(400, 'Reason: write why it is deleted (at least 3 letters).', 'reason');
    await removeOne(s, q, why); return { ok: true, id: q.id };
  },
  /* (19-11-2026, asked: "bulk madhe delete leave cha option de ani select krun pn delete kra yawet") MANY AT ONCE: { ids, reason } – the
   * requests ticked on the Leave page (or all of the list), one reason for all; each is checked as one alone (his own, a closed month,
   * one decided already – left as it is, with why). → { done: [ids], skipped: [{ id, why }] } */
  async leaveRemoveMany(s, x) {
    x = x || {}; needOffice(s); await needEditor(s); const why = R.str(x.reason, 200);
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(v => parseInt(v, 10)).filter(v => v > 0))];
    if (!ids.length) throw fail(400, 'Tick the leaves to delete first.', 'none'); if (ids.length > 300) throw fail(400, 'At most 300 leaves at a time.', 'many');
    if (why.length < 3) throw fail(400, 'Reason: write why they are deleted (at least 3 letters).', 'reason');
    const found = {}; for (const c of chunks(ids, 80)) ((await db('GET', 'hr_leave_requests?select=' + REQ + '&site=eq.' + enc(s.site) + '&id=in.(' + c.join(',') + ')')) || []).forEach(q => { found[q.id] = q; });
    const done = [], skipped = [];
    for (const id of ids) {
      const q = found[id]; if (!q) { skipped.push({ id: id, why: 'This request was not found on this site.' }); continue; }
      try { await removeOne(s, q, why); done.push(id); } catch (e) { if (!e || !(e.status >= 400 && e.status < 500)) throw e; skipped.push({ id: id, why: e.message }); }
    }
    await audit(s.site, s.email, 'Leaves deleted at once by the HR office', done.length + ' deleted' + (skipped.length ? ', ' + skipped.length + ' left as they are' : ''), { done: done, skipped: skipped.map(k => k.id), reason: why });
    return { done: done, skipped: skipped };
  },
  async leaveDecide(s, x) {
    needOffice(s); const q = ((await db('GET', 'hr_leave_requests?select=' + REQ + '&id=eq.' + (parseInt(x.id, 10) || 0) + '&site=eq.' + enc(s.site))) || [])[0]; if (!q) throw fail(404, 'This request was not found on this site.', 'notfound');
    if (q.status !== 'pending') throw fail(409, 'This request was already decided.', 'decided');
    /* (step 13) with a leave policy of the Rule Book the policy says who does this step; "verify" passes it on to "approve" */
    const emp0 = await empOf(s, q.employee_id), bp = await bookPolicy(emp0);
    await OWN.notOwn(s, q.employee_id, 'decide this leave for');      // (Phase 1) his own leave: another person
    if (bp) {
      if (!(await mayStep(s, emp0, bp, q.level))) throw fail(403, q.level === 1 ? 'By his leave policy this request is verified by somebody else.' : 'By his leave policy this request is approved by somebody else.', 'step');
      if (q.level === 1 && x.decision === 'approved') {
        const st1 = { level: 1, by: s.email, name: s.name || '', decision: 'approved', note: R.str(x.note, 200), at: new Date().toISOString() };
        const moved = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&status=eq.pending&level=eq.1', { level: 2, steps: (q.steps || []).concat([st1]) }, 'return=representation')) || []; if (!moved.length) throw fail(409, 'This request was already decided.', 'decided');
        await audit(s.site, s.email, 'Leave verified', emp0.code + ' ' + q.from_day, { request: q.id }); return ACT.leaveList(s, { status: 'pending' });
      }
    } else { await power.need(s, 'regularize'); if (q.level === 1 && s.role !== 'super') throw fail(403, 'This request still waits for the reporting person.', 'level'); }
    await require('./act_month').needOpen(s.site, q.from_day);      // (step 10) a month the HO HR approved is closed
    const dec = x.decision === 'approved' || x.decision === 'refused' ? x.decision : '', note = R.str(x.note, 200); if (!dec) throw fail(400, 'Decision: approve or refuse.', 'decision');
    if (dec === 'refused' && note.length < 3) throw fail(400, 'Reason: write why it is refused.', 'note');
    const step = { level: q.level === 1 ? 1 : 2, by: s.email, name: s.name || '', decision: dec, note: note, at: new Date().toISOString() }, emp = emp0;
    const done = (await db('PATCH', 'hr_leave_requests?id=eq.' + q.id + '&status=eq.pending', { status: dec, steps: (q.steps || []).concat([step]), decided_at: step.at }, 'return=representation')) || [];
    if (!done.length) throw fail(409, 'This request was already decided.', 'decided');
    await audit(s.site, s.email, dec === 'approved' ? 'Leave approved' : 'Leave refused', emp.code + ' ' + q.from_day + (q.to_day !== q.from_day ? ' – ' + q.to_day : ''), { request: q.id, days: +q.days, note: note });
    return ACT.leaveList(s, { status: 'pending' });
  },
  // everybody's leave on this site, as of today
  async leaveBalances(s) {
    needOffice(s); const emps = (await db('GET', 'hr_employees?select=' + EMPF + '&site=eq.' + enc(s.site) + '&status=neq.left&order=name,id&limit=5000')) || [];
    const st = await state(s.site, 'site=eq.' + enc(s.site), emps);
    return { today: st.today, policy: polOut(st.policy), book: !!st.book, can: s.role === 'super' || (s.role === 'admin' && (await power.of(s.site)).regularize),
      rows: emps.map(e => { const b = st.by[e.id]; return { id: e.id, code: e.code, name: e.name, category: e.category, balance: b.balance, comp: b.comp || 0, booked: b.booked, pending: b.pending, credit: b.month.credit, added: b.month.added, used: b.month.used }; }) };
  },
  // the HR office adds to (or takes from) one employee's balance – a new row with the reason; the balance itself is never typed
  async leaveAdjust(s, x) {
    await power.need(s, 'regularize'); const emp = await empOf(s, String(x.id || '')), why = R.str(x.reason, 200), n = Number(String(x.days === undefined || x.days === null ? '' : x.days).trim());
    if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 366 || Math.round(n * 2) !== n * 2) throw fail(400, 'Days: a number (halves allowed), + to add, − to take – not 0.', 'days');
    if (why.length < 3) throw fail(400, 'Reason: write why (at least 3 letters).', 'reason');
    // (19-11-2026) the leave policy is the Rule Book's: a site with a Rule Book leave policy (or the policy of before) – not without one
    if (!(await policies(s.site)).length) { const st0 = await state(s.site, 'employee_id=eq.' + emp.id, [emp]); if (!st0.book) throw fail(400, 'No leave policy counts on this site yet – the Rule Book (Leave) gives one.', 'nopolicy'); }
    await db('POST', 'hr_leave_adjust', [{ employee_id: emp.id, site: s.site, day: R.today(), days: n, reason: why, entered_by: s.email }], 'return=minimal');
    await audit(s.site, s.email, n > 0 ? 'Leave added' : 'Leave taken off', emp.code + ' ' + emp.name, { days: n, reason: why });
    return ACT.leaveBalances(s);
  },
  /* (19-11-2026, asked on the Balances list: "ethe kuthe tick cha option nahi delete krnyasathi … jo balance aahe to chukun aalela aahe")
   * THE WHOLE BALANCE TAKEN OFF for the people ticked: { ids, reason } – for each a line "taken off" of his Paid balance of today (as
   * "Add / take" with − does), so it reads 0; nothing is deleted – the record keeps who, when and why, and days can be added back.
   * The HR Admin with the power "Decide requests" or the Super Admin; never his own (the Super Admin excepted). */
  async leaveZero(s, x) {
    x = x || {}; await power.need(s, 'regularize'); const why = R.str(x.reason, 200);
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(v => String(v || '')).filter(v => /^[0-9a-f-]{36}$/i.test(v)))];
    if (!ids.length) throw fail(400, 'Tick the people first.', 'none'); if (ids.length > 3000) throw fail(400, 'At most 3000 people at a time.', 'many');
    if (why.length < 3) throw fail(400, 'Reason: write why the balance is taken off (at least 3 letters).', 'reason');
    const emps = []; for (const c of chunks(ids, 80)) ((await db('GET', 'hr_employees?select=' + EMPF + '&site=eq.' + enc(s.site) + '&status=neq.left&id=in.(' + c.join(',') + ')')) || []).forEach(e => emps.push(e));
    const st = await state(s.site, 'site=eq.' + enc(s.site), emps), mine = await OWN.mineOf(s, emps.map(e => e.id)), today = R.today(), rows = [], done = [], skipped = [], seen = {};
    emps.forEach(e => {
      seen[e.id] = 1; const bal = L.r1((st.by[e.id] || {}).balance || 0);
      if (mine.has(e.id)) { skipped.push({ id: e.id, code: e.code, why: 'This is about you – another person of the HR office does it.' }); return; }
      if (!(bal > 0)) { skipped.push({ id: e.id, code: e.code, why: 'Nothing to take off – the balance is ' + bal + '.' }); return; }
      for (let left = bal; left > 0; left = L.r1(left - 366)) rows.push({ employee_id: e.id, site: s.site, day: today, days: -Math.min(left, 366), reason: why, entered_by: s.email });      // a line holds at most 366
      done.push({ id: e.id, code: e.code, name: e.name, days: bal });
    });
    ids.filter(id => !seen[id]).forEach(id => skipped.push({ id: id, code: '', why: 'Not an employee of this site.' }));
    if (rows.length) for (const c of chunks(rows, 200)) await db('POST', 'hr_leave_adjust', c, 'return=minimal');
    if (done.length) await audit(s.site, s.email, 'Leave balance taken off (made 0)', done.length + (done.length === 1 ? ' person' : ' people'), { reason: why, people: done.map(d => ({ code: d.code, days: d.days })) });
    return Object.assign(await ACT.leaveBalances(s), { zeroed: done, skipped: skipped });
  },
  async leavePolicy(s) { needOffice(s); const pol = await policies(s.site), now = L.versions(pol).on(R.today()); return { today: R.today(), policy: polOut(now), versions: pol.slice().reverse().map(p => Object.assign(polOut(p), { by: p.created_by, at: p.created_at })), can: s.role === 'super' || (s.role === 'admin' && (await power.of(s.site)).shifts) }; },
  async leavePolicySave(s, x) {
    await power.need(s, 'shifts'); const c = L.policy(x), today = R.today(), from = R.date(x.valid_from) || today; if (c.errors.length) throw fail(400, c.errors.join(' '), 'policy');
    if (from < today && s.role !== 'super') throw fail(403, 'A policy for days already gone can be set only by the Super Admin.', 'past');
    const was = L.versions(await policies(s.site)).on(from);
    await db('POST', 'hr_leave_policy', [Object.assign({ site: s.site, valid_from: from, created_by: s.email }, c.row)], 'return=minimal');
    await audit(s.site, s.email, 'Leave policy set', 'from ' + from, { old: polOut(was), new: c.row });
    return ACT.leavePolicy(s);
  },
};
const SELF = ['myLeave', 'leaveAsk', 'leaveChange', 'leaveCancel', 'teamLeaves', 'teamLeaveDecide'];
module.exports = { ACT, SELF, NOT_READY7, state, apply, onLeave };
