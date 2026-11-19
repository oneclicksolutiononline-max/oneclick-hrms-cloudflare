/* AI IN HR (18-11-2026, Phase 7 – step 19; the master prompt Part 17). Through lib/ai.js only. It READS and SUGGESTS; a person decides.
 *   aiStatus    – switched on or not, the provider and model, this month's cost, the last calls (who, what for, tokens, cost – no content)
 *   aiReadDoc   – reads a PHOTO of a paper waiting to be verified: the name, number and dates it sees, beside what is on record – the HR
 *                 Admin compares and decides; nothing is saved (only the log line and an audit line without the numbers)
 *   aiAsk       – a question about the company's published policies, answered only from their text
 *   aiChecks    – checks that look for what a person should look at (one phone used by several people, many punches to review, many hand
 *                 entries, a bank change asked twice, a big salary change) – plain rules, no AI call, nothing changed
 * NEVER: an approval, a change of pay, bank, face or attendance. Only the HR office (aiReadDoc: the HR Admin / Super Admin). */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const D = require('./day');
const AI = require('./ai');
const MUS = require('./act_muster');
const { isHo } = require('./act_month');

const office = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const soft = p => p.catch(e => { if (e && e.code === 'notinstalled') return []; throw e; });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const IMG = ['image/jpeg', 'image/png', 'image/webp'];
// the checks: what each looks for and from how many it is shown (a flag for a person to look at – never a decision)
const CHECKS = { phone_shared: 2, review_punches: 3, hand_entries: 3, bank_asked: 2, salary_jump_pct: 30 };

const ACT = {
  async aiStatus(s) {
    office(s); const st = AI.status(); let runs = [], spent = 0, ready = true;
    try { spent = await AI.spent(); if (isAdmin(s)) runs = (await db('GET', 'hr_ai_runs?select=at,by,purpose,provider,model,tokens_in,tokens_out,cost_usd,ms,ok,error' + (s.role === 'super' ? '' : '&site=eq.' + enc(s.site)) + '&order=id.desc&limit=50')) || []; }
    catch (e) { if (e && e.code === 'notinstalled') ready = false; else throw e; }
    return Object.assign(st, { ready: ready, spent_usd: spent, runs: runs, never: 'AI only reads and suggests – it never approves or changes pay, bank details, faces or attendance.' });
  },

  async aiReadDoc(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin reads a paper with AI.', 'role');
    const did = String(x.id || '').toLowerCase(); if (!UUID.test(did)) throw fail(400, 'Choose a paper.', 'id');
    const d = ((await db('GET', 'hr_employee_docs?select=id,kind,number,expires_on,issued_on,path,mime,bytes,employee_id,emp:hr_employees!inner(id,code,name,dob,site)&emp.site=eq.' + enc(s.site) + '&active=is.true&id=eq.' + did)) || [])[0];
    if (!d) throw fail(404, 'This paper was not found on this site.', 'notfound');
    if (IMG.indexOf(d.mime) < 0) throw fail(400, 'AI reads only a photo of a paper (JPG, PNG, WebP) – this one is a ' + (d.mime === 'application/pdf' ? 'PDF' : d.mime) + '.', 'type');
    if (+d.bytes > 5 * 1048576) throw fail(400, 'This photo is bigger than 5 MB – AI does not read it.', 'size');
    if (!AI.on()) throw fail(400, AI.NOT_ON, 'aioff');
    const url = await require('./store').link(d.path, 120); if (!url) throw fail(500, 'The paper could not be opened – try again.', 'link');
    let buf; try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(String(r.status)); buf = Buffer.from(await r.arrayBuffer()); } catch (e) { throw fail(503, 'The paper could not be opened – try again.', 'net'); }
    const kind = (R.docKind(d.kind) || {}).name || d.kind;
    const a = await AI.call({ s: s, purpose: 'ocr', image: { mime: d.mime, base64: buf.toString('base64') }, max_tokens: 400,
      system: 'You read one photo of an Indian HR paper (' + kind + '). Answer ONLY with JSON: {"name": "", "number": "", "date_of_birth": "DD-MM-YYYY", "issued_on": "DD-MM-YYYY", "expires_on": "DD-MM-YYYY", "readable": true, "note": ""}. Copy only what is printed; leave a field "" when it is not on the paper or not clear. Never guess.',
      text: 'Read this ' + kind + '.' });
    const j = AI.json(a.text) || {}, got = { name: String(j.name || '').slice(0, 120), number: String(j.number || '').slice(0, 60), date_of_birth: R.date(j.date_of_birth) || '', issued_on: R.date(j.issued_on) || '', expires_on: R.date(j.expires_on) || '' };
    const rec = { name: d.emp.name, number: d.number || '', date_of_birth: d.emp.dob || '', issued_on: d.issued_on || '', expires_on: d.expires_on ? String(d.expires_on).slice(0, 10) : '' };
    const same = k => (!got[k] || !rec[k] ? null : k === 'name' ? norm(got[k]) === norm(rec[k]) : k === 'number' ? norm(got[k]) === norm(rec[k]) : got[k] === rec[k]);
    await audit(s.site, s.email, 'AI read a paper', d.emp.code + ' ' + d.kind, { readable: j.readable !== false });      // (never the numbers)
    return { id: d.id, kind: kind, employee: { code: d.emp.code, name: d.emp.name }, readable: j.readable !== false, note: String(j.note || '').slice(0, 300),
      fields: ['name', 'number', 'date_of_birth', 'issued_on', 'expires_on'].map(k => ({ key: k, record: rec[k], read: got[k], same: same(k) })), cost_usd: a.cost_usd,
      warning: 'A suggestion only – check the paper yourself before you verify it.' };
  },

  async aiAsk(s, x) {
    office(s); const q = R.str(x.question, 600); if (q.length < 5) throw fail(400, 'Write the question (at least 5 letters).', 'question');
    let pol = []; try { const CP = require('./act_cpolicy'), list = (await CP.load('active=is.true&order=title')).filter(p => CP.ofSite(p, s.site)), v = await CP.inForce(list.map(p => p.id)); pol = list.filter(p => v[p.id]).map(p => ({ title: p.title, version: v[p.id].version, from: v[p.id].effective_from, body: String(v[p.id].body || '') })); } catch (e) { if (!e || e.code !== 'notinstalled') throw e; }
    if (!pol.length) throw fail(400, 'No company policy of this site is published yet – the assistant answers only from them.', 'nopolicy');
    let ctx = '', used = []; for (const p of pol) { const part = '\n\n### ' + p.title + ' (version ' + p.version + ', from ' + p.from + ')\n' + p.body; if (ctx.length + part.length > 60000) break; ctx += part; used.push(p.title); }
    const a = await AI.call({ s: s, purpose: 'ask', max_tokens: 700, text: 'The company\'s published policies:' + ctx + '\n\nQuestion: ' + q,
      system: 'You are the HR office\'s assistant of an Indian construction company. Answer ONLY from the company\'s published policies given. Name the policy you used. If they do not answer it, say "The published policies do not say this – ask the HR office." Short and plain. You cannot approve, change or promise anything.' });
    await audit(s.site, s.email, 'AI question asked', 'policies', { policies: used.length });      // (never the question)
    return { answer: a.text.trim(), policies: used, cost_usd: a.cost_usd, warning: 'From the published policies only – the HR office decides.' };
  },

  async aiChecks(s, x) {
    office(s); const t = R.today(), from = R.date(x.from) || D.addDays(t, -30), to = R.date(x.to) || t; if (!from || !to || to < from) throw fail(400, 'From / To: dates as DD-MM-YYYY.', 'range');
    const emps = await MUS.all('hr_employees?select=id,code,name&site=eq.' + enc(s.site)), E = {}; emps.forEach(e => { E[e.id] = e; }); const ids = Object.keys(E), out = [];
    const inIds = async (path) => { const r = []; for (const c of MUS.chunks(ids, 80)) ((await soft(db('GET', path + '=in.(' + c.join(',') + ')'))) || []).forEach(v => r.push(v)); return r; };
    const who = id => (E[id] ? E[id].code + ' ' + E[id].name : id);
    // one phone used by several people (one at a time – the database allows only one – but released and given on)
    const dev = await inIds('hr_devices?select=employee_id,device_id&employee_id'), byDev = {}; dev.forEach(d => { (byDev[d.device_id] = byDev[d.device_id] || new Set()).add(d.employee_id); });
    Object.keys(byDev).forEach(k => { if (byDev[k].size >= CHECKS.phone_shared) out.push({ check: 'One phone used by several people', who: [...byDev[k]].map(who).join(', '), count: byDev[k].size, look: 'Attendance → Phones' }); });
    // punches waiting for review, hand entries, by person
    const count = (rows, f) => { const n = {}; rows.forEach(r => { n[r[f]] = (n[r[f]] || 0) + 1; }); return n; };
    const rev = count(await soft(MUS.all('hr_punches?select=employee_id&site=eq.' + enc(s.site) + '&status=eq.review&day=gte.' + from + '&day=lte.' + to)), 'employee_id');
    Object.keys(rev).forEach(k => { if (rev[k] >= CHECKS.review_punches) out.push({ check: 'Many punches waiting for review', who: who(k), count: rev[k], look: 'Attendance → review' }); });
    const hand = count(await soft(MUS.all('hr_day_entries?select=employee_id&site=eq.' + enc(s.site) + '&day=gte.' + from + '&day=lte.' + to)), 'employee_id');
    Object.keys(hand).forEach(k => { if (hand[k] >= CHECKS.hand_entries) out.push({ check: 'Many days entered or corrected by hand', who: who(k), count: hand[k], look: 'Reports → Manual entries and corrections' }); });
    if (isAdmin(s)) { const bk = count(await inIds('hr_bank_changes?select=employee_id&asked_at=gte.' + from + 'T00:00:00%2B05:30&employee_id'), 'employee_id');
      Object.keys(bk).forEach(k => { if (bk[k] >= CHECKS.bank_asked) out.push({ check: 'Bank details asked to change more than once', who: who(k), count: bk[k], look: 'Approvals → Bank changes' }); }); }
    if (await isHo(s)) { const sal = await inIds('hr_salaries?select=employee_id,amount,pay_type,valid_from&status=eq.approved&order=valid_from&employee_id'), last = {};
      sal.forEach(v => { const p = last[v.employee_id]; if (p && p.pay_type === v.pay_type && v.valid_from >= from && v.valid_from <= to && +p.amount > 0) { const pct = Math.round((+v.amount - +p.amount) / +p.amount * 100); if (Math.abs(pct) >= CHECKS.salary_jump_pct) out.push({ check: 'A big salary change', who: who(v.employee_id), count: (pct > 0 ? '+' : '') + pct + ' %', look: 'Payroll → the person\'s salary' }); } last[v.employee_id] = v; }); }
    return { from: from, to: to, rows: out, limits: CHECKS, note: 'Checks to look at – they decide nothing and change nothing.' };
  },
};
module.exports = { ACT, CHECKS };
