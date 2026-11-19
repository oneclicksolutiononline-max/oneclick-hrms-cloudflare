/* HR'S MESSAGES – one queue for WhatsApp, e-mail and the app's own list (18-11-2026, Phase 4 – step 17; the master prompt Part 10;
 * his answers: WhatsApp for the shift reminders – four a shift, they stop once he has signed in – the onboarding link, papers pending
 * / running out, a policy to accept and a reporting change; everything else in the app and by e-mail).
 *   add()      – a message is put in the queue (hr_notify_queue), never twice (its dedupe key); nothing is sent here.
 *   run()      – the timer (api/jobs?job=notify, every 5 minutes – sql/hr_step17b_timer.sql) sends what is due: WhatsApp (a template
 *                Meta approved – lib/whatsapp.js), e-mail (lib/mail.js), the app (it is simply in his list); a fault is tried again
 *                after 5, 30 and 120 minutes, then it is "failed" (seen on the Notifications page; "Send again").
 *   shifts()   – the shift reminders of the next minutes (part of run()); daily() – papers running out / pending, policies not accepted.
 * OFF until HR_NOTIFY_ENABLED=true (Vercel) – then a site's shift reminders are still off until switched on (Notifications page).
 * WhatsApp is paid per message: only the kinds he named go by it, only when HR_WHATSAPP_ENABLED=true and its template is set. */
'use strict';
const { db, enc } = require('./db');
const R = require('./rules');
const MAIL = require('./mail');
const WA = require('./whatsapp');

const on = () => String(process.env.HR_NOTIFY_ENABLED || '') === 'true';
/* the kinds: wa = may go by WhatsApp (his list); params = the template's {{1}}, {{2}} … in this order */
const KINDS = {
  shift_reminder: { wa: true, name: 'Shift reminder', params: ['name', 'shift', 'start'] },
  onboarding_link: { wa: true, name: 'Joining link', params: ['name', 'link', 'until'] },
  doc_pending: { wa: true, name: 'Papers pending', params: ['name', 'papers', 'due'] },
  doc_expiry: { wa: true, name: 'Paper running out', params: ['name', 'paper', 'date'] },
  policy_accept: { wa: true, name: 'Policy to accept', params: ['name', 'policy'] },
  reporting_change: { wa: true, name: 'Reporting change', params: ['name', 'manager', 'from'] },
  general: { wa: false, name: 'Message', params: [] },
};
const DEFAULT_SET = { shift_on: false, offsets: [-15, 0, 15, 30] };
let has = null, hasAt = 0;
async function ready() {
  if (has !== null && Date.now() - hasAt < (has ? 300000 : 60000)) return has;
  try { await db('GET', 'hr_notify_queue?select=id&limit=1'); has = true; } catch (e) { if (e && e.code === 'notinstalled') has = false; else throw e; }
  hasAt = Date.now(); return has;
}
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');

/* PUT MESSAGES IN THE QUEUE. items: [{ site, employee_id?, kind, mobile?, email?, title, body, params: {…}, dedupe, at?, by?, app? }]
 * One item → a WhatsApp row (a WhatsApp kind with a mobile number and its template set), else an e-mail row (with an e-mail),
 * and (app !== false and an employee) a row in his app's list. Returns { queued } – 0 before step 17 / when it is off. */
async function add(items) {
  items = (items || []).filter(Boolean); if (!items.length || !(await ready())) return { queued: 0 };
  // while HR_NOTIFY_ENABLED is not true only his app's own list gets it – no WhatsApp / e-mail piles up to go out later at once
  const rows = [], out = on();
  for (const it of items) {
    const k = KINDS[it.kind] ? it.kind : 'general', base = { site: it.site, employee_id: it.employee_id || null, kind: k, title: R.str(it.title, 200), body: String(it.body || '').slice(0, 4000), params: it.params || {}, next_at: it.at || new Date().toISOString(), created_by: it.by || 'hr' };
    const wa = out && KINDS[k].wa && WA.ready(k) && WA.toNumber(it.mobile);
    if (!out) { /* only the app's row below */ }
    else if (wa) rows.push(Object.assign({}, base, { channel: 'whatsapp', to_addr: WA.toNumber(it.mobile), dedupe: it.dedupe + '|wa' }));
    else if (it.email && /@/.test(it.email)) rows.push(Object.assign({}, base, { channel: 'email', to_addr: String(it.email).toLowerCase(), dedupe: it.dedupe + '|mail' }));
    if (it.employee_id && it.app !== false) rows.push(Object.assign({}, base, { channel: 'app', to_addr: '', dedupe: it.dedupe + '|app' }));
  }
  for (let i = 0; i < rows.length; i += 200) await db('POST', 'hr_notify_queue?on_conflict=dedupe', rows.slice(i, i + 200), 'resolution=ignore-duplicates,return=minimal');
  return { queued: rows.length };
}

// one row sent: WhatsApp / e-mail / app → { status, provider_id?, error?, again? }
async function sendOne(r) {
  if (r.channel === 'app') return { status: 'sent' };
  if (r.channel === 'email') {
    const m = (await MAIL.send([{ to: r.to_addr, subject: r.title || 'RCL HR', text: r.body || r.title }]))[0];
    return m.sent ? { status: 'sent', provider_id: m.id || '' } : { status: 'failed', error: m.why, again: /did not answer|refused \(5|refused \(429/.test(m.why) };
  }
  const k = KINDS[r.kind] || KINDS.general, p = k.params.map(n => (r.params || {})[n]);
  const w = await WA.send(r.kind, r.to_addr, p);
  return w.sent ? { status: 'sent', provider_id: w.id } : { status: 'failed', error: w.why, again: w.again };
}
const BACK = [5, 30, 120];      // minutes before trying again
/* SEND WHAT IS DUE (at most [limit]). A row is taken by moving its attempts on (two timers at once never send it twice). */
async function sendDue(limit, now) {
  now = now || Date.now(); let sent = 0, failed = 0;
  const due = (await db('GET', 'hr_notify_queue?select=*&status=eq.queued&next_at=lte.' + enc(new Date(now).toISOString()) + '&order=id&limit=' + (limit || 100))) || [];
  for (const r of due) {
    const took = (await db('PATCH', 'hr_notify_queue?id=eq.' + r.id + '&status=eq.queued&attempts=eq.' + r.attempts, { attempts: r.attempts + 1, next_at: new Date(now + 10 * 60000).toISOString() }, 'return=representation')) || [];
    if (!took.length) continue;
    let o; try { o = await sendOne(r); } catch (e) { o = { status: 'failed', error: String((e && e.message) || e).slice(0, 200), again: true }; }
    if (o.status === 'failed' && o.again && r.attempts < BACK.length) { await db('PATCH', 'hr_notify_queue?id=eq.' + r.id, { next_at: new Date(now + BACK[r.attempts] * 60000).toISOString(), error: o.error || '' }, 'return=minimal'); continue; }
    await db('PATCH', 'hr_notify_queue?id=eq.' + r.id, Object.assign({ status: o.status, error: o.error || '' }, o.status === 'sent' ? { sent_at: new Date(now).toISOString(), provider_id: o.provider_id || '' } : {}), 'return=minimal');
    if (o.status === 'sent') sent++; else failed++;
  }
  return { due: due.length, sent: sent, failed: failed };
}

/* THE SHIFT REMINDERS (his rule: four a shift – by default 15 minutes before, at, 15 and 30 minutes after the start – and none once he
 * has signed in, none on his weekly off or a holiday). A site's setting (hr_settings "notify"): shift_on, offsets (minutes).
 * A reminder is put in the queue only in the 10 minutes after its moment; its dedupe key makes a second timer harmless. */
async function settingOf(site) { const r = ((await db('GET', 'hr_settings?select=value&key=eq.notify&site=eq.' + enc(site))) || [])[0]; return Object.assign({}, DEFAULT_SET, r ? r.value : {}); }
async function shifts(now) {
  now = now || Date.now(); const D = require('./day'), A = require('./act_attend'), M = require('./act_muster'), day = R.today(now);
  const sets = (await db('GET', 'hr_settings?select=site,value&key=eq.notify')) || [], out = { sites: 0, queued: 0 };
  for (const st of sets) {
    const set = Object.assign({}, DEFAULT_SET, st.value || {}); if (!set.shift_on || st.site === 'ALL') continue; out.sites++;
    const cfg = await M.setup(st.site), offs = (Array.isArray(set.offsets) ? set.offsets : DEFAULT_SET.offsets).map(Number).filter(n => Number.isFinite(n) && n >= -240 && n <= 240).slice(0, 6);
    if (!cfg.shifts.length || !offs.length) continue;
    const emps = (await db('GET', 'hr_employees?select=id,code,name,category,site,department_id,mobile,email,status&site=eq.' + enc(st.site) + '&status=in.(pending,active)&limit=5000')) || [];
    const ins = {}; ((await db('GET', 'hr_punches?select=employee_id&site=eq.' + enc(st.site) + '&day=eq.' + day + '&kind=eq.in')) || []).forEach(p => { ins[p.employee_id] = 1; });
    const items = [];
    for (const e of emps) {
      if (ins[e.id] || (!e.mobile && !e.email)) continue;
      const pl = A.planOf(cfg, e, day); if (pl.off || !pl.shift || !pl.shift.start_time) continue;
      const start = D.at(day, pl.shift.start_time);
      offs.forEach(m => { const t = start + m * 60000; if (now >= t && now < t + 10 * 60000) items.push({ site: e.site, employee_id: e.id, kind: 'shift_reminder', mobile: e.mobile, email: e.email,
        title: 'Sign in: your shift ' + pl.shift.name + ' starts at ' + pl.shift.start_time, body: 'Dear ' + e.name + ', your shift ' + pl.shift.name + ' starts at ' + pl.shift.start_time + ' – mark your IN in the RCL app. (No more reminders once you have signed in.)',
        params: { name: e.name, shift: pl.shift.name, start: pl.shift.start_time }, dedupe: 'shift|' + e.id + '|' + day + '|' + m, by: 'timer' }); });
    }
    out.queued += (await add(items)).queued;
  }
  return out;
}

/* ONCE A DAY: a paper running out (30, 7 and 0 days before), papers still missing under the seven-day rule (every 3rd day while
 * late, and 2 days before), a mandatory policy not accepted (every 7th day). Nothing is sent twice on the same day. */
async function daily(now) {
  now = now || Date.now(); const day = R.today(now), out = { expiry: 0, pending: 0, policies: 0 }, items = [];
  const add30 = n => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const docs = (await db('GET', 'hr_employee_docs?select=id,kind,expires_on,employee_id,emp:hr_employees!inner(id,name,site,mobile,email,status)&active=is.true&emp.status=neq.left&expires_on=in.(' + [add30(30), add30(7), day].join(',') + ')&limit=5000')) || [];
  docs.forEach(d => { const nm = (R.docKind(d.kind) || {}).name || d.kind; items.push({ site: d.emp.site, employee_id: d.emp.id, kind: 'doc_expiry', mobile: d.emp.mobile, email: d.emp.email, title: nm + ' runs out on ' + dmy(d.expires_on), body: 'Dear ' + d.emp.name + ', your ' + nm + ' runs out on ' + dmy(d.expires_on) + ' – attach the new one in the RCL app (Me → My documents).', params: { name: d.emp.name, paper: nm, date: dmy(d.expires_on) }, dedupe: 'docexp|' + d.id + '|' + d.expires_on + '|' + day, by: 'timer' }); out.expiry++; });
  // the seven-day rule
  const DR = require('./docrule'), sites = [...new Set(((await db('GET', 'hr_settings?select=site&key=eq.doc_rule')) || []).map(r => r.site))];
  const allSites = sites.indexOf('ALL') > -1 ? [...new Set(((await db('GET', 'hr_employees?select=site&status=neq.left&limit=10000')) || []).map(e => e.site))] : sites;
  for (const site of allSites) {
    const rule = await DR.ruleOf(site); if (!rule.on) continue;
    const emps = (await db('GET', 'hr_employees?select=id,name,site,category,joined_on,status,mobile,email&site=eq.' + enc(site) + '&status=neq.left&category=in.(' + rule.categories.join(',') + ')&joined_on=not.is.null&limit=5000')) || [];
    for (const e of emps) {
      const st = await DR.stateOf(e, rule); if (!st.applies || !st.missing.length) continue;
      const left = Math.round((Date.parse(st.due) - Date.parse(day)) / 86400000);
      if (!(left === 2 || (left < 0 && (-left) % 3 === 0))) continue;
      items.push({ site: site, employee_id: e.id, kind: 'doc_pending', mobile: e.mobile, email: e.email, title: 'Papers ' + (left < 0 ? 'were due by ' : 'due by ') + dmy(st.due), body: 'Dear ' + e.name + ', please attach in the RCL app (Me → My documents): ' + st.missing.join(', ') + '. Due by ' + dmy(st.due) + '.', params: { name: e.name, papers: st.missing.join(', '), due: dmy(st.due) }, dedupe: 'docpend|' + e.id + '|' + day, by: 'timer' }); out.pending++;
    }
  }
  // mandatory policies not accepted – every 7th day after it was published (the publishing itself asked once)
  if (await require('./step15').ready()) {
    const CP = require('./act_cpolicy'), force = await CP.inForce(), vids = Object.keys(force).map(k => force[k]);
    const pols = vids.length ? await CP.load('active=is.true&mandatory=is.true') : [];
    for (const p of pols) {
      const v = force[p.id]; if (!v || !v.published_at) continue; const age = Math.floor((Date.parse(day) - Date.parse(String(v.published_at).slice(0, 10))) / 86400000);
      if (age <= 0 || age % 7) continue;
      const acc = {}; ((await db('GET', 'hr_cpolicy_accepts?select=employee_id&version_id=eq.' + v.id)) || []).forEach(a => { acc[a.employee_id] = 1; });
      ((await db('GET', 'hr_employees?select=id,name,site,category,department_id,mobile,email&status=neq.left&limit=10000')) || []).filter(e => !acc[e.id] && CP.applies(p.scope, e)).forEach(e => {
        items.push({ site: e.site, employee_id: e.id, kind: 'policy_accept', mobile: e.mobile, email: e.email, title: 'Please read and accept: ' + p.title, body: 'Dear ' + e.name + ', please read and accept the company policy "' + p.title + '" in the RCL app (Me → Company policies).', params: { name: e.name, policy: p.title }, dedupe: 'pol|' + v.id + '|' + e.id + '|' + day, by: 'timer' }); out.policies++;
      });
    }
  }
  await add(items);
  return out;
}

/* THE TIMER: every 5 minutes – the shift reminders that are due, then everything due is sent; the daily work once a day (the first
 * run after 08:00 India). Written in hr_job_runs. */
async function run(now) {
  now = now || Date.now();
  if (!on()) return { ran: false, why: 'HR_NOTIFY_ENABLED is not true' };
  if (!(await ready())) return { ran: false, why: 'step 17 is not run' };
  const out = { ran: true, shifts: await shifts(now) }, day = R.today(now), hour = new Date(now + 19800000).getUTCHours();
  if (hour >= 8) {
    const done = (await db('GET', 'hr_job_runs?select=id&job=eq.notify_daily&started_at=gte.' + enc(new Date(Date.parse(day + 'T00:00:00Z') - 19800000).toISOString()) + '&limit=1').catch(() => [])) || [];
    if (!done.length) { out.daily = await daily(now); await db('POST', 'hr_job_runs', [{ job: 'notify_daily', finished_at: new Date().toISOString(), result: out.daily }], 'return=minimal').catch(() => null); }
  }
  out.send = await sendDue(200, now);
  return out;
}

/* WHATSAPP'S WORD OF A MESSAGE (api/wa-hook.js): delivered / read / failed – the row moves on (never back: read > delivered > sent) */
const RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 1 };
async function status(list) {
  let n = 0;
  for (const st of (list || []).slice(0, 200)) {
    const pid = String(st.id || ''), s = String(st.status || ''); if (!pid || ['sent', 'delivered', 'read', 'failed'].indexOf(s) < 0) continue;
    const r = ((await db('GET', 'hr_notify_queue?select=id,status&provider_id=eq.' + enc(pid))) || [])[0];
    await db('POST', 'hr_notify_events', [{ queue_id: r ? r.id : null, provider_id: pid, status: s, detail: st.errors ? { errors: (st.errors || []).map(e => ({ code: e.code, title: R.str(e.title, 120) })) } : {} }], 'return=minimal');
    if (r && (RANK[s] > (RANK[r.status] || 0) || (s === 'failed' && r.status === 'sent'))) { await db('PATCH', 'hr_notify_queue?id=eq.' + r.id, Object.assign({ status: s }, s === 'failed' ? { error: 'WhatsApp: ' + R.str(((st.errors || [])[0] || {}).title || 'not delivered', 150) } : {}), 'return=minimal'); n++; }
  }
  return n;
}
const reset = () => { has = null; hasAt = 0; };
module.exports = { KINDS, DEFAULT_SET, on, ready, add, sendDue, shifts, daily, run, status, settingOf, reset };
