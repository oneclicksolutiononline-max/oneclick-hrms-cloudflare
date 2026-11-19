/* ONBOARDING BY A LINK (18-11-2026, Phase 2 – step 15; the master prompt Part 4: "HR sends a secure onboarding link … the new
 * employee fills his details, uploads documents, verifies his e-mail, accepts the policies, submits … HR verifies, approves or
 * rejects … the link is single-use and expires"; his answer: the link also goes on WhatsApp – Phase 4).
 *   THE LINK: a random code of 256 bits made here; only its fingerprint (sha256) is kept – the code itself is shown / sent once. It
 *     works until its date (7 days unless the office says otherwise, 1–30), for ONE new joiner; a new link (resend) makes the old
 *     one dead; a cancelled, approved or rejected one is dead. Opening it never makes a sign-in: the sign-in is given after approval
 *     as today (the HR Admin, Portal's hrlogin).
 *   WHAT HE FILLS waits in the link's row (hr_invites.submission) – nothing of it is in the Employee Master until the HR Admin /
 *     Super Admin APPROVES; then the employee is made (code, record, his own details, profile), his papers are attached ("submitted"
 *     – for the verification list), his bank details go to the bank approval (step 14), his policy acceptances are kept.
 *   HIS E-MAIL is verified by a 6-digit code sent to it (Resend) – it is the e-mail he signs in with later.
 *   Every step is in the activity; the page of the link (public/onboard.html) reads the code from the address's # part, which a
 *     browser never sends to any server or log. */
'use strict';
const crypto = require('crypto');
const { fail } = require('./http');
const { db, enc } = require('./db');
const { audit } = require('./audit');
const R = require('./rules');
const store = require('./store');
const MAIL = require('./mail');
const S15 = require('./step15');
const CPOL = require('./act_cpolicy');
const REP = require('./act_reporting');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id = v => { v = String(v || '').toLowerCase(); return UUID.test(v) ? v : ''; };
const isAdmin = s => s.role === 'admin' || s.role === 'super';
const office = s => { if (s.role === 'self') throw fail(403, 'This is for the HR office only.', 'role'); };
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '');
const LIVE = ['sent', 'in_progress'];
const sitesOf = s => { const l = (s.info && Array.isArray(s.info.sites) ? s.info.sites : []).map(x => String(x.code)); if (l.indexOf(s.site) < 0) l.push(s.site); return l; };

/* WHAT HE FILLS – described once: the server checks with it and the page draws it */
const f = (key, label, type, o) => Object.assign({ key: key, label: label, type: type }, o || {});
const FORM = [
  { key: 'who', name: 'About you', fields: [f('name', 'Full name (as on Aadhaar)', 'text', { need: true, max: 80 }), f('gender', 'Gender', 'gender'), f('dob', 'Date of birth', 'date', { need: true }), f('father_name', 'Father\'s / husband\'s name', 'text', { max: 80 })] },
  { key: 'contact', name: 'Contact', fields: [f('mobile', 'Mobile number', 'mobile', { need: true }), f('email', 'E-mail (you will sign in with it)', 'email', { need: true }), f('mobile2', 'Second mobile', 'mobile')] },
  { key: 'address', name: 'Address and emergency contact', fields: [f('address_current', 'Current address', 'long', { need: true, max: 300 }), f('address_permanent', 'Permanent address', 'long', { max: 300 }),
    f('city', 'City', 'text', { max: 60 }), f('state', 'State', 'text', { max: 60 }), f('pin', 'PIN code', 'pin'),
    f('emergency_name', 'Emergency contact – name', 'text', { need: true, max: 80 }), f('emergency_relation', 'Emergency contact – relation', 'text', { need: true, max: 40 }), f('emergency_mobile', 'Emergency contact – mobile', 'mobile', { need: true }),
    f('family_name', 'Family member – name', 'text', { max: 80 }), f('family_relation', 'Family member – relation', 'relation'), f('family_mobile', 'Family member – mobile', 'mobile')] },
  { key: 'ids', name: 'Aadhaar, PAN and bank', fields: [f('aadhaar', 'Aadhaar number', 'aadhaar', { need: true }), f('pan', 'PAN', 'pan'),
    f('bank_name', 'Bank', 'text', { max: 60 }), f('bank_ifsc', 'Bank IFSC code', 'ifsc'), f('bank_account', 'Bank account number', 'account'), f('bank_holder', 'Name as on bank', 'text', { max: 80 })] },
];
const FIELDS = [].concat(...FORM.map(g => g.fields));
const BANK = ['bank_name', 'bank_ifsc', 'bank_account', 'bank_holder'];

// one field typed → { v } or { err } (empty = '')
function one(d, raw) {
  const t = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!t) return { v: '' };
  switch (d.type) {
    case 'text': case 'long': return { v: R.str(t, d.max || 120) };
    case 'gender': return ['male', 'female', 'other'].indexOf(t.toLowerCase()) > -1 ? { v: t.toLowerCase() } : { err: d.label + ': Male, Female or Other.' };
    case 'date': { const v = R.date(t); return v ? { v: v } : { err: d.label + ': a date as DD-MM-YYYY.' }; }
    case 'mobile': { const v = R.mobile(t); return v ? { v: v } : { err: d.label + ': a 10-digit mobile number.' }; }
    case 'email': { const v = R.email(t); return v ? { v: v } : { err: d.label + ': not an e-mail address.' }; }
    case 'pin': return /^\d{6}$/.test(t) ? { v: t } : { err: d.label + ': 6 digits.' };
    case 'relation': return R.REL.indexOf(t.toLowerCase()) > -1 ? { v: t.toLowerCase() } : { err: d.label + ': ' + R.REL.join(', ') + '.' };
    case 'aadhaar': { const v = R.aadhaar(t); return v ? { v: v } : { err: 'Aadhaar: 12 digits – please check the number.' }; }
    case 'pan': { const v = R.pan(t); return v ? { v: v } : { err: 'PAN: 10 letters and digits like ABCDE1234F.' }; }
    case 'ifsc': { const v = t.toUpperCase().replace(/\s/g, ''); return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? { v: v } : { err: d.label + ': 11 letters and digits, the fifth is 0 (for example SBIN0001234).' }; }
    case 'account': { const v = t.replace(/[\s-]/g, ''); return /^\d{6,18}$/.test(v) ? { v: v } : { err: d.label + ': 6 to 18 digits.' }; }
  }
  return { v: R.str(t, 120) };
}
// all the fields: { row, errors } (need = the compulsory ones are checked too)
function clean(x, need) {
  x = x || {}; const row = {}, errors = [];
  FIELDS.forEach(d => { const r = one(d, x[d.key]); if (r.err) errors.push(r.err); else if (r.v) row[d.key] = r.v; else if (need && d.need) errors.push(d.label + ': needed.'); });
  const b = BANK.filter(k => row[k]); if (b.length && b.length < 4) errors.push('Bank: fill all four (bank, IFSC, account number, name as on bank) – or none.');
  return { row: row, errors: errors };
}
// what the office sees of a submission: an HR User never sees the whole Aadhaar / PAN / account (the audit's E6)
function shownData(s, d) {
  d = Object.assign({}, d || {}); if (isAdmin(s)) return d;
  if (d.aadhaar) d.aadhaar = R.aadhaarMask(d.aadhaar); if (d.pan) d.pan = R.panMask(d.pan); if (d.bank_account) d.bank_account = 'XXXX' + String(d.bank_account).slice(-4);
  return d;
}
const pub = sub => { const o = Object.assign({}, sub || {}); Object.keys(o).forEach(k => { if (k.indexOf('__') === 0) delete o[k]; }); return o; };
// the papers a joiner of this category is asked for
const docsFor = category => R.DOCS.filter(d => R.docNeeded(d, category, {})).map(d => d.key);

// the base address of the HR pages, as the office's page gave it (only its own origin)
function baseOf(s, x) {
  const b = String(x.base || ''), o = String(s.origin || '');
  if (!/^https?:\/\/[^/]+(\/[A-Za-z0-9._~\-\/]*)?$/.test(b)) throw fail(400, 'The page did not say its address – open HR again.', 'base');
  if (o && b.indexOf(o + '/') !== 0 && b !== o) throw fail(400, 'The page\'s address is not this server\'s.', 'base');
  return b.replace(/\/?$/, '/');
}
function letter(kind, p) {
  const until = dmy(p.until);
  if (kind === 'invite') return { subject: 'RCL – join us: fill your joining details', text: [
    'Dear ' + (p.name || 'colleague') + ',', '', 'Welcome to Rachana Construction Limited. Please fill your joining details, attach your documents and accept the company policies here:', p.link, '', 'The link works until ' + until + ' and only for you – do not share it.', '',
    'नमस्कार ' + (p.name || '') + ', RCL मध्ये स्वागत. तुमची joining माहिती भरा, कागदपत्रं जोडा आणि company policies स्वीकारा – वरील link वर. Link ' + until + ' पर्यंत आणि फक्त तुमच्यासाठी आहे.', '',
    'नमस्ते ' + (p.name || '') + ', RCL में स्वागत है. अपनी joining जानकारी भरें, दस्तावेज़ जोड़ें और company policies स्वीकार करें – ऊपर के link पर. Link ' + until + ' तक और सिर्फ़ आपके लिए है.', '', 'RCL HR'].join('\n') };
  if (kind === 'code') return { subject: 'RCL – your e-mail code ' + p.code, text: ['Your code to verify this e-mail for RCL: ' + p.code, 'It works for 15 minutes. If you did not ask for it, ignore this e-mail.', '',
    'RCL साठी हा e-mail तपासण्याचा तुमचा code: ' + p.code + ' (15 मिनिटं चालतो).', 'RCL के लिए यह e-mail जाँचने का आपका code: ' + p.code + ' (15 मिनट चलता है).', '', 'RCL HR'].join('\n') };
  if (kind === 'check') return { subject: 'RCL – verify your e-mail', text: ['Dear ' + (p.name || 'colleague') + ',', '', 'Please verify that this is your e-mail for RCL HR – open this link:', p.link, '', 'It works until ' + until + '.', '',
    'RCL HR साठी हा तुमचा e-mail आहे हे तपासण्यासाठी वरील link उघडा (' + until + ' पर्यंत).', 'RCL HR के लिए यह आपका e-mail है, यह जाँचने के लिए ऊपर का link खोलें (' + until + ' तक).', '', 'RCL HR'].join('\n') };
  return { subject: '', text: '' };
}

module.exports = function (H) {
  // H: { newCodes, taken } of api/hr.js
  const invOf = async (s, v) => { const r = ((await db('GET', 'hr_invites?select=*&id=eq.' + id(v) + '&site=in.(' + sitesOf(s).map(enc).join(',') + ')')) || [])[0]; if (!r) throw fail(404, 'This onboarding link was not found.', 'notfound'); return r; };
  const expired = r => Date.parse(r.expires_at) <= Date.now();
  const stateOf = r => (LIVE.indexOf(r.status) > -1 && expired(r) ? 'expired' : r.status);

  async function send(s, r, token, base) {
    const p = r.prefill || {}, link = base + 'onboard.html#t=' + token;
    const m = p.email ? (await MAIL.send([Object.assign({ to: p.email }, letter('invite', { name: p.name, link: link, until: r.expires_at }))]))[0] : { sent: false, why: 'no e-mail given' };
    // (step 17) also on WhatsApp – his answer of 18-11-2026 (the e-mail above goes at once; the WhatsApp with the next timer run)
    const wa = p.mobile ? await require('./notify').add([{ site: r.site, kind: 'onboarding_link', mobile: p.mobile, title: 'RCL – join us', body: '', params: { name: p.name, link: link, until: dmy(r.expires_at) }, dedupe: 'onb|' + r.id + '|' + (r.sends || 1) + '|' + Date.now(), by: s.email, app: false }]).catch(() => ({ queued: 0 })) : { queued: 0 };
    return { link: link, mail: m, whatsapp: wa.queued > 0 };
  }

  const ACT = {
    /* A NEW LINK for a new joiner: what the office knows of him (name, mobile, e-mail, category, site, department, designation,
     * reporting person, joining date) and for how many days it works. The link is given back ONCE (to copy / share). */
    async invMake(s, x) {
      office(s); await S15.need();
      const p = x.prefill || x, row = {}, errs = [];
      row.name = R.str(p.name, 80); if (row.name.length < 2) errs.push('Name: at least 2 letters.');
      row.category = R.category(p.category) || ''; if (!row.category) errs.push('Category: Staff, Operator, Driver or Labour.');
      const mob = R.mobile(p.mobile), em = R.email(p.email);
      if (mob === null) errs.push('Mobile: a 10-digit mobile number.'); if (em === null) errs.push('E-mail: not an e-mail address.');
      if (!mob && !em) errs.push('Mobile or e-mail: one of them is needed – the link is sent to it.');
      row.mobile = mob || ''; row.email = em || '';
      row.site = R.str(p.site, 12).toUpperCase() || s.site; if (sitesOf(s).indexOf(row.site) < 0) errs.push('Site: choose a site where you have HR.');
      const jn = R.date(p.joined_on); if (jn === null) errs.push('Joining date: a date as DD-MM-YYYY.'); row.joined_on = jn || '';
      ['department_id', 'designation_id', 'reports_to'].forEach(k => { row[k] = id(p[k]); });
      if (errs.length) throw fail(400, errs.join(' '), 'check');
      if (row.department_id && !((await db('GET', 'hr_departments?select=id&id=eq.' + row.department_id)) || []).length) throw fail(400, 'Department: choose one of the list.', 'department_id');
      if (row.designation_id && !((await db('GET', 'hr_designations?select=id&id=eq.' + row.designation_id)) || []).length) throw fail(400, 'Designation: choose one of the list.', 'designation_id');
      if (row.reports_to && !((await db('GET', 'hr_employees?select=id&id=eq.' + row.reports_to + '&status=neq.left')) || []).length) throw fail(400, 'Reporting person: choose an employee of the list.', 'reports_to');
      const t = await H.taken([{ mobile: row.mobile, email: row.email }], '');
      if (row.mobile && t.mobile[row.mobile]) throw fail(409, 'This mobile number already belongs to employee ' + t.mobile[row.mobile] + '.', 'mobile');
      if (row.email && t.email[row.email]) throw fail(409, 'This e-mail already belongs to employee ' + t.email[row.email] + '.', 'email');
      const open = (await db('GET', 'hr_invites?select=id&status=in.(sent,in_progress,submitted,under_verification)&expires_at=gt.' + enc(new Date().toISOString()) + '&or=' + enc('(' + [row.mobile ? 'prefill->>mobile.eq.' + row.mobile : '', row.email ? 'prefill->>email.eq.' + row.email : ''].filter(Boolean).join(',') + ')') + '&limit=1')) || [];
      if (open.length) throw fail(409, 'A link for this mobile / e-mail is already open – resend it or cancel it first.', 'open');
      const days = Math.min(30, Math.max(1, Math.round(Number(x.days) || 7))), token = newToken(), base = baseOf(s, x);
      const made = (await db('POST', 'hr_invites', [{ site: row.site, token_hash: sha(token), prefill: row, status: 'sent', expires_at: new Date(Date.now() + days * 86400000).toISOString(), created_by: s.email }], 'return=representation'))[0];
      const out = await send(s, made, token, base);
      await audit(row.site, s.email, 'Onboarding link made', row.name, { invite: made.id, days: days, mail: out.mail.sent ? 'sent' : out.mail.why });
      return { id: made.id, link: out.link, until: made.expires_at, mail: out.mail };
    },
    async invList(s, x) {
      office(s); await S15.need();
      const st = String(x.status || ''), rows = (await db('GET', 'hr_invites?select=id,site,status,prefill,expires_at,sends,last_sent_at,opened_at,submitted_at,email_verified_at,decided_by,decided_at,reject_reason,employee_id,created_by,created_at&site=eq.' + enc(s.site) + '&order=created_at.desc&limit=300')) || [];
      const out = rows.map(r => Object.assign(r, { status: stateOf(r), prefill: { name: r.prefill.name, category: r.prefill.category, mobile: r.prefill.mobile, email: r.prefill.email, joined_on: r.prefill.joined_on } }));
      return { rows: st ? out.filter(r => r.status === st) : out };
    },
    // one link: what he filled, his papers (links for 5 minutes), the policies he accepted
    async invGet(s, x) {
      office(s); await S15.need();
      const r = await invOf(s, x.id), sub = pub(r.submission), docs = Array.isArray(sub.docs) ? sub.docs : [];
      const links = docs.length ? await store.links(docs.filter(d => isAdmin(s) || !((R.docKind(d.kind) || {}).pay || (R.docKind(d.kind) || {}).restricted)).map(d => d.path), 300) : {};
      return { invite: { id: r.id, site: r.site, status: stateOf(r), prefill: r.prefill, expires_at: r.expires_at, sends: r.sends, opened_at: r.opened_at, submitted_at: r.submitted_at, email_verified_at: r.email_verified_at, from_ip: r.from_ip, from_agent: r.from_agent,
        decided_by: r.decided_by, decided_at: r.decided_at, reject_reason: r.reject_reason, employee_id: r.employee_id },
        data: shownData(s, sub.data), docs: docs.map(d => ({ kind: d.kind, kind_name: (R.docKind(d.kind) || {}).name || d.kind, number: d.number || '', issued_on: d.issued_on || '', expires_on: d.expires_on || '', mime: d.mime, url: links[d.path] || '' })),
        na: sub.na || {}, accepts: r.accepts || [], declared: !!sub.declared, form: FORM };
    },
    // a NEW code for the same joiner (the old link stops working), new days
    async invResend(s, x) {
      office(s); await S15.need();
      const r = await invOf(s, x.id); if (['sent', 'in_progress', 'expired'].indexOf(stateOf(r)) < 0) throw fail(400, 'This link is ' + stateOf(r) + ' – it is not sent again.', 'status');
      const days = Math.min(30, Math.max(1, Math.round(Number(x.days) || 7))), token = newToken(), base = baseOf(s, x), until = new Date(Date.now() + days * 86400000).toISOString();
      await db('PATCH', 'hr_invites?id=eq.' + r.id, { token_hash: sha(token), expires_at: until, sends: (r.sends || 1) + 1, last_sent_at: new Date().toISOString(), status: r.opened_at ? 'in_progress' : 'sent' }, 'return=minimal');
      const out = await send(s, Object.assign({}, r, { expires_at: until }), token, base);
      await audit(r.site, s.email, 'Onboarding link sent again', r.prefill.name, { invite: r.id, days: days, mail: out.mail.sent ? 'sent' : out.mail.why });
      return { link: out.link, until: until, mail: out.mail };
    },
    async invCancel(s, x) {
      office(s); await S15.need();
      const r = await invOf(s, x.id); if (['approved', 'active', 'cancelled'].indexOf(r.status) > -1) throw fail(400, 'This link is ' + r.status + '.', 'status');
      const why = R.str(x.reason, 200); if (why.length < 3) throw fail(400, 'Reason: write why (at least 3 letters).', 'reason');
      await db('PATCH', 'hr_invites?id=eq.' + r.id, { status: 'cancelled', decided_by: s.email, decided_at: new Date().toISOString(), reject_reason: why }, 'return=minimal');
      await audit(r.site, s.email, 'Onboarding link cancelled', r.prefill.name, { invite: r.id, reason: why });
      return { ok: true };
    },
    /* THE DECISION (HR Admin / Super Admin): approve = the employee is made; back = he corrects what is written (the link works 7
     * more days); reject = closed. { id, ok: true | false, back?: true, reason } */
    async invDecide(s, x) {
      if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin approves a new joiner.', 'role');
      await S15.need(); const r = await invOf(s, x.id);
      if (['submitted', 'under_verification'].indexOf(r.status) < 0) throw fail(400, 'Only a submitted form is decided (this one is ' + stateOf(r) + ').', 'status');
      const why = R.str(x.reason, 300), now = new Date().toISOString();
      if (x.ok !== true) {
        if (why.length < 5) throw fail(400, 'Reason: write what is wrong / needed (at least 5 letters).', 'reason');
        if (x.back === true) await db('PATCH', 'hr_invites?id=eq.' + r.id, { status: 'in_progress', reject_reason: why, expires_at: new Date(Math.max(Date.parse(r.expires_at), Date.now() + 7 * 86400000)).toISOString() }, 'return=minimal');
        else await db('PATCH', 'hr_invites?id=eq.' + r.id, { status: 'rejected', reject_reason: why, decided_by: s.email, decided_at: now }, 'return=minimal');
        await audit(r.site, s.email, x.back === true ? 'Onboarding sent back for correction' : 'Onboarding rejected', r.prefill.name, { invite: r.id, reason: why });
        return { ok: true };
      }
      const sub = r.submission || {}, c = clean(sub.data, true), p = r.prefill || {};
      if (c.errors.length) throw fail(400, 'The form is not complete: ' + c.errors.join(' '), 'check');
      const d = c.row, emp = R.employee({ name: d.name, category: p.category, gender: d.gender, mobile: d.mobile, email: d.email, dob: d.dob, joined_on: p.joined_on });
      if (emp.errors.length) throw fail(400, emp.errors.join(' '), 'check');
      const t = await H.taken([emp.row], '');
      if (emp.row.mobile && t.mobile[emp.row.mobile]) throw fail(409, 'This mobile number already belongs to employee ' + t.mobile[emp.row.mobile] + '.', 'mobile');
      if (emp.row.email && t.email[emp.row.email]) throw fail(409, 'This e-mail already belongs to employee ' + t.email[emp.row.email] + '.', 'email');
      for (const k of ['aadhaar', 'pan']) if (d[k] && ((await db('GET', 'hr_employee_private?select=employee_id&' + k + '=eq.' + enc(d[k]) + '&limit=1')) || []).length) throw fail(409, (k === 'pan' ? 'PAN' : 'Aadhaar') + ': this number already belongs to another employee.', k);
      // the employee (his e-mail verified by the code he typed)
      const verified = r.email_verified_at && sub.verified_email && sub.verified_email === emp.row.email ? r.email_verified_at : null;
      const row = Object.assign({ code: (await H.newCodes(1))[0], site: r.site, status: R.statusOf(emp.row, ''), created_by: s.email, updated_by: s.email, department_id: p.department_id || null, designation_id: p.designation_id || null, reports_to: p.reports_to || null, email_verified_at: verified }, emp.row);
      const made = (await db('POST', 'hr_employees', [row], 'return=representation'))[0];
      await db('POST', 'hr_employment', [{ employee_id: made.id, site: r.site, department_id: row.department_id, designation_id: row.designation_id, reports_to: row.reports_to, valid_from: row.joined_on || R.today(), note: 'Joined (onboarding)', created_by: s.email }], 'return=minimal');
      if (row.reports_to) await REP.syncPrimary(made.id, row.reports_to, row.joined_on && row.joined_on <= R.today() ? row.joined_on : R.today(), s.email, 'Joined (onboarding)');
      // his own details, his profile
      const priv = { employee_id: made.id, aadhaar: d.aadhaar || '', pan: d.pan || '', mobile2: d.mobile2 || '', family_name: d.family_name || '', family_relation: d.family_relation || '', family_mobile: d.family_mobile || '', address_current: d.address_current || '', address_permanent: d.address_permanent || '', updated_by: s.email, updated_at: now };
      await db('POST', 'hr_employee_private?on_conflict=employee_id', [priv], 'resolution=merge-duplicates,return=minimal');
      const prof = {}; ['father_name', 'city', 'state', 'pin', 'emergency_name', 'emergency_relation', 'emergency_mobile'].forEach(k => { if (d[k]) prof[k] = d[k]; });
      await db('POST', 'hr_employee_profile?on_conflict=employee_id', [{ employee_id: made.id, data: prof, secret: {}, updated_by: s.email, updated_at: now }], 'resolution=merge-duplicates,return=minimal');
      // his papers – "submitted", for the verification list; the ones he said he does not have: not applicable, with his words
      const docs = Array.isArray(sub.docs) ? sub.docs : [];
      if (docs.length) {
        const back = await db('POST', 'hr_employee_docs', docs.map(x2 => ({ employee_id: made.id, kind: x2.kind, title: '', number: R.str(x2.number, 40).toUpperCase(), issued_on: x2.issued_on || null, expires_on: x2.expires_on || null, path: x2.path, mime: x2.mime, bytes: x2.bytes, status: 'submitted', created_by: 'onboarding:' + r.id })), 'return=representation');
        await db('POST', 'hr_doc_events', back.map(b => ({ doc_id: b.id, employee_id: made.id, site: r.site, kind: b.kind, event: 'uploaded', note: 'onboarding link', by: 'onboarding:' + r.id })), 'return=minimal');
      }
      const na = sub.na || {}, naK = Object.keys(na).filter(k => R.docKind(k));
      if (naK.length) {
        await db('POST', 'hr_doc_na', naK.map(k => ({ employee_id: made.id, kind: k, reason: 'Said at onboarding: ' + R.str(na[k], 150), by: s.email })), 'return=minimal');
        await db('POST', 'hr_doc_events', naK.map(k => ({ employee_id: made.id, site: r.site, kind: k, event: 'not_applicable', note: 'Said at onboarding: ' + R.str(na[k], 150), by: s.email })), 'return=minimal');
      }
      // his policy acceptances (the versions he accepted on the link)
      const acc = (Array.isArray(r.accepts) ? r.accepts : []).filter(a => Number(a.version_id) > 0);
      if (acc.length) await db('POST', 'hr_cpolicy_accepts?on_conflict=version_id,employee_id', acc.map(a => ({ version_id: Number(a.version_id), employee_id: made.id, invite_id: r.id, via: 'onboarding', device: R.str(a.device, 120), accepted_at: a.at || now })), 'resolution=ignore-duplicates,return=minimal');
      // his bank details: the bank approval of step 14 (the Super Admin's own approval counts at once)
      let bank = null;
      if (d.bank_account) bank = await require('./act_bank').ask(s, [{ emp: { id: made.id, site: r.site, code: made.code, name: made.name, email: made.email }, before: {}, after: { bank_name: d.bank_name, bank_ifsc: d.bank_ifsc, bank_account: d.bank_account, bank_holder: d.bank_holder } }], 'form');
      await db('PATCH', 'hr_invites?id=eq.' + r.id, { status: 'approved', employee_id: made.id, decided_by: s.email, decided_at: now, reject_reason: '' }, 'return=minimal');
      await audit(r.site, s.email, 'Onboarding approved – employee added', made.code, { invite: r.id, docs: docs.length, not_applicable: naK, policies: acc.length, bank: bank ? (bank.waiting ? 'waiting' : 'applied') : 'none', email_verified: !!verified });
      return { ok: true, employee: { id: made.id, code: made.code, status: made.status, name: made.name, email: made.email || '', mobile: made.mobile || '', site: made.site }, bank: bank };      // (18-11-2026) name, e-mail, mobile: his sign-in is made by itself (the page – the Portal)
    },

    /* AN EXISTING EMPLOYEE'S E-MAIL: a link to it; opened, his e-mail is verified (the activation needs it) */
    async emailCheckSend(s, x) {
      office(s); await S15.need();
      const e = ((await db('GET', 'hr_employees?select=id,code,name,email,site,status&id=eq.' + id(x.id) + '&site=eq.' + enc(s.site))) || [])[0];
      if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound'); if (!e.email) throw fail(400, 'He has no e-mail in his record.', 'email');
      if (e.status === 'left') throw fail(400, 'This employee has left.', 'left');
      const recent = (await db('GET', 'hr_email_checks?select=id&employee_id=eq.' + e.id + '&created_at=gt.' + enc(new Date(Date.now() - 3600000).toISOString()))) || [];
      if (recent.length >= 3) throw fail(429, 'Three links were sent within an hour – wait a little.', 'many');
      const token = newToken(), until = new Date(Date.now() + 3 * 86400000).toISOString(), link = baseOf(s, x) + 'onboard.html#e=' + token;
      await db('POST', 'hr_email_checks', [{ token_hash: sha(token), email: e.email, employee_id: e.id, expires_at: until, created_by: s.email }], 'return=minimal');
      const m = (await MAIL.send([Object.assign({ to: e.email }, letter('check', { name: e.name, link: link, until: until }))]))[0];
      await audit(e.site, s.email, 'E-mail check sent', e.code, { mail: m.sent ? 'sent' : m.why });
      return { mail: m, until: until };
    },

    /* ACTIVE (HR Admin / Super Admin): his date of birth, 18 on his joining date, his e-mail verified, the papers he needs attached
     * and none of them rejected. Until he is active he works as today (a complete record may punch – MAY_PUNCH). */
    async empActivate(s, x) {
      if (!isAdmin(s)) throw fail(403, 'Only the HR Admin or the Super Admin makes an employee active.', 'role');
      await S15.need();
      const e = ((await db('GET', 'hr_employees?select=id,code,name,category,dob,joined_on,email,mobile,email_verified_at,site,status&id=eq.' + id(x.id) + '&site=eq.' + enc(s.site))) || [])[0];
      if (!e) throw fail(404, 'This employee was not found on this site.', 'notfound');
      if (e.status === 'active') return { ok: true, already: true }; if (e.status === 'left') throw fail(400, 'This employee has left.', 'left');
      await require('./own').notOwn(s, e.id, 'make your own record active');
      const why = [];
      if (!e.dob) why.push('his date of birth'); else if (!R.adultOn(e.dob, e.joined_on || R.today())) why.push('18 years on his joining date (born ' + dmy(e.dob) + ')');
      if (!e.email) why.push('his e-mail'); else if (!e.email_verified_at) why.push('his e-mail verified (send him the e-mail check)');
      const docs = (await db('GET', 'hr_employee_docs?select=kind,status&employee_id=eq.' + e.id + '&active=is.true')) || [], miss = await S15.missingOf(e, docs);
      if (miss.length) why.push('the papers: ' + miss.join(', '));
      if (why.length) throw fail(400, 'Not yet active – still needed: ' + why.join('; ') + '.', 'activate');
      await db('PATCH', 'hr_employees?id=eq.' + e.id + '&status=neq.left', { status: 'active', updated_by: s.email, updated_at: new Date().toISOString() }, 'return=minimal');
      await audit(e.site, s.email, 'Employee made active', e.code, {});
      return { ok: true };
    },
  };

  /* ───────────── THE LINK'S OWN PAGE (no sign-in: the code of the link is the key) – api/onboard.js ───────────── */
  async function byToken(t) {
    t = String(t || ''); if (!/^[A-Za-z0-9_-]{40,60}$/.test(t)) throw fail(404, 'This link is not valid – ask the HR office for a new one.', 'link');
    const r = ((await db('GET', 'hr_invites?select=*&token_hash=eq.' + sha(t))) || [])[0];
    if (!r || ['cancelled', 'rejected'].indexOf(r.status) > -1) throw fail(404, 'This link is not valid (a newer one was sent, or it was cancelled) – ask the HR office.', 'link');
    if (LIVE.indexOf(r.status) > -1 && expired(r)) throw fail(410, 'This link has expired – ask the HR office to send it again.', 'expired');
    return r;
  }
  const editable = r => { if (LIVE.indexOf(r.status) < 0) throw fail(409, r.status === 'approved' || r.status === 'active' ? 'Your joining is approved – the HR office gives you your sign-in.' : 'Your form is submitted – the HR office is checking it.', 'submitted'); };
  async function policiesOf(r) {
    const p = r.prefill || {}, emp = { id: '00000000-0000-0000-0000-000000000000', site: r.site, category: p.category, department_id: p.department_id || null };
    const all = (await CPOL.forPerson(emp)).map(x => Object.assign(x, { accepted_at: ((r.accepts || []).filter(a => Number(a.version_id) === x.version_id)[0] || {}).at || null }));
    return all;
  }
  async function view(r) {
    const sub = pub(r.submission), p = r.prefill || {};
    return { name: p.name, site: r.site, category: p.category, joined_on: p.joined_on, until: r.expires_at, status: r.status, back_reason: r.status === 'in_progress' ? r.reject_reason || '' : '',
      form: FORM, data: Object.assign({ name: p.name, mobile: p.mobile, email: p.email }, sub.data || {}), relations: R.REL,
      docs_needed: docsFor(p.category), kinds: R.DOCS.filter(d => !d.restricted).map(d => ({ key: d.key, name: d.name, expires: !!d.expires })),
      docs: (Array.isArray(sub.docs) ? sub.docs : []).map(d => ({ kind: d.kind, number: d.number || '', issued_on: d.issued_on || '', expires_on: d.expires_on || '', mime: d.mime, at: d.at })), na: sub.na || {},
      email_verified: !!(r.email_verified_at && sub.verified_email), verified_email: sub.verified_email || '', policies: await policiesOf(r), declared: !!sub.declared, maxMb: R.DOC_MAX / 1048576 };
  }
  const saveSub = (r, sub) => db('PATCH', 'hr_invites?id=eq.' + r.id + '&status=in.(sent,in_progress)', { submission: sub, status: 'in_progress' }, 'return=minimal');
  const PUB = {
    async open(x, req) {
      const r = await byToken(x.t);
      if (!r.opened_at) { await db('PATCH', 'hr_invites?id=eq.' + r.id, { opened_at: new Date().toISOString(), status: r.status === 'sent' ? 'in_progress' : r.status }, 'return=minimal'); r.status = r.status === 'sent' ? 'in_progress' : r.status; }
      return await view(r);
    },
    // what is typed – kept as it is (the compulsory ones are checked at "Submit")
    async save(x) {
      const r = await byToken(x.t); editable(r);
      const c = clean(x.data, false); if (c.errors.length) throw fail(400, c.errors.join(' '), 'check');
      const sub = r.submission || {}; sub.data = c.row;
      if (sub.verified_email && c.row.email !== sub.verified_email) { sub.verified_email = ''; await db('PATCH', 'hr_invites?id=eq.' + r.id, { email_verified_at: null }, 'return=minimal'); }
      await saveSub(r, sub); return { ok: true, email_verified: !!sub.verified_email };
    },
    async uploadUrl(x) {
      const r = await byToken(x.t); editable(r);
      const k = R.docKind(x.kind); if (!k || k.restricted) throw fail(400, 'Choose what kind of paper this is.', 'kind');
      const ext = R.DOC_TYPES[String(x.type || '')], bytes = Number(x.bytes); if (!ext) throw fail(400, 'Only a photo (JPG, PNG, WebP) or a PDF can be attached.', 'type');
      if (!(bytes > 0) || bytes > R.DOC_MAX) throw fail(400, 'This file is empty or bigger than 10 MB.', 'bytes');
      const sub = r.submission || {}; if ((Array.isArray(sub.docs) ? sub.docs.length : 0) >= 20) throw fail(400, 'At most 20 papers on the form.', 'many');
      const path = 'onboard/' + r.id + '/' + crypto.randomBytes(12).toString('hex') + '.' + ext;
      return { path: path, url: await store.uploadUrl(path), type: String(x.type) };
    },
    async docAdd(x) {
      const r = await byToken(x.t); editable(r);
      const k = R.docKind(x.kind); if (!k || k.restricted) throw fail(400, 'Choose what kind of paper this is.', 'kind');
      const path = String(x.path || ''); if (!new RegExp('^onboard/' + r.id + '/[0-9a-f]{24}\\.(jpg|png|webp|pdf)$').test(path)) throw fail(400, 'This file does not belong to this form.', 'path');
      if (!(await store.link(path, 60))) throw fail(400, 'The file did not arrive – attach it again.', 'path');
      const iss = R.date(x.issued_on), exp = R.date(x.expires_on); if (iss === null) throw fail(400, 'Issued on: a date as DD-MM-YYYY.', 'issued_on'); if (exp === null) throw fail(400, 'Valid up to: a date as DD-MM-YYYY.', 'expires_on');
      const mime = Object.keys(R.DOC_TYPES).filter(t => R.DOC_TYPES[t] === path.split('.').pop())[0];
      const sub = r.submission || {}; sub.docs = (Array.isArray(sub.docs) ? sub.docs : []).filter(d => !(d.kind === k.key && k.key !== 'other' && k.key !== 'education'));      // (one of a kind – a new one takes its place)
      sub.docs.push({ kind: k.key, path: path, mime: mime, bytes: Math.round(Number(x.bytes) || 0), number: R.str(x.number, 40), issued_on: iss || '', expires_on: exp || '', at: new Date().toISOString() });
      if (sub.na) delete sub.na[k.key];
      await saveSub(r, sub); return { ok: true };
    },
    async docDrop(x) {
      const r = await byToken(x.t); editable(r); const sub = r.submission || {};
      sub.docs = (Array.isArray(sub.docs) ? sub.docs : []).filter(d => !(d.kind === x.kind && (!x.at || d.at === x.at)));
      await saveSub(r, sub); return { ok: true };
    },
    // "I do not have this paper" – with why (the HR office sees it; it becomes "not applicable" at approval)
    async docNa(x) {
      const r = await byToken(x.t); editable(r);
      const k = R.docKind(x.kind); if (!k || k.restricted) throw fail(400, 'Choose what kind of paper this is.', 'kind');
      const sub = r.submission || {}; sub.na = sub.na || {};
      if (x.na === false) delete sub.na[k.key]; else { const why = R.str(x.reason, 150); if (why.length < 3) throw fail(400, 'Write why you do not have it (at least 3 letters).', 'reason'); sub.na[k.key] = why; }
      await saveSub(r, sub); return { ok: true };
    },
    // a 6-digit code to his e-mail (at most 5 an hour)
    async emailCode(x) {
      const r = await byToken(x.t); editable(r);
      const em = R.email(x.email); if (!em) throw fail(400, 'E-mail: not an e-mail address.', 'email');
      const t = await H.taken([{ email: em }], ''); if (t.email[em]) throw fail(409, 'This e-mail already belongs to an employee – use your own.', 'email');
      const recent = (await db('GET', 'hr_email_checks?select=id&invite_id=eq.' + r.id + '&created_at=gt.' + enc(new Date(Date.now() - 3600000).toISOString()))) || [];
      if (recent.length >= 5) throw fail(429, 'Five codes were sent within an hour – wait a little and try again.', 'many');
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await db('POST', 'hr_email_checks', [{ token_hash: sha(r.id + '|' + em + '|' + code), email: em, invite_id: r.id, expires_at: new Date(Date.now() + 15 * 60000).toISOString(), created_by: 'onboarding' }], 'return=minimal');
      const m = (await MAIL.send([Object.assign({ to: em }, letter('code', { code: code }))]))[0];
      if (!m.sent) throw fail(503, 'The code could not be sent (' + m.why + ') – tell the HR office.', 'mail');
      const sub = r.submission || {}; sub.__wrong = 0; await saveSub(r, sub);
      return { sent: true };
    },
    async emailVerify(x) {
      const r = await byToken(x.t); editable(r);
      const em = R.email(x.email), code = String(x.code || '').replace(/\D/g, ''); if (!em || code.length !== 6) throw fail(400, 'Type the 6-digit code from your e-mail.', 'code');
      const sub = r.submission || {}; if ((sub.__wrong || 0) >= 5) throw fail(429, 'Too many wrong codes – ask for a new code.', 'many');
      const row = ((await db('GET', 'hr_email_checks?select=id,expires_at,used_at&token_hash=eq.' + sha(r.id + '|' + em + '|' + code))) || [])[0];
      if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) { sub.__wrong = (sub.__wrong || 0) + 1; await saveSub(r, sub); throw fail(400, 'This code is not right (or has expired).', 'code'); }
      const now = new Date().toISOString();
      await db('PATCH', 'hr_email_checks?id=eq.' + row.id + '&used_at=is.null', { used_at: now }, 'return=minimal');
      sub.verified_email = em; sub.__wrong = 0; sub.data = Object.assign(sub.data || {}, { email: em });
      await db('PATCH', 'hr_invites?id=eq.' + r.id, { email_verified_at: now, submission: sub, status: 'in_progress' }, 'return=minimal');
      return { ok: true };
    },
    async accept(x) {
      const r = await byToken(x.t); editable(r);
      if (x.read !== true) throw fail(400, 'Tick "I have read and accept" first.', 'read');
      const v = Number(x.version), mine = (await policiesOf(r)).filter(p => p.version_id === v)[0]; if (!mine) throw fail(400, 'This policy is not the one in force – open the link again.', 'version');
      const acc = (Array.isArray(r.accepts) ? r.accepts : []).filter(a => Number(a.version_id) !== v); acc.push({ version_id: v, at: new Date().toISOString(), device: R.str(x.device, 120) });
      await db('PATCH', 'hr_invites?id=eq.' + r.id + '&status=in.(sent,in_progress)', { accepts: acc }, 'return=minimal'); return { ok: true };
    },
    // SUBMIT: everything compulsory is there – the HR office checks it
    async submit(x, req) {
      const r = await byToken(x.t); editable(r);
      const sub = r.submission || {}, c = clean(sub.data, true), p = r.prefill || {}, errs = c.errors.slice();
      const emp = R.employee({ name: c.row.name, category: p.category, dob: c.row.dob, joined_on: p.joined_on, mobile: c.row.mobile, email: c.row.email }); emp.errors.forEach(m => { if (errs.indexOf(m) < 0) errs.push(m); });
      if (!sub.verified_email || sub.verified_email !== c.row.email) errs.push('E-mail: verify it with the code sent to it.');
      const have = (Array.isArray(sub.docs) ? sub.docs : []).map(d => d.kind), na = sub.na || {};
      docsFor(p.category).forEach(k => { if (have.indexOf(k) < 0 && !na[k]) errs.push('Paper: ' + (R.docKind(k) || {}).name + ' – attach it, or say why you do not have it.'); });
      (await policiesOf(r)).forEach(pl => { if (pl.mandatory && !pl.accepted_at) errs.push('Policy: read and accept "' + pl.title + '".'); });
      if (x.declare !== true) errs.push('Tick: "What I have written is true".');
      if (errs.length) throw fail(400, errs.join(' '), 'check');
      sub.declared = true;
      const h = (req && req.headers) || {}, ip = String(h['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 60), ag = String(h['user-agent'] || '').slice(0, 200);
      await db('PATCH', 'hr_invites?id=eq.' + r.id + '&status=in.(sent,in_progress)', { submission: sub, status: 'submitted', submitted_at: new Date().toISOString(), from_ip: ip, from_agent: ag, reject_reason: '' }, 'return=minimal');
      await audit(r.site, 'onboarding:' + r.id, 'Onboarding form submitted', p.name, { invite: r.id });
      // (Phase 4) the HR office is told – app notification and e-mail
      return { ok: true };
    },
    // an existing employee's e-mail check link
    async verify(x) {
      const t = String(x.e || ''); if (!/^[A-Za-z0-9_-]{40,60}$/.test(t)) throw fail(404, 'This link is not valid.', 'link');
      const row = ((await db('GET', 'hr_email_checks?select=id,email,employee_id,expires_at,used_at&token_hash=eq.' + sha(t))) || [])[0];
      if (!row || !row.employee_id) throw fail(404, 'This link is not valid.', 'link');
      if (row.used_at) return { ok: true, already: true };
      if (Date.parse(row.expires_at) <= Date.now()) throw fail(410, 'This link has expired – ask the HR office to send it again.', 'expired');
      const e = ((await db('GET', 'hr_employees?select=id,code,site,email&id=eq.' + row.employee_id)) || [])[0];
      if (!e || String(e.email || '').toLowerCase() !== String(row.email).toLowerCase()) throw fail(409, 'Your e-mail in the HR record has changed – ask the HR office for a new link.', 'changed');
      const now = new Date().toISOString();
      await db('PATCH', 'hr_email_checks?id=eq.' + row.id + '&used_at=is.null', { used_at: now }, 'return=minimal');
      await db('PATCH', 'hr_employees?id=eq.' + e.id + '&email=eq.' + enc(row.email), { email_verified_at: now }, 'return=minimal');
      await audit(e.site, 'e-mail link', 'E-mail verified', e.code, {});
      return { ok: true };
    },
  };
  return { ACT, PUB, FORM, clean };
};
