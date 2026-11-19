/* A BANK CHANGE WAITS FOR A SECOND PERSON (18-11-2026, Phase 1 – the audit's E1; his answer: "बदल मंजुरीला जाईल").
 * The salary goes to the bank account of the profile (the bank list – lib/act_more.js payBank). So the four bank details – bank,
 * IFSC, account number, name as on bank – are NOT changed when somebody of the office saves them, on the employee's page or with the
 * employee sheet: the new details are kept here as a request (hr_bank_changes) and the OLD ones stay in use until the HO HR or the
 * Super Admin approves – never the person who asked, never the employee himself. A new request for the same person replaces the
 * one that waits. The Super Admin's own change counts at once (as his salary decision does) – it is written here all the same.
 * The employee is told by e-mail when a change is asked, approved or refused (lib/mail.js – "not set up" is written down too).
 * The audit and the e-mail carry only the last four digits of an account – never the number. */
'use strict';
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const MAIL = require('./mail');
const OWN = require('./own');

const BANK = ['bank_name', 'bank_ifsc', 'bank_account', 'bank_holder'];
const NOT_READY14 = 'The approval of bank changes is not set up yet: the Super Admin runs sql/hr_step14_security.sql once in the rcl-hr Supabase → SQL Editor. Until then a bank detail cannot be changed.';
const ready = e => { if (e && e.code === 'notinstalled') throw fail(500, NOT_READY14, 'notready14'); throw e; };
const pick = o => { const b = {}; BANK.forEach(k => { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') b[k] = o[k]; }); return b; };
const same = (a, b) => BANK.every(k => String((a || {})[k] || '') === String((b || {})[k] || ''));
const last4 = v => (v ? String(v).slice(-4) : '');
const mask = v => (v ? 'XXXX' + last4(v) : '');
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const inList = async (path, ids, size) => { const out = []; for (let i = 0; i < ids.length; i += size || 80) ((await db('GET', path + '=in.(' + ids.slice(i, i + (size || 80)).join(',') + ')')) || []).forEach(r => out.push(r)); return out; };
const chunks = (l, n) => { const o = []; for (let i = 0; i < l.length; i += n) o.push(l.slice(i, i + n)); return o; };
const isHo = s => require('./act_month').isHo(s);
const COLS = 'id,site,employee_id,new_bank,old_last4,new_last4,source,status,asked_by,asked_at,decided_by,decided_at,note,mails';

/* WHAT THE EMPLOYEE IS TOLD – English, मराठी, हिंदी in one message (the employee reads his own language). No full number. */
function letter(what, emp, ch, by) {
  const acc = ch.new_last4 ? 'XXXX' + ch.new_last4 : '–', bank = (ch.new_bank && ch.new_bank.bank_name) || '';
  const head = { asked: 'Bank details change requested', approved: 'Your bank details were changed', refused: 'Bank details change refused' }[what];
  const en = {
    asked: 'A change of the bank account where your salary is paid was asked by ' + by + '. New account: ' + acc + (bank ? ' (' + bank + ')' : '') + '. It counts only after the HO HR approves it; until then your present account stays. If you did not ask for this, tell your HR office at once.',
    approved: 'The bank account where your salary is paid is now ' + acc + (bank ? ' (' + bank + ')' : '') + ' – approved by ' + by + '. If you did not ask for this, tell your HR office at once.',
    refused: 'The request to change your bank account to ' + acc + ' was refused by ' + by + '. Your present account stays as it was.' }[what];
  const mr = {
    asked: 'तुमचा पगार ज्या bank account मध्ये जातो तो बदलण्याची विनंती ' + by + ' यांनी केली आहे. नवीन account: ' + acc + '. HO HR ने मंजूर केल्यावरच हा बदल लागू होईल; तोपर्यंत तुमचा आधीचा account चालू राहील. ही विनंती तुम्ही केली नसेल तर लगेच HR office ला कळवा.',
    approved: 'तुमचा पगार आता ' + acc + ' या bank account मध्ये जाईल. ' + by + ' यांनी मंजूर केलं. हा बदल तुम्ही मागितला नसेल तर लगेच HR office ला कळवा.',
    refused: 'तुमचा bank account ' + acc + ' मध्ये बदलण्याची विनंती ' + by + ' यांनी नामंजूर केली. तुमचा आधीचा account तसाच राहील.' }[what];
  const hi = {
    asked: 'आपकी सैलरी जिस bank account में जाती है, उसे बदलने का अनुरोध ' + by + ' ने किया है. नया account: ' + acc + '. HO HR की मंज़ूरी के बाद ही यह बदलाव लागू होगा; तब तक आपका पुराना account चालू रहेगा. यह अनुरोध आपने नहीं किया हो तो तुरंत HR office को बताएँ.',
    approved: 'आपकी सैलरी अब ' + acc + ' इस bank account में जाएगी. ' + by + ' ने मंज़ूर किया. यह बदलाव आपने नहीं माँगा हो तो तुरंत HR office को बताएँ.',
    refused: 'आपका bank account ' + acc + ' में बदलने का अनुरोध ' + by + ' ने नामंज़ूर किया. आपका पुराना account वैसा ही रहेगा.' }[what];
  return { to: emp.email || '', subject: 'RCL HR – ' + head + ' (' + emp.code + ')', text: 'Dear ' + emp.name + ',\n\n' + en + '\n\n' + mr + '\n\n' + hi + '\n\nRCL HR' };
}
// tell the employees and keep what happened with each request (one write for many)
async function tell(what, items, by) {
  const res = await MAIL.send(items.map(it => letter(what, it.emp, it.row, by))), at = new Date().toISOString();
  for (const part of chunks(items.map((it, i) => ({ it: it, r: res[i] })), 200))
    await db('POST', 'hr_bank_changes?on_conflict=id', part.map(p => Object.assign({}, p.it.row, { mails: (p.it.row.mails || []).concat([{ what: what, at: at, sent: !!p.r.sent, why: p.r.why || '' }]) })), 'resolution=merge-duplicates,return=minimal');
  return res.filter(r => r.sent).length;
}
// the bank details laid over the profiles (many at once): only the four details – every other number stays as it is
async function applyMany(list, who) {
  if (!list.length) return;
  const had = {}; (await inList('hr_employee_profile?select=employee_id,data,secret&employee_id', list.map(l => l.employee_id), 80)).forEach(p => { had[p.employee_id] = p; });
  const now = new Date().toISOString(), rows = list.map(l => { const p = had[l.employee_id] || { data: {}, secret: {} }, sec = Object.assign({}, p.secret || {}); BANK.forEach(k => { delete sec[k]; }); Object.assign(sec, pick(l.new_bank)); return { employee_id: l.employee_id, data: p.data || {}, secret: sec, updated_by: who, updated_at: now }; });
  for (const part of chunks(rows, 200)) await db('POST', 'hr_employee_profile?on_conflict=employee_id', part, 'resolution=merge-duplicates,return=minimal');
}

/* ASKED from the employee's page or the employee sheet: items = [{ emp: { id, code, name, email, site }, before: {…}, after: {…} }]
 * (before / after = his secret details now and as typed). Only a real change of the four details is asked. The Super Admin's
 * change counts at once. → { waiting, applied, mailed } */
async function ask(s, items, source) {
  const todo = items.filter(it => !same(pick(it.before), pick(it.after)));
  if (!todo.length) return { waiting: 0, applied: 0, mailed: 0, ids: [] };
  const direct = s.role === 'super', now = new Date().toISOString();
  // a request that still waits for the same person is replaced by the new one
  for (const part of chunks(todo.map(it => it.emp.id), 60)) await db('PATCH', 'hr_bank_changes?status=eq.waiting&employee_id=in.(' + part.join(',') + ')', { status: 'replaced', decided_by: s.email, decided_at: now, note: 'replaced by a newer request' }, 'return=minimal').catch(ready);
  const made = [];
  for (const part of chunks(todo, 200)) {
    const back = await db('POST', 'hr_bank_changes', part.map(it => Object.assign({ site: it.emp.site || s.site, employee_id: it.emp.id, new_bank: pick(it.after), old_last4: last4(pick(it.before).bank_account), new_last4: last4(pick(it.after).bank_account),
      source: source === 'sheet' ? 'sheet' : 'form', asked_by: s.email }, direct ? { status: 'approved', decided_by: s.email, decided_at: now, note: 'Super Admin – counts at once' } : { status: 'waiting' })), 'return=representation').catch(ready);
    back.forEach((row, i) => made.push({ emp: part[i].emp, row: row }));
  }
  if (direct) await applyMany(made.map(m => m.row), s.email);
  const mailed = await tell(direct ? 'approved' : 'asked', made, s.email);
  await audit(s.site, s.email, direct ? 'Bank details changed (Super Admin)' : 'Bank details change asked', made.length === 1 ? made[0].emp.code : made.length + ' employees',
    { codes: made.slice(0, 300).map(m => m.emp.code), last4: made.length === 1 ? [made[0].row.old_last4, made[0].row.new_last4] : undefined, source: source, mailed: mailed });
  return { waiting: direct ? 0 : made.length, applied: direct ? made.length : 0, mailed: mailed, ids: made.map(m => m.row.id) };
}

// is step 14 there? (asked before anything of a save is written – a bank change must not half-happen)
async function isReady() { try { await db('GET', 'hr_bank_changes?select=id&limit=1'); return true; } catch (e) { if (e && e.code === 'notinstalled') return false; throw e; } }
async function needReady() { if (!(await isReady())) throw fail(500, NOT_READY14, 'notready14'); }
// what waits for one employee (his page): { id, new_last4, bank_name, ifsc, asked_by, asked_at, can, account? }
async function waitingOf(s, empId) {
  let r; try { r = ((await db('GET', 'hr_bank_changes?select=' + COLS + '&employee_id=eq.' + empId + '&status=eq.waiting')) || [])[0]; } catch (e) { if (e && e.code === 'notinstalled') return null; throw e; }
  if (!r) return null;
  const ho = await isHo(s), full = isAdmin(s) || ho, can = await mayDecide(s, r, undefined, ho);
  return { id: r.id, bank_name: r.new_bank.bank_name || '', bank_ifsc: r.new_bank.bank_ifsc || '', bank_holder: r.new_bank.bank_holder || '', account: full ? r.new_bank.bank_account || '' : mask(r.new_bank.bank_account), new_last4: r.new_last4, old_last4: r.old_last4, asked_by: r.asked_by, asked_at: r.asked_at, can: can };
}
// the HO HR or the Super Admin – never the one who asked, never the employee himself
async function mayDecide(s, r, mine, ho) {
  if (r.status !== 'waiting') return false;
  if (s.role === 'super') return true;
  if (!(ho === undefined ? await isHo(s) : ho)) return false;
  if (OWN.mail(r.asked_by) === OWN.mail(s.email)) return false;
  if (mine ? mine.has(r.employee_id) : (await OWN.mineOf(s, [r.employee_id])).has(r.employee_id)) return false;
  return true;
}

const ACT = {
  // the bank changes of this site: waiting | approved | refused (the newest first)
  async bankList(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    const st = ['waiting', 'approved', 'refused', 'replaced'].indexOf(x.status) > -1 ? x.status : 'waiting';
    const list = (await db('GET', 'hr_bank_changes?select=' + COLS + '&site=eq.' + enc(s.site) + '&status=eq.' + st + '&order=asked_at.desc&limit=500').catch(e => { if (e && e.code === 'notinstalled') return null; throw e; }));
    if (list === null) return { ready: false, note: NOT_READY14, rows: [] };
    const emp = {}; (await inList('hr_employees?select=id,code,name,category&id', [...new Set(list.map(r => r.employee_id))], 80)).forEach(e => { emp[e.id] = e; });
    const ho = await isHo(s), full = isAdmin(s) || ho, mine = await OWN.mineOf(s, list.map(r => r.employee_id)), may = s.role === 'super' || ho;
    const rows = []; for (const r of list) { const e = emp[r.employee_id] || {};
      rows.push({ id: r.id, employee_id: r.employee_id, code: e.code || '', name: e.name || '', category: e.category || '', bank_name: r.new_bank.bank_name || '', bank_ifsc: r.new_bank.bank_ifsc || '', bank_holder: r.new_bank.bank_holder || '',
        account: full ? r.new_bank.bank_account || '' : mask(r.new_bank.bank_account), new_last4: r.new_last4, old_last4: r.old_last4, source: r.source, status: r.status, asked_by: r.asked_by, asked_at: r.asked_at, decided_by: r.decided_by, decided_at: r.decided_at, note: r.note,
        told: (r.mails || []).map(m => ({ what: m.what, at: m.at, sent: m.sent, why: m.why })), can: may && await mayDecide(s, r, mine, ho) }); }
    return { ready: true, status: st, rows: rows, can: may };
  },
  /* approve or refuse – one or many at once: { ids: [..], ok: true | false, note }. Refused needs the reason. Who may not decide one
   * (he asked it, it is about himself, it does not wait any more) is said; the others are done. */
  async bankDecide(s, x) {
    if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role');
    if (s.role !== 'super' && !(await isHo(s))) throw fail(403, 'Only the HO HR or the Super Admin approves a bank change.', 'role');
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : [x.id]).map(v => parseInt(v, 10)).filter(v => v > 0))].slice(0, 1000), ok = x.ok === true, note = R.str(x.note, 200);
    if (!ids.length) throw fail(400, 'Choose at least one bank change.', 'none');
    if (!ok && note.length < 3) throw fail(400, 'Reason: write why it is refused.', 'note');
    const list = (await inList('hr_bank_changes?select=' + COLS + '&site=eq.' + enc(s.site) + '&id', ids, 80).catch(ready)), mine = await OWN.mineOf(s, list.map(r => r.employee_id)), skipped = [], good = [];
    for (const r of list) {
      if (r.status !== 'waiting') skipped.push({ id: r.id, why: 'It does not wait any more.' });
      else if (s.role !== 'super' && OWN.mail(r.asked_by) === OWN.mail(s.email)) skipped.push({ id: r.id, why: 'You asked it – another person approves it.' });
      else if (mine.has(r.employee_id)) skipped.push({ id: r.id, why: 'It is your own bank account – another person approves it.' });
      else good.push(r);
    }
    ids.filter(i => !list.some(r => r.id === i)).forEach(i => skipped.push({ id: i, why: 'Not found on this site.' }));
    const now = new Date().toISOString(), done = [];
    for (const part of chunks(good, 60)) ((await db('PATCH', 'hr_bank_changes?status=eq.waiting&id=in.(' + part.map(r => r.id).join(',') + ')', { status: ok ? 'approved' : 'refused', decided_by: s.email, decided_at: now, note: note }, 'return=representation')) || []).forEach(r => done.push(r));
    if (ok) await applyMany(done, s.email);
    const emp = {}; (await inList('hr_employees?select=id,code,name,email,site&id', [...new Set(done.map(r => r.employee_id))], 80)).forEach(e => { emp[e.id] = e; });
    const mailed = done.length ? await tell(ok ? 'approved' : 'refused', done.map(r => ({ emp: emp[r.employee_id] || { code: '', name: '' }, row: r })), s.email) : 0;
    if (done.length) await audit(s.site, s.email, ok ? 'Bank details change approved' : 'Bank details change refused', done.length === 1 ? (emp[done[0].employee_id] || {}).code : done.length + ' employees', { ids: done.map(r => r.id).slice(0, 300), note: note, mailed: mailed });
    return { done: done.length, mailed: mailed, skipped: skipped };
  },
};
module.exports = { ACT, BANK, NOT_READY14, ask, waitingOf, pick, same, applyMany, isReady, needReady };
